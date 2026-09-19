const assert = require('node:assert/strict');
const { test } = require('node:test');

const { createInteractionHandler, registerSlashCommands } = require('../src/slash-commands');

test('registers global commands and removes legacy guild commands', async () => {
  const calls = [];
  const rest = {
    async put(route, options) {
      calls.push({ options, route });
    },
  };
  const client = {
    application: { id: 'application-id' },
    guilds: {
      cache: new Map([
        ['guild-one', { id: 'guild-one' }],
        ['guild-two', { id: 'guild-two' }],
      ]),
    },
    user: { id: 'bot-user-id' },
  };

  await registerSlashCommands({ client, rest });

  assert.equal(calls.length, 3);
  assert.equal(calls[0].route, '/applications/application-id/commands');
  assert.ok(calls[0].options.body.length > 0);
  assert.ok(calls[0].options.body.some((command) => command.name === 'ping'));
  assert.ok(calls[0].options.body.some((command) => command.name === 'version'));
  assert.ok(calls[0].options.body.some((command) => command.name === 'help'));
  assert.ok(calls[0].options.body.some((command) => command.name === 'map'));
  assert.ok(calls[0].options.body.some((command) => command.name === 'setup'));
  const verifyCommand = calls[0].options.body.find((command) => command.name === 'osuverify');
  assert.equal(verifyCommand.options[0].required, false);
  const quickVerifyCommand = calls[0].options.body.find((command) => command.name === 'verify');
  assert.equal(quickVerifyCommand.options[0].required, false);
  assert.deepEqual(calls.slice(1), [
    {
      route: '/applications/application-id/guilds/guild-one/commands',
      options: { body: [] },
    },
    {
      route: '/applications/application-id/guilds/guild-two/commands',
      options: { body: [] },
    },
  ]);
});

test('quick setup configures a selected verification role', async () => {
  const selectedRole = { id: 'verified-role' };
  const configured = [];
  let reply;
  const interaction = {
    channelId: 'channel',
    commandName: 'setup',
    guild: { id: 'guild' },
    guildId: 'guild',
    inGuild: () => true,
    isChatInputCommand: () => true,
    memberPermissions: { has: () => true },
    options: {
      getChannel: () => null,
      getRole: (name) => (name === 'verify_role' ? selectedRole : null),
      getString: () => null,
    },
    async deferReply() {},
    async deleteReply() {},
    async editReply(payload) { reply = payload; },
  };
  const handler = createInteractionHandler({
    osuMaps: {},
    osuVerification: {
      async configureVerificationRole(...args) { configured.push(args); },
    },
    store: {
      isConfigured: true,
      getCommunityAlertSettings: async () => null,
      getMapSettings: async () => null,
      getVerificationRole: async () => selectedRole.id,
    },
  });

  await handler(interaction);

  assert.equal(configured.length, 1);
  assert.equal(configured[0][1], selectedRole);
  assert.match(reply.embeds[0].toJSON().title, /บันทึก/);
});

test('passes the selected role from /verify-role to the verification service', async () => {
  const selectedRole = { id: 'role' };
  const calls = [];
  const interaction = {
    channelId: 'channel',
    commandName: 'verify-role',
    guild: { id: 'guild' },
    guildId: 'guild',
    inGuild: () => true,
    isChatInputCommand: () => true,
    member: {},
    memberPermissions: {},
    options: {
      getRole: () => selectedRole,
    },
    user: { id: 'user' },
    async deferReply() {},
    async deleteReply() {},
    async editReply() {},
  };
  const handler = createInteractionHandler({
    osuVerification: {
      async setVerificationRole(...args) { calls.push(args); },
    },
  });

  await handler(interaction);

  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], selectedRole);
});

test('passes rich verification status replies through to Discord', async () => {
  const expectedPayload = { embeds: [{ title: 'Verified profile' }] };
  let reply;
  const interaction = {
    channelId: 'channel',
    commandName: 'osuverify-status',
    guild: { id: 'guild' },
    guildId: 'guild',
    inGuild: () => true,
    isChatInputCommand: () => true,
    member: {},
    memberPermissions: {},
    options: {},
    user: { id: 'user' },
    async deferReply() {},
    async deleteReply() {},
    async editReply(payload) { reply = payload; },
  };
  const handler = createInteractionHandler({
    osuVerification: {
      async showStatus(context) { await context.reply(expectedPayload); },
    },
  });

  await handler(interaction);

  assert.equal(reply, expectedPayload);
});

test('help language dropdown updates the guide in place', async () => {
  let update;
  const interaction = {
    customId: 'alrenhelp:language',
    isStringSelectMenu: () => true,
    values: ['en'],
    async update(payload) { update = payload; },
  };
  const handler = createInteractionHandler({});

  await handler(interaction);

  assert.match(update.embeds[0].toJSON().title, /English/);
  assert.equal(update.components[0].toJSON().components[0].custom_id, 'alrenhelp:language');
});

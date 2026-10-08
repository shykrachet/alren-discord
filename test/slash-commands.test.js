const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  createInteractionHandler,
  registerGuildSlashCommands,
  registerSlashCommands,
} = require('../src/slash-commands');

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
  assert.equal(calls[0].options.body.some((command) => command.name === 'version'), false);
  assert.ok(calls[0].options.body.some((command) => command.name === 'help'));
  assert.ok(calls[0].options.body.some((command) => command.name === 'map'));
  assert.ok(calls[0].options.body.some((command) => command.name === 'setup'));
  const mapSettingsCommand = calls[0].options.body.find((command) => command.name === 'osumap-settings');
  assert.deepEqual(mapSettingsCommand.options.map((option) => option.name), ['status', 'mode', 'channel']);
  assert.equal(mapSettingsCommand.options[2].type, 7);
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

test('registers commands immediately for a newly joined guild', async () => {
  const calls = [];
  const rest = {
    async put(route, options) {
      calls.push({ options, route });
    },
  };
  const client = {
    application: { id: 'application-id' },
    user: { id: 'bot-user-id' },
  };

  await registerGuildSlashCommands({
    client,
    guild: { id: 'new-guild', name: 'New Guild' },
    rest,
  });

  assert.deepEqual(calls.map((call) => call.route), ['/applications/application-id/guilds/new-guild/commands']);
  assert.ok(calls[0].options.body.some((command) => command.name === 'verify'));
});

test('osumap-settings can configure a selected beatmap channel', async () => {
  const selectedChannel = { id: 'beatmap-channel' };
  const configured = [];
  let reply;
  const interaction = {
    channelId: 'command-channel',
    commandName: 'osumap-settings',
    guildId: 'guild',
    inGuild: () => true,
    isChatInputCommand: () => true,
    memberPermissions: { has: () => true },
    options: {
      getChannel: (name) => (name === 'channel' ? selectedChannel : null),
      getString: (name) => ({ status: 'ranked', mode: 'mania' }[name] ?? null),
    },
    async deferReply() {},
    async deleteReply() {},
    async editReply(payload) { reply = payload; },
  };
  const handler = createInteractionHandler({
    osuMaps: {
      async configureFeed(settings) {
        configured.push(settings);
        return settings;
      },
    },
  });

  await handler(interaction);

  assert.deepEqual(configured, [{
    channelId: 'beatmap-channel',
    guildId: 'guild',
    mode: 'mania',
    status: 'ranked',
  }]);
  assert.match(reply, /<#beatmap-channel>/);
  assert.doesNotMatch(reply, /<#command-channel>/);
});

test('osumap-settings reports the real configuration error', async () => {
  let reply;
  const interaction = {
    channelId: 'channel',
    commandName: 'osumap-settings',
    guildId: 'guild',
    inGuild: () => true,
    isChatInputCommand: () => true,
    memberPermissions: { has: () => true },
    options: {
      getChannel: () => null,
      getString: () => null,
    },
    async deferReply() {},
    async deleteReply() {},
    async editReply(payload) { reply = payload; },
  };
  const handler = createInteractionHandler({
    osuMaps: {
      async configureFeed() {
        throw new Error('Supabase is missing osu_map_settings.');
      },
    },
  });

  await handler(interaction);

  assert.match(reply, /I could not save the beatmap feed settings/);
  assert.match(reply, /Reason: Supabase is missing osu_map_settings/);
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

test('verification slash commands report service errors to the user', async () => {
  let reply;
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
      getRole: () => ({ id: 'role' }),
    },
    user: { id: 'user' },
    async deferReply() {},
    async deleteReply() {},
    async editReply(payload) { reply = payload; },
  };
  const handler = createInteractionHandler({
    osuVerification: {
      async setVerificationRole() {
        throw new Error('The selected role must be lower than Alren.');
      },
    },
  });

  await handler(interaction);

  assert.match(reply, /I could not complete that verification request/);
  assert.match(reply, /Reason: The selected role must be lower than Alren/);
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
  assert.equal(update.components[1].toJSON().components[0].url, 'https://www.alrenbot.xyz/commands');
});

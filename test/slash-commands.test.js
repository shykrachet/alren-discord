const assert = require('node:assert/strict');
const { test } = require('node:test');
const { MessageFlags, PermissionsBitField } = require('discord.js');
const { createSqliteStore } = require('../src/sqlite-store');
const { MODE_DEFINITIONS, syncApplicationModeEmojis } = require('../src/mode-icons');

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
  assert.deepEqual(calls[0].options.body.map((command) => command.name), [
    'alren',
    'alrenclear',
    'ping',
    'help',
    'verify-status',
    'verify',
    'map',
    'setup',
  ]);
  assert.equal(calls[0].options.body.some((command) => command.name === 'version'), false);
  assert.equal(calls[0].options.body.some((command) => command.name === 'alrenhelp'), false);
  assert.equal(calls[0].options.body.some((command) => command.name === 'community-alert-settings'), false);
  assert.equal(calls[0].options.body.some((command) => command.name === 'osumap'), false);
  assert.equal(calls[0].options.body.some((command) => command.name === 'osumap-settings'), false);
  assert.equal(calls[0].options.body.some((command) => command.name === 'osumap-status'), false);
  assert.equal(calls[0].options.body.some((command) => command.name === 'osuverify'), false);
  assert.equal(calls[0].options.body.some((command) => command.name === 'osuverify-status'), false);
  assert.equal(calls[0].options.body.some((command) => command.name === 'verify-setting'), false);
  assert.equal(calls[0].options.body.some((command) => command.name === 'verify-role'), false);
  assert.equal(calls[0].options.body.some((command) => command.name === 'verify-role-status'), false);
  assert.doesNotMatch(JSON.stringify(calls[0].options.body), /\p{Script=Thai}/u);
  assert.deepEqual(calls[0].options.body.find((command) => command.name === 'help').options, []);
  const setupCommand = calls[0].options.body.find((command) => command.name === 'setup');
  assert.deepEqual(setupCommand.options.map((option) => option.name), ['status', 'verify', 'beatmap', 'bn-management']);
  const beatmapOptions = setupCommand.options.find((option) => option.name === 'beatmap').options;
  assert.deepEqual(beatmapOptions.map((option) => option.name), ['channel', 'status', 'mode', 'enabled']);
  const modeChoices = beatmapOptions.find((option) => option.name === 'mode').choices;
  assert.deepEqual(modeChoices.map((choice) => choice.value), ['any', 'osu', 'taiko', 'catch', 'mania']);
  assert.equal(modeChoices[0].name, 'All Mode');
  assert.deepEqual(modeChoices.map((choice) => choice.name), ['All Mode', 'Standard (osu!)', 'osu!taiko', 'osu!catch / fruits', 'osu!mania']);
  const bnChoices = setupCommand.options.find((option) => option.name === 'bn-management').options.find((option) => option.name === 'bn_mode').choices;
  assert.equal(bnChoices[0].name, 'All Mode');
  assert.match(modeChoices.find((choice) => choice.value === 'osu').name, /Standard/);
  const statusChoice = { name: 'Ranked + Loved', value: 'ranked_loved' };
  assert.ok(beatmapOptions.find((option) => option.name === 'status').choices.some((choice) => choice.name === statusChoice.name && choice.value === statusChoice.value));
  assert.ok(calls[0].options.body.find((command) => command.name === 'map').options.find((option) => option.name === 'status').choices.some((choice) => choice.value === statusChoice.value));
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
        throw new Error('Database is missing osu_map_settings.');
      },
    },
  });

  await handler(interaction);

  assert.match(reply, /I could not save the beatmap feed settings/);
  assert.match(reply, /Reason: Database is missing osu_map_settings/);
});

test('setup verify configures a selected verification role', async () => {
  const selectedRole = { id: 'verified-role' };
  const selectedChannel = { id: 'verify-channel' };
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
      getChannel: (name) => (name === 'channel' ? selectedChannel : null),
      getRole: (name) => (name === 'role' ? selectedRole : null),
      getString: () => null,
      getSubcommand: () => 'verify',
    },
    async deferReply() {},
    async deleteReply() {},
    async editReply(payload) { reply = payload; },
  };
  const handler = createInteractionHandler({
    osuMaps: {},
    osuVerification: {
      async configureVerificationSettings(...args) {
        configured.push(args);
        return { channelId: selectedChannel.id, roleId: selectedRole.id };
      },
    },
    store: {
      isConfigured: true,
      getCommunityAlertSettings: async () => null,
      getMapSettings: async () => null,
      listMapSettings: async () => [],
      getVerificationSettings: async () => ({ channel_id: selectedChannel.id, role_id: selectedRole.id }),
    },
  });

  await handler(interaction);

  assert.equal(configured.length, 1);
  assert.equal(configured[0][1].role, selectedRole);
  assert.equal(configured[0][1].channel, selectedChannel);
  assert.match(reply.embeds[0].toJSON().title, /settings saved/);
  assert.doesNotMatch(JSON.stringify(reply.embeds[0].toJSON()), /\p{Script=Thai}/u);
});

function setupInteraction({ channel = null, channelId = 'commands', enabled = null, mode = null, status = null, section = 'beatmap', canManage = true, inGuild = true } = {}) {
  return {
    commandName: 'setup',
    guildId: 'guild',
    channelId,
    inGuild: () => inGuild,
    isChatInputCommand: () => true,
    memberPermissions: { has: (permission) => canManage && permission === PermissionsBitField.Flags.ManageGuild },
    options: {
      getChannel: () => channel,
      getString: (name) => ({ mode, status }[name] ?? null),
      getBoolean: () => enabled,
      getSubcommand: () => section,
    },
    async deferReply(payload) { this.deferred = payload; },
    async reply(payload) { this.result = payload; },
    async editReply(payload) { this.result = payload; },
    async deleteReply() {},
  };
}

test('setup beatmap adds separate mode channels, displays every feed, and disables only the selected channel', async (t) => {
  await syncApplicationModeEmojis({
    emojis: {
      async fetch() { return Object.values(MODE_DEFINITIONS).map((mode, index) => ({ id: String(index + 10), name: mode.emojiName })); },
      async create() { throw new Error('Existing mode emojis should be reused.'); },
    },
  });
  const store = createSqliteStore({ dbPath: ':memory:' });
  t.after(() => store.close());
  const configured = [];
  const handler = createInteractionHandler({
    store,
    osuMaps: {
      async configureFeed(settings) {
        configured.push(settings);
        const previous = await store.getMapSettings(settings.guildId, settings.channelId);
        const resolved = { ...settings, mode: settings.mode || previous?.mode_filter || 'any', status: settings.status || previous?.status_filter || 'ranked' };
        await store.saveMapSettings(settings.guildId, resolved);
        return resolved;
      },
    },
  });
  const mania = setupInteraction({ channel: { id: 'mania' }, mode: 'mania', status: 'ranked_loved' });
  await handler(mania);
  const standard = setupInteraction({ channel: { id: 'standard' }, mode: 'osu' });
  await handler(standard);
  assert.deepEqual(configured.map((settings) => [settings.channelId, settings.mode]), [['mania', 'mania'], ['standard', 'osu']]);
  assert.equal(mania.deferred.flags, MessageFlags.Ephemeral);
  assert.equal((await store.getMapSettings('guild', 'mania')).status_filter, 'ranked_loved');
  assert.equal((await store.getMapSettings('guild', 'standard')).status_filter, 'ranked');

  const currentChannel = setupInteraction({ channelId: 'taiko', mode: 'taiko' });
  await handler(currentChannel);
  assert.equal(configured.at(-1).channelId, 'taiko');
  const status = setupInteraction({ section: 'status' });
  await handler(status);
  const mapField = status.result.embeds[0].toJSON().fields.find((field) => field.name.includes('Beatmap'));
  assert.match(mapField.value, /<#mania>.*Ranked \+ Loved.*mania/);
  assert.match(mapField.value, /<#standard>.*Ranked.*Standard/);
  assert.match(mapField.value, /<#taiko>.*Ranked.*taiko/);
  assert.match(mapField.value, /<:alren_mode_mania_v2:13>/);
  assert.match(mapField.value, /<:alren_mode_osu_v2:10>/);
  assert.match(mapField.value, /<:alren_mode_taiko_v2:11>/);

  const disable = setupInteraction({ channel: { id: 'mania' }, enabled: false });
  await handler(disable);
  assert.equal(await store.getMapSettings('guild', 'mania'), null);
  assert.equal((await store.listMapSettings('guild')).length, 2);
  assert.doesNotMatch(disable.result.embeds[0].toJSON().fields.find((field) => field.name.includes('Beatmap')).value, /<#mania>/);
});

test('setup beatmap rejects DMs and members without Manage Server before changing feeds', async (t) => {
  const store = createSqliteStore({ dbPath: ':memory:' });
  t.after(() => store.close());
  const handler = createInteractionHandler({ store, osuMaps: {} });
  for (const options of [{ canManage: false }, { inGuild: false }]) {
    const interaction = setupInteraction({ ...options, mode: 'mania', enabled: false });
    await handler(interaction);
    assert.equal(interaction.result.flags, MessageFlags.Ephemeral);
    assert.match(interaction.result.content, /Manage Server|only be used in a server/);
    assert.equal(interaction.deferred, undefined);
  }
  assert.deepEqual(await store.listMapSettings(), []);
});

test('map passes the current channel to the service and preserves explicit overrides', async () => {
  let request;
  const interaction = setupInteraction({ channelId: 'mania', mode: 'osu', status: 'qualified' });
  interaction.commandName = 'map';
  const handler = createInteractionHandler({
    osuMaps: {
      async getRandomMap(options) {
        request = options;
        return { map: { id: 123, status: 'qualified' }, filters: { mode: options.mode, status: options.status } };
      },
    },
  });
  await handler(interaction);
  assert.deepEqual(request, { channelId: 'mania', guildId: 'guild', mode: 'osu', status: 'qualified' });
  assert.equal(interaction.result.embeds[0].toJSON().url, 'https://osu.ppy.sh/beatmapsets/123');
  assert.match(interaction.result.content, /<:alren_mode_osu_v2:10>/);
});

test('verify-setting saves the selected role and channel', async () => {
  const selectedRole = { id: 'role' };
  const selectedChannel = { id: 'channel-log' };
  const calls = [];
  let reply;
  const interaction = {
    channelId: 'channel',
    commandName: 'verify-setting',
    guild: { id: 'guild' },
    guildId: 'guild',
    inGuild: () => true,
    isChatInputCommand: () => true,
    member: {},
    memberPermissions: { has: () => true },
    options: {
      getChannel: () => selectedChannel,
      getRole: () => selectedRole,
    },
    user: { id: 'user' },
    async deferReply() {},
    async deleteReply() {},
    async editReply(payload) { reply = payload; },
  };
  const handler = createInteractionHandler({
    osuVerification: {
      async configureVerificationSettings(...args) {
        calls.push(args);
        return { channelId: selectedChannel.id, roleId: selectedRole.id };
      },
    },
  });

  await handler(interaction);

  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].role, selectedRole);
  assert.equal(calls[0][1].channel, selectedChannel);
  assert.match(reply.embeds[0].toJSON().description, /<#channel-log>/);
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
    memberPermissions: { has: () => true },
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
    commandName: 'verify-setting',
    guild: { id: 'guild' },
    guildId: 'guild',
    inGuild: () => true,
    isChatInputCommand: () => true,
    member: {},
    memberPermissions: { has: () => true },
    options: {
      getChannel: () => null,
      getRole: () => ({ id: 'role' }),
    },
    user: { id: 'user' },
    async deferReply() {},
    async deleteReply() {},
    async editReply(payload) { reply = payload; },
  };
  const handler = createInteractionHandler({
    osuVerification: {
      async configureVerificationSettings() {
        throw new Error('The selected role must be lower than Alren.');
      },
    },
  });

  await handler(interaction);

  assert.match(reply, /I could not save verification settings/);
  assert.match(reply, /Reason: The selected role must be lower than Alren/);
});

test('osumap-status shows configured beatmap feed settings', async () => {
  let reply;
  let mode = 'mania';
  const interaction = {
    channelId: 'channel',
    commandName: 'osumap-status',
    guildId: 'guild',
    inGuild: () => true,
    isChatInputCommand: () => true,
    async deferReply() {},
    async deleteReply() {},
    async editReply(payload) { reply = payload; },
  };
  const handler = createInteractionHandler({
    store: {
      async getMapSettings() {
        return { channel_id: 'beatmaps', mode_filter: mode, status_filter: 'ranked' };
      },
    },
  });

  await handler(interaction);

  const embed = reply.embeds[0].toJSON();
  assert.match(embed.title, /beatmap feed settings/);
  assert.match(embed.fields[0].value, /<#beatmaps>/);
  assert.match(embed.fields[1].value, /Mania|mania|osu!mania/);
  assert.match(embed.fields[1].value, /<:alren_mode_mania_v2:13>/);
  mode = 'any';
  await handler(interaction);
  assert.equal(reply.embeds[0].toJSON().fields[1].value, 'Ranked · All Mode');
});

test('legacy help language dropdown switches to the English guide and removes language controls', async () => {
  let update;
  const interaction = {
    customId: 'alrenhelp:language',
    isStringSelectMenu: () => true,
    values: ['th'],
    async update(payload) { update = payload; },
  };
  const handler = createInteractionHandler({});

  await handler(interaction);

  assert.match(update.embeds[0].toJSON().title, /English/);
  assert.equal(update.components.length, 1);
  assert.equal(update.components[0].toJSON().components[0].url, 'https://www.alrenbot.xyz/commands');
  assert.doesNotMatch(JSON.stringify(update), /\p{Script=Thai}/u);
});

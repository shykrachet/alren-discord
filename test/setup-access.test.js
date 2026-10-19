const test = require('node:test');
const assert = require('node:assert/strict');
const { createSqliteStore } = require('../src/sqlite-store');
const { resolveInviter, setupAccess, ACCESS_DENIED, ACCESS_UNKNOWN, USE_DENIED, commandAccess } = require('../src/setup-access');
const { createInteractionHandler } = require('../src/slash-commands');

function guild(entries = []) {
  return { id: 'guild', client: { user: { id: 'bot' } }, members: { me: { joinedTimestamp: 100000 } },
    async fetchAuditLogs() { return { entries: new Map(entries.map((entry, i) => [i, entry])) }; } };
}

test('only matching bot-add executor gains setup; stored identity survives audit expiry', async (t) => {
  const store = createSqliteStore({ dbPath: ':memory:' });
  t.after(() => store.close());
  const server = guild([
    { targetId: 'another-bot', executorId: 'admin', createdTimestamp: 100000 },
    { targetId: 'bot', executorId: 'inviter', createdTimestamp: 100000 },
  ]);
  assert.equal(await resolveInviter(server, store), 'inviter');
  server.fetchAuditLogs = async () => { throw new Error('expired'); };
  assert.equal(await setupAccess({ guild: server, user: { id: 'inviter' } }, store), null);
  assert.equal(await setupAccess({ guild: server, user: { id: 'admin' }, memberPermissions: { has: () => true } }, store), ACCESS_DENIED);
  server.members.me.joinedTimestamp = 200000;
  assert.equal(await setupAccess({ guild: server, user: { id: 'inviter' } }, store), ACCESS_UNKNOWN);
});

test('missing permission or missing inviter never grants setup', async (t) => {
  const store = createSqliteStore({ dbPath: ':memory:' });
  t.after(() => store.close());
  const server = guild();
  assert.equal(await setupAccess({ guild: server, user: { id: 'admin' } }, store), ACCESS_UNKNOWN);
  server.fetchAuditLogs = async () => { throw new Error('Missing permissions'); };
  assert.equal(await setupAccess({ guild: server, user: { id: 'admin' } }, store), ACCESS_UNKNOWN);
});

test('all slash setup aliases deny administrators who did not invite Alren', async (t) => {
  const store = createSqliteStore({ dbPath: ':memory:' });
  t.after(() => store.close());
  await store.saveBotInviter('guild', 'inviter', '100000');
  await store.grantBotAccess('guild', 'admin', 'inviter');
  const handler = createInteractionHandler({ store });
  for (const commandName of ['setup', 'verify-setting', 'verify-role', 'osumap-settings', 'community-alert-settings']) {
    let reply;
    const interaction = { commandName, guild: guild(), user: { id: 'admin' },
      inGuild: () => true, isChatInputCommand: () => true, memberPermissions: { has: () => true },
      async deferReply() { this.deferred = true; }, async editReply(payload) { reply = payload; } };
    await handler(interaction);
    assert.equal(reply.content, ACCESS_DENIED);
  }
});

test('everyday commands require a grant, which can be revoked', async (t) => {
  const store = createSqliteStore({ dbPath: ':memory:' });
  t.after(() => store.close());
  await store.saveBotInviter('guild', 'inviter', '100000');
  const context = { guild: guild(), user: { id: 'member' } };
  assert.equal(await commandAccess(context, store), USE_DENIED);
  await store.grantBotAccess('guild', 'member', 'inviter');
  assert.equal(await commandAccess(context, store), null);
  assert.equal(await setupAccess(context, store), ACCESS_DENIED);
  await store.revokeBotAccess('guild', 'member');
  assert.equal(await commandAccess(context, store), USE_DENIED);
});

test('inviter can use setup status without Manage Server', async (t) => {
  const store = createSqliteStore({ dbPath: ':memory:' });
  t.after(() => store.close());
  await store.saveBotInviter('guild', 'inviter', '100000');
  let reply;
  await createInteractionHandler({ store })({ commandName: 'setup', guild: guild(), guildId: 'guild',
    user: { id: 'inviter' }, inGuild: () => true, isChatInputCommand: () => true,
    memberPermissions: { has: () => false }, options: { getSubcommand: () => 'status' },
    async deferReply() { this.deferred = true; }, async editReply(payload) { reply = payload; }, async deleteReply() {} });
  assert.match(reply.embeds[0].toJSON().title, /Alren settings/);
});

test('legacy prefix setup cannot bypass inviter access', async (t) => {
  const { createMessageHandler } = require('../src/message-handler');
  const store = createSqliteStore({ dbPath: ':memory:' });
  t.after(() => store.close());
  await store.saveBotInviter('guild', 'inviter', '100000');
  await store.grantBotAccess('guild', 'admin', 'inviter');
  const handler = createMessageHandler({ bot: { user: { id: 'bot' } }, store });
  for (const command of ['verify-role', 'verify-setting', 'osumap-settings', 'community-alert-settings']) {
    let reply;
    await handler({ content: `!${command}`, guild: guild(), author: { id: 'admin' },
      member: { permissions: { has: () => true } }, inGuild: () => true,
      async reply(payload) { reply = payload; } });
    assert.equal(reply, ACCESS_DENIED);
  }
});

test('help explains access, omits removed chat and fits Discord embed limits', () => {
  const { createHelpEmbed } = require('../src/message-handler');
  const embed = createHelpEmbed().toJSON();
  assert.match(JSON.stringify(embed), /Only the person who invited/);
  assert.doesNotMatch(JSON.stringify(embed), /\/alren\b|\/alrenclear\b/);
  for (const field of embed.fields) assert.ok(field.value.length <= 1024);
});

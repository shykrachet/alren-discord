const test = require('node:test');
const assert = require('node:assert/strict');
const { createSqliteStore } = require('../src/sqlite-store');
const { createAdminHandler } = require('../src/admin-commands');
const { commandAccess, setupAccess, USE_DENIED, ACCESS_DENIED } = require('../src/setup-access');

function server() {
  return { id: 'guild', members: { me: { joinedTimestamp: 1000 }, async fetch(id) { return { id }; } } };
}
function interaction(commandName, userId = 'inviter', action = 'list', target = { id: 'member', bot: false }) {
  return { commandName, guild: server(), guildId: 'guild', user: { id: userId },
    inGuild: () => true, isChatInputCommand: () => true, isButton: () => false,
    options: { getSubcommand: () => action, getUser: () => target },
    async deferReply(payload) { this.deferred = payload; }, async deferUpdate() { this.deferred = true; },
    async editReply(payload) { this.result = payload; }, async reply(payload) { this.result = payload; } };
}
async function storeFor(t) {
  const store = createSqliteStore({ dbPath: ':memory:' });
  t.after(() => store.close());
  await store.saveBotInviter('guild', 'inviter', '1000');
  return store;
}
function resetButton(request, action = 'confirm', userId = 'inviter') {
  const customId = request.result.components[0].toJSON().components[action === 'confirm' ? 0 : 1].custom_id;
  return { ...interaction('', userId), customId, isButton: () => true, isChatInputCommand: () => false };
}

test('inviter grants and revokes everyday access; grantees cannot grant or setup', async (t) => {
  const store = await storeFor(t);
  const handle = createAdminHandler({ store });
  const member = { guild: server(), user: { id: 'member' } };
  assert.equal(await commandAccess(member, store), USE_DENIED);
  const grant = interaction('access', 'inviter', 'grant');
  await handle(grant);
  assert.match(grant.result.embeds[0].toJSON().title, /Access granted/);
  assert.equal(await commandAccess(member, store), null);
  assert.equal(await setupAccess(member, store), ACCESS_DENIED);
  const unauthorized = interaction('access', 'member', 'grant', { id: 'another' });
  await handle(unauthorized);
  assert.equal(unauthorized.result.content, ACCESS_DENIED);
  assert.equal(await store.hasBotAccess('guild', 'another'), false);
  await handle(interaction('access', 'inviter', 'revoke'));
  assert.equal(await commandAccess(member, store), USE_DENIED);
});

test('reset requires the same user, installation permissions, and a live one-use confirmation', async (t) => {
  const store = await storeFor(t);
  let now = 100;
  const handle = createAdminHandler({ store, now: () => now });
  await store.saveMapSettings('guild', { channelId: 'maps', mode: 'mania', status: 'ranked' });
  const request = interaction('reset');
  await handle(request);
  assert.equal((await store.listMapSettings('guild')).length, 1);
  const foreign = resetButton(request, 'confirm', 'member');
  await handle(foreign);
  assert.equal((await store.listMapSettings('guild')).length, 1);
  const confirm = resetButton(request);
  await handle(confirm);
  assert.equal((await store.listMapSettings('guild')).length, 0);
  assert.match(confirm.result.embeds[0].toJSON().title, /settings reset/);
  await store.saveMapSettings('guild', { channelId: 'new', mode: 'osu', status: 'ranked' });
  await handle(confirm);
  assert.match(confirm.result.content, /expired/);
  assert.equal((await store.listMapSettings('guild')).length, 1);
  const expired = interaction('reset');
  await handle(expired);
  now += 60001;
  const button = resetButton(expired);
  await handle(button);
  assert.match(button.result.content, /expired/);
  assert.equal((await store.listMapSettings('guild')).length, 1);
  const cancel = interaction('reset');
  await handle(cancel);
  await handle(resetButton(cancel, 'cancel'));
  assert.equal((await store.listMapSettings('guild')).length, 1);
});

test('reset is guild-scoped and keeps linked accounts, grants and inviter', async (t) => {
  const store = await storeFor(t);
  for (const guildId of ['guild', 'other']) {
    await store.saveVerificationSettings(guildId, { roleId: 'role', channelId: 'welcome' });
    await store.saveMapSettings(guildId, { channelId: 'maps', mode: 'mania', status: 'ranked' });
    await store.markMapPosted(guildId, 123, 'ranked', 'maps');
    await store.saveCommunityAlertSettings(guildId, { channelId: 'alerts', bnMode: 'all' });
    await store.saveVerification({ guildId, discordUserId: 'member', osuUser: { id: 1, username: 'osuUser' } });
    await store.createVerificationRequest({ guildId, discordUserId: 'member', state: guildId, expiresAt: '2099-01-01' });
    await store.grantBotAccess(guildId, 'member', 'inviter');
  }
  await store.resetGuildSettings('guild');
  assert.equal(await store.getVerificationSettings('guild'), null);
  assert.equal(await store.getCommunityAlertSettings('guild'), null);
  assert.deepEqual(await store.listMapSettings('guild'), []);
  assert.equal(await store.hasPostedMap('guild', 123, 'ranked', 'maps'), false);
  assert.equal(await store.consumeVerificationRequest('guild'), null);
  assert.ok(await store.getVerification('guild', 'member'));
  assert.equal(await store.hasBotAccess('guild', 'member'), true);
  assert.equal((await store.getBotInviter('guild')).user_id, 'inviter');
  assert.ok(await store.getVerificationSettings('other'));
  assert.ok(await store.getCommunityAlertSettings('other'));
  assert.equal((await store.listMapSettings('other')).length, 1);
  assert.equal(await store.hasPostedMap('other', 123, 'ranked', 'maps'), true);
  assert.ok(await store.consumeVerificationRequest('other'));
});

test('configured private controller uses ID rather than username and is absent from help', async (t) => {
  const previous = process.env.ALREN_OWNER_ID;
  process.env.ALREN_OWNER_ID = '123456789012345678';
  t.after(() => { if (previous === undefined) delete process.env.ALREN_OWNER_ID; else process.env.ALREN_OWNER_ID = previous; });
  const store = await storeFor(t);
  assert.equal(await setupAccess({ guild: server(), user: { id: '123456789012345678' } }, store), null);
  assert.equal(await commandAccess({ user: { id: '123456789012345678' } }, store), null);
  assert.notEqual(await setupAccess({ guild: server(), user: { id: 'member', username: 'copied-display-name' } }, store), null);
  const { createHelpEmbed } = require('../src/message-handler');
  assert.doesNotMatch(JSON.stringify(createHelpEmbed().toJSON()), /ALREN_OWNER_ID|Alren owner/i);
});

test('unauthorized users cannot reset; grants exclude bots and non-members', async (t) => {
  const store = await storeFor(t);
  const handle = createAdminHandler({ store });
  const denied = interaction('reset', 'admin');
  await handle(denied);
  assert.equal(denied.result.content, ACCESS_DENIED);
  assert.equal(denied.result.components.length, 0);
  const botGrant = interaction('access', 'inviter', 'grant', { id: 'bot', bot: true });
  await handle(botGrant);
  assert.equal(await store.hasBotAccess('guild', 'bot'), false);
  const absent = interaction('access', 'inviter', 'grant', { id: 'absent' });
  absent.guild.members.fetch = async () => { throw new Error('Unknown Member'); };
  await handle(absent);
  assert.equal(await store.hasBotAccess('guild', 'absent'), false);
});

test('private controller grants access when the inviter audit record is unavailable', async (t) => {
  const previous = process.env.ALREN_OWNER_ID;
  process.env.ALREN_OWNER_ID = '123456789012345678';
  t.after(() => { if (previous === undefined) delete process.env.ALREN_OWNER_ID; else process.env.ALREN_OWNER_ID = previous; });
  const store = createSqliteStore({ dbPath: ':memory:' });
  t.after(() => store.close());
  const handle = createAdminHandler({ store });
  const grant = interaction('access', '123456789012345678', 'grant');
  grant.guild.fetchAuditLogs = async () => { throw new Error('Missing access'); };
  await handle(grant);
  assert.equal(await commandAccess({ guild: grant.guild, user: { id: 'member' } }, store), null);
  assert.equal(await setupAccess({ guild: grant.guild, user: { id: '123456789012345678' } }, store), null);
  grant.guild.members.me.joinedTimestamp = 2000;
  assert.notEqual(await commandAccess({ guild: grant.guild, user: { id: 'member' } }, store), null);
  const list = interaction('access', '123456789012345678', 'list');
  await handle(list);
  assert.doesNotMatch(JSON.stringify(list.result), /123456789012345678|ALREN_OWNER_ID|Alren owner/i);
  const revoke = interaction('access', '123456789012345678', 'revoke');
  await handle(revoke);
  assert.doesNotMatch(JSON.stringify(revoke.result), /123456789012345678|ALREN_OWNER_ID|Alren owner/i);
});

test('all everyday slash and prefix commands deny a member without a grant', async (t) => {
  const { createInteractionHandler } = require('../src/slash-commands');
  const { createMessageHandler } = require('../src/message-handler');
  const store = await storeFor(t);
  const slash = createInteractionHandler({ store });
  for (const name of ['help', 'ping', 'verify', 'verify-status', 'map']) {
    const input = interaction(name, 'member');
    await slash(input);
    assert.equal(input.result.content, USE_DENIED);
  }
  const prefix = createMessageHandler({ store, bot: { user: { id: 'bot' } } });
  for (const command of ['help', 'alrenhelp', 'ping', 'osuverify', 'verify-status', 'osumap', 'osumap-status', 'verify-role-status']) {
    let reply;
    await prefix({ guild: server(), author: { id: 'member', bot: false }, content: `!${command}`,
      async reply(payload) { reply = payload; } });
    assert.equal(reply, USE_DENIED);
  }
});

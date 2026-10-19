const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { createSqliteStore } = require('../src/sqlite-store');

test('sqlite-store: verification lifecycle and duplicate checks', async () => {
  const store = createSqliteStore({ dbPath: ':memory:' });

  assert.equal(await store.getVerification('guild-1', 'discord-1'), null);

  await store.saveVerification({
    discordUserId: 'discord-1',
    guildId: 'guild-1',
    osuUser: { id: 12345, username: 'osuUser1' },
  });

  const record = await store.getVerification('guild-1', 'discord-1');
  assert.equal(record.osu_user_id, '12345');
  assert.equal(record.osu_username, 'osuUser1');
  assert.ok(record.verified_at);

  // findOtherOwner when same user -> null
  const same = await store.findOtherOwner('guild-1', 'discord-1', '12345');
  assert.equal(same, null);

  // findOtherOwner when different user has same osu id -> finds it
  const other = await store.findOtherOwner('guild-1', 'discord-2', '12345');
  assert.equal(other.discord_user_id, 'discord-1');

  // Updating verification for same discord user
  await store.saveVerification({
    discordUserId: 'discord-1',
    guildId: 'guild-1',
    osuUser: { id: 99999, username: 'newOsuUser' },
  });
  const updated = await store.getVerification('guild-1', 'discord-1');
  assert.equal(updated.osu_user_id, '99999');
  assert.equal(updated.osu_username, 'newOsuUser');

  store.close();
});

test('sqlite-store: verification settings management', async () => {
  const store = createSqliteStore({ dbPath: ':memory:' });

  assert.equal(await store.getVerificationRole('guild-1'), null);
  assert.equal(await store.getVerificationSettings('guild-1'), null);

  await store.saveVerificationRole('guild-1', 'role-1');
  assert.equal(await store.getVerificationRole('guild-1'), 'role-1');

  await store.saveVerificationSettings('guild-1', { channelId: 'chan-1', roleId: 'role-2' });
  const settings = await store.getVerificationSettings('guild-1');
  assert.equal(settings.role_id, 'role-2');
  assert.equal(settings.channel_id, 'chan-1');

  store.close();
});

test('sqlite-store: map settings and posting state', async () => {
  const store = createSqliteStore({ dbPath: ':memory:' });

  assert.equal(await store.getMapSettings('guild-1'), null);
  assert.deepEqual(await store.listMapSettings(), []);

  await store.saveMapSettings('guild-1', { channelId: 'map-chan', mode: 'osu', status: 'ranked' });
  const mapSettings = await store.getMapSettings('guild-1');
  assert.equal(mapSettings.channel_id, 'map-chan');
  assert.equal(mapSettings.mode_filter, 'osu');
  assert.equal(mapSettings.status_filter, 'ranked');

  const list = await store.listMapSettings();
  assert.equal(list.length, 1);
  assert.equal(list[0].guild_id, 'guild-1');

  // Check map posting state
  assert.equal(await store.hasPostedMap('guild-1', 456, 'ranked'), false);
  await store.markMapPosted('guild-1', 456, 'ranked');
  assert.equal(await store.hasPostedMap('guild-1', 456, 'ranked'), true);
  assert.equal(await store.hasPostedMap('guild-1', 456, 'qualified'), false);
  assert.equal(await store.hasPostedMap('guild-2', 456, 'ranked'), false);

  store.close();
});

test('sqlite-store: feeds and posting history are isolated by channel and server', async (t) => {
  const store = createSqliteStore({ dbPath: ':memory:' });
  t.after(() => store.close());
  for (const [channelId, mode] of [['mania', 'mania'], ['standard', 'osu'], ['taiko', 'taiko'], ['catch', 'catch']]) {
    await store.saveMapSettings('guild', { channelId, mode, status: 'ranked' });
  }
  await store.saveMapSettings('other-guild', { channelId: 'other', mode: 'any', status: 'all' });
  assert.equal((await store.listMapSettings('guild')).length, 4);
  assert.equal((await store.listMapSettings()).length, 5);
  assert.equal((await store.getMapSettings('guild', 'mania')).mode_filter, 'mania');
  assert.equal(await store.getMapSettings('guild', 'unconfigured'), null);

  await store.markMapPosted('guild', 456, 'ranked', 'standard');
  assert.equal(await store.hasPostedMap('guild', 456, 'ranked', 'standard'), true);
  assert.equal(await store.hasPostedMap('guild', 456, 'ranked', 'mania'), false);
  assert.equal(await store.hasPostedMap('other-guild', 456, 'ranked', 'standard'), false);
  await store.markMapPosted('guild', 456, 'ranked', 'mania');

  await store.saveMapSettings('guild', { channelId: 'mania', mode: 'mania', status: 'ranked' });
  assert.equal(await store.hasPostedMap('guild', 456, 'ranked', 'mania'), true);
  await store.saveMapSettings('guild', { channelId: 'mania', mode: 'mania', status: 'loved' });
  assert.equal(await store.hasPostedMap('guild', 456, 'ranked', 'mania'), false);
  assert.equal(await store.hasPostedMap('guild', 456, 'ranked', 'standard'), true);

  assert.equal(await store.deleteMapSettings('guild', 'standard'), true);
  assert.equal(await store.getMapSettings('guild', 'standard'), null);
  assert.equal(await store.hasPostedMap('guild', 456, 'ranked', 'standard'), false);
  assert.equal((await store.listMapSettings('guild')).length, 3);
  assert.equal((await store.listMapSettings('other-guild')).length, 1);
});

test('sqlite-store: migrates a legacy feed and posting watermark and can reopen safely', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alren-map-migration-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, 'legacy.sqlite');
  const legacy = new Database(dbPath);
  legacy.exec(`
    CREATE TABLE osu_map_settings (
      guild_id TEXT PRIMARY KEY, channel_id TEXT, mode_filter TEXT, status_filter TEXT, updated_at TEXT NOT NULL
    );
    CREATE TABLE osu_map_posts (
      guild_id TEXT NOT NULL, beatmapset_id TEXT NOT NULL, status TEXT NOT NULL,
      PRIMARY KEY (guild_id, beatmapset_id, status)
    );
    INSERT INTO osu_map_settings VALUES ('guild', 'mania', 'mania', 'ranked', '2026-10-14T00:00:00Z');
    INSERT INTO osu_map_settings VALUES ('unset-guild', NULL, 'any', 'ranked', '2026-10-14T00:00:00Z');
    INSERT INTO osu_map_posts VALUES ('guild', '123', 'ranked');
    INSERT INTO osu_map_posts VALUES ('unset-guild', '456', 'ranked');
  `);
  legacy.close();

  let store = createSqliteStore({ dbPath });
  try {
    assert.equal((await store.getMapSettings('guild', 'mania')).mode_filter, 'mania');
    assert.equal(await store.hasPostedMap('guild', 123, 'ranked', 'mania'), true);
    assert.equal(await store.hasPostedMap('guild', 123, 'ranked', 'standard'), false);
    assert.deepEqual(await store.listMapSettings('unset-guild'), []);
    await store.saveMapSettings('guild', { channelId: 'standard', mode: 'osu', status: 'loved' });
    await store.markMapPosted('guild', 123, 'ranked', 'standard');
  } finally {
    store.close();
  }
  store = createSqliteStore({ dbPath });
  try {
    assert.equal((await store.listMapSettings('guild')).length, 2);
    assert.equal((await store.getMapSettings('guild', 'standard')).status_filter, 'loved');
    assert.equal(await store.hasPostedMap('guild', 123, 'ranked', 'mania'), true);
    assert.equal(await store.hasPostedMap('guild', 123, 'ranked', 'standard'), true);
  } finally {
    store.close();
  }
});

test('sqlite-store: community alert settings', async () => {
  const store = createSqliteStore({ dbPath: ':memory:' });

  assert.equal(await store.getCommunityAlertSettings('guild-1'), null);
  assert.deepEqual(await store.listCommunityAlertSettings(), []);

  await store.saveCommunityAlertSettings('guild-1', { bnMode: 'taiko', channelId: 'alert-chan' });
  const alerts = await store.getCommunityAlertSettings('guild-1');
  assert.equal(alerts.channel_id, 'alert-chan');
  assert.equal(alerts.bn_mode_filter, 'taiko');

  const alertList = await store.listCommunityAlertSettings();
  assert.equal(alertList.length, 1);
  assert.equal(alertList[0].guild_id, 'guild-1');

  store.close();
});

test('sqlite-store: verification request state tokens', async () => {
  const store = createSqliteStore({ dbPath: ':memory:' });

  await store.createVerificationRequest({
    channelId: 'chan-1',
    discordUserId: 'user-1',
    expiresAt: '2026-10-12T15:00:00Z',
    guildId: 'guild-1',
    osuUserId: 'osu-1',
    state: 'state-abc',
  });

  const consumed = await store.consumeVerificationRequest('state-abc');
  assert.ok(consumed);
  assert.equal(consumed.state, 'state-abc');
  assert.equal(consumed.discord_user_id, 'user-1');

  // Second consume must return null because it's deleted
  const reConsumed = await store.consumeVerificationRequest('state-abc');
  assert.equal(reConsumed, null);

  // Deleting request directly
  await store.createVerificationRequest({
    channelId: null,
    discordUserId: 'user-2',
    expiresAt: '2026-10-12T15:00:00Z',
    guildId: 'guild-1',
    osuUserId: null,
    state: 'state-xyz',
  });
  await store.deleteVerificationRequest('state-xyz');
  assert.equal(await store.consumeVerificationRequest('state-xyz'), null);

  store.close();
});

test('sqlite-store: server setup, linked accounts and feed history survive reopening', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alren-persistence-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, 'alren.sqlite');
  let store = createSqliteStore({ dbPath });
  try {
    await store.saveBotInviter('guild', 'inviter', '100000');
    await store.saveVerificationSettings('guild', { channelId: 'welcome', roleId: 'verified' });
    await store.saveMapSettings('guild', { channelId: 'maps', mode: 'mania', status: 'ranked_loved' });
    await store.saveCommunityAlertSettings('guild', { channelId: 'alerts', bnMode: 'osu' });
    await store.saveVerification({ guildId: 'guild', discordUserId: 'user', osuUser: { id: 123, username: 'mapper' } });
    await store.markMapPosted('guild', 456, 'ranked', 'maps');
    store.close();
    store = createSqliteStore({ dbPath });
    assert.deepEqual(await store.getBotInviter('guild'), { user_id: 'inviter', joined_at: '100000' });
    assert.deepEqual(await store.getVerificationSettings('guild'), { channel_id: 'welcome', role_id: 'verified' });
    assert.equal((await store.getMapSettings('guild', 'maps')).status_filter, 'ranked_loved');
    assert.deepEqual(await store.getCommunityAlertSettings('guild'), { channel_id: 'alerts', bn_mode_filter: 'osu' });
    assert.equal((await store.getVerification('guild', 'user')).osu_user_id, '123');
    assert.equal(await store.hasPostedMap('guild', 456, 'ranked', 'maps'), true);
  } finally {
    store.close();
  }
});

test('sqlite-store: access grants are isolated, persist on reopen and expire on a new installation', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alren-access-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, 'alren.sqlite');
  let store = createSqliteStore({ dbPath });
  try {
    await store.saveBotInviter('guild', 'inviter', '1000');
    await store.grantBotAccess('guild', 'member', 'inviter');
    await store.grantBotAccess('other', 'member', 'other-inviter');
    await store.grantBotAccess('guild', 'member', 'inviter');
    assert.equal((await store.listBotAccess('guild')).length, 1);
    store.close();
    store = createSqliteStore({ dbPath });
    assert.equal(await store.hasBotAccess('guild', 'member'), true);
    assert.equal(await store.hasBotAccess('missing', 'member'), false);
    await store.saveBotInviter('guild', 'inviter', '1000');
    assert.equal(await store.hasBotAccess('guild', 'member'), true);
    await store.saveBotInviter('guild', 'new-inviter', '2000');
    assert.equal(await store.hasBotAccess('guild', 'member'), false);
    assert.equal(await store.hasBotAccess('other', 'member'), true);
    assert.equal(await store.revokeBotAccess('other', 'member'), true);
    assert.equal(await store.revokeBotAccess('other', 'member'), false);
  } finally { store.close(); }
});

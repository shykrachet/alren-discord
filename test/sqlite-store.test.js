const assert = require('node:assert/strict');
const test = require('node:test');
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

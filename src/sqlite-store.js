const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS osu_verifications (
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  osu_user_id TEXT NOT NULL,
  osu_username TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  PRIMARY KEY (guild_id, discord_user_id)
);

CREATE INDEX IF NOT EXISTS idx_osu_verifications_osu_user
  ON osu_verifications (guild_id, osu_user_id);

CREATE TABLE IF NOT EXISTS osu_verification_settings (
  guild_id TEXT PRIMARY KEY,
  role_id TEXT,
  channel_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS osu_verification_requests (
  state TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  osu_user_id TEXT,
  channel_id TEXT,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS osu_map_settings (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT,
  mode_filter TEXT,
  status_filter TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS osu_map_posts (
  guild_id TEXT NOT NULL,
  beatmapset_id TEXT NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (guild_id, beatmapset_id, status)
);

CREATE TABLE IF NOT EXISTS community_alert_settings (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT,
  bn_mode_filter TEXT,
  updated_at TEXT NOT NULL
);
`;

function createSqliteStore({ dbPath = path.join(__dirname, '../data/alren.sqlite') } = {}) {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);
  if (dbPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');

  // Initialize database schema
  db.exec(SCHEMA);

  // Prepared statements for high performance
  const stmts = {
    getVerification: db.prepare(
      'SELECT osu_user_id, osu_username, verified_at FROM osu_verifications WHERE guild_id = ? AND discord_user_id = ? LIMIT 1'
    ),
    findOtherOwner: db.prepare(
      'SELECT discord_user_id FROM osu_verifications WHERE guild_id = ? AND discord_user_id != ? AND osu_user_id = ? LIMIT 1'
    ),
    saveVerification: db.prepare(`
      INSERT INTO osu_verifications (guild_id, discord_user_id, osu_user_id, osu_username, verified_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, discord_user_id) DO UPDATE SET
        osu_user_id = excluded.osu_user_id,
        osu_username = excluded.osu_username,
        verified_at = excluded.verified_at
    `),
    getVerificationRole: db.prepare(
      'SELECT role_id FROM osu_verification_settings WHERE guild_id = ? LIMIT 1'
    ),
    getVerificationSettings: db.prepare(
      'SELECT role_id, channel_id FROM osu_verification_settings WHERE guild_id = ? LIMIT 1'
    ),
    saveVerificationRole: db.prepare(`
      INSERT INTO osu_verification_settings (guild_id, role_id, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        role_id = excluded.role_id,
        updated_at = excluded.updated_at
    `),
    saveVerificationSettings: db.prepare(`
      INSERT INTO osu_verification_settings (guild_id, channel_id, role_id, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        role_id = excluded.role_id,
        updated_at = excluded.updated_at
    `),
    getMapSettings: db.prepare(
      'SELECT channel_id, mode_filter, status_filter FROM osu_map_settings WHERE guild_id = ? LIMIT 1'
    ),
    saveMapSettings: db.prepare(`
      INSERT INTO osu_map_settings (guild_id, channel_id, mode_filter, status_filter, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        mode_filter = excluded.mode_filter,
        status_filter = excluded.status_filter,
        updated_at = excluded.updated_at
    `),
    listMapSettings: db.prepare(
      'SELECT guild_id, channel_id, mode_filter, status_filter FROM osu_map_settings WHERE channel_id IS NOT NULL'
    ),
    getCommunityAlertSettings: db.prepare(
      'SELECT channel_id, bn_mode_filter FROM community_alert_settings WHERE guild_id = ? LIMIT 1'
    ),
    saveCommunityAlertSettings: db.prepare(`
      INSERT INTO community_alert_settings (guild_id, channel_id, bn_mode_filter, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        bn_mode_filter = excluded.bn_mode_filter,
        updated_at = excluded.updated_at
    `),
    listCommunityAlertSettings: db.prepare(
      'SELECT guild_id, channel_id, bn_mode_filter FROM community_alert_settings WHERE channel_id IS NOT NULL'
    ),
    hasPostedMap: db.prepare(
      'SELECT 1 FROM osu_map_posts WHERE guild_id = ? AND beatmapset_id = ? AND status = ? LIMIT 1'
    ),
    markMapPosted: db.prepare(`
      INSERT OR IGNORE INTO osu_map_posts (guild_id, beatmapset_id, status)
      VALUES (?, ?, ?)
    `),
    createVerificationRequest: db.prepare(`
      INSERT OR REPLACE INTO osu_verification_requests (channel_id, discord_user_id, expires_at, guild_id, osu_user_id, state)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    getVerificationRequest: db.prepare(
      'SELECT * FROM osu_verification_requests WHERE state = ? LIMIT 1'
    ),
    deleteVerificationRequest: db.prepare(
      'DELETE FROM osu_verification_requests WHERE state = ?'
    ),
  };

  const consumeVerificationRequestTx = db.transaction((state) => {
    const row = stmts.getVerificationRequest.get(state);
    if (row) {
      stmts.deleteVerificationRequest.run(state);
    }
    return row ?? null;
  });

  async function getVerification(guildId, discordUserId) {
    return stmts.getVerification.get(guildId, discordUserId) ?? null;
  }

  async function findOtherOwner(guildId, discordUserId, osuUserId) {
    return stmts.findOtherOwner.get(guildId, discordUserId, String(osuUserId)) ?? null;
  }

  async function saveVerification({ discordUserId, guildId, osuUser }) {
    stmts.saveVerification.run(
      guildId,
      discordUserId,
      String(osuUser.id),
      osuUser.username,
      new Date().toISOString()
    );
  }

  async function getVerificationRole(guildId) {
    const row = stmts.getVerificationRole.get(guildId);
    return row?.role_id ?? null;
  }

  async function getVerificationSettings(guildId) {
    return stmts.getVerificationSettings.get(guildId) ?? null;
  }

  async function saveVerificationRole(guildId, roleId) {
    stmts.saveVerificationRole.run(guildId, roleId, new Date().toISOString());
  }

  async function saveVerificationSettings(guildId, { channelId, roleId }) {
    stmts.saveVerificationSettings.run(guildId, channelId ?? null, roleId ?? null, new Date().toISOString());
  }

  async function getMapSettings(guildId) {
    return stmts.getMapSettings.get(guildId) ?? null;
  }

  async function saveMapSettings(guildId, { channelId, mode, status }) {
    stmts.saveMapSettings.run(guildId, channelId ?? null, mode ?? null, status ?? null, new Date().toISOString());
  }

  async function listMapSettings() {
    return stmts.listMapSettings.all();
  }

  async function getCommunityAlertSettings(guildId) {
    return stmts.getCommunityAlertSettings.get(guildId) ?? null;
  }

  async function saveCommunityAlertSettings(guildId, { channelId, bnMode }) {
    stmts.saveCommunityAlertSettings.run(guildId, channelId ?? null, bnMode ?? null, new Date().toISOString());
  }

  async function listCommunityAlertSettings() {
    return stmts.listCommunityAlertSettings.all();
  }

  async function hasPostedMap(guildId, beatmapsetId, status) {
    const row = stmts.hasPostedMap.get(guildId, String(beatmapsetId), status);
    return Boolean(row);
  }

  async function markMapPosted(guildId, beatmapsetId, status) {
    stmts.markMapPosted.run(guildId, String(beatmapsetId), status);
  }

  async function createVerificationRequest({ channelId, discordUserId, expiresAt, guildId, osuUserId, state }) {
    stmts.createVerificationRequest.run(
      channelId ?? null,
      discordUserId,
      expiresAt,
      guildId,
      osuUserId ?? null,
      state
    );
  }

  async function consumeVerificationRequest(state) {
    return consumeVerificationRequestTx(state);
  }

  async function deleteVerificationRequest(state) {
    stmts.deleteVerificationRequest.run(state);
  }

  function close() {
    db.close();
  }

  return {
    close,
    consumeVerificationRequest,
    createVerificationRequest,
    deleteVerificationRequest,
    findOtherOwner,
    getCommunityAlertSettings,
    getMapSettings,
    getVerification,
    getVerificationRole,
    getVerificationSettings,
    hasPostedMap,
    isConfigured: true,
    listCommunityAlertSettings,
    listMapSettings,
    markMapPosted,
    saveCommunityAlertSettings,
    saveMapSettings,
    saveVerification,
    saveVerificationRole,
    saveVerificationSettings,
  };
}

module.exports = { createSqliteStore };

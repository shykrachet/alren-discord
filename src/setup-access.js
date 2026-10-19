const { AuditLogEvent } = require('discord.js');

const ACCESS_DENIED = 'Only the person who invited Alren to this server can use setup commands.';
const USE_DENIED = '🔒 You do not have access to Alren yet. Ask the person who invited Alren to grant access with `/access grant user:@you`.';
const ACCESS_UNKNOWN = 'Alren could not identify the inviter. Grant Alren View Audit Log and try again. If the bot-add record has expired, invite Alren again so the inviter can be recorded. Existing settings are preserved.';

function isBotOwner(userId) {
  const configuredId = process.env.ALREN_OWNER_ID?.trim();
  return Boolean(configuredId && /^\d{17,20}$/.test(configuredId) && userId === configuredId);
}

async function resolveInviter(guild, store) {
  if (!guild?.id || !store?.getBotInviter) return null;
  const joinedAt = guild.members?.me?.joinedTimestamp;
  if (!joinedAt) return null;
  const saved = await store.getBotInviter(guild.id);
  if (saved?.joined_at === String(joinedAt)) return saved.user_id;
  let before;
  for (;;) {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 100, ...(before && { before }) });
    const entries = [...logs.entries.values()];
    const entry = entries.find((item) => item.targetId === guild.client.user.id
      && Math.abs(item.createdTimestamp - joinedAt) < 60000);
    if (entry?.executorId) {
      await store.saveBotInviter(guild.id, entry.executorId, String(joinedAt));
      return entry.executorId;
    }
    if (entries.length < 100 || entries.at(-1).createdTimestamp < joinedAt - 60000) return null;
    before = entries.at(-1).id;
  }
}

async function setupAccess(context, store) {
  const userId = context.user?.id || context.author?.id;
  if (isBotOwner(userId)) return null;
  try {
    const inviter = await resolveInviter(context.guild, store);
    if (!inviter) return ACCESS_UNKNOWN;
    return inviter === userId ? null : ACCESS_DENIED;
  } catch {
    return ACCESS_UNKNOWN;
  }
}

async function commandAccess(context, store) {
  const userId = context.user?.id || context.author?.id;
  if (isBotOwner(userId)) return null;
  if (!context.guild?.id) return 'Use Alren in a server where you have been granted access.';
  try {
    // An inviter lookup may be unavailable; explicit owner grants still work,
    // but only for the installation in which they were issued.
    const inviter = await resolveInviter(context.guild, store).catch(() => null);
    if (inviter === userId) return null;
    const installation = context.guild.members?.me?.joinedTimestamp;
    if (installation && await store.hasBotAccess?.(context.guild.id, userId, String(installation))) return null;
    return inviter ? USE_DENIED : ACCESS_UNKNOWN;
  } catch {
    return ACCESS_UNKNOWN;
  }
}

module.exports = { ACCESS_DENIED, ACCESS_UNKNOWN, USE_DENIED, isBotOwner, resolveInviter, setupAccess, commandAccess };

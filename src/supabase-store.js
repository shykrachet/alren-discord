function createSupabaseStore({ url, secretKey }) {
  const baseUrl = url?.replace(/\/$/, '');

  function ensureConfigured() {
    if (!baseUrl || !secretKey) {
      throw new Error('Supabase is not configured: add SUPABASE_URL and SUPABASE_SECRET_KEY.');
    }
  }

  async function request(table, { body, headers = {}, method = 'GET', params = {} } = {}) {
    ensureConfigured();
    const requestUrl = new URL(`/rest/v1/${table}`, baseUrl);
    for (const [key, value] of Object.entries(params)) requestUrl.searchParams.set(key, value);

    const response = await fetch(requestUrl, {
      method,
      headers: {
        apikey: secretKey,
        authorization: `Bearer ${secretKey}`,
        accept: 'application/json',
        ...headers,
        ...(body && { 'content-type': 'application/json' }),
      },
      ...(body && { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      console.error(`Supabase ${method} ${table} failed:`, response.status, await response.text());
      throw new Error('Could not connect to Supabase. Please try again.');
    }
    // PostgREST can return an empty body with either 201 or 204 when a write
    // uses `Prefer: return=minimal`. Do not attempt to parse that as JSON.
    const text = await response.text();
    if (!text.trim()) return null;
    return JSON.parse(text);
  }

  async function getVerification(guildId, discordUserId) {
    const rows = await request('osu_verifications', {
      params: {
        select: 'osu_user_id,osu_username,verified_at',
        guild_id: `eq.${guildId}`,
        discord_user_id: `eq.${discordUserId}`,
        limit: '1',
      },
    });
    return rows[0] ?? null;
  }

  async function findOtherOwner(guildId, discordUserId, osuUserId) {
    const rows = await request('osu_verifications', {
      params: {
        select: 'discord_user_id',
        guild_id: `eq.${guildId}`,
        discord_user_id: `neq.${discordUserId}`,
        osu_user_id: `eq.${osuUserId}`,
        limit: '1',
      },
    });
    return rows[0] ?? null;
  }

  async function saveVerification({ discordUserId, guildId, osuUser }) {
    await request('osu_verifications', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      params: { on_conflict: 'guild_id,discord_user_id' },
      body: {
        discord_user_id: discordUserId,
        guild_id: guildId,
        osu_user_id: String(osuUser.id),
        osu_username: osuUser.username,
        verified_at: new Date().toISOString(),
      },
    });
  }

  async function getVerificationRole(guildId) {
    const rows = await request('osu_verification_settings', {
      params: {
        select: 'role_id',
        guild_id: `eq.${guildId}`,
        limit: '1',
      },
    });
    return rows[0]?.role_id ?? null;
  }

  async function saveVerificationRole(guildId, roleId) {
    await request('osu_verification_settings', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      params: { on_conflict: 'guild_id' },
      body: {
        guild_id: guildId,
        role_id: roleId,
        updated_at: new Date().toISOString(),
      },
    });
  }

  async function getMapSettings(guildId) {
    const rows = await request('osu_map_settings', {
      params: {
        select: 'channel_id,mode_filter,status_filter',
        guild_id: `eq.${guildId}`,
        limit: '1',
      },
    });
    return rows[0] ?? null;
  }

  async function saveMapSettings(guildId, { channelId, mode, status }) {
    await request('osu_map_settings', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      params: { on_conflict: 'guild_id' },
      body: {
        guild_id: guildId,
        channel_id: channelId,
        mode_filter: mode,
        status_filter: status,
        updated_at: new Date().toISOString(),
      },
    });
  }

  async function listMapSettings() {
    return request('osu_map_settings', {
      params: {
        select: 'guild_id,channel_id,mode_filter,status_filter',
        channel_id: 'not.is.null',
      },
    });
  }

  async function getCommunityAlertSettings(guildId) {
    const rows = await request('community_alert_settings', {
      params: {
        select: 'channel_id,bn_mode_filter',
        guild_id: `eq.${guildId}`,
        limit: '1',
      },
    });
    return rows[0] ?? null;
  }

  async function saveCommunityAlertSettings(guildId, { channelId, bnMode }) {
    await request('community_alert_settings', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      params: { on_conflict: 'guild_id' },
      body: {
        guild_id: guildId,
        channel_id: channelId,
        bn_mode_filter: bnMode,
        updated_at: new Date().toISOString(),
      },
    });
  }

  async function listCommunityAlertSettings() {
    return request('community_alert_settings', {
      params: {
        select: 'guild_id,channel_id,bn_mode_filter',
        channel_id: 'not.is.null',
      },
    });
  }

  async function hasPostedMap(guildId, beatmapsetId, status) {
    const rows = await request('osu_map_posts', {
      params: {
        select: 'beatmapset_id',
        guild_id: `eq.${guildId}`,
        beatmapset_id: `eq.${beatmapsetId}`,
        status: `eq.${status}`,
        limit: '1',
      },
    });
    return Boolean(rows[0]);
  }

  async function markMapPosted(guildId, beatmapsetId, status) {
    await request('osu_map_posts', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: {
        beatmapset_id: String(beatmapsetId),
        guild_id: guildId,
        status,
      },
    });
  }

  async function createVerificationRequest({ channelId, discordUserId, expiresAt, guildId, osuUserId, state }) {
    await request('osu_verification_requests', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: {
        channel_id: channelId,
        discord_user_id: discordUserId,
        expires_at: expiresAt,
        guild_id: guildId,
        osu_user_id: osuUserId,
        state,
      },
    });
  }

  async function consumeVerificationRequest(state) {
    const rows = await request('osu_verification_requests', {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
      params: { state: `eq.${state}` },
    });
    return rows[0] ?? null;
  }

  async function deleteVerificationRequest(state) {
    await request('osu_verification_requests', {
      method: 'DELETE',
      params: { state: `eq.${state}` },
    });
  }

  return {
    consumeVerificationRequest,
    createVerificationRequest,
    deleteVerificationRequest,
    findOtherOwner,
    getVerification,
    getVerificationRole,
    getMapSettings,
    getCommunityAlertSettings,
    hasPostedMap,
    isConfigured: Boolean(baseUrl && secretKey),
    listMapSettings,
    listCommunityAlertSettings,
    markMapPosted,
    saveVerification,
    saveVerificationRole,
    saveMapSettings,
    saveCommunityAlertSettings,
  };
}

module.exports = { createSupabaseStore };

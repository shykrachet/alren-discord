const { EmbedBuilder } = require('discord.js');
const { OSU_CLIENT_ID, OSU_CLIENT_SECRET } = require('./config');
const { modeLabel } = require('./mode-icons');

const OSU_API_URL = 'https://osu.ppy.sh/api/v2';
const OSU_TOKEN_URL = 'https://osu.ppy.sh/oauth/token';
const STATUSES = ['ranked', 'qualified', 'loved'];
const MODES = {
  any: null,
  osu: 0,
  taiko: 1,
  catch: 2,
  mania: 3,
};
const STATUS_COLORS = {
  ranked: 0x66ccff,
  qualified: 0xffcc22,
  loved: 0xff66aa,
};
const STATUS_ICONS = {
  ranked: '⏫',
  qualified: '✅',
  loved: '❤️',
};

function titleCase(value) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : 'Unknown';
}

function validateStatus(status) {
  if (status === 'all' || STATUSES.includes(status)) return status;
  throw new Error(`Unsupported beatmap status: ${status}`);
}

function validateMode(mode) {
  if (Object.hasOwn(MODES, mode)) return mode;
  throw new Error(`Unsupported osu! mode: ${mode}`);
}

function mapModes(beatmapset) {
  const modes = new Set((beatmapset.beatmaps || []).map((beatmap) => beatmap.mode));
  return [...modes].map(modeLabel).join(', ') || 'Unknown';
}

function mapNominators(beatmapset) {
  const users = new Map((beatmapset.related_users || []).map((user) => [String(user.id), user.username]));
  const names = (beatmapset.current_nominations || [])
    .map((nomination) => users.get(String(nomination.user_id)))
    .filter(Boolean);
  return [...new Set(names)].join(', ') || 'Not listed';
}

function difficultySummary(beatmapset) {
  const stars = (beatmapset.beatmaps || [])
    .map((beatmap) => Number(beatmap.difficulty_rating))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!stars.length) return `${(beatmapset.beatmaps || []).length || 'Unknown'} difficulties`;
  const range = stars.length === 1
    ? `${stars[0].toFixed(2)}★`
    : `${stars[0].toFixed(2)}★ – ${stars.at(-1).toFixed(2)}★`;
  return `${range} • ${stars.length} difficult${stars.length === 1 ? 'y' : 'ies'}`;
}

function mapLength(beatmapset) {
  const seconds = Math.max(0, ...(beatmapset.beatmaps || [])
    .map((beatmap) => Number(beatmap.total_length))
    .filter(Number.isFinite));
  if (!seconds) return 'Unknown';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function compactMetadata(value, maxLength = 900) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return 'Not listed';
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function createMapEmbed(beatmapset) {
  if (!beatmapset?.id) throw new Error('Cannot create an embed without a beatmapset.');

  const url = `https://osu.ppy.sh/beatmapsets/${beatmapset.id}`;
  const status = beatmapset.status || 'unknown';
  const mapper = beatmapset.user_id
    ? `[${beatmapset.creator || 'Unknown'}](https://osu.ppy.sh/users/${beatmapset.user_id})`
    : beatmapset.creator || 'Unknown';
  const statusLabel = `${STATUS_ICONS[status] || '🎵'} ${titleCase(status)}`;
  const bpm = Number(beatmapset.bpm);
  const embed = new EmbedBuilder()
    .setColor(STATUS_COLORS[status] || 0x5865f2)
    .setTitle(`${beatmapset.artist || 'Unknown artist'} — ${beatmapset.title || 'Untitled'}`)
    .setURL(url)
    .setDescription(`Mapped by ${mapper}\n[Open beatmap page ↗](${url})`)
    .addFields(
      { name: '🏷️ Status', value: statusLabel, inline: true },
      { name: '🎮 Modes', value: mapModes(beatmapset), inline: true },
      { name: '⭐ Difficulties', value: difficultySummary(beatmapset), inline: true },
      { name: '🎵 BPM', value: Number.isFinite(bpm) ? String(bpm) : 'Unknown', inline: true },
      { name: '⏱️ Length', value: mapLength(beatmapset), inline: true },
      { name: '✅ Nominators', value: mapNominators(beatmapset), inline: false },
      { name: '📀 Source', value: compactMetadata(beatmapset.source), inline: false },
      { name: '🎸 Genre', value: compactMetadata(beatmapset.genre?.name), inline: true },
      { name: '🌐 Language', value: compactMetadata(beatmapset.language?.name), inline: true },
      { name: '🏷️ Mapper Tags', value: compactMetadata(beatmapset.tags), inline: false },
    )
    .setFooter({ text: `osu! beatmapset • #${beatmapset.id}` });

  const updatedAt = beatmapset.ranked_date || beatmapset.last_updated;
  if (updatedAt && !Number.isNaN(Date.parse(updatedAt))) embed.setTimestamp(new Date(updatedAt));

  const cover = beatmapset.covers?.['cover@2x']
    || beatmapset.covers?.cover
    || beatmapset.covers?.['card@2x']
    || beatmapset.covers?.card;
  if (cover) embed.setImage(cover);
  const thumbnail = beatmapset.covers?.['list@2x'] || beatmapset.covers?.list;
  if (thumbnail) embed.setThumbnail(thumbnail);
  return embed;
}

function createOsuMapService({
  store,
  clientId = OSU_CLIENT_ID,
  clientSecret = OSU_CLIENT_SECRET,
  fetchImpl = global.fetch,
  random = Math.random,
} = {}) {
  let accessToken;
  let accessTokenExpiresAt = 0;
  let feedTimer;
  let feedRunning = false;

  function ensureApiConfigured() {
    if (!clientId || !clientSecret) {
      throw new Error('osu! is not configured: add OSU_CLIENT_ID and OSU_CLIENT_SECRET.');
    }
    if (typeof fetchImpl !== 'function') throw new Error('This Node.js version does not provide fetch.');
  }

  async function getAccessToken() {
    ensureApiConfigured();
    if (accessToken && Date.now() < accessTokenExpiresAt) return accessToken;

    const response = await fetchImpl(OSU_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: Number(clientId),
        client_secret: clientSecret,
        grant_type: 'client_credentials',
        scope: 'public',
      }),
    });
    if (!response.ok) {
      throw new Error(`osu! authentication failed (${response.status}).`);
    }

    const token = await response.json();
    if (!token.access_token) throw new Error('osu! authentication returned no access token.');
    accessToken = token.access_token;
    // Refresh one minute early so a token cannot expire midway through a feed pass.
    accessTokenExpiresAt = Date.now() + Math.max(0, Number(token.expires_in || 0) - 60) * 1000;
    return accessToken;
  }

  async function searchMaps({ mode, status }) {
    const token = await getAccessToken();
    const url = new URL(`${OSU_API_URL}/beatmapsets/search`);
    url.searchParams.set('s', status);
    url.searchParams.set('sort', 'ranked_desc');
    if (MODES[mode] !== null) url.searchParams.set('m', String(MODES[mode]));

    const response = await fetchImpl(url, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) throw new Error(`osu! beatmap search failed (${response.status}).`);
    const result = await response.json();
    return Array.isArray(result.beatmapsets) ? result.beatmapsets : [];
  }

  function normalizeSettings(settings) {
    return {
      channelId: settings?.channel_id || settings?.channelId,
      guildId: settings?.guild_id || settings?.guildId,
      mode: validateMode(settings?.mode_filter || settings?.mode || 'any'),
      status: validateStatus(settings?.status_filter || settings?.status || 'ranked'),
    };
  }

  async function getSavedSettings(guildId) {
    if (!store?.isConfigured) return null;
    return store.getMapSettings(guildId);
  }

  async function resolveFilters({ guildId, mode, status }) {
    const saved = await getSavedSettings(guildId);
    return {
      mode: validateMode(mode || saved?.mode_filter || 'any'),
      status: validateStatus(status || saved?.status_filter || 'ranked'),
    };
  }

  async function newestMap(filters) {
    const statuses = filters.status === 'all' ? STATUSES : [filters.status];
    const resultSets = await Promise.all(statuses.map((status) => searchMaps({
      mode: filters.mode,
      status,
    })));
    return resultSets
      .flat()
      .sort((left, right) => {
        const leftDate = Date.parse(left.ranked_date || left.last_updated || 0);
        const rightDate = Date.parse(right.ranked_date || right.last_updated || 0);
        return rightDate - leftDate;
      })[0] || null;
  }

  async function getRandomMap({ guildId, mode, status } = {}) {
    const requestedFilters = await resolveFilters({ guildId, mode, status });
    const selectedStatus = requestedFilters.status === 'all'
      ? STATUSES[Math.floor(random() * STATUSES.length)]
      : requestedFilters.status;
    const maps = await searchMaps({ mode: requestedFilters.mode, status: selectedStatus });
    if (!maps.length) throw new Error('No osu! beatmaps matched those filters.');
    const map = maps[Math.floor(random() * maps.length)];
    return {
      map,
      filters: { ...requestedFilters, status: selectedStatus },
    };
  }

  async function configureFeed({ channelId, guildId, mode, status }) {
    if (!store?.isConfigured) {
      throw new Error('Supabase is not configured: add SUPABASE_URL and SUPABASE_SECRET_KEY.');
    }
    const previous = await store.getMapSettings(guildId);
    const settings = normalizeSettings({
      channelId,
      guildId,
      mode: mode || previous?.mode_filter || 'any',
      status: status || previous?.status_filter || 'ranked',
    });
    await store.saveMapSettings(guildId, settings);

    // Prime the feed so enabling it does not post an existing map as if it were new.
    const map = await newestMap(settings);
    if (map) await store.markMapPosted(guildId, map.id, map.status);
    return settings;
  }

  async function checkFeed(postMap) {
    if (feedRunning || !store?.isConfigured) return;
    feedRunning = true;
    try {
      const settingsRows = await store.listMapSettings();
      for (const row of settingsRows || []) {
        const settings = normalizeSettings(row);
        try {
          const map = await newestMap(settings);
          if (!map || await store.hasPostedMap(settings.guildId, map.id, map.status)) continue;
          await postMap({ map, settings });
          await store.markMapPosted(settings.guildId, map.id, map.status);
        } catch (error) {
          console.error(`Beatmap feed failed for server ${settings.guildId}:`, error.message);
        }
      }
    } finally {
      feedRunning = false;
    }
  }

  function startFeed(postMap) {
    if (typeof postMap !== 'function') throw new Error('A beatmap feed callback is required.');
    if (!store?.isConfigured) {
      console.warn('Beatmap feed is disabled: Supabase is not configured.');
      return () => {};
    }
    if (feedTimer) clearInterval(feedTimer);

    const requestedMinutes = Number(process.env.OSU_MAP_FEED_INTERVAL_MINUTES || 15);
    const intervalMinutes = Number.isFinite(requestedMinutes)
      ? Math.min(Math.max(requestedMinutes, 5), 60)
      : 15;
    const run = () => checkFeed(postMap).catch((error) => {
      console.error('Beatmap feed check failed:', error.message);
    });

    run();
    feedTimer = setInterval(run, intervalMinutes * 60 * 1000);
    feedTimer.unref?.();
    return () => {
      clearInterval(feedTimer);
      feedTimer = undefined;
    };
  }

  return { configureFeed, getRandomMap, startFeed };
}

module.exports = { createMapEmbed, createOsuMapService };

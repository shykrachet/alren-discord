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
const DEFAULT_FEED_INTERVAL_SECONDS = 30;
const MAX_FEED_POSTS_PER_PASS = 10;

function titleCase(value) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : 'Unknown';
}

function validateStatus(status) {
  if (status === 'all' || status === 'ranked_loved' || STATUSES.includes(status)) return status;
  throw new Error(`Unsupported beatmap status: ${status}`);
}

function validateMode(mode) {
  if (Object.hasOwn(MODES, mode)) return mode;
  throw new Error(`Unsupported osu! mode: ${mode}`);
}

function beatmapModes(beatmapset) {
  return [...new Set((beatmapset.beatmaps || []).map((beatmap) => beatmap.mode).filter(Boolean))];
}

function mapModes(beatmapset) {
  return beatmapModes(beatmapset).map(modeLabel).join(', ') || 'Unknown';
}

function mapNominators(beatmapset) {
  const users = new Map((beatmapset.related_users || []).map((user) => [String(user.id), user]));
  const nominators = (beatmapset.current_nominations || [])
    .map((nomination) => users.get(String(nomination.user_id)))
    .filter(Boolean);
  return [...new Map(nominators.map((user) => [String(user.id), user])).values()]
    .map((user) => `[${user.username}](https://osu.ppy.sh/users/${user.id})`)
    .join(', ') || 'Not listed';
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

function searchableMetadata(metadata, queryKey) {
  const name = compactMetadata(metadata?.name);
  if (name === 'Not listed' || metadata?.id == null) return name;
  return `[${name}](https://osu.ppy.sh/beatmapsets?${queryKey}=${encodeURIComponent(metadata.id)})`;
}

function mapDate(beatmapset) {
  return Date.parse(beatmapset.ranked_date || beatmapset.last_updated || 0);
}

function feedStatuses(status) {
  if (status === 'ranked_loved') return ['ranked', 'loved'];
  return status === 'all' ? STATUSES : [status];
}

function feedIntervalMs({ intervalSeconds, intervalMinutes }) {
  const requestedSeconds = intervalSeconds != null
    ? Number(intervalSeconds)
    : Number(intervalMinutes ?? DEFAULT_FEED_INTERVAL_SECONDS / 60) * 60;
  const safeSeconds = Number.isFinite(requestedSeconds)
    ? Math.min(Math.max(requestedSeconds, 30), 3600)
    : DEFAULT_FEED_INTERVAL_SECONDS;
  return safeSeconds * 1000;
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
      { name: '🎸 Genre', value: searchableMetadata(beatmapset.genre, 'g'), inline: true },
      { name: '🌐 Language', value: searchableMetadata(beatmapset.language, 'l'), inline: true },
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
  intervalSeconds = process.env.OSU_MAP_FEED_INTERVAL_SECONDS,
  intervalMinutes = process.env.OSU_MAP_FEED_INTERVAL_MINUTES,
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

  async function getBeatmapset(beatmapset) {
    const token = await getAccessToken();
    const response = await fetchImpl(`${OSU_API_URL}/beatmapsets/${beatmapset.id}`, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) throw new Error(`osu! beatmap details failed (${response.status}).`);
    const details = await response.json();
    return { ...beatmapset, ...details };
  }

  function normalizeSettings(settings) {
    return {
      channelId: settings?.channel_id || settings?.channelId,
      guildId: settings?.guild_id || settings?.guildId,
      mode: validateMode(settings?.mode_filter || settings?.mode || 'any'),
      status: validateStatus(settings?.status_filter || settings?.status || 'ranked'),
    };
  }

  async function getSavedSettings(guildId, channelId) {
    if (!store?.isConfigured) return null;
    return store.getMapSettings(guildId, channelId);
  }

  async function resolveFilters({ channelId, guildId, mode, status }) {
    const saved = await getSavedSettings(guildId, channelId);
    return {
      mode: validateMode(mode || saved?.mode_filter || 'any'),
      status: validateStatus(status || saved?.status_filter || 'ranked'),
    };
  }

  async function newestMap(filters) {
    const resultSets = await Promise.all(feedStatuses(filters.status).map((status) => searchMaps({
      mode: filters.mode,
      status,
    })));
    return resultSets
      .flat()
      .sort((left, right) => mapDate(right) - mapDate(left))[0] || null;
  }

  async function feedCandidatesByStatus(filters) {
    const entries = await Promise.all(feedStatuses(filters.status).map(async (status) => {
      const maps = await searchMaps({ mode: filters.mode, status });
      return [status, maps
        .map((map) => ({ ...map, status: map.status || status }))
        .sort((left, right) => mapDate(right) - mapDate(left))];
    }));
    return entries;
  }

  async function getRandomMap({ channelId, guildId, mode, status } = {}) {
    const requestedFilters = await resolveFilters({ channelId, guildId, mode, status });
    const statuses = feedStatuses(requestedFilters.status);
    const selectedStatus = statuses.length > 1
      ? statuses[Math.floor(random() * statuses.length)]
      : statuses[0];
    const maps = await searchMaps({ mode: requestedFilters.mode, status: selectedStatus });
    if (!maps.length) throw new Error('No osu! beatmaps matched those filters.');
    const selectedMap = maps[Math.floor(random() * maps.length)];
    const map = await getBeatmapset(selectedMap);
    return {
      map,
      filters: { ...requestedFilters, status: selectedStatus },
    };
  }

  async function configureFeed({ channelId, guildId, mode, status }) {
    if (!store?.isConfigured) {
      throw new Error('Database is not configured.');
    }
    if (!guildId || !channelId) throw new Error('A server and beatmap feed channel are required.');
    const previous = await store.getMapSettings(guildId, channelId);
    const settings = normalizeSettings({
      channelId,
      guildId,
      mode: mode || previous?.mode_filter || 'any',
      status: status || previous?.status_filter || 'ranked',
    });
    // Prime each watched status so enabling the feed does not post existing maps as if they were new.
    const candidateGroups = await feedCandidatesByStatus(settings);
    await store.saveMapSettings(guildId, settings);
    await Promise.all(candidateGroups.flatMap(([status, maps]) => {
      const newest = maps[0];
      return newest ? [store.markMapPosted(guildId, newest.id, newest.status || status, channelId)] : [];
    }));
    return settings;
  }

  async function newFeedMaps(settings) {
    const candidateGroups = await feedCandidatesByStatus(settings);
    const unposted = [];
    for (const [status, maps] of candidateGroups) {
      for (const map of maps) {
        if (await store.hasPostedMap(settings.guildId, map.id, map.status || status, settings.channelId)) break;
        unposted.push({ ...map, status: map.status || status });
      }
    }
    return unposted
      .sort((left, right) => mapDate(left) - mapDate(right))
      .slice(0, MAX_FEED_POSTS_PER_PASS);
  }

  async function checkFeed(postMap) {
    if (feedRunning || !store?.isConfigured) return;
    feedRunning = true;
    try {
      const settingsRows = await store.listMapSettings();
      for (const row of settingsRows || []) {
        const settings = normalizeSettings(row);
        try {
          const mapSummaries = await newFeedMaps(settings);
          for (const mapSummary of mapSummaries) {
            const map = await getBeatmapset(mapSummary);
            if (await postMap({ map, settings }) === false) break;
            await store.markMapPosted(settings.guildId, mapSummary.id, mapSummary.status, settings.channelId);
          }
        } catch (error) {
          console.error(`Beatmap feed failed for server ${settings.guildId}, channel ${settings.channelId}:`, error.message);
        }
      }
    } finally {
      feedRunning = false;
    }
  }

  function startFeed(postMap) {
    if (typeof postMap !== 'function') throw new Error('A beatmap feed callback is required.');
    if (!store?.isConfigured) {
      console.warn('Beatmap feed is disabled: database is not configured.');
      return () => {};
    }
    if (feedTimer) clearInterval(feedTimer);

    const run = () => checkFeed(postMap).catch((error) => {
      console.error('Beatmap feed check failed:', error.message);
    });

    run();
    feedTimer = setInterval(run, feedIntervalMs({ intervalSeconds, intervalMinutes }));
    feedTimer.unref?.();
    return () => {
      clearInterval(feedTimer);
      feedTimer = undefined;
    };
  }

  return { configureFeed, getRandomMap, startFeed };
}

module.exports = { createMapEmbed, createOsuMapService };

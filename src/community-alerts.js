const { EmbedBuilder } = require('discord.js');
const { modeLabel } = require('./mode-icons');

const BN_SOURCE_URL = 'https://bn.mappersguild.com/api/relevantInfo';
const MISSION_LOG_SOURCE_URL = 'https://mappersguild.com/api/logs/query';
const BN_PAGE_URL = 'https://bn.mappersguild.com/';
const MISSIONS_PAGE_URL = 'https://mappersguild.com/missions';
const DEFAULT_CACHE_MS = 60 * 1000;
const DEFAULT_INTERVAL_MINUTES = 5;

const MODE_NAMES = {
  all: '🌐 All modes',
  osu: 'osu!',
  taiko: 'osu!taiko',
  catch: 'osu!catch',
  mania: 'osu!mania',
};

const REQUEST_METHOD_NAMES = {
  gameChat: 'osu! chat',
  moddingQueue: 'Modding queue',
  personalQueue: 'Personal queue',
};

const BN_ROLE_NAMES = {
  bn: 'Beatmap Nominator',
  nat: 'Nomination Assessment Team',
};

function titleCase(value) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : 'Unknown';
}

function safeHttpUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeBnMode(value) {
  if (value === 'fruits') return 'catch';
  return MODE_NAMES[value] ? value : 'all';
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : [];
}

function compactText(value, maxLength = 1024) {
  const text = String(value || '').trim();
  if (!text) return 'None listed';
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function preferenceText(positive = [], negative = [], custom = []) {
  const lines = [
    ...stringList(positive).map((item) => `✅ ${item}`),
    ...stringList(negative).map((item) => `❌ ${item}`),
    ...stringList(custom).map((item) => `• ${item}`),
  ];
  return compactText(lines.join('\n'), 650);
}

function relativeDiscordTime(value) {
  const time = Date.parse(value || '');
  return Number.isNaN(time) ? 'Unknown' : `<t:${Math.floor(time / 1000)}:R>`;
}

function shouldDeliverCommunityAlert(alert, settings) {
  if (!settings?.channel_id) return false;
  if (!['bn-open', 'bn-closed'].includes(alert.type)) return alert.type === 'mission-open';
  const filter = normalizeBnMode(settings.bn_mode_filter || 'all');
  return filter === 'all' || filter === alert.entry.mode;
}

function normalizeBnRequests(data) {
  const entries = [];
  const seen = new Set();

  for (const modeGroup of data?.allUsersByMode || []) {
    for (const user of modeGroup.users || []) {
      const mode = normalizeBnMode(user.mode || modeGroup._id);
      const preferenceMode = ['osu', 'taiko', 'catch', 'mania'].includes(mode) ? mode : 'osu';
      const id = user.id || user.osuId;
      if (!id) continue;
      const key = `${id}:${mode}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const requestMethods = Array.isArray(user.requestStatus) ? user.requestStatus : [];
      const status = requestMethods.length === 0
        ? 'unknown'
        : requestMethods.includes('closed') ? 'closed' : 'open';
      entries.push({
        id: String(id),
        key,
        username: user.username,
        osuId: user.osuId,
        mode,
        status,
        requestMethods: requestMethods.filter((method) => method !== 'closed'),
        requestLink: safeHttpUrl(user.requestLink),
        requestInfo: user.requestInfo || null,
        lastOpenedAt: user.lastOpenedForRequests || null,
        avatarUrl: user.osuId ? `https://a.ppy.sh/${encodeURIComponent(user.osuId)}` : null,
        coverUrl: safeHttpUrl(user.cover),
        group: user.groups || null,
        level: user.level || null,
        languages: stringList(user.languages),
        genrePreferences: stringList(user.genrePreferences),
        genreNegativePreferences: stringList(user.genreNegativePreferences),
        customGenrePreferences: stringList(user.customGenrePreferences),
        languagePreferences: stringList(user.languagePreferences),
        languageNegativePreferences: stringList(user.languageNegativePreferences),
        customLanguagePreferences: stringList(user.customLanguagePreferences),
        mapPreferences: stringList(user[`${preferenceMode}StylePreferences`]),
        mapNegativePreferences: stringList(user[`${preferenceMode}StyleNegativePreferences`]),
        songDetailPreferences: stringList(user.detailPreferences),
        songDetailNegativePreferences: stringList(user.detailNegativePreferences),
        mapperPreferences: stringList(user.mapperPreferences),
        mapperNegativePreferences: stringList(user.mapperNegativePreferences),
        customMapPreferences: stringList(user.customMapPreferences),
        customDetailPreferences: stringList(user.customDetailPreferences),
        customMapperPreferences: stringList(user.customMapperPreferences),
      });
    }
  }

  return entries;
}

function normalizeMissionOpenings(data) {
  return (data?.logs || []).flatMap((log) => {
    if (log.category !== 'mission') return [];
    const match = /^"(.+)" opened$/.exec(log.action || '');
    if (!match) return [];
    return [{
      id: String(log.id || log._id || `${log.action}:${log.createdAt || ''}`),
      name: match[1],
      openedAt: log.createdAt || null,
      url: MISSIONS_PAGE_URL,
    }];
  });
}

function createBnStatusEmbed(entry, isOpen) {
  const modeName = modeLabel(entry.mode);
  const methods = entry.requestMethods
    .map((method) => REQUEST_METHOD_NAMES[method] || method)
    .join(', ') || 'See profile';
  const profileUrl = `https://osu.ppy.sh/users/${encodeURIComponent(entry.osuId)}`;
  const bnUrl = new URL(BN_PAGE_URL);
  bnUrl.searchParams.set('id', entry.id);
  const roleName = BN_ROLE_NAMES[entry.group] || 'BN/NAT member';
  const level = entry.level ? ` • ${titleCase(entry.level)}` : '';
  const embed = new EmbedBuilder()
    .setColor(isOpen ? 0x22c55e : 0xef4444)
    .setAuthor({
      name: `${entry.username} • ${roleName}${level}`,
      ...(entry.avatarUrl ? { iconURL: entry.avatarUrl } : {}),
    })
    .setTitle(isOpen ? '🟢 Beatmap requests are open' : '🔴 Beatmap requests are closed')
    .setURL(bnUrl.toString())
    .setDescription(isOpen
      ? `**[${entry.username}](${profileUrl})** is accepting **${modeName}** requests now.`
      : `**[${entry.username}](${profileUrl})** is no longer accepting **${modeName}** requests.`)
    .addFields(
      { name: isOpen ? '🟢 Status' : '🔴 Status', value: isOpen ? '**Open**' : '**Closed**', inline: true },
      { name: '🕒 Last opened', value: relativeDiscordTime(entry.lastOpenedAt), inline: true },
      { name: '📨 Request methods', value: methods, inline: true },
      { name: '🗣️ Languages', value: entry.languages?.join(', ') || 'Not listed', inline: true },
      { name: '🎸 Genre preferences', value: preferenceText(entry.genrePreferences, entry.genreNegativePreferences, entry.customGenrePreferences), inline: true },
      { name: '🌐 Language preferences', value: preferenceText(entry.languagePreferences, entry.languageNegativePreferences, entry.customLanguagePreferences), inline: true },
      { name: `🎮 ${modeName} map preferences`, value: preferenceText(entry.mapPreferences, entry.mapNegativePreferences, entry.customMapPreferences), inline: true },
      { name: '🎧 Song details', value: preferenceText(entry.songDetailPreferences, entry.songDetailNegativePreferences, entry.customDetailPreferences), inline: true },
      { name: '🗺️ Mapper preferences', value: preferenceText(entry.mapperPreferences, entry.mapperNegativePreferences, entry.customMapperPreferences), inline: true },
    )
    .setFooter({ text: 'BN request data • bn.mappersguild.com' });

  if (entry.requestLink) {
    embed.addFields({ name: '🔗 Request link', value: `[Open request page ↗](${entry.requestLink})` });
  }
  if (entry.requestInfo) {
    embed.spliceFields(4, 0, { name: '📝 Request information', value: compactText(entry.requestInfo, 900) });
  }
  if (entry.coverUrl) embed.setImage(entry.coverUrl);
  if (entry.avatarUrl) embed.setThumbnail(entry.avatarUrl);
  const openedAt = Date.parse(entry.lastOpenedAt || '');
  embed.setTimestamp(isOpen && !Number.isNaN(openedAt) ? new Date(openedAt) : new Date());
  return embed;
}

function createBnRequestEmbed(entry) {
  return createBnStatusEmbed(entry, true);
}

function createBnClosedEmbed(entry) {
  return createBnStatusEmbed(entry, false);
}

function createMissionEmbed(mission) {
  return new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle('🆕 New Mappers\' Guild mission')
    .setURL(MISSIONS_PAGE_URL)
    .setDescription(`**${mission.name}** is now open.`)
    .setTimestamp(mission.openedAt ? new Date(mission.openedAt) : new Date());
}

function createCommunityAlertsService({
  fetchImpl = global.fetch,
  cacheMs = DEFAULT_CACHE_MS,
  intervalMinutes = process.env.COMMUNITY_ALERT_INTERVAL_MINUTES,
} = {}) {
  let bnStates;
  let missionLogIds;
  let monitorTimer;
  let monitorRunning = false;
  let cachedSnapshot;
  let cacheExpiresAt = 0;
  let snapshotPromise;

  async function fetchJson(url) {
    if (typeof fetchImpl !== 'function') throw new Error('This Node.js version does not provide fetch.');
    const response = await fetchImpl(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'Alren Discord Bot/0.1 (+https://github.com/shykrachet/alren-discord)',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}.`);
    return response.json();
  }

  async function fetchBnRequests() {
    return normalizeBnRequests(await fetchJson(BN_SOURCE_URL));
  }

  async function fetchMissionOpenings() {
    return normalizeMissionOpenings(await fetchJson(MISSION_LOG_SOURCE_URL));
  }

  async function loadSnapshot() {
    const [bnResult, missionResult] = await Promise.allSettled([
      fetchBnRequests(),
      fetchMissionOpenings(),
    ]);
    return {
      checkedAt: new Date().toISOString(),
      bnRequests: bnResult.status === 'fulfilled'
        ? { source: BN_SOURCE_URL, entries: bnResult.value }
        : { source: BN_SOURCE_URL, entries: [], error: bnResult.reason.message },
      missions: missionResult.status === 'fulfilled'
        ? { source: MISSION_LOG_SOURCE_URL, recentOpenings: missionResult.value }
        : { source: MISSION_LOG_SOURCE_URL, recentOpenings: [], error: missionResult.reason.message },
    };
  }

  async function getSnapshot({ force = false } = {}) {
    if (!force && cachedSnapshot && Date.now() < cacheExpiresAt) return cachedSnapshot;
    if (snapshotPromise) return snapshotPromise;

    snapshotPromise = loadSnapshot().then((snapshot) => {
      cachedSnapshot = snapshot;
      cacheExpiresAt = Date.now() + cacheMs;
      return snapshot;
    }).finally(() => {
      snapshotPromise = undefined;
    });
    return snapshotPromise;
  }

  async function checkNow(sendAlert) {
    const snapshot = await getSnapshot({ force: true });

    if (!snapshot.bnRequests.error) {
      const nextStates = new Map(snapshot.bnRequests.entries.map((entry) => [entry.key, entry.status]));
      if (bnStates && typeof sendAlert === 'function') {
        for (const entry of snapshot.bnRequests.entries) {
          const previousStatus = bnStates.get(entry.key);
          if (entry.status === 'open' && previousStatus !== 'open') {
            await sendAlert({ type: 'bn-open', entry });
          } else if (entry.status === 'closed' && previousStatus === 'open') {
            await sendAlert({ type: 'bn-closed', entry });
          }
        }
      }
      bnStates = nextStates;
    }

    if (!snapshot.missions.error) {
      const currentIds = new Set(snapshot.missions.recentOpenings.map((mission) => mission.id));
      if (missionLogIds && typeof sendAlert === 'function') {
        const newMissions = snapshot.missions.recentOpenings
          .filter((mission) => !missionLogIds.has(mission.id))
          .reverse();
        for (const mission of newMissions) {
          await sendAlert({ type: 'mission-open', mission });
        }
      }
      missionLogIds = new Set([...(missionLogIds || []), ...currentIds]);
      if (missionLogIds.size > 1000) {
        missionLogIds = new Set([...missionLogIds].slice(-1000));
      }
    }

    return snapshot;
  }

  function start(sendAlert) {
    if (typeof sendAlert !== 'function') throw new Error('A community alert callback is required.');
    if (monitorTimer) clearInterval(monitorTimer);

    const requestedMinutes = Number(intervalMinutes || DEFAULT_INTERVAL_MINUTES);
    const safeMinutes = Number.isFinite(requestedMinutes)
      ? Math.min(Math.max(requestedMinutes, 1), 60)
      : DEFAULT_INTERVAL_MINUTES;
    const run = async () => {
      if (monitorRunning) return;
      monitorRunning = true;
      try {
        const snapshot = await checkNow(sendAlert);
        if (snapshot.bnRequests.error) console.error('BN request monitor failed:', snapshot.bnRequests.error);
        if (snapshot.missions.error) console.error('Mission monitor failed:', snapshot.missions.error);
      } catch (error) {
        console.error('Community alert monitor failed:', error.message);
      } finally {
        monitorRunning = false;
      }
    };

    run();
    monitorTimer = setInterval(run, safeMinutes * 60 * 1000);
    monitorTimer.unref?.();
    return () => {
      clearInterval(monitorTimer);
      monitorTimer = undefined;
    };
  }

  async function handleApiRequest(request, response) {
    const requestUrl = new URL(request.url, 'http://localhost');
    if (requestUrl.pathname !== '/api/community-alerts') return false;

    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('cache-control', 'public, max-age=60');
    response.setHeader('content-type', 'application/json; charset=utf-8');
    if (request.method !== 'GET') {
      response.writeHead(405, { allow: 'GET' });
      response.end(JSON.stringify({ error: 'Method not allowed' }));
      return true;
    }

    const snapshot = await getSnapshot();
    response.writeHead(200);
    response.end(JSON.stringify(snapshot));
    return true;
  }

  return {
    checkNow,
    getSnapshot,
    handleApiRequest,
    start,
  };
}

module.exports = {
  createBnClosedEmbed,
  createBnRequestEmbed,
  createCommunityAlertsService,
  createMissionEmbed,
  normalizeBnRequests,
  normalizeMissionOpenings,
  shouldDeliverCommunityAlert,
};

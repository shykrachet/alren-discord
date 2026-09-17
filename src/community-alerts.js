const { EmbedBuilder } = require('discord.js');

const BN_SOURCE_URL = 'https://bn.mappersguild.com/api/relevantInfo';
const MISSION_LOG_SOURCE_URL = 'https://mappersguild.com/api/logs/query';
const BN_PAGE_URL = 'https://bn.mappersguild.com/';
const MISSIONS_PAGE_URL = 'https://mappersguild.com/missions';
const DEFAULT_CACHE_MS = 60 * 1000;
const DEFAULT_INTERVAL_MINUTES = 5;

const MODE_NAMES = {
  all: 'All modes',
  osu: 'osu!',
  taiko: 'osu!taiko',
  catch: 'osu!catch',
  mania: 'osu!mania',
};

const REQUEST_METHOD_NAMES = {
  gameChat: 'osu! chat',
  personalQueue: 'Personal queue',
};

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

function shouldDeliverCommunityAlert(alert, settings) {
  if (!settings?.channel_id) return false;
  if (alert.type !== 'bn-open') return alert.type === 'mission-open';
  const filter = normalizeBnMode(settings.bn_mode_filter || 'all');
  return filter === 'all' || filter === alert.entry.mode;
}

function normalizeBnRequests(data) {
  const entries = [];
  const seen = new Set();

  for (const modeGroup of data?.allUsersByMode || []) {
    for (const user of modeGroup.users || []) {
      const mode = normalizeBnMode(user.mode || modeGroup._id);
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

function createBnRequestEmbed(entry) {
  const modeName = MODE_NAMES[entry.mode] || entry.mode;
  const methods = entry.requestMethods
    .map((method) => REQUEST_METHOD_NAMES[method] || method)
    .join(', ') || 'See profile';
  const profileUrl = `https://osu.ppy.sh/users/${encodeURIComponent(entry.osuId)}`;
  const bnUrl = new URL(BN_PAGE_URL);
  bnUrl.searchParams.set('id', entry.id);
  const embed = new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle('🟢 BN requests are open')
    .setURL(bnUrl.toString())
    .setDescription(`**[${entry.username}](${profileUrl})** is now accepting **${modeName}** requests.`)
    .addFields(
      { name: 'Request method', value: methods, inline: true },
      { name: 'Mode', value: modeName, inline: true },
    )
    .setTimestamp(entry.lastOpenedAt ? new Date(entry.lastOpenedAt) : new Date());

  if (entry.requestLink) {
    embed.addFields({ name: 'Request link', value: `[Open request page](${entry.requestLink})` });
  }
  if (entry.requestInfo) {
    const info = entry.requestInfo.length > 900
      ? `${entry.requestInfo.slice(0, 897)}...`
      : entry.requestInfo;
    embed.addFields({ name: 'Notes', value: info });
  }
  return embed;
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
          if (entry.status === 'open' && bnStates.get(entry.key) !== 'open') {
            await sendAlert({ type: 'bn-open', entry });
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
  createBnRequestEmbed,
  createCommunityAlertsService,
  createMissionEmbed,
  normalizeBnRequests,
  normalizeMissionOpenings,
  shouldDeliverCommunityAlert,
};

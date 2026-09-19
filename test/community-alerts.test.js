const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createBnClosedEmbed,
  createBnRequestEmbed,
  createCommunityAlertsService,
  createMissionEmbed,
  normalizeBnRequests,
  normalizeMissionOpenings,
  shouldDeliverCommunityAlert,
} = require('../src/community-alerts');

function bnResponse(status) {
  return {
    allUsersByMode: [{
      _id: 'osu',
      users: [{
        id: 'bn-id',
        username: 'Mapper',
        osuId: 123,
        mode: 'osu',
        requestStatus: status === 'open' ? ['personalQueue'] : ['personalQueue', 'closed'],
        requestLink: 'https://example.com/queue',
        cover: 'https://example.com/banner.jpg',
        languages: ['english', 'thai'],
        genrePreferences: ['rock'],
        genreNegativePreferences: ['country'],
        languagePreferences: ['instrumental'],
        osuStylePreferences: ['tech'],
        detailPreferences: ['featured artist'],
        mapperPreferences: ['new mapper'],
      }],
    }],
  };
}

function missionResponse(logs) {
  return { logs };
}

test('normalizes BN request status using the upstream UI rules', () => {
  const entries = normalizeBnRequests({
    allUsersByMode: [{
      _id: 'mania',
      users: [
        { id: '1', username: 'Open', osuId: 1, requestStatus: ['gameChat'] },
        { id: '2', username: 'Closed', osuId: 2, requestStatus: ['closed'] },
        { id: '3', username: 'Unknown', osuId: 3, requestStatus: [] },
      ],
    }],
  });
  assert.deepEqual(entries.map((entry) => entry.status), ['open', 'closed', 'unknown']);
  assert.equal(entries[0].mode, 'mania');
});

test('creates a rich BN request card with artwork and preferences', () => {
  const [entry] = normalizeBnRequests(bnResponse('open'));
  const embed = createBnRequestEmbed(entry).toJSON();

  assert.equal(embed.image.url, 'https://example.com/banner.jpg');
  assert.equal(embed.thumbnail.url, 'https://a.ppy.sh/123');
  assert.match(embed.author.name, /Mapper/);
  assert.equal(embed.url, 'https://bn.mappersguild.com/?id=bn-id');
  assert.match(embed.description, /https:\/\/osu\.ppy\.sh\/users\/123/);
  assert.match(embed.fields.find((field) => field.name.includes('Request link')).value, /https:\/\/example\.com\/queue/);
  assert.match(embed.fields.find((field) => field.name.includes('Genre')).value, /✅ rock/);
  assert.match(embed.fields.find((field) => field.name.includes('Genre')).value, /❌ country/);
  assert.match(embed.fields.find((field) => field.name.includes('Languages')).value, /english, thai/);
});

test('creates a red BN closed card with the same profile artwork', () => {
  const [entry] = normalizeBnRequests(bnResponse('closed'));
  const embed = createBnClosedEmbed(entry).toJSON();

  assert.equal(embed.color, 0xef4444);
  assert.match(embed.title, /closed/i);
  assert.equal(embed.image.url, 'https://example.com/banner.jpg');
  assert.equal(embed.fields.find((field) => field.name.includes('Status')).value, '**Closed**');
});

test('normalizes only mission-open log events', () => {
  const missions = normalizeMissionOpenings(missionResponse([
    { id: '1', category: 'mission', action: '"New mission" opened', createdAt: '2026-09-17T00:00:00Z' },
    { id: '2', category: 'mission', action: 'removed a map from mission' },
    { id: '3', category: 'party', action: '"Not a mission" opened' },
  ]));
  assert.deepEqual(missions, [{
    id: '1',
    name: 'New mission',
    openedAt: '2026-09-17T00:00:00Z',
    url: 'https://mappersguild.com/missions',
  }]);
});

test('creates a linked Mappers Guild mission card', () => {
  const embed = createMissionEmbed({
    id: 'mission-id',
    name: 'New mission',
    openedAt: '2026-09-17T00:00:00Z',
  }).toJSON();

  assert.equal(embed.title, '🆕 New Mappers\' Guild mission');
  assert.equal(embed.url, 'https://mappersguild.com/missions');
  assert.match(embed.description, /New mission/);
  assert.equal(embed.timestamp, '2026-09-17T00:00:00.000Z');
});

test('delivers BN alerts only for the configured mode and always delivers missions', () => {
  const settings = { channel_id: 'alerts', bn_mode_filter: 'mania' };
  assert.equal(shouldDeliverCommunityAlert({
    type: 'bn-open', entry: { mode: 'mania' },
  }, settings), true);
  assert.equal(shouldDeliverCommunityAlert({
    type: 'bn-open', entry: { mode: 'osu' },
  }, settings), false);
  assert.equal(shouldDeliverCommunityAlert({
    type: 'bn-closed', entry: { mode: 'mania' },
  }, settings), true);
  assert.equal(shouldDeliverCommunityAlert({ type: 'mission-open' }, settings), true);
  assert.equal(shouldDeliverCommunityAlert({ type: 'mission-open' }, {
    bn_mode_filter: 'all',
  }), false);
});

test('first check creates a baseline and the next check emits only transitions', async () => {
  let bnCalls = 0;
  let missionCalls = 0;
  const fetchImpl = async (url) => {
    const value = String(url).includes('bn.mappersguild.com')
      ? [bnResponse('closed'), bnResponse('open'), bnResponse('closed')][bnCalls++]
      : [
        missionResponse([{ id: 'old', category: 'mission', action: '"Old" opened' }]),
        missionResponse([
          { id: 'new', category: 'mission', action: '"New" opened' },
          { id: 'old', category: 'mission', action: '"Old" opened' },
        ]),
        missionResponse([
          { id: 'new', category: 'mission', action: '"New" opened' },
          { id: 'old', category: 'mission', action: '"Old" opened' },
        ]),
      ][missionCalls++];
    return { ok: true, json: async () => value };
  };
  const alerts = [];
  const service = createCommunityAlertsService({ fetchImpl });

  await service.checkNow((alert) => alerts.push(alert));
  assert.equal(alerts.length, 0);
  await service.checkNow((alert) => alerts.push(alert));
  assert.deepEqual(alerts.map((alert) => alert.type), ['bn-open', 'mission-open']);
  assert.equal(alerts[1].mission.name, 'New');
  await service.checkNow((alert) => alerts.push(alert));
  assert.deepEqual(alerts.map((alert) => alert.type), ['bn-open', 'mission-open', 'bn-closed']);
});

test('API handler returns the normalized public snapshot', async () => {
  const service = createCommunityAlertsService({
    fetchImpl: async (url) => ({
      ok: true,
      json: async () => (String(url).includes('bn.mappersguild.com')
        ? bnResponse('open')
        : missionResponse([{ id: '1', category: 'mission', action: '"Mission" opened' }])),
    }),
  });
  const headers = {};
  let statusCode;
  let body;
  const handled = await service.handleApiRequest(
    { method: 'GET', url: '/api/community-alerts' },
    {
      setHeader: (name, value) => { headers[name] = value; },
      writeHead: (status) => { statusCode = status; },
      end: (value) => { body = value; },
    },
  );

  assert.equal(handled, true);
  assert.equal(statusCode, 200);
  assert.equal(headers['access-control-allow-origin'], '*');
  const parsed = JSON.parse(body);
  assert.equal(parsed.bnRequests.entries[0].status, 'open');
  assert.equal(parsed.missions.recentOpenings[0].name, 'Mission');
});

const assert = require('node:assert/strict');
const test = require('node:test');
const { createMapEmbed, createOsuMapService } = require('../src/osu-maps');
const { syncApplicationModeEmojis } = require('../src/mode-icons');
const { createSqliteStore } = require('../src/sqlite-store');

function beatmapsetTemplate(id, status = 'ranked') {
  return {
    id,
    artist: 'Artist',
    title: 'Title',
    creator: 'Mapper',
    status,
    ranked_date: '2026-09-17T00:00:00Z',
    beatmaps: [
      { difficulty_rating: 2.5, mode: 'osu', total_length: 125 },
      { difficulty_rating: 5.75, mode: 'mania', total_length: 180 },
    ],
    bpm: 180,
    covers: {
      cover: 'https://example.com/cover.jpg',
      list: 'https://example.com/list.jpg',
    },
    current_nominations: [{ user_id: 42 }],
    genre: { id: 10, name: 'Electronic' },
    language: { id: 5, name: 'Instrumental' },
    related_users: [{ id: 42, username: 'Nominator' }],
    source: '4 Digit osu!mania World Cup 4',
    tags: 'featured artist original song electronic instrumental',
  };
}

function apiFetch(beatmapsets, requests) {
  return async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('/oauth/token')) {
      return {
        ok: true,
        json: async () => ({ access_token: 'token', expires_in: 3600 }),
      };
    }
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/beatmapsets/search')) {
      const summaries = beatmapsets.map((beatmapset) => {
        const {
          current_nominations: currentNominations,
          genre,
          language,
          related_users: relatedUsers,
          ...summary
        } = beatmapset;
        return summary;
      });
      return {
        ok: true,
        json: async () => ({ beatmapsets: summaries }),
      };
    }
    const id = Number(pathname.split('/').at(-1));
    return {
      ok: true,
      json: async () => beatmapsets.find((beatmapset) => beatmapset.id === id),
    };
  };
}

function feedApiFetch(beatmapsByStatus, requests = []) {
  const allMaps = Object.values(beatmapsByStatus).flat();
  return async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('/oauth/token')) {
      return {
        ok: true,
        json: async () => ({ access_token: 'token', expires_in: 3600 }),
      };
    }
    const requestUrl = new URL(url);
    if (requestUrl.pathname.endsWith('/beatmapsets/search')) {
      return {
        ok: true,
        json: async () => ({ beatmapsets: beatmapsByStatus[requestUrl.searchParams.get('s')] || [] }),
      };
    }
    const id = Number(requestUrl.pathname.split('/').at(-1));
    return {
      ok: true,
      json: async () => allMaps.find((beatmapset) => beatmapset.id === id),
    };
  };
}

test('createMapEmbed presents the beatmap metadata', () => {
  const embed = createMapEmbed(beatmapsetTemplate(123)).toJSON();
  assert.equal(embed.title, 'Artist — Title');
  assert.equal(embed.url, 'https://osu.ppy.sh/beatmapsets/123');
  assert.equal(embed.fields.find((field) => field.name.includes('Status')).value, '⏫ Ranked');
  assert.equal(embed.fields.find((field) => field.name.includes('Modes')).name, '🎮 Modes');
  assert.equal(embed.fields.find((field) => field.name.includes('Modes')).value, '🎯 osu!, 🎹 osu!mania');
  assert.equal(embed.fields.find((field) => field.name.includes('Difficulties')).value, '2.50★ – 5.75★ • 2 difficulties');
  assert.equal(embed.fields.find((field) => field.name.includes('Nominators')).value, '[Nominator](https://osu.ppy.sh/users/42)');
  assert.equal(embed.fields.find((field) => field.name.includes('Source')).value, '4 Digit osu!mania World Cup 4');
  assert.equal(embed.fields.find((field) => field.name.includes('Genre')).value, '[Electronic](https://osu.ppy.sh/beatmapsets?g=10)');
  assert.equal(embed.fields.find((field) => field.name.includes('Language')).value, '[Instrumental](https://osu.ppy.sh/beatmapsets?l=5)');
  assert.equal(embed.fields.some((field) => field.name.includes('Mapper Tags')), false);
  assert.equal(embed.image.url, 'https://example.com/cover.jpg');
  assert.equal(embed.thumbnail.url, 'https://example.com/list.jpg');
});

test('createMapEmbed uses synced img/modes application emoji icons', async () => {
  const application = {
    emojis: {
      async fetch() {
        return [];
      },
      async create(options) {
        return { id: options.name === 'alren_mode_osu_v2' ? '10' : '20', name: options.name };
      },
    },
  };

  await syncApplicationModeEmojis(application);
  const embed = createMapEmbed(beatmapsetTemplate(123)).toJSON();

  assert.equal(embed.fields.find((field) => field.name.includes('Modes')).name, '🎮 Modes');
  assert.equal(embed.fields.find((field) => field.name.includes('Modes')).value, '<:alren_mode_osu_v2:10> osu!, <:alren_mode_mania_v2:20> osu!mania');
});

test('uses the requested Discord status icons', () => {
  const ranked = createMapEmbed(beatmapsetTemplate(1, 'ranked')).toJSON();
  const qualified = createMapEmbed(beatmapsetTemplate(2, 'qualified')).toJSON();
  const loved = createMapEmbed(beatmapsetTemplate(3, 'loved')).toJSON();
  const status = (embed) => embed.fields.find((field) => field.name.includes('Status')).value;

  assert.equal(status(ranked), '⏫ Ranked');
  assert.equal(status(qualified), '✅ Qualified');
  assert.equal(status(loved), '❤️ Loved');
});

test('getRandomMap uses stored filters and authenticates with osu!', async () => {
  const requests = [];
  const service = createOsuMapService({
    clientId: '123',
    clientSecret: 'secret',
    fetchImpl: apiFetch([beatmapsetTemplate(456, 'loved')], requests),
    random: () => 0,
    store: {
      isConfigured: true,
      getMapSettings: async () => ({ mode_filter: 'mania', status_filter: 'loved' }),
    },
  });

  const result = await service.getRandomMap({ guildId: 'guild' });
  assert.equal(result.map.id, 456);
  assert.equal(result.map.genre.name, 'Electronic');
  assert.equal(result.map.language.name, 'Instrumental');
  assert.equal(result.map.related_users[0].username, 'Nominator');
  assert.deepEqual(result.filters, { mode: 'mania', status: 'loved' });
  assert.equal(JSON.parse(requests[0].options.body).grant_type, 'client_credentials');
  assert.match(requests[1].url, /[?&]s=loved(?:&|$)/);
  assert.match(requests[1].url, /[?&]m=3(?:&|$)/);
  assert.equal(requests[2].url, 'https://osu.ppy.sh/api/v2/beatmapsets/456');
});

test('configureFeed saves settings and primes the latest map', async () => {
  const saved = [];
  const posted = [];
  const service = createOsuMapService({
    clientId: '123',
    clientSecret: 'secret',
    fetchImpl: apiFetch([beatmapsetTemplate(789)], []),
    store: {
      isConfigured: true,
      getMapSettings: async () => null,
      saveMapSettings: async (...args) => saved.push(args),
      markMapPosted: async (...args) => posted.push(args),
    },
  });

  const settings = await service.configureFeed({ channelId: 'channel', guildId: 'guild' });
  assert.deepEqual(settings, {
    channelId: 'channel',
    guildId: 'guild',
    mode: 'any',
    status: 'ranked',
  });
  assert.deepEqual(saved, [['guild', settings]]);
  assert.deepEqual(posted, [['guild', 789, 'ranked', 'channel']]);
});

test('configureFeed primes every status for realtime all-mode feeds', async () => {
  const posted = [];
  const service = createOsuMapService({
    clientId: '123',
    clientSecret: 'secret',
    fetchImpl: feedApiFetch({
      ranked: [beatmapsetTemplate(100, 'ranked')],
      qualified: [beatmapsetTemplate(200, 'qualified')],
      loved: [beatmapsetTemplate(300, 'loved')],
    }),
    store: {
      isConfigured: true,
      getMapSettings: async () => null,
      saveMapSettings: async () => {},
      markMapPosted: async (...args) => posted.push(args),
    },
  });

  await service.configureFeed({
    channelId: 'channel',
    guildId: 'guild',
    mode: 'any',
    status: 'all',
  });

  assert.deepEqual(posted, [
    ['guild', 100, 'ranked', 'channel'],
    ['guild', 200, 'qualified', 'channel'],
    ['guild', 300, 'loved', 'channel'],
  ]);
});

test('startFeed posts all new all-mode maps before the previous watermark', async () => {
  const delivered = [];
  const marked = [];
  const service = createOsuMapService({
    clientId: '123',
    clientSecret: 'secret',
    fetchImpl: feedApiFetch({
      ranked: [
        { ...beatmapsetTemplate(101, 'ranked'), ranked_date: '2026-09-17T00:02:00Z' },
        { ...beatmapsetTemplate(100, 'ranked'), ranked_date: '2026-09-17T00:00:00Z' },
      ],
      qualified: [
        { ...beatmapsetTemplate(201, 'qualified'), ranked_date: '2026-09-17T00:03:00Z' },
        { ...beatmapsetTemplate(200, 'qualified'), ranked_date: '2026-09-17T00:01:00Z' },
      ],
      loved: [
        { ...beatmapsetTemplate(300, 'loved'), ranked_date: '2026-09-17T00:00:30Z' },
      ],
    }),
    store: {
      isConfigured: true,
      listMapSettings: async () => [{
        channel_id: 'channel',
        guild_id: 'guild',
        mode_filter: 'any',
        status_filter: 'all',
      }],
      hasPostedMap: async (guildId, beatmapsetId) => [100, 200, 300].includes(Number(beatmapsetId)),
      markMapPosted: async (...args) => marked.push(args),
    },
  });

  const stop = service.startFeed(async ({ map }) => {
    delivered.push(map.id);
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  stop();

  assert.deepEqual(delivered, [101, 201]);
  assert.deepEqual(marked, [
    ['guild', 101, 'ranked', 'channel'],
    ['guild', 201, 'qualified', 'channel'],
  ]);
});

test('feeds four modes to separate channels and delivers shared sets to both matching channels', async (t) => {
  const store = createSqliteStore({ dbPath: ':memory:' });
  t.after(() => store.close());
  const allMaps = [];
  const modeNames = ['osu', 'taiko', 'fruits', 'mania'];
  const makeMap = (id, modes, date) => ({
    ...beatmapsetTemplate(id),
    beatmaps: modes.map((mode) => ({ mode, difficulty_rating: 3 })),
    ranked_date: date,
  });
  for (let i = 0; i < modeNames.length; i += 1) {
    allMaps.push(makeMap(100 + i, [modeNames[i]], '2026-10-13T00:00:00Z'));
  }
  const fetchImpl = async (url) => {
    const requestUrl = new URL(url);
    if (requestUrl.pathname.endsWith('/oauth/token')) {
      return { ok: true, json: async () => ({ access_token: 'token', expires_in: 3600 }) };
    }
    if (requestUrl.pathname.endsWith('/search')) {
      const mode = modeNames[Number(requestUrl.searchParams.get('m'))];
      const beatmapsets = allMaps.filter((map) => map.status === requestUrl.searchParams.get('s')
        && (!requestUrl.searchParams.has('m') || map.beatmaps.some((beatmap) => beatmap.mode === mode)));
      return { ok: true, json: async () => ({ beatmapsets }) };
    }
    return { ok: true, json: async () => allMaps.find((map) => map.id === Number(requestUrl.pathname.split('/').at(-1))) };
  };
  const service = createOsuMapService({ store, clientId: '123', clientSecret: 'secret', fetchImpl, random: () => 0 });
  for (const mode of ['osu', 'taiko', 'catch', 'mania']) {
    await service.configureFeed({ guildId: 'guild', channelId: mode, mode });
  }
  assert.equal((await store.listMapSettings('guild')).length, 4);
  for (let i = 0; i < modeNames.length; i += 1) {
    allMaps.push(makeMap(200 + i, [modeNames[i]], '2026-10-14T00:00:00Z'));
  }
  allMaps.push(makeMap(300, ['osu', 'mania'], '2026-10-14T00:01:00Z'));

  const delivered = [];
  async function runFeed() {
    const stop = service.startFeed(async ({ map, settings }) => delivered.push([settings.channelId, map.id]));
    try {
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      stop();
    }
  }
  await runFeed();
  assert.deepEqual(delivered, [
    ['catch', 202], ['mania', 203], ['mania', 300], ['osu', 200], ['osu', 300], ['taiko', 201],
  ]);
  await runFeed();
  assert.equal(delivered.length, 6, 'the next poll must not post duplicates');

  assert.deepEqual((await service.getRandomMap({ guildId: 'guild', channelId: 'mania' })).filters, { mode: 'mania', status: 'ranked' });
  assert.deepEqual((await service.getRandomMap({ guildId: 'guild', channelId: 'osu' })).filters, { mode: 'osu', status: 'ranked' });
  assert.deepEqual((await service.getRandomMap({ guildId: 'guild', channelId: 'unconfigured' })).filters, { mode: 'any', status: 'ranked' });
  assert.deepEqual((await service.getRandomMap({ guildId: 'guild', channelId: 'mania', mode: 'taiko' })).filters, { mode: 'taiko', status: 'ranked' });
});

test('failed feed setup preserves the previous filters and posting history', async (t) => {
  const store = createSqliteStore({ dbPath: ':memory:' });
  t.after(() => store.close());
  await store.saveMapSettings('guild', { channelId: 'mania', mode: 'mania', status: 'ranked' });
  await store.markMapPosted('guild', 123, 'ranked', 'mania');
  const service = createOsuMapService({
    store,
    clientId: '123',
    clientSecret: 'secret',
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  await assert.rejects(service.configureFeed({ guildId: 'guild', channelId: 'mania', mode: 'osu' }), /authentication failed/);
  assert.equal((await store.getMapSettings('guild', 'mania')).mode_filter, 'mania');
  assert.equal(await store.hasPostedMap('guild', 123, 'ranked', 'mania'), true);
  assert.equal((await store.listMapSettings('guild')).length, 1);
});

test('Ranked + Loved primes and polls both statuses without requesting Qualified', async (t) => {
  const store = createSqliteStore({ dbPath: ':memory:' });
  t.after(() => store.close());
  const requests = [];
  const initialMaps = {
    ranked: [beatmapsetTemplate(100, 'ranked')],
    loved: [beatmapsetTemplate(300, 'loved')],
    qualified: [beatmapsetTemplate(200, 'qualified')],
  };
  const createService = (maps) => createOsuMapService({
    store, clientId: '123', clientSecret: 'secret', fetchImpl: feedApiFetch(maps, requests),
  });
  await createService(initialMaps).configureFeed({
    guildId: 'guild', channelId: 'mania', mode: 'mania', status: 'ranked_loved',
  });
  assert.equal((await store.getMapSettings('guild', 'mania')).status_filter, 'ranked_loved');
  assert.equal(await store.hasPostedMap('guild', 100, 'ranked', 'mania'), true);
  assert.equal(await store.hasPostedMap('guild', 300, 'loved', 'mania'), true);
  assert.equal(await store.hasPostedMap('guild', 200, 'qualified', 'mania'), false);

  const service = createService({
    ranked: [{ ...beatmapsetTemplate(101, 'ranked'), ranked_date: '2026-10-14T00:00:00Z' }, ...initialMaps.ranked],
    loved: [{ ...beatmapsetTemplate(301, 'loved'), ranked_date: '2026-10-14T00:01:00Z' }, ...initialMaps.loved],
    qualified: initialMaps.qualified,
  });
  const delivered = [];
  for (let pass = 0; pass < 2; pass += 1) {
    const stop = service.startFeed(async ({ map, settings }) => delivered.push([settings.channelId, map.id, map.status]));
    try {
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      stop();
    }
  }
  assert.deepEqual(delivered, [['mania', 101, 'ranked'], ['mania', 301, 'loved']]);
  const searches = requests.map(({ url }) => new URL(url)).filter((url) => url.pathname.endsWith('/search'));
  assert.deepEqual(searches.map((url) => url.searchParams.get('s')), ['ranked', 'loved', 'ranked', 'loved', 'ranked', 'loved']);
  assert.ok(searches.every((url) => url.searchParams.get('m') === '3'));
});

test('random maps inherit Ranked + Loved from the channel and choose only its allowed statuses', async (t) => {
  const store = createSqliteStore({ dbPath: ':memory:' });
  t.after(() => store.close());
  await store.saveMapSettings('guild', { channelId: 'mania', mode: 'mania', status: 'ranked_loved' });
  for (const [randomValue, expectedStatus, expectedId] of [[0, 'ranked', 100], [0.75, 'loved', 300]]) {
    const requests = [];
    const service = createOsuMapService({
      store,
      clientId: '123',
      clientSecret: 'secret',
      random: () => randomValue,
      fetchImpl: feedApiFetch({ ranked: [beatmapsetTemplate(100)], loved: [beatmapsetTemplate(300, 'loved')] }, requests),
    });
    const result = await service.getRandomMap({ guildId: 'guild', channelId: 'mania' });
    assert.deepEqual(result.filters, { mode: 'mania', status: expectedStatus });
    assert.equal(result.map.id, expectedId);
    assert.equal(new URL(requests[1].url).searchParams.get('s'), expectedStatus);
    const overridden = await service.getRandomMap({ guildId: 'guild', channelId: 'mania', status: 'ranked' });
    assert.equal(overridden.filters.status, 'ranked');
    assert.equal(overridden.map.id, 100);
  }
});

test('beatmap feed checks immediately and delivers new maps on the next 30-second tick', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const store = createSqliteStore({ dbPath: ':memory:' });
  t.after(() => store.close());
  await store.saveMapSettings('guild', { channelId: 'mania', mode: 'mania', status: 'ranked' });
  await store.markMapPosted('guild', 100, 'ranked', 'mania');
  const maps = [beatmapsetTemplate(100)];
  const requests = [];
  const delivered = [];
  const service = createOsuMapService({
    store,
    clientId: '123',
    clientSecret: 'secret',
    intervalSeconds: null,
    intervalMinutes: null,
    fetchImpl: apiFetch(maps, requests),
  });
  const stop = service.startFeed(async ({ map }) => delivered.push(map.id));
  t.after(stop);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(requests.some(({ url }) => url.includes('/search')));
  assert.deepEqual(delivered, []);

  maps.push({ ...beatmapsetTemplate(101), ranked_date: '2026-10-14T00:00:00Z' });
  t.mock.timers.tick(29_999);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(delivered, []);
  t.mock.timers.tick(1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(delivered, [101]);
  t.mock.timers.tick(30_000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(delivered, [101]);
  stop();
  const requestCount = requests.length;
  t.mock.timers.tick(30_000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, requestCount);
});

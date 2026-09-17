const assert = require('node:assert/strict');
const test = require('node:test');
const { createMapEmbed, createOsuMapService } = require('../src/osu-maps');

function map(id, status = 'ranked') {
  return {
    id,
    artist: 'Artist',
    title: 'Title',
    creator: 'Mapper',
    status,
    ranked_date: '2026-09-17T00:00:00Z',
    beatmaps: [{ mode: 'osu' }, { mode: 'mania' }],
    covers: { cover: 'https://example.com/cover.jpg' },
    current_nominations: [{ user_id: 42 }],
    related_users: [{ id: 42, username: 'Nominator' }],
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
    return {
      ok: true,
      json: async () => ({ beatmapsets }),
    };
  };
}

test('createMapEmbed presents the beatmap metadata', () => {
  const embed = createMapEmbed(map(123)).toJSON();
  assert.equal(embed.title, 'Artist — Title');
  assert.equal(embed.url, 'https://osu.ppy.sh/beatmapsets/123');
  assert.equal(embed.fields.find((field) => field.name === 'Modes').value, 'osu!, osu!mania');
  assert.equal(embed.fields.find((field) => field.name === 'Nominators').value, 'Nominator');
  assert.equal(embed.image.url, 'https://example.com/cover.jpg');
});

test('getRandomMap uses stored filters and authenticates with osu!', async () => {
  const requests = [];
  const service = createOsuMapService({
    clientId: '123',
    clientSecret: 'secret',
    fetchImpl: apiFetch([map(456, 'loved')], requests),
    random: () => 0,
    store: {
      isConfigured: true,
      getMapSettings: async () => ({ mode_filter: 'mania', status_filter: 'loved' }),
    },
  });

  const result = await service.getRandomMap({ guildId: 'guild' });
  assert.equal(result.map.id, 456);
  assert.deepEqual(result.filters, { mode: 'mania', status: 'loved' });
  assert.equal(JSON.parse(requests[0].options.body).grant_type, 'client_credentials');
  assert.match(requests[1].url, /[?&]s=loved(?:&|$)/);
  assert.match(requests[1].url, /[?&]m=3(?:&|$)/);
});

test('configureFeed saves settings and primes the latest map', async () => {
  const saved = [];
  const posted = [];
  const service = createOsuMapService({
    clientId: '123',
    clientSecret: 'secret',
    fetchImpl: apiFetch([map(789)], []),
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
  assert.deepEqual(posted, [['guild', 789, 'ranked']]);
});

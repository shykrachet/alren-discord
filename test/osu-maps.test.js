const assert = require('node:assert/strict');
const test = require('node:test');
const { createMapEmbed, createOsuMapService } = require('../src/osu-maps');

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

test('createMapEmbed presents the beatmap metadata', () => {
  const embed = createMapEmbed(beatmapsetTemplate(123)).toJSON();
  assert.equal(embed.title, 'Artist — Title');
  assert.equal(embed.url, 'https://osu.ppy.sh/beatmapsets/123');
  assert.equal(embed.fields.find((field) => field.name.includes('Status')).value, '⏫ Ranked');
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
  assert.deepEqual(posted, [['guild', 789, 'ranked']]);
});

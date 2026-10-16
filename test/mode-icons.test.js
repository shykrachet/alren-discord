const assert = require('node:assert/strict');
const test = require('node:test');
const {
  modeIcon,
  modeLabel,
  normalizeMode,
  syncApplicationModeEmojis,
} = require('../src/mode-icons');

test('normalizes fruits to catch and provides usable fallback icons', () => {
  assert.equal(normalizeMode('fruits'), 'catch');
  assert.equal(modeLabel('fruits'), '🍎 osu!catch');
  assert.equal(modeLabel('mania'), '🎹 osu!mania');
  for (const mode of ['any', 'all']) {
    assert.equal(modeLabel(mode), 'All Mode');
    assert.equal(modeIcon(mode), '');
  }
});

test('syncs local mode assets as Discord application emojis', async () => {
  const created = [];
  const existing = [
    { id: '1', name: 'alren_mode_osu_v2' },
    { id: 'legacy-taiko', name: 'alren_mode_taiko' },
  ];
  const application = {
    emojis: {
      async fetch() {
        return existing;
      },
      async create(options) {
        created.push(options);
        const emoji = { id: String(created.length + 1), name: options.name };
        existing.push(emoji);
        return emoji;
      },
    },
  };

  const result = await syncApplicationModeEmojis(application);

  assert.equal(result.ready, 4);
  assert.equal(result.created, 3);
  assert.equal(created.length, 3);
  assert.deepEqual(created.map((item) => item.attachment.split('/').slice(-3).join('/')), [
    'img/modes/mode-taiko-emoji.png',
    'img/modes/mode-fruits-emoji.png',
    'img/modes/mode-mania-emoji.png',
  ]);
  assert.match(modeLabel('osu'), /^<:alren_mode_osu_v2:1> osu!$/);
  assert.equal(modeIcon('taiko'), '<:alren_mode_taiko_v2:2>');
  assert.deepEqual(await syncApplicationModeEmojis(application), { ready: 4, created: 0 });
  assert.equal(created.length, 3);
});

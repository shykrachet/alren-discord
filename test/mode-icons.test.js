const assert = require('node:assert/strict');
const test = require('node:test');
const {
  modeLabel,
  normalizeMode,
  syncApplicationModeEmojis,
} = require('../src/mode-icons');

test('normalizes fruits to catch and provides usable fallback icons', () => {
  assert.equal(normalizeMode('fruits'), 'catch');
  assert.equal(modeLabel('fruits'), '🍎 osu!catch');
  assert.equal(modeLabel('mania'), '🎹 osu!mania');
});

test('syncs local mode assets as Discord application emojis', async () => {
  const created = [];
  const application = {
    emojis: {
      async fetch() {
        return [{ id: '1', name: 'alren_mode_osu' }];
      },
      async create(options) {
        created.push(options);
        return { id: String(created.length + 1), name: options.name };
      },
    },
  };

  const result = await syncApplicationModeEmojis(application);

  assert.equal(result.ready, 4);
  assert.equal(result.created, 3);
  assert.equal(created.length, 3);
  assert.ok(created.every((item) => item.attachment.includes('img')));
  assert.match(modeLabel('osu'), /^<:alren_mode_osu:1> osu!$/);
});

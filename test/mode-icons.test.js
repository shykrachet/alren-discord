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
  assert.deepEqual(created.map((item) => item.attachment.split('/').slice(-3).join('/')), [
    'img/modes/mode-taiko-small@2x.png',
    'img/modes/mode-fruits-small@2x.png',
    'img/modes/mode-mania-small@2x.png',
  ]);
  assert.match(modeLabel('osu'), /^<:alren_mode_osu:1> osu!$/);
});

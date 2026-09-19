const path = require('node:path');

const MODE_DEFINITIONS = {
  osu: {
    emojiName: 'alren_mode_osu',
    fallback: '🎯',
    file: 'mode-osu-small@2x.png',
    label: 'osu!',
  },
  taiko: {
    emojiName: 'alren_mode_taiko',
    fallback: '🥁',
    file: 'mode-taiko-small@2x.png',
    label: 'osu!taiko',
  },
  catch: {
    emojiName: 'alren_mode_fruits',
    fallback: '🍎',
    file: 'mode-fruits-small@2x.png',
    label: 'osu!catch',
  },
  mania: {
    emojiName: 'alren_mode_mania',
    fallback: '🎹',
    file: 'mode-mania-small@2x.png',
    label: 'osu!mania',
  },
};

const applicationEmojiMentions = new Map();

function normalizeMode(mode) {
  return mode === 'fruits' ? 'catch' : mode;
}

function modeIcon(mode) {
  const normalized = normalizeMode(mode);
  return applicationEmojiMentions.get(normalized)
    || MODE_DEFINITIONS[normalized]?.fallback
    || '🎮';
}

function modeLabel(mode) {
  const normalized = normalizeMode(mode);
  const definition = MODE_DEFINITIONS[normalized];
  return definition ? `${modeIcon(normalized)} ${definition.label}` : String(mode || 'Unknown');
}

async function syncApplicationModeEmojis(application) {
  if (!application?.emojis?.fetch || !application?.emojis?.create) {
    throw new Error('Discord application emojis are unavailable.');
  }

  const existing = await application.emojis.fetch();
  let created = 0;
  for (const [mode, definition] of Object.entries(MODE_DEFINITIONS)) {
    let emoji = existing.find((item) => item.name === definition.emojiName);
    if (!emoji) {
      emoji = await application.emojis.create({
        attachment: path.join(__dirname, '..', 'img', 'modes', definition.file),
        name: definition.emojiName,
      });
      created += 1;
    }
    applicationEmojiMentions.set(mode, `<:${emoji.name}:${emoji.id}>`);
  }

  return { created, ready: applicationEmojiMentions.size };
}

module.exports = {
  MODE_DEFINITIONS,
  modeIcon,
  modeLabel,
  normalizeMode,
  syncApplicationModeEmojis,
};

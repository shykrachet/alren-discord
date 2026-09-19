const assert = require('node:assert/strict');
const test = require('node:test');
const { createVerificationMessage } = require('../src/osu-verification');

test('verification card includes osu profile artwork and OAuth button', () => {
  const payload = createVerificationMessage({
    authorizationUrl: 'https://osu.ppy.sh/oauth/authorize?state=test',
    botAvatarUrl: 'https://example.com/bot.png',
    guildName: 'Test server',
    osuProfile: {
      avatar_url: 'https://example.com/avatar.png',
      cover_url: 'https://example.com/cover.png',
      id: 123,
      username: 'Player',
    },
  });
  const embed = payload.embeds[0].toJSON();
  const row = payload.components[0].toJSON();

  assert.equal(embed.thumbnail.url, 'https://example.com/avatar.png');
  assert.equal(embed.image.url, 'https://example.com/cover.png');
  assert.equal(embed.url, 'https://osu.ppy.sh/users/123');
  assert.match(row.components[0].url, /osu\.ppy\.sh\/oauth\/authorize/);
});

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createVerificationCompleteEmbed,
  createVerificationMessage,
} = require('../src/osu-verification');

test('verification card shows the account avatar, link lifetime and OAuth button', () => {
  const payload = createVerificationMessage({
    authorizationUrl: 'https://osu.ppy.sh/oauth/authorize?state=test',
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

  assert.equal(embed.description, '**Player** (osu! ID 123)\nPrivate link · Expires in 10 minutes');
  assert.equal(embed.thumbnail.url, 'https://example.com/avatar.png');
  assert.equal(embed.image, undefined);
  assert.equal(embed.fields, undefined);
  assert.match(row.components[0].url, /osu\.ppy\.sh\/oauth\/authorize/);
});

test('verification complete card shows osu player profile details', () => {
  const embed = createVerificationCompleteEmbed({
    botAvatarUrl: 'https://example.com/bot.png',
    guildName: 'Test server',
    nicknameUpdated: true,
    role: { name: 'Verified' },
    osuUser: {
      avatar_url: 'https://example.com/avatar.png',
      country: { name: 'Thailand' },
      country_code: 'TH',
      cover_url: 'https://example.com/cover.png',
      id: 123,
      playmode: 'mania',
      statistics: {
        country_rank: 456,
        global_rank: 12345,
      },
      username: 'Player',
    },
  }).toJSON();
  const field = (name) => embed.fields.find((item) => item.name.includes(name));

  assert.equal(embed.title, '✅ Player verified');
  assert.equal(embed.thumbnail.url, 'https://example.com/avatar.png');
  assert.equal(embed.image.url, 'https://example.com/cover.png');
  assert.equal(embed.url, 'https://osu.ppy.sh/users/123/mania');
  assert.equal(field('Player').value, '[Player](https://osu.ppy.sh/users/123/mania)');
  assert.match(field('Rank mode').value, /osu!mania/);
  assert.equal(field('Country').value, '🇹🇭 Thailand');
  assert.equal(field('Global rank').value, '#12,345');
  assert.equal(field('Country rank').value, '#456');
  assert.equal(field('Profile').value, '[Open osu! profile ↗](https://osu.ppy.sh/users/123/mania)');
});

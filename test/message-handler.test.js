const assert = require('node:assert/strict');
const { test } = require('node:test');

const { createHelpEmbed, createMessageHandler } = require('../src/message-handler');

function message(content) {
  const sent = [];
  const replies = [];
  return {
    author: {
      bot: false,
      id: 'user',
      username: 'User',
      async send(payload) { sent.push(payload); },
      toString() { return '<@user>'; },
    },
    channel: { async send(payload) { replies.push(payload); } },
    channelId: 'channel',
    content,
    deletable: false,
    guildId: 'guild',
    inGuild: () => true,
    member: { displayName: 'Display Name' },
    replies,
    async reply(payload) { replies.push(payload); },
    sent,
  };
}

function dependencies(overrides = {}) {
  return {
    bot: { user: { id: 'bot' }, ws: { ping: 42 } },
    chat: { clearMemory() {}, async reply() { return 'Hello from Alren'; } },
    osuMaps: {},
    osuVerification: {
      async begin() {},
      async setVerificationRole() {},
      async showStatus() {},
      async showVerificationRole() {},
    },
    store: {},
    ...overrides,
  };
}

test('prefix chat sends a styled private response', async () => {
  const input = message('!alren hello');
  await createMessageHandler(dependencies())(input);

  assert.equal(input.sent.length, 1);
  assert.equal(input.sent[0].embeds[0].data.author.name, 'Alren');
  assert.equal(input.sent[0].embeds[0].data.description, 'Hello from Alren');
});

test('prefix verification can start without an osu id', async () => {
  const calls = [];
  const input = message('!osuverify');
  await createMessageHandler(dependencies({
    osuVerification: {
      async begin(...args) { calls.push(args); },
    },
  }))(input);

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], input);
  assert.equal(calls[0][1], undefined);
});

test('help cards support Thai and English', () => {
  const thai = createHelpEmbed('th').toJSON();
  const english = createHelpEmbed('en').toJSON();

  assert.match(thai.title, /ภาษาไทย/);
  assert.match(thai.fields[0].name, /แชทส่วนตัว/);
  assert.match(english.title, /English/);
  assert.match(english.fields[0].name, /Private chat/);
});

test('prefix help selects English with !alrenhelp en', async () => {
  const input = message('!alrenhelp en');
  await createMessageHandler(dependencies())(input);

  assert.equal(input.sent.length, 1);
  assert.match(input.sent[0].embeds[0].toJSON().title, /English/);
});

test('prefix help without a language sends the language dropdown', async () => {
  const input = message('!alrenhelp');
  await createMessageHandler(dependencies())(input);

  const embed = input.sent[0].embeds[0].toJSON();
  const menu = input.sent[0].components[0].toJSON().components[0];
  assert.match(embed.title, /Choose a language/);
  assert.equal(menu.custom_id, 'alrenhelp:language');
  assert.deepEqual(menu.options.map((option) => option.value), ['th', 'en']);
});

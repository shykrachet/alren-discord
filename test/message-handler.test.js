const assert = require('node:assert/strict');
const { test } = require('node:test');

const { COMMANDS_URL, createHelpEmbed, createMessageHandler } = require('../src/message-handler');

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

test('removed AI prefix and mention commands do not invoke chat', async () => {
  let calls = 0;
  const handler = createMessageHandler(dependencies({ chat: { async reply() { calls++; } } }));
  for (const content of ['!alren hello', '!chat hello', '!alrenclear', '<@bot> hello']) {
    const input = message(content);
    await handler(input);
    assert.equal(input.sent.length, 0);
  }
  assert.equal(calls, 0);
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

test('help cards display only the English guide', () => {
  const english = createHelpEmbed().toJSON();
  assert.match(english.title, /English/);
  assert.equal(english.url, COMMANDS_URL);
  assert.match(english.fields[0].name, /Verify your account/);
  assert.ok(english.fields.at(-1).value.includes(COMMANDS_URL));
  assert.doesNotMatch(JSON.stringify(english), /\p{Script=Thai}/u);
  assert.deepEqual(createHelpEmbed('th').toJSON(), english);
});

test('prefix help selects English with !alrenhelp en', async () => {
  const input = message('!alrenhelp en');
  await createMessageHandler(dependencies())(input);

  assert.equal(input.sent.length, 1);
  assert.match(input.sent[0].embeds[0].toJSON().title, /English/);
});

test('prefix help opens the English guide directly with the website button', async () => {
  const input = message('!alrenhelp');
  await createMessageHandler(dependencies())(input);

  const embed = input.sent[0].embeds[0].toJSON();
  const button = input.sent[0].components[0].toJSON().components[0];
  assert.match(embed.title, /English/);
  assert.equal(embed.url, COMMANDS_URL);
  assert.equal(input.sent[0].components.length, 1);
  assert.equal(button.url, COMMANDS_URL);
  assert.doesNotMatch(JSON.stringify(input.sent[0]), /\p{Script=Thai}/u);
});

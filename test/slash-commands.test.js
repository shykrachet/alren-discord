const assert = require('node:assert/strict');
const { test } = require('node:test');

const { registerSlashCommands } = require('../src/slash-commands');

test('registers global commands and removes legacy guild commands', async () => {
  const calls = [];
  const rest = {
    async put(route, options) {
      calls.push({ options, route });
    },
  };
  const client = {
    application: { id: 'application-id' },
    guilds: {
      cache: new Map([
        ['guild-one', { id: 'guild-one' }],
        ['guild-two', { id: 'guild-two' }],
      ]),
    },
    user: { id: 'bot-user-id' },
  };

  await registerSlashCommands({ client, rest });

  assert.equal(calls.length, 3);
  assert.equal(calls[0].route, '/applications/application-id/commands');
  assert.ok(calls[0].options.body.length > 0);
  assert.deepEqual(calls.slice(1), [
    {
      route: '/applications/application-id/guilds/guild-one/commands',
      options: { body: [] },
    },
    {
      route: '/applications/application-id/guilds/guild-two/commands',
      options: { body: [] },
    },
  ]);
});

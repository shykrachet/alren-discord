const assert = require('node:assert/strict');
const test = require('node:test');
const { PermissionsBitField } = require('discord.js');

const { createOsuVerificationService } = require('../src/osu-verification');

test('verification role setup explains Discord role hierarchy fixes', async () => {
  const botMember = {
    permissions: new PermissionsBitField(PermissionsBitField.Flags.ManageRoles),
    roles: {
      highest: { name: 'Alren', position: 5 },
    },
  };
  const guild = {
    id: 'guild',
    members: {
      me: botMember,
      async fetchMe() {
        return botMember;
      },
    },
  };
  const role = {
    id: 'verified',
    managed: false,
    name: 'Verified',
    position: 10,
  };
  const service = createOsuVerificationService({
    bot: {},
    store: {
      async saveVerificationRole() {},
    },
  });

  await assert.rejects(
    () => service.configureVerificationRole(guild, role),
    /drag Alren's bot role above Verified/,
  );
});

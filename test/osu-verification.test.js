const assert = require('node:assert/strict');
const test = require('node:test');
const { MessageFlags, PermissionsBitField } = require('discord.js');

const { createOsuVerificationService } = require('../src/osu-verification');
const { activeOsuTeamIds, eligibleProfileRoles, PROFILE_ROLES } = require('../src/osu-profile-roles');

test('osu! role eligibility uses group membership and published map counts', () => {
  assert.deepEqual([...eligibleProfileRoles({
    id: 123,
    groups: [4, 7, 11, 16, 22, 26, 28, 29, 31, 32, 33, 35, 47, 48, 50].map((id) => ({ id })),
    loved_beatmapset_count: 1,
    ranked_beatmapset_count: 2,
  }, new Set(['123']))], Object.keys(PROFILE_ROLES));
  assert.deepEqual([...eligibleProfileRoles({
    is_bng: true, groups: [{ id: 32 }], ranked_beatmapset_count: 0, loved_beatmapset_count: 0,
  })], ['bn_probationary']);
  assert.deepEqual([...eligibleProfileRoles({ groups: [26, 29, 33, 47].map((id) => ({ id })) })], []);
  assert.deepEqual([...eligibleProfileRoles({ badges: [{ description: 'Featured Artist' }] })], []);
});

test('osu! team uses active roster IDs and excludes inactive members', () => {
  const roster = activeOsuTeamIds([
    '# osu! team',
    '| [Active](https://osu.ppy.sh/users/123) | Developer |',
    '## Inactive core team members',
    '| [Inactive](https://osu.ppy.sh/users/456) | Contributor |',
  ].join('\n'));
  assert.deepEqual([...roster], ['123']);
  assert.deepEqual([...eligibleProfileRoles({ id: 456, team: { name: 'osu! team' } }, roster)], []);
});

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

test('the configured panel replies privately without opening a form and moving it invalidates old buttons', async () => {
  const posted = [];
  const deleted = [];
  let settings;
  function channel(id) {
    return {
      id,
      permissionsFor: () => ({ has: () => true }),
      messages: { delete: async (messageId) => deleted.push(messageId) },
      async send(payload) {
        posted.push(payload);
        return { id: `panel-${posted.length}` };
      },
    };
  }
  const verify = channel('verify');
  const newVerify = channel('new-verify');
  const results = channel('results');
  const guild = {
    id: 'guild',
    channels: { fetch: async (id) => [verify, newVerify, results].find((item) => item.id === id) },
    members: { me: {
      permissions: new PermissionsBitField(PermissionsBitField.Flags.ManageRoles),
      roles: { highest: { position: 5 } },
    } },
  };
  const role = { id: 'verified', position: 1 };
  const service = createOsuVerificationService({
    bot: {},
    store: {
      getVerificationSettings: async () => settings,
      async saveVerificationSettings(guildId, values) {
        settings = {
          channel_id: values.channelId,
          panel_channel_id: values.panelChannelId,
          panel_message_id: values.panelMessageId,
          role_id: values.roleId,
        };
      },
    },
  });
  await service.configureVerificationSettings(guild, { channel: results, panelChannel: verify, role });
  const context = { guildId: guild.id, channelId: verify.id, inGuild: () => true };
  let reply;
  const click = {
    ...context,
    isButton: () => true,
    customId: posted[0].components[0].toJSON().components[0].custom_id,
    message: { id: settings.panel_message_id },
    async deferReply({ flags }) { assert.equal(flags, MessageFlags.Ephemeral); },
    async editReply(payload) { reply = payload.content; },
  };
  await service.handlePanelInteraction(click);
  assert.match(reply, /An administrator must configure the bot first/);

  await service.configureVerificationSettings(guild, { panelChannel: newVerify, role });
  assert.deepEqual(deleted, ['panel-1']);
  await service.handlePanelInteraction(click);
  assert.match(reply, /no longer active/);
});

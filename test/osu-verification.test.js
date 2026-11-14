const assert = require('node:assert/strict');
const test = require('node:test');
const { MessageFlags, PermissionsBitField } = require('discord.js');

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

test('the configured panel opens an osu! ID form and moving it invalidates old forms', async () => {
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
  let modal;
  await service.handlePanelInteraction({
    ...context,
    isButton: () => true,
    customId: posted[0].components[0].toJSON().components[0].custom_id,
    message: { id: settings.panel_message_id },
    async showModal(builder) { modal = builder.toJSON(); },
  });
  assert.equal(modal.components[0].component.custom_id, 'osu_id');

  let reply;
  const submission = {
    ...context,
    isModalSubmit: () => true,
    customId: modal.custom_id,
    fields: { getTextInputValue: () => 'invalid' },
    async deferReply({ flags }) { assert.equal(flags, MessageFlags.Ephemeral); },
    async editReply(payload) { reply = payload.content; },
  };
  await service.handlePanelInteraction(submission);
  assert.match(reply, /numeric osu! ID/);

  await service.configureVerificationSettings(guild, { panelChannel: newVerify, role });
  assert.deepEqual(deleted, ['panel-1']);
  await service.handlePanelInteraction(submission);
  assert.match(reply, /no longer active/);
});

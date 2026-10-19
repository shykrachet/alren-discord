const { randomBytes } = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const { setupAccess, resolveInviter } = require('./setup-access');

const ACCESS_COMMAND = new SlashCommandBuilder().setName('access')
  .setDescription('Manage access to Alren. Server inviter only.')
  .addSubcommand((sub) => sub.setName('grant').setDescription('Allow a member to use Alren.')
    .addUserOption((option) => option.setName('user').setDescription('Server member to allow.').setRequired(true)))
  .addSubcommand((sub) => sub.setName('revoke').setDescription('Remove a member’s access to Alren.')
    .addUserOption((option) => option.setName('user').setDescription('Member whose access will be removed.').setRequired(true)))
  .addSubcommand((sub) => sub.setName('list').setDescription('View members allowed to use Alren.'));
const RESET_COMMAND = new SlashCommandBuilder().setName('reset')
  .setDescription('Reset this server’s Alren settings after confirmation. Inviter only.');

function card(title, description, color = 0xff66aa) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description)
    .setFooter({ text: 'Alren • Server controls' });
}

function createAdminHandler({ store, now = Date.now }) {
  const pending = new Map();
  return async (interaction) => {
    const button = interaction.isButton?.() && interaction.customId.startsWith('alren-reset:');
    const command = interaction.isChatInputCommand?.() && ['access', 'reset'].includes(interaction.commandName);
    if (!button && !command) return false;
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'Use server controls in a Discord server.', flags: MessageFlags.Ephemeral });
      return true;
    }
    if (button) await interaction.deferUpdate();
    else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const denied = await setupAccess(interaction, store);
    if (denied) {
      await interaction.editReply({ content: denied, embeds: [], components: [] });
      return true;
    }
    if (!store?.isConfigured) {
      await interaction.editReply({ content: 'Server controls require a configured database.', embeds: [], components: [] });
      return true;
    }
    for (const [id, request] of pending) if (request.expires <= now()) pending.delete(id);
    if (button) {
      const [, action, token] = interaction.customId.split(':');
      const request = pending.get(token);
      if (!request || request.guildId !== interaction.guildId || request.userId !== interaction.user.id || request.joinedAt !== interaction.guild.members.me?.joinedTimestamp) {
        await interaction.editReply({ content: 'This confirmation expired or belongs to another user. Run `/reset` again.', embeds: [], components: [] });
        return true;
      }
      pending.delete(token);
      if (action === 'cancel') {
        await interaction.editReply({ content: '', embeds: [card('Reset cancelled', 'Your server settings were kept.')], components: [] });
      } else if (action === 'confirm') {
        await store.resetGuildSettings(interaction.guildId);
        await interaction.editReply({ content: '', embeds: [card('✅ Server settings reset',
          'Verification settings, pending verification links, beatmap feeds, posting history and community alert settings were cleared.\n\nLinked osu! accounts, access grants and inviter identity were kept. Discord roles and existing messages were not removed.\n\nUse `/setup` to configure Alren again.', 0x22c55e)], components: [] });
      }
      return true;
    }
    if (interaction.commandName === 'reset') {
      for (const [id, request] of pending) if (request.guildId === interaction.guildId && request.userId === interaction.user.id) pending.delete(id);
      const token = randomBytes(16).toString('hex');
      pending.set(token, { guildId: interaction.guildId, userId: interaction.user.id, expires: now() + 60000, joinedAt: interaction.guild.members.me?.joinedTimestamp });
      await interaction.editReply({ embeds: [card('⚠️ Reset this server?',
        '**This cannot be undone.**\n\n**Clear**\nVerification settings and pending links • Beatmap feeds and posting history • BN / Mappers’ Guild alert settings\n\n**Keep**\nLinked osu! accounts • Access grants • Inviter identity • Existing Discord roles and messages\n\nOnly you can confirm. This request expires in **60 seconds**.', 0xf59e0b)],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`alren-reset:confirm:${token}`).setLabel('Reset server settings').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`alren-reset:cancel:${token}`).setLabel('Keep settings').setStyle(ButtonStyle.Secondary),
      )] });
      return true;
    }
    const action = interaction.options.getSubcommand();
    if (action === 'list') {
      const grants = await store.listBotAccess(interaction.guildId);
      const inviter = await resolveInviter(interaction.guild, store).catch(() => null);
      const visible = grants.slice(0, 50).map((grant) => `<@${grant.user_id}>`).join('\n');
      await interaction.editReply({ embeds: [card('🔑 Alren access',
        `**Server inviter**\n${inviter ? `<@${inviter}>` : 'Not identified'}\n\n**Members with access · ${grants.length}**\n${visible || 'No members granted access yet.'}${grants.length > 50 ? `\n… ${grants.length - 50} more members` : ''}\n\nGranted members can use everyday commands. Only the inviter can manage access, setup and reset.`)], allowedMentions: { parse: [] } });
      return true;
    }
    const user = interaction.options.getUser('user', true);
    if (action === 'grant') {
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member || user.bot) {
        await interaction.editReply({ content: 'Select a human member of this server.' });
        return true;
      }
      const installation = interaction.guild.members.me?.joinedTimestamp;
      if (!installation) { await interaction.editReply({ content: 'Alren could not identify this installation. Try again after the bot reconnects.' }); return true; }
      await store.grantBotAccess(interaction.guildId, user.id, interaction.user.id, String(installation));
    } else if (action === 'revoke') {
      await store.revokeBotAccess(interaction.guildId, user.id);
    }
    await interaction.editReply({ embeds: [card(action === 'grant' ? '✅ Access granted' : '🔒 Access revoked',
      action === 'grant' ? `<@${user.id}> can now use Alren’s everyday commands in this server. Setup, access management and reset remain restricted.`
        : `The access grant for <@${user.id}> was removed. The server inviter always retains control.`, action === 'grant' ? 0x22c55e : 0xff66aa)], allowedMentions: { parse: [] } });
    return true;
  };
}

module.exports = { ACCESS_COMMAND, RESET_COMMAND, createAdminHandler };

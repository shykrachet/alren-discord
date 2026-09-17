const {
  ChannelType, MessageFlags, PermissionsBitField, REST, Routes, SlashCommandBuilder,
} = require('discord.js');
const { formatHelp } = require('./message-handler');
const { createMapEmbed } = require('./osu-maps');

const MAP_STATUS_CHOICES = [
  { name: 'Ranked', value: 'ranked' },
  { name: 'Qualified', value: 'qualified' },
  { name: 'Loved', value: 'loved' },
  { name: 'All statuses', value: 'all' },
];
const MAP_MODE_CHOICES = [
  { name: 'Any mode', value: 'any' },
  { name: 'osu!', value: 'osu' },
  { name: 'osu!taiko', value: 'taiko' },
  { name: 'osu!catch', value: 'catch' },
  { name: 'osu!mania', value: 'mania' },
];
const BN_MODE_CHOICES = [
  { name: 'All osu! modes', value: 'all' },
  { name: 'osu!', value: 'osu' },
  { name: 'osu!taiko', value: 'taiko' },
  { name: 'osu!catch', value: 'catch' },
  { name: 'osu!mania', value: 'mania' },
];

const CHAT_COMMAND = new SlashCommandBuilder()
  .setName('alren')
  .setDescription('Chat privately with Alren. Replies delete automatically.')
  .addStringOption((option) => option
    .setName('message')
    .setDescription('What you want to say to Alren')
    .setRequired(true));

const CLEAR_CHAT_COMMAND = new SlashCommandBuilder()
  .setName('alrenclear')
  .setDescription('Clear your private Alren chat memory in this channel.');

const HELP_COMMAND = new SlashCommandBuilder()
  .setName('alrenhelp')
  .setDescription('Show Alren commands privately.');

const OSU_VERIFY_COMMAND = new SlashCommandBuilder()
  .setName('osuverify')
  .setDescription('Verify an osu! account privately.')
  .addStringOption((option) => option
    .setName('osu_user_id')
    .setDescription('The number from your osu! profile URL')
    .setRequired(true));

const OSU_VERIFY_STATUS_COMMAND = new SlashCommandBuilder()
  .setName('osuverify-status')
  .setDescription('Show your verified osu! account privately.');

const VERIFY_ROLE_COMMAND = new SlashCommandBuilder()
  .setName('verify-role')
  .setDescription('Set the osu! verification role privately.')
  .addRoleOption((option) => option
    .setName('role')
    .setDescription('The role verified members receive')
    .setRequired(true));

const VERIFY_ROLE_STATUS_COMMAND = new SlashCommandBuilder()
  .setName('verify-role-status')
  .setDescription('Show the configured verification role privately.');

const OSU_MAP_COMMAND = new SlashCommandBuilder()
  .setName('osumap')
  .setDescription('Post a random osu! beatmap in this channel.')
  .addStringOption((option) => option
    .setName('status')
    .setDescription('Temporarily choose a beatmap status')
    .addChoices(...MAP_STATUS_CHOICES))
  .addStringOption((option) => option
    .setName('mode')
    .setDescription('Temporarily choose a game mode')
    .addChoices(...MAP_MODE_CHOICES));

const OSU_MAP_SETTINGS_COMMAND = new SlashCommandBuilder()
  .setName('osumap-settings')
  .setDescription('Configure the osu! beatmap feed for this server privately.')
  .addStringOption((option) => option
    .setName('status')
    .setDescription('Default beatmap status')
    .addChoices(...MAP_STATUS_CHOICES))
  .addStringOption((option) => option
    .setName('mode')
    .setDescription('Default game mode')
    .addChoices(...MAP_MODE_CHOICES));

const COMMUNITY_ALERT_SETTINGS_COMMAND = new SlashCommandBuilder()
  .setName('community-alert-settings')
  .setDescription('Configure BN and Mappers’ Guild alerts privately.')
  .addChannelOption((option) => option
    .setName('channel')
    .setDescription('Channel that receives alerts')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
  .addStringOption((option) => option
    .setName('bn_mode')
    .setDescription('BN request mode to notify about')
    .addChoices(...BN_MODE_CHOICES));

const COMMANDS = [
  CHAT_COMMAND.toJSON(),
  CLEAR_CHAT_COMMAND.toJSON(),
  HELP_COMMAND.toJSON(),
  OSU_VERIFY_COMMAND.toJSON(),
  OSU_VERIFY_STATUS_COMMAND.toJSON(),
  VERIFY_ROLE_COMMAND.toJSON(),
  VERIFY_ROLE_STATUS_COMMAND.toJSON(),
  OSU_MAP_COMMAND.toJSON(),
  OSU_MAP_SETTINGS_COMMAND.toJSON(),
  COMMUNITY_ALERT_SETTINGS_COMMAND.toJSON(),
];
const DEFAULT_DELETE_AFTER_SECONDS = 300;

function getDeleteAfterMs() {
  const requestedSeconds = Number(process.env.EPHEMERAL_CHAT_TTL_SECONDS || DEFAULT_DELETE_AFTER_SECONDS);
  const safeSeconds = Number.isFinite(requestedSeconds)
    ? Math.min(Math.max(requestedSeconds, 15), 3600)
    : DEFAULT_DELETE_AFTER_SECONDS;
  return safeSeconds * 1000;
}

function scheduleReplyDeletion(interaction) {
  const deletionTimer = setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, getDeleteAfterMs());
  deletionTimer.unref?.();
}

function createPrivateCommandContext(interaction) {
  return {
    author: interaction.user,
    channelId: interaction.channelId,
    guild: interaction.guild,
    guildId: interaction.guildId,
    inGuild: () => interaction.inGuild(),
    member: interaction.member,
    memberPermissions: interaction.memberPermissions,
    reply: (content) => interaction.editReply({ content }),
  };
}

function describeFilters({ mode, status }) {
  const modeName = MAP_MODE_CHOICES.find((choice) => choice.value === mode)?.name ?? 'Any mode';
  const statusName = MAP_STATUS_CHOICES.find((choice) => choice.value === status)?.name ?? 'Ranked';
  return `${statusName} · ${modeName}`;
}

function describeBnMode(mode) {
  return BN_MODE_CHOICES.find((choice) => choice.value === mode)?.name ?? 'All osu! modes';
}

async function registerSlashCommands({ client, token }) {
  if (!client.user || !token) return;

  const rest = new REST({ version: '10' }).setToken(token);
  const guilds = [...client.guilds.cache.values()];
  await Promise.all(guilds.map((guild) => rest.put(
    Routes.applicationGuildCommands(client.user.id, guild.id),
    { body: COMMANDS },
  )));
  console.log(`registered /alren in ${guilds.length} server(s)`);
}

function createInteractionHandler({ chat, osuMaps, osuVerification, store }) {
  return async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'community-alert-settings') {
      if (!interaction.inGuild()) {
        await interaction.reply({
          content: 'This command can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
        scheduleReplyDeletion(interaction);
        return;
      }
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
        await interaction.reply({
          content: 'You need the Manage Server permission to change community alert settings.',
          flags: MessageFlags.Ephemeral,
        });
        scheduleReplyDeletion(interaction);
        return;
      }
      if (!store?.isConfigured) {
        await interaction.reply({
          content: 'Community alerts need Supabase. Add SUPABASE_URL and SUPABASE_SECRET_KEY first.',
          flags: MessageFlags.Ephemeral,
        });
        scheduleReplyDeletion(interaction);
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const current = await store.getCommunityAlertSettings(interaction.guildId);
        const selectedChannel = interaction.options.getChannel('channel');
        const selectedMode = interaction.options.getString('bn_mode');
        const channelId = selectedChannel?.id || current?.channel_id;
        const bnMode = selectedMode || current?.bn_mode_filter || 'all';
        if (!channelId) {
          await interaction.editReply('Select a channel the first time, for example `/community-alert-settings channel:#alerts`.');
        } else if (!selectedChannel && !selectedMode) {
          await interaction.editReply(`Community alerts are configured for <#${channelId}>. BN requests: **${describeBnMode(bnMode)}**. New Mappers’ Guild missions: **all missions**.`);
        } else {
          await store.saveCommunityAlertSettings(interaction.guildId, { bnMode, channelId });
          await interaction.editReply(`Community alerts will be posted in <#${channelId}>. BN requests: **${describeBnMode(bnMode)}**. New Mappers’ Guild missions: **all missions**.`);
        }
      } catch (error) {
        console.error('Community alert settings failed:', error.message);
        await interaction.editReply('I could not save the community alert settings. Apply the Supabase schema and try again.');
      }
      scheduleReplyDeletion(interaction);
      return;
    }

    if (interaction.commandName === 'osumap-settings') {
      if (!interaction.inGuild()) {
        await interaction.reply({
          content: 'This command can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
        scheduleReplyDeletion(interaction);
        return;
      }
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
        await interaction.reply({
          content: 'You need the Manage Server permission to change beatmap feed settings.',
          flags: MessageFlags.Ephemeral,
        });
        scheduleReplyDeletion(interaction);
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const status = interaction.options.getString('status') ?? undefined;
        const mode = interaction.options.getString('mode') ?? undefined;
        const settings = await osuMaps.configureFeed({
          channelId: interaction.channelId,
          guildId: interaction.guildId,
          mode,
          status,
        });
        await interaction.editReply(`Automatic beatmap feed enabled in <#${interaction.channelId}>: **${describeFilters(settings)}**. New maps will be posted here on the next check (up to 15 minutes by default).`);
      } catch (error) {
        console.error('Beatmap settings failed:', error.message);
        await interaction.editReply('I could not save the beatmap feed settings. Please check Supabase and try again.');
      }
      scheduleReplyDeletion(interaction);
      return;
    }

    if (interaction.commandName === 'osumap') {
      if (!interaction.inGuild()) {
        await interaction.reply({
          content: 'This command can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
        scheduleReplyDeletion(interaction);
        return;
      }

      await interaction.deferReply();
      try {
        const result = await osuMaps.getRandomMap({
          guildId: interaction.guildId,
          mode: interaction.options.getString('mode') ?? undefined,
          status: interaction.options.getString('status') ?? undefined,
        });
        await interaction.editReply({
          content: `🎵 **${describeFilters(result.filters)}**`,
          embeds: [createMapEmbed(result.map)],
        });
      } catch (error) {
        console.error('Beatmap request failed:', error.message);
        await interaction.editReply('I could not fetch an osu! beatmap right now. Please try again shortly.');
      }
      return;
    }

    if (interaction.commandName === 'alrenhelp') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.editReply({ content: formatHelp() });
      scheduleReplyDeletion(interaction);
      return;
    }

    if (interaction.commandName === 'alrenclear') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      chat?.clearMemory(interaction.channelId, interaction.user.id);
      await interaction.editReply('Your private Alren chat memory in this channel has been cleared.');
      scheduleReplyDeletion(interaction);
      return;
    }

    if (['osuverify', 'osuverify-status', 'verify-role', 'verify-role-status'].includes(interaction.commandName)) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const context = createPrivateCommandContext(interaction);
      try {
        if (interaction.commandName === 'osuverify') {
          await osuVerification.begin(context, interaction.options.getString('osu_user_id', true));
        } else if (interaction.commandName === 'osuverify-status') {
          await osuVerification.showStatus(context);
        } else if (interaction.commandName === 'verify-role') {
          await osuVerification.setVerificationRole(context, interaction.options.getRole('role', true));
        } else {
          await osuVerification.showVerificationRole(context);
        }
      } catch (error) {
        console.error('Private verification command failed:', error.message);
        await interaction.editReply('I could not complete that verification request. Please try again shortly.');
      }
      scheduleReplyDeletion(interaction);
      return;
    }

    if (interaction.commandName !== 'alren') return;

    if (!chat) {
      await interaction.reply({
        content: 'OpenAI is not configured yet. Add an API key to the environment variables.',
        flags: MessageFlags.Ephemeral,
      });
      scheduleReplyDeletion(interaction);
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const answer = await chat.reply({
        channelId: interaction.channelId,
        userId: interaction.user.id,
        displayName: interaction.member?.displayName || interaction.user.username,
        prompt: interaction.options.getString('message', true),
      });
      const content = answer.length > 1900 ? `${answer.slice(0, 1897)}...` : answer;
      await interaction.editReply({ content });
    } catch (error) {
      console.error('Slash chat request failed:', error.message);
      await interaction.editReply('I cannot respond right now. Please try again shortly.');
    }

    scheduleReplyDeletion(interaction);
  };
}

module.exports = { createInteractionHandler, registerSlashCommands };

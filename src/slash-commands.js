const {
  ChannelType, EmbedBuilder, MessageFlags, PermissionsBitField, REST, Routes, SlashCommandBuilder,
} = require('discord.js');
const {
  createAlrenEmbed,
  createHelpEmbed,
  createHelpLanguageMenu,
  createHelpLanguagePrompt,
} = require('./message-handler');
const { createMapEmbed } = require('./osu-maps');

const MAP_STATUS_CHOICES = [
  { name: 'Ranked', value: 'ranked' },
  { name: 'Qualified', value: 'qualified' },
  { name: 'Loved', value: 'loved' },
  { name: 'All statuses', value: 'all' },
];
const MAP_MODE_CHOICES = [
  { name: '🌐 Any mode', value: 'any' },
  { name: '🎯 osu!', value: 'osu' },
  { name: '🥁 osu!taiko', value: 'taiko' },
  { name: '🍎 osu!catch / fruits', value: 'catch' },
  { name: '🎹 osu!mania', value: 'mania' },
];
const BN_MODE_CHOICES = [
  { name: '🌐 All osu! modes', value: 'all' },
  { name: '🎯 Standard (osu!)', value: 'osu' },
  { name: '🥁 Taiko', value: 'taiko' },
  { name: '🍎 Catch / fruits', value: 'catch' },
  { name: '🎹 Mania', value: 'mania' },
];
const HELP_LANGUAGE_CHOICES = [
  { name: 'ไทย (TH)', value: 'th' },
  { name: 'English (EN)', value: 'en' },
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
  .setDescription('เปิดคู่มือคำสั่ง Alren แบบส่วนตัว เลือกภาษาไทยหรือ English')
  .addStringOption((option) => option
    .setName('language')
    .setDescription('เลือกภาษาของคู่มือ / Choose guide language')
    .addChoices(...HELP_LANGUAGE_CHOICES));

const PING_COMMAND = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check whether Alren is online.');

const QUICK_HELP_COMMAND = new SlashCommandBuilder()
  .setName('help')
  .setDescription('ดูเมนูคำสั่งทั้งหมดของ Alren แบบส่วนตัว')
  .addStringOption((option) => option
    .setName('language')
    .setDescription('เลือกภาษาของคู่มือ / Choose guide language')
    .addChoices(...HELP_LANGUAGE_CHOICES));

const OSU_VERIFY_COMMAND = new SlashCommandBuilder()
  .setName('osuverify')
  .setDescription('Verify an osu! account privately.')
  .addStringOption((option) => option
    .setName('osu_user_id')
    .setDescription('Optional: the number from your osu! profile URL')
    .setRequired(false));

const OSU_VERIFY_STATUS_COMMAND = new SlashCommandBuilder()
  .setName('osuverify-status')
  .setDescription('Show your verified osu! account privately.');

const QUICK_VERIFY_COMMAND = new SlashCommandBuilder()
  .setName('verify')
  .setDescription('ยืนยันบัญชี osu! ด้วยปุ่ม OAuth แบบส่วนตัว')
  .addStringOption((option) => option
    .setName('osu_id')
    .setDescription('ไม่ใส่ก็ได้ ระบบจะตรวจบัญชีจาก osu! ให้อัตโนมัติ')
    .setRequired(false));

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

const QUICK_MAP_COMMAND = new SlashCommandBuilder()
  .setName('map')
  .setDescription('สุ่ม beatmap พร้อมรูปปกลงในห้องนี้')
  .addStringOption((option) => option
    .setName('status')
    .setDescription('สถานะของแผนที่ (ไม่ใส่จะใช้ค่าที่เซิร์ฟเวอร์ตั้งไว้)')
    .addChoices(...MAP_STATUS_CHOICES))
  .addStringOption((option) => option
    .setName('mode')
    .setDescription('โหมดเกม (ไม่ใส่จะใช้ค่าที่เซิร์ฟเวอร์ตั้งไว้)')
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

const SETUP_COMMAND = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('ตั้งค่า Verify, Beatmap และ BN alerts ในคำสั่งเดียว (สำหรับแอดมิน)')
  .addRoleOption((option) => option
    .setName('verify_role')
    .setDescription('ยศที่จะมอบให้สมาชิกหลัง Verify สำเร็จ'))
  .addChannelOption((option) => option
    .setName('beatmap_channel')
    .setDescription('ห้องสำหรับส่ง beatmap อัตโนมัติ')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
  .addStringOption((option) => option
    .setName('map_status')
    .setDescription('สถานะ beatmap เริ่มต้น')
    .addChoices(...MAP_STATUS_CHOICES))
  .addStringOption((option) => option
    .setName('map_mode')
    .setDescription('โหมด beatmap เริ่มต้น')
    .addChoices(...MAP_MODE_CHOICES))
  .addChannelOption((option) => option
    .setName('alerts_channel')
    .setDescription('ห้องสำหรับแจ้งเตือน BN และ Mappers’ Guild')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
  .addStringOption((option) => option
    .setName('bn_mode')
    .setDescription('โหมด BN ที่ต้องการแจ้งเตือน')
    .addChoices(...BN_MODE_CHOICES));

const COMMANDS = [
  CHAT_COMMAND.toJSON(),
  CLEAR_CHAT_COMMAND.toJSON(),
  HELP_COMMAND.toJSON(),
  PING_COMMAND.toJSON(),
  QUICK_HELP_COMMAND.toJSON(),
  OSU_VERIFY_COMMAND.toJSON(),
  OSU_VERIFY_STATUS_COMMAND.toJSON(),
  QUICK_VERIFY_COMMAND.toJSON(),
  VERIFY_ROLE_COMMAND.toJSON(),
  VERIFY_ROLE_STATUS_COMMAND.toJSON(),
  OSU_MAP_COMMAND.toJSON(),
  OSU_MAP_SETTINGS_COMMAND.toJSON(),
  QUICK_MAP_COMMAND.toJSON(),
  COMMUNITY_ALERT_SETTINGS_COMMAND.toJSON(),
  SETUP_COMMAND.toJSON(),
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
    reply: (payload) => interaction.editReply(
      typeof payload === 'string' ? { content: payload } : payload,
    ),
  };
}

function describeFilters({ mode, status }) {
  const modeName = MAP_MODE_CHOICES.find((choice) => choice.value === mode)?.name ?? '🌐 Any mode';
  const statusName = MAP_STATUS_CHOICES.find((choice) => choice.value === status)?.name ?? 'Ranked';
  return `${statusName} · ${modeName}`;
}

function describeBnMode(mode) {
  return BN_MODE_CHOICES.find((choice) => choice.value === mode)?.name ?? '🌐 All osu! modes';
}

function createSetupEmbed({ alerts, map, roleId, updated }) {
  const mapText = map?.channel_id
    ? `<#${map.channel_id}>\n${describeFilters({ mode: map.mode_filter, status: map.status_filter })}`
    : 'ยังไม่ได้ตั้งค่า';
  const alertsText = alerts?.channel_id
    ? `<#${alerts.channel_id}>\n${describeBnMode(alerts.bn_mode_filter || 'all')}`
    : 'ยังไม่ได้ตั้งค่า';
  return new EmbedBuilder()
    .setColor(updated ? 0x22c55e : 0x5865f2)
    .setTitle(updated ? '✅ บันทึกการตั้งค่า Alren แล้ว' : '⚙️ การตั้งค่า Alren')
    .setDescription(updated
      ? 'ระบบพร้อมใช้งานตามค่าด้านล่าง'
      : 'ใส่เฉพาะตัวเลือกที่ต้องการเปลี่ยน แล้วเรียก `/setup` อีกครั้ง')
    .addFields(
      { name: '✅ Verify role', value: roleId ? `<@&${roleId}>` : 'ยังไม่ได้ตั้งค่า', inline: true },
      { name: '🎵 Beatmap feed', value: mapText, inline: true },
      { name: '🔔 BN alerts', value: alertsText, inline: true },
    )
    .setFooter({ text: 'เฉพาะผู้มีสิทธิ์ Manage Server เท่านั้นที่ตั้งค่าได้' })
    .setTimestamp();
}

async function registerSlashCommands({ client, token, rest: providedRest }) {
  if (!client.user || (!token && !providedRest)) return;

  const rest = providedRest ?? new REST({ version: '10' }).setToken(token);
  const applicationId = client.application?.id || client.user.id;

  // Global commands automatically become available in every server where the
  // app is installed, including servers that add the bot after it starts.
  await rest.put(
    Routes.applicationCommands(applicationId),
    { body: COMMANDS },
  );

  // Older releases registered the same commands per guild. Remove those
  // legacy copies so Discord does not keep serving stale guild overrides.
  const guilds = [...client.guilds.cache.values()];
  const cleanupResults = await Promise.allSettled(guilds.map((guild) => rest.put(
    Routes.applicationGuildCommands(applicationId, guild.id),
    { body: [] },
  )));
  const cleanupFailures = cleanupResults.filter((result) => result.status === 'rejected');
  if (cleanupFailures.length) {
    console.warn(`Could not clear legacy slash commands in ${cleanupFailures.length} server(s).`);
  }

  console.log(`registered ${COMMANDS.length} global slash command(s) for ${guilds.length} server(s)`);
}

function createInteractionHandler({ chat, osuMaps, osuVerification, store }) {
  return async (interaction) => {
    if (interaction.isStringSelectMenu?.() && interaction.customId === 'alrenhelp:language') {
      const language = interaction.values[0] === 'en' ? 'en' : 'th';
      await interaction.update({
        embeds: [createHelpEmbed(language)],
        components: [createHelpLanguageMenu(language)],
      });
      return;
    }
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'ping') {
      await interaction.reply({
        content: `🏓 Pong — **${interaction.client.ws.ping}ms**`,
        flags: MessageFlags.Ephemeral,
      });
      scheduleReplyDeletion(interaction);
      return;
    }

    if (interaction.commandName === 'setup') {
      if (!interaction.inGuild()) {
        await interaction.reply({ content: 'ใช้คำสั่งนี้ภายในเซิร์ฟเวอร์เท่านั้น', flags: MessageFlags.Ephemeral });
        return;
      }
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
        await interaction.reply({ content: 'ต้องมีสิทธิ์ Manage Server จึงจะตั้งค่าได้', flags: MessageFlags.Ephemeral });
        return;
      }
      if (!store?.isConfigured) {
        await interaction.reply({ content: 'ต้องตั้งค่า Supabase ก่อนใช้งาน `/setup`', flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const role = interaction.options.getRole('verify_role');
        const beatmapChannel = interaction.options.getChannel('beatmap_channel');
        const mapStatus = interaction.options.getString('map_status');
        const mapMode = interaction.options.getString('map_mode');
        const alertsChannel = interaction.options.getChannel('alerts_channel');
        const bnMode = interaction.options.getString('bn_mode');
        const hasMapUpdate = Boolean(beatmapChannel || mapStatus || mapMode);
        const hasAlertUpdate = Boolean(alertsChannel || bnMode);
        const updated = Boolean(role || hasMapUpdate || hasAlertUpdate);

        if (role) await osuVerification.configureVerificationRole(interaction.guild, role);

        let currentMap = await store.getMapSettings(interaction.guildId);
        if (hasMapUpdate) {
          currentMap = await osuMaps.configureFeed({
            channelId: beatmapChannel?.id || currentMap?.channel_id || interaction.channelId,
            guildId: interaction.guildId,
            mode: mapMode || currentMap?.mode_filter || 'any',
            status: mapStatus || currentMap?.status_filter || 'ranked',
          });
          currentMap = {
            channel_id: currentMap.channelId,
            mode_filter: currentMap.mode,
            status_filter: currentMap.status,
          };
        }

        let currentAlerts = await store.getCommunityAlertSettings(interaction.guildId);
        if (hasAlertUpdate) {
          currentAlerts = {
            channel_id: alertsChannel?.id || currentAlerts?.channel_id || interaction.channelId,
            bn_mode_filter: bnMode || currentAlerts?.bn_mode_filter || 'all',
          };
          await store.saveCommunityAlertSettings(interaction.guildId, {
            channelId: currentAlerts.channel_id,
            bnMode: currentAlerts.bn_mode_filter,
          });
        }

        const roleId = role?.id || await store.getVerificationRole(interaction.guildId);
        await interaction.editReply({
          embeds: [createSetupEmbed({ alerts: currentAlerts, map: currentMap, roleId, updated })],
        });
      } catch (error) {
        console.error('Quick setup failed:', error.message);
        await interaction.editReply(`ตั้งค่าไม่สำเร็จ: ${error.message}`);
      }
      scheduleReplyDeletion(interaction);
      return;
    }

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

    if (['osumap', 'map'].includes(interaction.commandName)) {
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

    if (['alrenhelp', 'help'].includes(interaction.commandName)) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const language = interaction.options.getString('language');
      await interaction.editReply({
        embeds: [language ? createHelpEmbed(language) : createHelpLanguagePrompt()],
        components: [createHelpLanguageMenu(language)],
      });
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

    if (['osuverify', 'verify', 'osuverify-status', 'verify-role', 'verify-role-status'].includes(interaction.commandName)) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const context = createPrivateCommandContext(interaction);
      try {
        if (['osuverify', 'verify'].includes(interaction.commandName)) {
          const optionName = interaction.commandName === 'verify' ? 'osu_id' : 'osu_user_id';
          await osuVerification.begin(context, interaction.options.getString(optionName) ?? undefined);
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
      await interaction.editReply({ embeds: [createAlrenEmbed(answer)] });
    } catch (error) {
      console.error('Slash chat request failed:', error.message);
      await interaction.editReply('I cannot respond right now. Please try again shortly.');
    }

    scheduleReplyDeletion(interaction);
  };
}

module.exports = { createInteractionHandler, registerSlashCommands };

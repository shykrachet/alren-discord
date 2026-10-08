const {
  ChannelType, EmbedBuilder, MessageFlags, PermissionsBitField, REST, Routes, SlashCommandBuilder,
} = require('discord.js');
const {
  createAlrenEmbed,
  createHelpEmbed,
  createHelpComponents,
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

const VERIFY_STATUS_COMMAND = new SlashCommandBuilder()
  .setName('verify-status')
  .setDescription('Show your verified osu! account privately.');

const QUICK_VERIFY_COMMAND = new SlashCommandBuilder()
  .setName('verify')
  .setDescription('ยืนยันบัญชี osu! ด้วยปุ่ม OAuth แบบส่วนตัว')
  .addStringOption((option) => option
    .setName('osu_id')
    .setDescription('ไม่ใส่ก็ได้ ระบบจะตรวจบัญชีจาก osu! ให้อัตโนมัติ')
    .setRequired(false));

const VERIFY_SETTINGS_COMMAND = new SlashCommandBuilder()
  .setName('verify-setting')
  .setDescription('Configure osu! verification role and result channel privately.')
  .addRoleOption((option) => option
    .setName('role')
    .setDescription('The role verified members receive')
    .setRequired(false))
  .addChannelOption((option) => option
    .setName('channel')
    .setDescription('Channel that receives verification profile summaries')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement));

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
    .addChoices(...MAP_MODE_CHOICES))
  .addChannelOption((option) => option
    .setName('channel')
    .setDescription('Channel that receives automatic beatmap posts')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement));

const OSU_MAP_STATUS_COMMAND = new SlashCommandBuilder()
  .setName('osumap-status')
  .setDescription('Show the configured osu! beatmap feed settings privately.');

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
    .setName('verify_channel')
    .setDescription('ห้องสำหรับแสดงข้อมูลหลัง Verify สำเร็จ')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
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
  VERIFY_STATUS_COMMAND.toJSON(),
  QUICK_VERIFY_COMMAND.toJSON(),
  VERIFY_SETTINGS_COMMAND.toJSON(),
  OSU_MAP_COMMAND.toJSON(),
  OSU_MAP_SETTINGS_COMMAND.toJSON(),
  OSU_MAP_STATUS_COMMAND.toJSON(),
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

function errorReason(error) {
  const reason = String(error?.message || error || 'Unknown error').trim();
  return reason.length > 1500 ? `${reason.slice(0, 1497)}...` : reason;
}

function commandError(prefix, error) {
  return `${prefix}\nReason: ${errorReason(error)}`;
}

function createMapStatusEmbed(map) {
  const configured = Boolean(map?.channel_id);
  return new EmbedBuilder()
    .setColor(configured ? 0x22c55e : 0x5865f2)
    .setTitle('🎵 osu! beatmap feed settings')
    .setDescription(configured
      ? 'Automatic beatmap feed is configured for this server.'
      : 'Automatic beatmap feed is not configured yet. Use `/setup` or `/osumap-settings`.')
    .addFields(
      { name: '📣 Channel', value: map?.channel_id ? `<#${map.channel_id}>` : 'Not configured', inline: true },
      { name: '🔎 Filters', value: describeFilters({ mode: map?.mode_filter || 'any', status: map?.status_filter || 'ranked' }), inline: true },
    )
    .setFooter({ text: 'Configure with /setup or /osumap-settings' })
    .setTimestamp();
}

function createSetupEmbed({
  alerts, map, roleId, updated, verifyChannelId,
}) {
  const verifyText = roleId || verifyChannelId
    ? `${roleId ? `<@&${roleId}>` : 'No role'}\n${verifyChannelId ? `<#${verifyChannelId}>` : 'No result channel'}`
    : 'ยังไม่ได้ตั้งค่า';
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
      { name: '✅ Verify', value: verifyText, inline: true },
      { name: '🎵 Beatmap feed', value: mapText, inline: true },
      { name: '🔔 BN alerts', value: alertsText, inline: true },
    )
    .setFooter({ text: 'เฉพาะผู้มีสิทธิ์ Manage Server เท่านั้นที่ตั้งค่าได้' })
    .setTimestamp();
}

function getApplicationId(client) {
  return client.application?.id || client.user.id;
}

function createRest(token, providedRest) {
  return providedRest ?? new REST({ version: '10' }).setToken(token);
}

async function registerSlashCommands({ client, token, rest: providedRest }) {
  if (!client.user || (!token && !providedRest)) return;

  const rest = createRest(token, providedRest);
  const applicationId = getApplicationId(client);

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

async function registerGuildSlashCommands({
  client, guild, token, rest: providedRest,
}) {
  if (!client.user || !guild?.id || (!token && !providedRest)) return;

  const rest = createRest(token, providedRest);
  await rest.put(
    Routes.applicationGuildCommands(getApplicationId(client), guild.id),
    { body: COMMANDS },
  );
  console.log(`registered ${COMMANDS.length} slash command(s) for ${guild.name || guild.id}`);
}

function createInteractionHandler({ chat, osuMaps, osuVerification, store }) {
  return async (interaction) => {
    if (interaction.isStringSelectMenu?.() && interaction.customId === 'alrenhelp:language') {
      const language = interaction.values[0] === 'en' ? 'en' : 'th';
      await interaction.update({
        embeds: [createHelpEmbed(language)],
        components: createHelpComponents(language),
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
        const verifyChannel = interaction.options.getChannel('verify_channel');
        const beatmapChannel = interaction.options.getChannel('beatmap_channel');
        const mapStatus = interaction.options.getString('map_status');
        const mapMode = interaction.options.getString('map_mode');
        const alertsChannel = interaction.options.getChannel('alerts_channel');
        const bnMode = interaction.options.getString('bn_mode');
        const hasVerifyUpdate = Boolean(role || verifyChannel);
        const hasMapUpdate = Boolean(beatmapChannel || mapStatus || mapMode);
        const hasAlertUpdate = Boolean(alertsChannel || bnMode);
        const updated = Boolean(hasVerifyUpdate || hasMapUpdate || hasAlertUpdate);

        let currentVerify = await store.getVerificationSettings(interaction.guildId);
        if (hasVerifyUpdate) {
          currentVerify = await osuVerification.configureVerificationSettings(interaction.guild, {
            channel: verifyChannel,
            role,
          });
          currentVerify = {
            channel_id: currentVerify.channelId,
            role_id: currentVerify.roleId,
          };
        }

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

        await interaction.editReply({
          embeds: [createSetupEmbed({
            alerts: currentAlerts,
            map: currentMap,
            roleId: currentVerify?.role_id,
            updated,
            verifyChannelId: currentVerify?.channel_id,
          })],
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
        await interaction.editReply(commandError('I could not save the community alert settings.', error));
      }
      scheduleReplyDeletion(interaction);
      return;
    }

    if (interaction.commandName === 'verify-setting') {
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
          content: 'You need the Manage Server permission to change verification settings.',
          flags: MessageFlags.Ephemeral,
        });
        scheduleReplyDeletion(interaction);
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const context = createPrivateCommandContext(interaction);
      try {
        const role = interaction.options.getRole('role');
        const channel = interaction.options.getChannel('channel');
        if (role || channel) {
          const settings = await osuVerification.configureVerificationSettings(interaction.guild, {
            channel,
            role,
          });
          await interaction.editReply({
            embeds: [new EmbedBuilder()
              .setColor(0x22c55e)
              .setTitle('✅ Verification settings saved')
              .setDescription(`Verified role: <@&${settings.roleId}>\nResult channel: ${settings.channelId ? `<#${settings.channelId}>` : 'Not configured'}`)],
          });
        } else {
          await osuVerification.showVerificationSettings(context);
        }
      } catch (error) {
        console.error('Verification settings failed:', error.message);
        await interaction.editReply(commandError('I could not save verification settings.', error));
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
        const selectedChannel = interaction.options.getChannel('channel');
        const status = interaction.options.getString('status') ?? undefined;
        const mode = interaction.options.getString('mode') ?? undefined;
        const channelId = selectedChannel?.id || interaction.channelId;
        const settings = await osuMaps.configureFeed({
          channelId,
          guildId: interaction.guildId,
          mode,
          status,
        });
        await interaction.editReply(`Automatic beatmap feed enabled in <#${channelId}>: **${describeFilters(settings)}**. New maps will be posted there on the next check (up to 15 minutes by default).`);
      } catch (error) {
        console.error('Beatmap settings failed:', error.message);
        await interaction.editReply(commandError('I could not save the beatmap feed settings.', error));
      }
      scheduleReplyDeletion(interaction);
      return;
    }

    if (interaction.commandName === 'osumap-status') {
      if (!interaction.inGuild()) {
        await interaction.reply({
          content: 'This command can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
        scheduleReplyDeletion(interaction);
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const map = await store.getMapSettings(interaction.guildId);
        await interaction.editReply({ embeds: [createMapStatusEmbed(map)] });
      } catch (error) {
        console.error('Beatmap status failed:', error.message);
        await interaction.editReply(commandError('I could not read the beatmap feed settings.', error));
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
        await interaction.editReply(commandError('I could not fetch an osu! beatmap right now.', error));
      }
      return;
    }

    if (['alrenhelp', 'help'].includes(interaction.commandName)) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const language = interaction.options.getString('language');
      await interaction.editReply({
        embeds: [language ? createHelpEmbed(language) : createHelpLanguagePrompt()],
        components: createHelpComponents(language),
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

    if (['osuverify', 'verify', 'osuverify-status', 'verify-status'].includes(interaction.commandName)) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const context = createPrivateCommandContext(interaction);
      try {
        if (['osuverify', 'verify'].includes(interaction.commandName)) {
          const optionName = interaction.commandName === 'verify' ? 'osu_id' : 'osu_user_id';
          await osuVerification.begin(context, interaction.options.getString(optionName) ?? undefined);
        } else if (['osuverify-status', 'verify-status'].includes(interaction.commandName)) {
          await osuVerification.showStatus(context);
        }
      } catch (error) {
        console.error('Private verification command failed:', error.message);
        await interaction.editReply(commandError('I could not complete that verification request.', error));
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
      await interaction.editReply(commandError('I cannot respond right now.', error));
    }

    scheduleReplyDeletion(interaction);
  };
}

module.exports = { createInteractionHandler, registerGuildSlashCommands, registerSlashCommands };

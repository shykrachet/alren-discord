const { setupAccess, commandAccess } = require('./setup-access');
const { ACCESS_COMMAND, RESET_COMMAND, createAdminHandler } = require('./admin-commands');
const {
  ChannelType, EmbedBuilder, MessageFlags, REST, Routes, SlashCommandBuilder,
} = require('discord.js');
const {
  createHelpEmbed,
  createHelpComponents,
} = require('./message-handler');
const { createMapEmbed } = require('./osu-maps');
const { modeIcon } = require('./mode-icons');

const MAP_STATUS_CHOICES = [
  { name: 'Ranked', value: 'ranked' },
  { name: 'Qualified', value: 'qualified' },
  { name: 'Loved', value: 'loved' },
  { name: 'Ranked + Loved', value: 'ranked_loved' },
  { name: 'All statuses', value: 'all' },
];
const MAP_MODE_CHOICES = [
  { name: 'All Mode', value: 'any' },
  { name: 'Standard (osu!)', value: 'osu' },
  { name: 'osu!taiko', value: 'taiko' },
  { name: 'osu!catch / fruits', value: 'catch' },
  { name: 'osu!mania', value: 'mania' },
];
const BN_MODE_CHOICES = [
  { name: 'All Mode', value: 'all' },
  { name: 'Standard (osu!)', value: 'osu' },
  { name: 'Taiko', value: 'taiko' },
  { name: 'Catch / fruits', value: 'catch' },
  { name: 'Mania', value: 'mania' },
];

const PING_COMMAND = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check whether Alren is online.');

const QUICK_HELP_COMMAND = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show Alren’s command guide privately.');

const VERIFY_STATUS_COMMAND = new SlashCommandBuilder()
  .setName('verify-status')
  .setDescription('Show your verified osu! account privately.');

const QUICK_VERIFY_COMMAND = new SlashCommandBuilder()
  .setName('verify')
  .setDescription('Verify your osu! account privately with OAuth.')
  .addStringOption((option) => option
    .setName('osu_id')
    .setDescription('Optional osu! user ID. Your account is detected automatically when omitted.')
    .setRequired(false));

const QUICK_MAP_COMMAND = new SlashCommandBuilder()
  .setName('map')
  .setDescription('Post a random beatmap with cover artwork in this channel.')
  .addStringOption((option) => option
    .setName('status')
    .setDescription('Beatmap status. Defaults to this channel’s saved setting.')
    .addChoices(...MAP_STATUS_CHOICES))
  .addStringOption((option) => option
    .setName('mode')
    .setDescription('Game mode. Defaults to this channel’s saved setting.')
    .addChoices(...MAP_MODE_CHOICES));

const SETUP_COMMAND = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Configure verification, beatmap feeds and BN alerts. Inviter only.')
  .addSubcommand((subcommand) => subcommand
    .setName('status')
    .setDescription('View all Alren settings for this server.'))
  .addSubcommand((subcommand) => subcommand
    .setName('verify')
    .setDescription('Configure the verified role and verification result channel.')
    .addRoleOption((option) => option
      .setName('role')
      .setDescription('Role assigned after successful verification.'))
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('Channel for posting successful verification results.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand((subcommand) => subcommand
    .setName('beatmap')
    .setDescription('Configure a beatmap feed per channel, such as Mania in #mania or Standard in #standard.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('Channel to configure. Defaults to this channel; other feeds are unaffected.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((option) => option
      .setName('status')
      .setDescription('Status for this channel. Choose Ranked + Loved to receive both statuses.')
      .addChoices(...MAP_STATUS_CHOICES))
    .addStringOption((option) => option
      .setName('mode')
      .setDescription('Mode for this channel: Standard, Taiko, Catch, Mania or All Mode.')
      .addChoices(...MAP_MODE_CHOICES))
    .addBooleanOption((option) => option
      .setName('enabled')
      .setDescription('Enable or disable the feed in the selected channel.')))
  .addSubcommand((subcommand) => subcommand
    .setName('bn-management')
    .setDescription('Manage BN request notifications and Mappers’ Guild alerts.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('Channel for BN and Mappers’ Guild alerts.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((option) => option
      .setName('bn_mode')
      .setDescription('BN mode to receive alerts for.')
      .addChoices(...BN_MODE_CHOICES)));

const COMMANDS = [
  PING_COMMAND.toJSON(),
  QUICK_HELP_COMMAND.toJSON(),
  VERIFY_STATUS_COMMAND.toJSON(),
  QUICK_VERIFY_COMMAND.toJSON(),
  QUICK_MAP_COMMAND.toJSON(),
  SETUP_COMMAND.toJSON(),
  ACCESS_COMMAND.toJSON(),
  RESET_COMMAND.toJSON(),
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

function describeMode(mode, choices) {
  const choice = choices.find((item) => item.value === mode) || choices[0];
  return ['any', 'all'].includes(choice.value) ? choice.name : `${modeIcon(choice.value)} ${choice.name}`;
}

function describeFilters({ mode, status }) {
  const modeName = describeMode(mode, MAP_MODE_CHOICES);
  const statusName = MAP_STATUS_CHOICES.find((choice) => choice.value === status)?.name ?? 'Ranked';
  return `${statusName} · ${modeName}`;
}

function describeBnMode(mode) {
  return describeMode(mode, BN_MODE_CHOICES);
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
      ? 'Automatic beatmap feed is configured for this channel. Use `/setup status` to view all channel feeds.'
      : 'Automatic beatmap feed is not configured for this channel yet. Use `/setup beatmap`.')
    .addFields(
      { name: '📣 Channel', value: map?.channel_id ? `<#${map.channel_id}>` : 'Not configured', inline: true },
      { name: '🔎 Filters', value: describeFilters({ mode: map?.mode_filter || 'any', status: map?.status_filter || 'ranked' }), inline: true },
    )
    .setFooter({ text: 'Configure with /setup beatmap' })
    .setTimestamp();
}

function createSetupEmbed({
  alerts, maps = [], roleId, updated, verifyChannelId,
}) {
  const verifyText = roleId || verifyChannelId
    ? `${roleId ? `<@&${roleId}>` : 'No role'}\n${verifyChannelId ? `<#${verifyChannelId}>` : 'No result channel'}`
    : 'Not configured';
  const mapLines = maps.map((map) => `<#${map.channel_id}> — ${describeFilters({ mode: map.mode_filter, status: map.status_filter })}`);
  const visibleMapLines = [];
  for (const line of mapLines) {
    // Leave room for the omitted count within Discord's 1024-character field limit.
    if ([...visibleMapLines, line].join('\n').length > 950) break;
    visibleMapLines.push(line);
  }
  if (visibleMapLines.length < mapLines.length) {
    visibleMapLines.push(`… ${mapLines.length - visibleMapLines.length} more channels`);
  }
  const mapText = visibleMapLines.join('\n') || 'Not configured';
  const alertsText = alerts?.channel_id
    ? `<#${alerts.channel_id}>\n${describeBnMode(alerts.bn_mode_filter || 'all')}`
    : 'Not configured';
  return new EmbedBuilder()
    .setColor(updated ? 0x22c55e : 0x5865f2)
    .setTitle(updated ? '✅ Alren settings saved' : '⚙️ Alren settings')
    .setDescription(updated
      ? 'Your settings are shown below.'
      : 'Run `/setup` with only the options you want to change.')
    .addFields(
      { name: '✅ Verify', value: verifyText, inline: true },
      { name: '🎵 Beatmap feeds (per channel)', value: mapText, inline: false },
      { name: '🔔 BN alerts', value: alertsText, inline: true },
    )
    .setFooter({ text: 'Only the person who invited Alren can use setup' })
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

  // Keep guild commands current as well: guild updates are available immediately,
  // while clients may still hold an older global command definition.
  const guilds = [...client.guilds.cache.values()];
  const syncResults = await Promise.allSettled(guilds.map((guild) => registerGuildSlashCommands({
    client, guild, rest,
  })));
  syncResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.warn(`Could not sync slash commands for server ${guilds[index].id}:`, result.reason?.message || result.reason);
    }
  });
  const synced = syncResults.filter((result) => result.status === 'fulfilled').length;
  console.log(`registered ${COMMANDS.length} global slash command(s); synced ${synced}/${guilds.length} server(s)`);
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

function createInteractionHandler({ osuMaps, osuVerification, store }) {
  const handleAdmin = createAdminHandler({ store });
  return async (interaction) => {
    if (await handleAdmin(interaction)) return;
    if (interaction.isStringSelectMenu?.() && interaction.customId === 'alrenhelp:language') {
      const denied = await commandAccess(interaction, store);
      if (denied) { await interaction.reply({ content: denied, flags: MessageFlags.Ephemeral }); return; }
      await interaction.update({
        embeds: [createHelpEmbed()],
        components: createHelpComponents(),
      });
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.deferred) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const accessDenied = await commandAccess(interaction, store);
    if (accessDenied) { await interaction.editReply({ content: accessDenied }); return; }


    if (['alren', 'alrenclear'].includes(interaction.commandName)) {
      await interaction.editReply({ content: 'AI chat has been removed from Alren.' });
      return;
    }

    if (interaction.commandName === 'ping') {
      await interaction.editReply({
        content: `🏓 Pong — **${interaction.client.ws.ping}ms**`,
        flags: MessageFlags.Ephemeral,
      });
      scheduleReplyDeletion(interaction);
      return;
    }

    if (['setup', 'community-alert-settings', 'verify-setting', 'verify-role', 'osumap-settings'].includes(interaction.commandName) && interaction.inGuild()) {
      if (!interaction.deferred) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const denied = await setupAccess(interaction, store);
      if (denied) { await interaction.editReply({ content: denied }); return; }
    }

    if (interaction.commandName === 'setup') {
      if (!interaction.inGuild()) {
        await interaction.editReply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (!store?.isConfigured) {
        await interaction.editReply({ content: 'A configured database is required to use `/setup`.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (!interaction.deferred) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const section = interaction.options.getSubcommand(false) || 'status';
        let updated = false;
        let currentVerify = await store.getVerificationSettings(interaction.guildId);
        let currentAlerts = await store.getCommunityAlertSettings(interaction.guildId);

        if (section === 'verify') {
          const role = interaction.options.getRole('role');
          const verifyChannel = interaction.options.getChannel('channel');
          if (role || verifyChannel) {
            currentVerify = await osuVerification.configureVerificationSettings(interaction.guild, {
              channel: verifyChannel,
              role,
            });
            currentVerify = {
              channel_id: currentVerify.channelId,
              role_id: currentVerify.roleId,
            };
            updated = true;
          }
        }

        if (section === 'beatmap') {
          const beatmapChannel = interaction.options.getChannel('channel');
          const mapStatus = interaction.options.getString('status');
          const mapMode = interaction.options.getString('mode');
          const enabled = interaction.options.getBoolean('enabled');
          const channelId = beatmapChannel?.id || interaction.channelId;
          if (enabled === false) {
            await store.deleteMapSettings(interaction.guildId, channelId);
            updated = true;
          } else if (beatmapChannel || mapStatus || mapMode || enabled === true) {
            await osuMaps.configureFeed({
              channelId,
              guildId: interaction.guildId,
              mode: mapMode ?? undefined,
              status: mapStatus ?? undefined,
            });
            updated = true;
          }
        }

        if (section === 'bn-management') {
          const alertsChannel = interaction.options.getChannel('channel');
          const bnMode = interaction.options.getString('bn_mode');
          if (alertsChannel || bnMode) {
            currentAlerts = {
              channel_id: alertsChannel?.id || currentAlerts?.channel_id || interaction.channelId,
              bn_mode_filter: bnMode || currentAlerts?.bn_mode_filter || 'all',
            };
            await store.saveCommunityAlertSettings(interaction.guildId, {
              channelId: currentAlerts.channel_id,
              bnMode: currentAlerts.bn_mode_filter,
            });
            updated = true;
          }
        }

        await interaction.editReply({
          embeds: [createSetupEmbed({
            alerts: currentAlerts,
            maps: await store.listMapSettings(interaction.guildId),
            roleId: currentVerify?.role_id,
            updated,
            verifyChannelId: currentVerify?.channel_id,
          })],
        });
      } catch (error) {
        console.error('Quick setup failed:', error.message);
        await interaction.editReply(`Could not save settings: ${error.message}`);
      }
      scheduleReplyDeletion(interaction);
      return;
    }

    if (interaction.commandName === 'community-alert-settings') {
      if (!interaction.inGuild()) {
        await interaction.editReply({
          content: 'This command can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
        scheduleReplyDeletion(interaction);
        return;
      }
      if (!store?.isConfigured) {
        await interaction.editReply({
          content: 'Community alerts need a configured database.',
          flags: MessageFlags.Ephemeral,
        });
        scheduleReplyDeletion(interaction);
        return;
      }

      if (!interaction.deferred) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const current = await store.getCommunityAlertSettings(interaction.guildId);
        const selectedChannel = interaction.options.getChannel('channel');
        const selectedMode = interaction.options.getString('bn_mode');
        const channelId = selectedChannel?.id || current?.channel_id;
        const bnMode = selectedMode || current?.bn_mode_filter || 'all';
        if (!channelId) {
          await interaction.editReply('Select a channel the first time, for example `/setup bn-management channel:#alerts`.');
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
        await interaction.editReply({
          content: 'This command can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
        scheduleReplyDeletion(interaction);
        return;
      }

      if (!interaction.deferred) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
        await interaction.editReply({
          content: 'This command can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
        scheduleReplyDeletion(interaction);
        return;
      }

      if (!interaction.deferred) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
        await interaction.editReply(`Automatic beatmap feed enabled in <#${channelId}>: **${describeFilters(settings)}**. New maps will be posted there on the next realtime check.`);
      } catch (error) {
        console.error('Beatmap settings failed:', error.message);
        await interaction.editReply(commandError('I could not save the beatmap feed settings.', error));
      }
      scheduleReplyDeletion(interaction);
      return;
    }

    if (interaction.commandName === 'osumap-status') {
      if (!interaction.inGuild()) {
        await interaction.editReply({
          content: 'This command can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
        scheduleReplyDeletion(interaction);
        return;
      }

      if (!interaction.deferred) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const map = await store.getMapSettings(interaction.guildId, interaction.channelId);
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
        await interaction.editReply({
          content: 'This command can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
        scheduleReplyDeletion(interaction);
        return;
      }

      await interaction.deferReply();
      try {
        const result = await osuMaps.getRandomMap({
          channelId: interaction.channelId,
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
      if (!interaction.deferred) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.editReply({
        embeds: [createHelpEmbed()],
        components: createHelpComponents(),
      });
      scheduleReplyDeletion(interaction);
      return;
    }

    if (['osuverify', 'verify', 'osuverify-status', 'verify-status'].includes(interaction.commandName)) {
      if (!interaction.deferred) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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


  };
}

module.exports = { createInteractionHandler, registerGuildSlashCommands, registerSlashCommands };

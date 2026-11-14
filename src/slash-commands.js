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
const { PROFILE_ROLES } = require('./osu-profile-roles');

const ALREN_DEV_APPLICATION_ID = '1571056197719695421';

const MAP_STATUS_CHOICES = [
  { name: 'Ranked', value: 'ranked' },
  { name: 'Qualified', value: 'qualified' },
  { name: 'Loved', value: 'loved' },
  { name: 'Ranked + Loved', value: 'ranked_loved' },
  { name: 'All statuses', value: 'all' },
];
const MAP_MODE_CHOICES = [
  { name: 'All game modes', value: 'any' },
  { name: 'Standard (osu!)', value: 'osu' },
  { name: 'osu!taiko', value: 'taiko' },
  { name: 'osu!catch / fruits', value: 'catch' },
  { name: 'osu!mania', value: 'mania' },
];
const BN_MODE_CHOICES = [
  { name: 'All game modes', value: 'all' },
  { name: 'Standard (osu!)', value: 'osu' },
  { name: 'Taiko', value: 'taiko' },
  { name: 'Catch / fruits', value: 'catch' },
  { name: 'Mania', value: 'mania' },
];

// /ping — Check whether the bot responds and show its latency.
const PING_COMMAND = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check if Alren is responding and see its latency.');

// /help — Open the bot command guide.
const QUICK_HELP_COMMAND = new SlashCommandBuilder()
  .setName('help')
  .setDescription('See what Alren commands do. Only you can see the guide.');

// /verify-status — Show the osu! account linked to Discord.
const VERIFY_STATUS_COMMAND = new SlashCommandBuilder()
  .setName('verify-status')
  .setDescription('See which osu! account you linked in this server. Only you can see the result.');

// /verify osu_user_id:123456 — Link an osu! account using the optional ID from the profile URL.
const QUICK_VERIFY_COMMAND = new SlashCommandBuilder()
  .setName('verify')
  .setDescription('Link your Discord account by signing in to osu! through a private link.')
  .addStringOption((option) => option
    .setName('osu_user_id')
    .setDescription('Number in your osu! profile URL. Leave blank to use the account you sign in with.')
    .setRequired(false));

// /map map_status:ranked game_mode:mania — Post a random Ranked osu!mania beatmap.
const QUICK_MAP_COMMAND = new SlashCommandBuilder()
  .setName('map')
  .setDescription('Post a random osu! beatmap in this channel.')
  .addStringOption((option) => option
    .setName('map_status')
    .setDescription('Beatmap status. Defaults to this channel’s saved setting.')
    .addChoices(...MAP_STATUS_CHOICES))
  .addStringOption((option) => option
    .setName('game_mode')
    .setDescription('Game mode. Defaults to this channel’s saved setting.')
    .addChoices(...MAP_MODE_CHOICES));

// /setup — Configure the bot for this server.
const SETUP_COMMAND = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Set up osu! verification, roles, beatmap feeds and alerts. Inviter only.')
  // /setup status — Show the current server settings.
  .addSubcommand((subcommand) => subcommand
    .setName('status')
    .setDescription('See the current verification, beatmap feed and alert settings for this server.'))
  // /setup verify verify_channel:#verify result_channel:#verify-done verified_role:@Verified
  // Choose the Verify button channel, the results channel, and the role awarded after verification.
  .addSubcommand((subcommand) => subcommand
    .setName('verify')
    .setDescription('Choose where members verify and what happens after they pass.')
    .addChannelOption((option) => option
      .setName('verify_channel')
      .setDescription('Where members click Verify, e.g. #verify.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addChannelOption((option) => option
      .setName('result_channel')
      .setDescription('Where Alren posts successful verifications, e.g. #verify-done.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addRoleOption((option) => option
      .setName('verified_role')
      .setDescription('Role given to members who pass verification, e.g. @Verified.')))
  // /setup beatmap feed_channel:#mania game_mode:mania map_status:ranked feed_enabled:true
  // Choose the feed channel, game mode, and map status. Use feed_enabled:false to stop the feed.
  .addSubcommand((subcommand) => subcommand
    .setName('beatmap')
    .setDescription('Choose which new beatmaps Alren posts automatically in a channel.')
    .addChannelOption((option) => option
      .setName('feed_channel')
      .setDescription('Where Alren posts new beatmaps. Defaults to the current channel.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((option) => option
      .setName('map_status')
      .setDescription('Which map statuses to post, e.g. Ranked, Loved or both.')
      .addChoices(...MAP_STATUS_CHOICES))
    .addStringOption((option) => option
      .setName('game_mode')
      .setDescription('Which game mode to post, e.g. osu!mania or all game modes.')
      .addChoices(...MAP_MODE_CHOICES))
    .addBooleanOption((option) => option
      .setName('feed_enabled')
      .setDescription('True starts posting; false stops posting in the selected channel.')))
  // /setup bn-management alert_channel:#alerts game_mode:mania — Choose the alert channel and the game mode for Beatmap Nominator alerts.
  .addSubcommand((subcommand) => subcommand
    .setName('bn-management')
    .setDescription('Set where Beatmap Nominator and Mappers’ Guild alerts are posted.')
    .addChannelOption((option) => option
      .setName('alert_channel')
      .setDescription('Where Alren posts Beatmap Nominator and Mappers’ Guild alerts.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((option) => option
      .setName('game_mode')
      .setDescription('Which game mode to follow for Beatmap Nominator alerts.')
      .addChoices(...BN_MODE_CHOICES)))
  // /setup osu-role osu_category:Ranked Mapper discord_role:@Ranked Mapper
  // Match an osu! category to a Discord role. Use stop_assigning:true to stop awarding it.
  .addSubcommand((subcommand) => subcommand
    .setName('osu-role')
    .setDescription('Choose which Discord roles Alren gives for osu! groups or mapping achievements.')
    .addStringOption((option) => option.setName('osu_category').setDescription('Which osu! group or achievement qualifies, e.g. Ranked Mapper.')
      .addChoices(...Object.entries(PROFILE_ROLES).map(([value, name]) => ({ name, value }))))
    .addRoleOption((option) => option.setName('discord_role').setDescription('Discord role Alren gives to members who qualify.'))
    .addBooleanOption((option) => option.setName('stop_assigning').setDescription('True stops awarding this role. Members keep roles already given.')))
  // /setup osu-role-sync — Check previously verified members and award matching roles.
  .addSubcommand((subcommand) => subcommand
    .setName('osu-role-sync')
    .setDescription('Check linked accounts in the background and give any osu! roles they qualify for.'));

// Slash commands registered with Discord.
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
  alerts, maps = [], roleId, updated, verifyChannelId, verifyPanelChannelId,
}) {
  const verifyText = roleId || verifyChannelId || verifyPanelChannelId
    ? [
      `Verify button channel · ${verifyPanelChannelId ? `<#${verifyPanelChannelId}>` : 'Not configured'}`,
      `Result channel · ${verifyChannelId ? `<#${verifyChannelId}>` : 'Not configured'}`,
      `Verified role · ${roleId ? `<@&${roleId}>` : 'Not configured'}`,
    ].join('\n')
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
  const isDev = applicationId === ALREN_DEV_APPLICATION_ID;

  // Global commands automatically become available in every server where the
  // app is installed, including servers that add the bot after it starts.
  if (!isDev) {
    await rest.put(Routes.applicationCommands(applicationId), { body: COMMANDS });
  }

  // Dev uses guild commands for immediate updates. Main removes its old guild copies.
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
  if (isDev) {
    if (synced === guilds.length) {
      // Clear previously registered global commands after their guild replacements are ready.
      await rest.put(Routes.applicationCommands(applicationId), { body: [] });
      console.log(`cleared Alren-Dev global slash commands; synced ${synced}/${guilds.length} server(s)`);
    }
    return;
  }
  console.log(`registered ${COMMANDS.length} global slash command(s); synced ${synced}/${guilds.length} server(s)`);
}

async function registerGuildSlashCommands({
  client, guild, token, rest: providedRest,
}) {
  if (!client.user || !guild?.id || (!token && !providedRest)) return;

  const rest = createRest(token, providedRest);
  const applicationId = getApplicationId(client);
  const commands = applicationId === ALREN_DEV_APPLICATION_ID ? COMMANDS : [];
  await rest.put(
    Routes.applicationGuildCommands(applicationId, guild.id),
    { body: commands },
  );
  console.log(commands.length
    ? `registered ${commands.length} slash command(s) for ${guild.name || guild.id}`
    : `cleared guild slash command copies for ${guild.name || guild.id}`);
}

function createInteractionHandler({ osuMaps, osuVerification, store }) {
  const handleAdmin = createAdminHandler({ store });
  return async (interaction) => {
    if (await handleAdmin(interaction)) return;
    if (await osuVerification?.handlePanelInteraction?.(interaction)) return;
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
    if (!interaction.deferred) {
      await interaction.deferReply(interaction.commandName === 'setup' && interaction.inGuild()
        ? {}
        : { flags: MessageFlags.Ephemeral });
    }
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
      const denied = await setupAccess(interaction, store);
      if (denied) { await interaction.editReply({ content: denied }); return; }
    }

    if (interaction.commandName === 'setup') {
      if (!interaction.inGuild()) {
        await interaction.editReply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (!store?.isConfigured) {
        await interaction.editReply({ content: 'A configured database is required to use `/setup`.' });
        return;
      }

      try {
        const section = interaction.options.getSubcommand(false) || 'status';
        if (section === 'osu-role-sync') {
          const status = await osuVerification.startProfileRoleSync(interaction.guild, (content) =>
            interaction.channel.send({ content, allowedMentions: { parse: [] } }));
          await interaction.editReply({ content: status });
          return;
        }
        if (section === 'osu-role') {
          const category = interaction.options.getString('osu_category') ?? interaction.options.getString('category');
          const role = interaction.options.getRole('discord_role') ?? interaction.options.getRole('role');
          const disable = interaction.options.getBoolean('stop_assigning') ?? interaction.options.getBoolean('disable');
          if ((role || disable) && !category) throw new Error('Select a category first.');
          if (role && disable) throw new Error('Choose a role or disable the category.');
          if (role || disable) await osuVerification.configureProfileRole(interaction.guild, category, role);
          const roles = await store.listOsuProfileRoles(interaction.guildId);
          await interaction.editReply({
            content: roles.map(({ category: key, role_id: id }) => `${PROFILE_ROLES[key]} · <@&${id}>`).join('\n')
              || 'No osu! profile roles configured.',
            allowedMentions: { parse: [] },
          });
          return;
        }
        let updated = false;
        let currentVerify = await store.getVerificationSettings(interaction.guildId);
        let currentAlerts = await store.getCommunityAlertSettings(interaction.guildId);

        if (section === 'verify') {
          const role = interaction.options.getRole('verified_role') ?? interaction.options.getRole('role');
          const resultChannel = interaction.options.getChannel('result_channel') ?? interaction.options.getChannel('channel');
          const panelChannel = interaction.options.getChannel('verify_channel') ?? interaction.options.getChannel('panel');
          if (role || resultChannel || panelChannel) {
            currentVerify = await osuVerification.configureVerificationSettings(interaction.guild, {
              channel: resultChannel,
              panelChannel,
              role,
            });
            currentVerify = {
              channel_id: currentVerify.channelId,
              panel_channel_id: currentVerify.panelChannelId,
              role_id: currentVerify.roleId,
            };
            updated = true;
          }
        }

        if (section === 'beatmap') {
          const beatmapChannel = interaction.options.getChannel('feed_channel') ?? interaction.options.getChannel('channel');
          const mapStatus = interaction.options.getString('map_status') ?? interaction.options.getString('status');
          const mapMode = interaction.options.getString('game_mode') ?? interaction.options.getString('mode');
          const enabled = interaction.options.getBoolean('feed_enabled') ?? interaction.options.getBoolean('enabled');
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
          const alertsChannel = interaction.options.getChannel('alert_channel') ?? interaction.options.getChannel('channel');
          const bnMode = interaction.options.getString('game_mode') ?? interaction.options.getString('bn_mode');
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
            verifyPanelChannelId: currentVerify?.panel_channel_id,
          })],
        });
      } catch (error) {
        console.error('Quick setup failed:', error.message);
        await interaction.editReply(`Could not save settings: ${error.message}`);
      }
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
          await interaction.editReply('Select a channel the first time, for example `/setup bn-management alert_channel:#alerts`.');
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
          mode: interaction.options.getString('game_mode') ?? interaction.options.getString('mode') ?? undefined,
          status: interaction.options.getString('map_status') ?? interaction.options.getString('status') ?? undefined,
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
          const osuUserId = interaction.options.getString('osu_user_id') ?? interaction.options.getString('osu_id');
          await osuVerification.begin(context, osuUserId ?? undefined);
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

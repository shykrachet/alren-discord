const { resolveInviter } = require('./src/setup-access');
require('dotenv').config();

const { Client, GatewayIntentBits, MessageFlags } = require('discord.js');
const {
  DISCORD_TOKEN, SQLITE_PATH,
} = require('./src/config');
const {
  createBnClosedEmbed, createBnRequestEmbed, createCommunityAlertsService, createMissionEmbed,
  shouldDeliverCommunityAlert,
} = require('./src/community-alerts');
const { createMessageHandler } = require('./src/message-handler');
const { syncApplicationModeEmojis } = require('./src/mode-icons');
const { createMapEmbed, createOsuMapService } = require('./src/osu-maps');
const { createOsuVerificationService } = require('./src/osu-verification');
const {
  createInteractionHandler,
  registerGuildSlashCommands,
  registerSlashCommands,
} = require('./src/slash-commands');
const { createSqliteStore } = require('./src/sqlite-store');

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const verificationStore = createSqliteStore({ dbPath: SQLITE_PATH });
const communityAlerts = createCommunityAlertsService();
const osuMaps = createOsuMapService({ store: verificationStore });
const osuVerification = createOsuVerificationService({
  apiHandler: communityAlerts.handleApiRequest,
  bot,
  store: verificationStore,
});

bot.once('clientReady', async () => {
  console.log(`online: ${bot.user.tag}`);
  for (const guild of bot.guilds.cache.values()) {
    resolveInviter(guild, verificationStore).catch((error) => console.warn(`Could not identify inviter for ${guild.id}:`, error.message));
  }
  try {
    const modeIcons = await syncApplicationModeEmojis(bot.application);
    console.log(`mode icons ready: ${modeIcons.ready} (${modeIcons.created} created)`);
  } catch (error) {
    console.warn('Could not prepare application mode emojis; using Unicode fallbacks:', error.message);
  }
  try {
    await registerSlashCommands({ client: bot, token: DISCORD_TOKEN });
  } catch (error) {
    console.error('Could not register slash commands:', error.message);
  }
  try {
    await osuVerification.startServer();
  } catch (error) {
    console.error('Could not start the HTTP API:', error.message);
  }
  osuMaps.startFeed(async ({ map, settings }) => {
    const channel = await bot.channels.fetch(settings.channelId);
    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
      throw new Error(`Configured beatmap channel ${settings.channelId} is unavailable.`);
    }
    await channel.send({
      content: '🆕 **New osu! beatmap**',
      embeds: [createMapEmbed(map)],
    });
  });
  if (verificationStore.isConfigured) {
    communityAlerts.start(async (alert) => {
      const settingsRows = await verificationStore.listCommunityAlertSettings();
      for (const settings of settingsRows || []) {
        if (!shouldDeliverCommunityAlert(alert, settings)) continue;
        try {
          const channel = await bot.channels.fetch(settings.channel_id);
          if (!channel?.isTextBased() || typeof channel.send !== 'function') {
            throw new Error(`Configured community alert channel ${settings.channel_id} is unavailable.`);
          }
          const embed = alert.type === 'bn-open'
            ? createBnRequestEmbed(alert.entry)
            : alert.type === 'bn-closed'
              ? createBnClosedEmbed(alert.entry)
              : createMissionEmbed(alert.mission);
          await channel.send({ embeds: [embed] });
        } catch (error) {
          console.error(`Community alert delivery failed for server ${settings.guild_id}:`, error.message);
        }
      }
    });
  } else {
    console.warn('Community notifications are disabled: database is not configured.');
  }
});

bot.on('messageCreate', createMessageHandler({
  bot,
  osuMaps,
  osuVerification,
  store: verificationStore,
}));
bot.on('guildAuditLogEntryCreate', (entry, guild) => {
  if (entry.action === 28 && entry.targetId === bot.user.id) {
    resolveInviter(guild, verificationStore).catch((error) => console.warn('Could not save inviter:', error.message));
  }
});

bot.on('guildMemberAdd', (member) => {
  osuVerification.sendWelcomeVerification(member).catch((error) => {
    console.error('Welcome verification failed:', error.message);
  });
});
bot.on('guildCreate', (guild) => {
  resolveInviter(guild, verificationStore).catch((error) => console.warn(`Could not identify inviter for ${guild.id}:`, error.message));
  registerGuildSlashCommands({ client: bot, guild, token: DISCORD_TOKEN }).catch((error) => {
    console.error(`Could not register slash commands for ${guild.id}:`, error.message);
  });
});
const handleInteraction = createInteractionHandler({
  osuMaps,
  osuVerification,
  store: verificationStore,
});
async function reportInteractionError(interaction, error) {
  if (!interaction?.isRepliable?.()) return;
  const reason = String(error?.message || error || 'Unknown error').trim();
  const content = `Alren could not run this command.\nReason: ${reason.length > 1500 ? `${reason.slice(0, 1497)}...` : reason}`;
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(content).catch(() => interaction.followUp({
      content,
      flags: MessageFlags.Ephemeral,
    }).catch(() => {}));
    return;
  }
  await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
}
bot.on('interactionCreate', (interaction) => {
  handleInteraction(interaction).catch((error) => {
    console.error('Interaction handler failed:', error.message);
    reportInteractionError(interaction, error).catch((reportError) => {
      console.error('Could not report interaction failure:', reportError.message);
    });
  });
});
bot.on('error', (error) => {
  console.error('Discord client error:', error.message);
});

if (!DISCORD_TOKEN) throw new Error('Missing DISCORD_TOKEN in .env');

bot.login(DISCORD_TOKEN);

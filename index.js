require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const OpenAI = require('openai');
const {
  AI_BASE_URL, DISCORD_TOKEN, OPENAI_API_KEY,
  SUPABASE_SECRET_KEY, SUPABASE_URL,
} = require('./src/config');
const { createChatService } = require('./src/chat');
const {
  createBnRequestEmbed, createCommunityAlertsService, createMissionEmbed, shouldDeliverCommunityAlert,
} = require('./src/community-alerts');
const { createMessageHandler } = require('./src/message-handler');
const { createMapEmbed, createOsuMapService } = require('./src/osu-maps');
const { createOsuVerificationService } = require('./src/osu-verification');
const { createInteractionHandler, registerSlashCommands } = require('./src/slash-commands');
const { createSupabaseStore } = require('./src/supabase-store');

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const openai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY, ...(AI_BASE_URL && { baseURL: AI_BASE_URL }) })
  : null;
const chat = openai ? createChatService(openai) : null;
const verificationStore = createSupabaseStore({ url: SUPABASE_URL, secretKey: SUPABASE_SECRET_KEY });
const communityAlerts = createCommunityAlertsService();
const osuMaps = createOsuMapService({ store: verificationStore });
const osuVerification = createOsuVerificationService({
  apiHandler: communityAlerts.handleApiRequest,
  bot,
  store: verificationStore,
});

bot.once('clientReady', async () => {
  console.log(`online: ${bot.user.tag}`);
  if (!chat) console.warn('Chat is disabled: add OPENAI_API_KEY to .env');
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
            : createMissionEmbed(alert.mission);
          await channel.send({ embeds: [embed] });
        } catch (error) {
          console.error(`Community alert delivery failed for server ${settings.guild_id}:`, error.message);
        }
      }
    });
  } else {
    console.warn('Community notifications are disabled: configure Supabase, then use /community-alert-settings.');
  }
});

bot.on('messageCreate', createMessageHandler({ bot }));
const handleInteraction = createInteractionHandler({
  chat,
  osuMaps,
  osuVerification,
  store: verificationStore,
});
bot.on('interactionCreate', (interaction) => {
  handleInteraction(interaction).catch((error) => {
    console.error('Interaction handler failed:', error.message);
  });
});
bot.on('error', (error) => {
  console.error('Discord client error:', error.message);
});

if (!DISCORD_TOKEN) throw new Error('Missing DISCORD_TOKEN in .env');

bot.login(DISCORD_TOKEN);

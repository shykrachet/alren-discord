require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const OpenAI = require('openai');
const {
  DISCORD_TOKEN, OPENAI_API_KEY, AI_BASE_URL, SUPABASE_SECRET_KEY, SUPABASE_URL,
} = require('./src/config');
const { createChatService } = require('./src/chat');
const { createMessageHandler } = require('./src/message-handler');
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
const osuVerification = createOsuVerificationService({ bot, store: verificationStore });

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
    console.error('osu! verification is disabled:', error.message);
  }
});

bot.on('messageCreate', createMessageHandler({ bot }));
const handleInteraction = createInteractionHandler({ chat, osuVerification });
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

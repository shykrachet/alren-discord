require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const OpenAI = require('openai');
const { DISCORD_TOKEN, OPENAI_API_KEY, AI_BASE_URL } = require('./src/config');
const { createChatService } = require('./src/chat');
const { createMessageHandler } = require('./src/message-handler');
const { createOsuVerificationService } = require('./src/osu-verification');

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
const osuVerification = createOsuVerificationService({ bot });

bot.once('ready', async () => {
  console.log(`online: ${bot.user.tag}`);
  if (!chat) console.warn('Chat is disabled: add OPENAI_API_KEY to .env');
  try {
    await osuVerification.startServer();
  } catch (error) {
    console.error('osu! verification is disabled:', error.message);
  }
});

bot.on('messageCreate', createMessageHandler({ bot, chat, osuVerification }));

if (!DISCORD_TOKEN) throw new Error('Missing DISCORD_TOKEN in .env');

bot.login(DISCORD_TOKEN);

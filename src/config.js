const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const isOpenRouter = OPENAI_API_KEY?.startsWith('sk-or-');

module.exports = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  OPENAI_API_KEY,
  // OpenRouter is OpenAI-compatible but requires its own API base URL.
  AI_BASE_URL: process.env.AI_BASE_URL || (isOpenRouter ? 'https://openrouter.ai/api/v1' : undefined),
  OPENAI_MODEL: process.env.OPENAI_MODEL || (isOpenRouter ? 'openai/gpt-5-mini' : 'gpt-5.4-mini'),
};

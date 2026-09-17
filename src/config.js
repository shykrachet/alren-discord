const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const isOpenRouter = OPENAI_API_KEY?.startsWith('sk-or-');

module.exports = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  OPENAI_API_KEY,
  // OpenRouter is OpenAI-compatible but requires its own API base URL.
  AI_BASE_URL: process.env.AI_BASE_URL || (isOpenRouter ? 'https://openrouter.ai/api/v1' : undefined),
  OPENAI_MODEL: process.env.OPENAI_MODEL || (isOpenRouter ? 'openai/gpt-5-mini' : 'gpt-5.4-mini'),
  OSU_CLIENT_ID: process.env.OSU_CLIENT_ID,
  OSU_CLIENT_SECRET: process.env.OSU_CLIENT_SECRET,
  OSU_REDIRECT_URI: process.env.OSU_REDIRECT_URI,
  // Railway supplies PORT at runtime; VERIFY_PORT remains useful for local development.
  VERIFY_PORT: Number(process.env.PORT || process.env.VERIFY_PORT || 3000),
  SUPABASE_URL: process.env.SUPABASE_URL,
  // SUPABASE_SECRET_KEY is the current Supabase server-only key name.
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
};

# Alren — Discord AI Bot

A Discord bot that chats like a friend through `!chat` or bot mentions. It keeps a short conversation history separately for each user and channel.

> Current version: `0.1.0-beta.1`

## Install from scratch

### 1. Install prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- Git
- A Discord account
- An API key from OpenAI or OpenRouter

Confirm that Node.js is installed:

```bash
node --version
```

### 2. Download the project

```bash
git clone https://github.com/shykrachet/shydev-discord.git
cd shydev-discord
npm ci
npm run setup
```

`npm run setup` checks your Node.js version and creates `.env` from `.env.example`. It never overwrites an existing `.env` file.

### 3. Create and configure the Discord bot

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Open **Bot**, create a bot user, and copy its token.
3. Under **Bot → Privileged Gateway Intents**, enable **Message Content Intent**.
4. Open **OAuth2 → URL Generator**, select the `bot` scope and the `Send Messages` permission, then use the generated link to invite the bot to your server.

### 4. Configure your AI provider

Open `.env`, add the Discord token, and choose one provider. Never commit `.env` to GitHub.

### Using OpenRouter

```env
DISCORD_TOKEN=your-discord-bot-token
OPENAI_API_KEY=sk-or-v1-your-openrouter-key
OPENAI_MODEL=openai/gpt-5-mini
```

### Using OpenAI

```env
DISCORD_TOKEN=your-discord-bot-token
OPENAI_API_KEY=sk-your-openai-key
OPENAI_MODEL=gpt-5.4-mini
```

### 5. Start the bot

```bash
npm start
```

When the terminal displays `online: ...`, the bot is ready.

## Commands

| Command | Description |
| --- | --- |
| `!ping` | Check whether the bot is online. |
| `!chat message` | Start a chat with the bot. |
| `@Alren message` | Chat with the bot by mentioning it. |
| `!reset` | Clear your chat context in the current channel. |
| `!version` or `!ver` | Show the bot version. |

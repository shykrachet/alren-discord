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

#### 3. Create and configure the Discord bot

Open the [Discord Developer Portal](https://discord.com/developers/applications), then create an application or select the existing bot application.

#### Bot token

1. Open **Bot** in the left sidebar and select **Reset Token** if the application does not have a token yet.
2. Copy the token only to `DISCORD_TOKEN` in your local `.env` or Railway Variables. Treat it like a password: do not put it in Git, screenshots, or chat. Reset it immediately if exposed.

#### Privileged Gateway Intents

On **Bot → Privileged Gateway Intents**, turn on both of these settings and save:

- **Message Content Intent** — required because this bot reads prefix commands such as `!verify` and `!chat`.
- **Server Members Intent** — required to find a member, give the `verify` role, and update their nickname.

If either setting is off, Discord closes the bot connection with `Used disallowed intents`. For bots in 100 or more servers, Discord must also approve these privileged intents after the bot is verified. See the [Discord Gateway intents documentation](https://docs.discord.com/developers/events/gateway).

#### Invite the bot to your server

1. Open **OAuth2 → URL Generator**.
2. Under **Scopes**, select `bot`.
3. Under **Bot Permissions**, select only the permissions the bot needs:
   - **View Channels**
   - **Send Messages**
   - **Read Message History**
   - **Manage Roles**
   - **Manage Nicknames**
4. Copy the generated URL, open it in a browser, choose your server, and authorize the bot. You need the server's **Manage Server** permission to install it.

#### Role order and channel permissions

Discord does not let a bot manage roles at or above its own top role. In the server, open **Server Settings → Roles**, then drag the bot role above `verify` and above every member role whose nickname it must change. Also make sure the channel where users run `!verify` allows the bot to view and send messages.

After changing an intent or any Railway Variable, redeploy/restart the Railway service. A healthy deployment logs `online: ...` and `osu! verification callback listening on port ...`.

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

### Enable osu! verification

1. Create an OAuth application from [osu! account settings](https://osu.ppy.sh/home/account/edit#new-oauth-application).
2. Add a public callback URL, for example `https://bot.example.com/osu/callback`. It must reach this bot's `VERIFY_PORT` through a reverse proxy, and must match exactly in osu! and `.env`.
3. Add the credentials to `.env`:

```env
OSU_CLIENT_ID=12345
OSU_CLIENT_SECRET=your-osu-client-secret
OSU_REDIRECT_URI=https://bot.example.com/osu/callback
VERIFY_PORT=3000
```

The bot creates the `verify` role the first time it is needed, or reuses a role with that name. The bot role must be higher than that role and than members whose nicknames it needs to change.

### Deploy on Railway

1. Deploy this repository as a Railway service. Railway detects `npm start` automatically.
2. In **Settings → Networking → Public Networking**, choose **Generate Domain**. Copy the resulting `https://...up.railway.app` domain.
3. In osu! OAuth application settings, set the callback URL to `https://your-service.up.railway.app/osu/callback`.
4. In Railway **Variables**, add `DISCORD_TOKEN`, `OPENAI_API_KEY` (if chat is used), `OSU_CLIENT_ID`, `OSU_CLIENT_SECRET`, and set `OSU_REDIRECT_URI` to that exact callback URL. Do **not** set `PORT`; Railway supplies it.
5. Optionally set the Railway health check path to `/health`.

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
| `!verify` | Open osu! OAuth verification. On success, changes your Discord nickname to your osu! username and gives the `verify` role. |
| `!verify-status` | Show the linked osu! account in this server. |

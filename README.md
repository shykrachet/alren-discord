# Alren User Guide

Alren is a Discord bot for private AI chat and osu! account verification.

## Installation

### 1. Requirements

- [Node.js](https://nodejs.org/) 20 or later
- Git
- A Discord account
- An API key from OpenAI or OpenRouter
- A Supabase project for osu! verification

Check Node.js:

```bash
node --version
```

### 2. Download and install

```bash
git clone https://github.com/shykrachet/alren-discord.git
cd alren-discord
npm ci
npm run setup
```

`npm run setup` creates `.env` from `.env.example` when it does not exist.

### 3. Configure Discord Developer Portal

Open the [Discord Developer Portal](https://discord.com/developers/applications), create an application, and open its **Bot** page.

1. Copy the bot token to `DISCORD_TOKEN`. Keep it private.
2. Enable **Message Content Intent** and **Server Members Intent** under **Privileged Gateway Intents**.
3. Open **OAuth2 → URL Generator**.
4. Select the `bot` and `applications.commands` scopes.
5. Select these bot permissions:
   - View Channels
   - Send Messages
   - Read Message History
   - Manage Roles
   - Manage Nicknames
   - Manage Messages
6. Open the generated URL and add the bot to your server.

### 4. Configure AI chat

Add one of the following to `.env` locally or Railway Variables.

```env
DISCORD_TOKEN=your-discord-bot-token
OPENAI_API_KEY=your-openai-or-openrouter-key
OPENAI_MODEL=gpt-5.4-mini
```

For OpenRouter, use an `sk-or-...` key and set `OPENAI_MODEL` to an available OpenRouter model, for example `openai/gpt-5-mini`.

### 5. Configure osu! verification

1. Create an OAuth application in [osu! account settings](https://osu.ppy.sh/home/account/edit#new-oauth-application).
2. Set its callback URL to `https://your-domain.example/osu/callback`.
3. Add the credentials:

```env
OSU_CLIENT_ID=12345
OSU_CLIENT_SECRET=your-osu-client-secret
OSU_REDIRECT_URI=https://your-domain.example/osu/callback
VERIFY_PORT=3000
```

### 6. Configure Supabase

1. In Supabase, open **SQL Editor** and run [supabase/schema.sql](supabase/schema.sql).
2. Copy the project URL and a server-only secret key from **Project Settings → API Keys**.
3. Add them to `.env` or Railway Variables:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-server-only-supabase-secret
```

### 7. Deploy on Railway

1. Create a Railway service from this GitHub repository.
2. Railway runs `npm start` automatically.
3. In **Settings → Networking → Public Networking**, generate a domain.
4. Set `OSU_REDIRECT_URI` to `https://your-service.up.railway.app/osu/callback`.
5. Enter all variables above in the Railway **Variables** tab. Do not add `PORT`; Railway provides it.
6. Optionally use `/health` as the Railway health-check path.

After changing Railway Variables, redeploy the service.

## Private chat

Use the `/alren` slash command, enter a message, and send it.

- Only you can see the conversation.
- Alren’s response deletes automatically after five minutes.
- Use `/alrenclear` to clear your private chat memory in the current channel.
- Use `/alrenhelp` to open this guide privately.

Public chat through `!chat`, bot mentions, and `!reset` is disabled.

## osu! verification

### For server administrators

Choose the Discord role members receive after a successful verification:

```text
/verify-role role:@role
```

The Alren role must be above the selected role in **Server Settings → Roles**.

### For members

1. Open the osu! profile URL, for example `https://osu.ppy.sh/users/[your-id-osu]`.
2. Copy the number at the end of the link.
3. Run the command in the Discord server:

```text
/osuverify osu_user_id:[your-id-osu]
```

4. Alren sends a personal verification link by DM.
5. Open the link and sign in to the same osu! account.
6. Alren gives the configured role, updates your Discord nickname to your osu! username when Discord allows it, and sends the result by DM. Nothing is posted in the server channel.

The verification link lasts for 10 minutes and can only verify the osu! ID entered in the command.

> Discord does not allow bots to change a Server Owner’s nickname. The Server Owner can still verify and receive the configured role.

## osu! beatmap feed

`/osumap` posts a random beatmap publicly in the channel. Each post shows the song title, artist, mapper, Ranked/Qualified/Loved status, available game modes, nominators, cover image, and an osu! link.

Server administrators run `/osumap-settings` in the channel that should receive automatic updates. It saves the default filter and enables the feed privately:

```text
/osumap-settings status:all mode:any
```

Choose `ranked`, `qualified`, `loved`, or `all` for the status, and choose `any`, `osu!`, `osu!taiko`, `osu!catch`, or `osu!mania` for the mode. With `status:all`, each `/osumap` chooses a random status from Ranked, Qualified, and Loved.

Alren checks osu! every 15 minutes and posts a newly updated map only once in the configured channel. The first setup records the current newest map without posting old maps. Set `OSU_MAP_FEED_INTERVAL_MINUTES` in Railway Variables to adjust the interval from 5 to 60 minutes.

Anyone can temporarily override the saved filters when posting a map:

```text
/osumap status:qualified mode:mania
```

After updating the bot, run [supabase/schema.sql](supabase/schema.sql) again in Supabase SQL Editor to create the `osu_map_settings` table. It is safe to run more than once.

## Commands

| Command | Description |
| --- | --- |
| `/alren message` | Start a private chat with Alren. The response deletes automatically after five minutes. |
| `/alrenclear` | Clear your private Alren chat memory in the current channel. |
| `/alrenhelp` | Open this guide privately. |
| `!alrenhelp` | Show this guide in the channel. |
| `!ping` | Check whether Alren is online. |
| `!version` or `!ver` | Show the bot version. |
| `/verify-role role:@role` | Set the role awarded after osu! verification privately. Requires Manage Server. |
| `/verify-role-status` | Show the configured verification role privately. |
| `/osuverify osu_user_id` | Send a private osu! OAuth verification link. |
| `/osuverify-status` | Show the linked osu! account in this server privately. |
| `/osumap` | Post a random beatmap publicly using this server’s saved filters. |
| `/osumap status mode` | Post a map with a temporary status and/or mode filter. |
| `/osumap-settings status mode` | Set the current channel as the automatic beatmap feed and choose filters privately. Requires Manage Server. |

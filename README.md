# Alren

Alren is a Discord bot for private AI chat, osu! account verification, random beatmap discovery, and automatic beatmap updates.

## Installation

### 1. Requirements

- [Node.js](https://nodejs.org/) 20 or later
- Git
- A Discord account
- An API key from OpenAI or OpenRouter for AI chat
- An osu! OAuth application for account verification and beatmap searches
- A Supabase project for verification records and beatmap feed settings

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

After configuring `.env`, verify the installation and start the bot:

```bash
npm test
npm start
```

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

### 5. Configure the osu! integration

1. Create an OAuth application in [osu! account settings](https://osu.ppy.sh/home/account/edit#new-oauth-application).
2. Set its callback URL to `https://your-domain.example/osu/callback`.
3. Add the credentials:

```env
OSU_CLIENT_ID=12345
OSU_CLIENT_SECRET=your-osu-client-secret
OSU_REDIRECT_URI=https://your-domain.example/osu/callback
VERIFY_PORT=3000
```

`OSU_CLIENT_ID` and `OSU_CLIENT_SECRET` are used for both account verification and beatmap searches. `OSU_REDIRECT_URI` is used by the account-verification callback and must exactly match the URL registered with osu!.

### 6. Configure Supabase

1. In Supabase, open **SQL Editor** and apply your project schema. The bot expects the `osu_verifications`, `osu_verification_settings`, `osu_verification_requests`, `osu_map_settings`, `osu_map_posts`, and `community_alert_settings` tables.
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

`/osumap` posts a random beatmap publicly in the current channel. Each post shows the song title, artist, mapper, Ranked/Qualified/Loved status, available game modes, nominators, cover image, and an osu! link.

Without saved server settings, `/osumap` defaults to `ranked` and `any`. Anyone can temporarily override either filter:

```text
/osumap status:qualified mode:mania
```

Available status filters are `ranked`, `qualified`, `loved`, and `all`. Available mode filters are `any`, `osu!`, `osu!taiko`, `osu!catch`, and `osu!mania`. For a manual request using `status:all`, Alren randomly chooses one of the three supported statuses.

### Configure automatic updates

Server administrators run `/osumap-settings` in the channel that should receive automatic updates. It saves the default filter and enables the feed privately:

```text
/osumap-settings status:all mode:any
```

The first configuration defaults to `ranked` and `any` when filters are omitted. On later runs, omitted filters keep their previously saved values. Running the command in another channel moves future feed posts to that channel.

Alren checks osu! when the bot starts and every 15 minutes afterward. It posts only the latest matching map and records every automatic post to prevent duplicates. The first configuration records the current latest map without posting it, so enabling the feed does not publish an old map.

Set `OSU_MAP_FEED_INTERVAL_MINUTES` in `.env` or Railway Variables to change the interval. Values are limited to 5–60 minutes:

```env
OSU_MAP_FEED_INTERVAL_MINUTES=15
```

After updating the bot, reapply your project schema in Supabase SQL Editor so the `osu_map_settings`, `osu_map_posts`, and `community_alert_settings` tables are available.

## BN and Mappers' Guild alerts

Alren can monitor two public community data sources:

- BN request status from `bn.mappersguild.com`. A notification is sent when a BN changes from Closed or Unknown to Open.
- Mappers' Guild activity logs. A notification is sent when a new mission is opened.

Run [`supabase/community_alert_settings.sql`](supabase/community_alert_settings.sql) in Supabase SQL Editor once. Then, in Discord, an administrator with **Manage Server** can configure the alert destination and BN mode:

```text
/community-alert-settings channel:#alerts bn_mode:osu!
```

Choose `All osu! modes`, `osu!`, `osu!taiko`, `osu!catch`, or `osu!mania`. The BN mode filter applies only to BN request-opening messages; new Mappers' Guild missions are always sent to the selected channel. Run the command again with no options to view the saved setting, or provide one option to change just that value.

Set the optional polling interval in `.env` or Railway Variables:

```env
COMMUNITY_ALERT_INTERVAL_MINUTES=5
```

The interval accepts values from 1–60 minutes. When the bot starts, it records the current state as a baseline without sending old notifications. Later checks notify only new Open transitions and new mission-opening events.

The bot role needs **View Channel** and **Send Messages** permissions in the configured channel.

### Community alerts API

The same normalized public data is available from the bot's HTTP server:

```http
GET /api/community-alerts
```

For a Railway deployment, the full URL is:

```text
https://your-service.up.railway.app/api/community-alerts
```

The JSON response contains `checkedAt`, normalized `bnRequests.entries`, and recent `missions.recentOpenings`. Responses are cached for 60 seconds to avoid excessive requests to the upstream sites. The API contains only public data and does not require an osu! or Mappers' Guild login.

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
| `/osumap status mode` | Post a map with temporary status and/or mode filters. |
| `/osumap-settings status mode` | Set the current channel as the automatic beatmap feed and save optional filters privately. Requires Manage Server. |
| `/community-alert-settings channel bn_mode` | Set the channel and BN mode for BN/Mappers' Guild notifications privately. Requires Manage Server. |

## Troubleshooting

### `Cannot find module './src/osu-maps'`

This means the checkout predates the restored beatmap module. Update the repository and reinstall the locked dependencies:

```bash
git pull
npm ci
npm test
```

Confirm that `src/osu-maps.js` exists before running `npm start` again.

### Beatmap requests fail

- Confirm that `OSU_CLIENT_ID` and `OSU_CLIENT_SECRET` match the same osu! OAuth application.
- Confirm that the bot host can reach `https://osu.ppy.sh`.
- Check the bot logs for an osu! authentication or beatmap-search status code.

### Automatic feed is disabled or settings cannot be saved

- Confirm that `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set.
- Run the latest Supabase schema after pulling an update.
- Keep the Supabase secret key on the server; never expose it in Discord or client-side code.

## Development

Run the offline test suite with:

```bash
npm test
```

The beatmap tests use mocked osu! and Supabase responses, so they do not post to Discord or modify live data.

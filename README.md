# Alren

Alren is a Discord bot featuring osu! account verification, beatmap discovery and realtime updates, and BN / Mappers' Guild community alerts.

All bot interface text is in English, including commands, help, notifications, verification pages and errors.

---

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Configuration Reference](#configuration-reference)
  - [Feed timing and recovery](#feed-timing-and-recovery)
- [Server Permissions](#server-permissions)
- [Commands](#commands)
  - [Slash Commands](#slash-commands)
  - [Beatmap feed examples](#beatmap-feed-examples)
  - [Legacy Prefix Commands](#legacy-prefix-commands)
- [Community Alerts API](#community-alerts-api)
- [Development](#development)

---

## Features

- **osu! Verification**: One-click OAuth verification, automatic server role assignment, profile synchronization, and welcome messages.
- **Beatmap Feed & Discovery**: `/map` command with status/mode filters and automated realtime channel feeds for Ranked, Qualified, and Loved beatmaps.
- **Community Alerts**: Realtime notifications for Beatmap Nominator (BN) request status openings/closures and Mappers' Guild mission openings.
- **AI chat removed**: `/alren`, `/alrenclear`, prefix chat and mention chat are no longer available.
- **Built-in SQLite Storage**: Zero-configuration, file-based database powered by `better-sqlite3` with automated schema migrations.

---

## Requirements

- [Node.js](https://nodejs.org/) 20.0.0 or higher
- Git
- A Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))
- *(Optional)* [osu! OAuth Application](https://osu.ppy.sh/home/account/edit#new-oauth-application) credentials for account verification and beatmap search
- *(Optional)* OpenAI or OpenRouter API key for AI chat

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/shykrachet/alren-discord.git
cd alren-discord
npm ci
npm run setup
```

`npm run setup` copies `.env.example` to `.env` if `.env` does not already exist.

### 2. Configure Environment

Edit `.env` with your credentials:

```env
# Discord Bot
DISCORD_TOKEN=your-discord-bot-token

# AI Chat (Optional)
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-5.4-mini
AI_BASE_URL=

# osu! Integration (Optional)
OSU_CLIENT_ID=your-client-id
OSU_CLIENT_SECRET=your-client-secret
OSU_REDIRECT_URI=https://your-domain.example/osu/callback
VERIFY_PORT=3000

# Database (Optional - defaults to ./data/alren.sqlite)
SQLITE_PATH=./data/alren.sqlite
```

### 3. Verify & Run

```bash
# Run tests
npm test

# Start the bot
npm start
```

---

## Configuration Reference

| Variable | Description | Default |
| --- | --- | --- |
| `DISCORD_TOKEN` | Discord bot application token. | *(Required)* |
| `OPENAI_API_KEY` | API key from OpenAI (`sk-...`) or OpenRouter (`sk-or-...`). | `undefined` |
| `OPENAI_MODEL` | AI model identifier. | `gpt-5.4-mini` |
| `AI_BASE_URL` | Base API URL for custom OpenAI-compatible providers. | `https://openrouter.ai/api/v1` (if OpenRouter key) |
| `OSU_CLIENT_ID` | OAuth Client ID from osu! account settings. | `undefined` |
| `OSU_CLIENT_SECRET` | OAuth Client Secret from osu! account settings. | `undefined` |
| `OSU_REDIRECT_URI` | Public OAuth callback endpoint URL. | `http://localhost:3000/osu/callback` |
| `VERIFY_PORT` | Local port for the HTTP OAuth and healthcheck server. | `3000` (or `PORT` provided by cloud host) |
| `SQLITE_PATH` | File path for SQLite database. | `./data/alren.sqlite` |
| `OSU_MAP_FEED_INTERVAL_SECONDS` | Polling interval for beatmap feed (30–3600 seconds). | `30` |
| `COMMUNITY_ALERT_INTERVAL_SECONDS` | Polling interval for BN open/closed status and Mappers' Guild alerts (30–3600 seconds). | `30` |
| `COMMUNITY_ALERT_REQUEST_TIMEOUT_MS` | Deadline per BN / Mappers' Guild API attempt, including the response body (1000–120000 ms). | `30000` |
| `OSU_MAP_FEED_INTERVAL_MINUTES` | Legacy beatmap interval, used when the seconds variable is absent. | `0.5` |
| `COMMUNITY_ALERT_INTERVAL_MINUTES` | Legacy community interval, used when the seconds variable is absent. | `0.5` |

### Feed timing and recovery

The bot checks feeds immediately at startup, then every 30 seconds by default. BN alerts are sent when a request status changes, and beatmap feeds post new maps to each configured channel. These updates use polling; delivery follows the next successful check and depends on when the upstream APIs expose the change. The first BN check establishes a baseline to avoid flooding channels with existing statuses.

For existing deployments configured with the old minute intervals, set `OSU_MAP_FEED_INTERVAL_SECONDS=30` and `COMMUNITY_ALERT_INTERVAL_SECONDS=30`, then restart the bot. Seconds settings take precedence. The community snapshot API disables browser/proxy caching and keeps a 30-second in-memory cache for direct requests; monitor checks always request fresh data.

Community API timeouts, network errors, and temporary HTTP failures are retried once after one second. Each attempt has its own deadline; monitor checks do not overlap while a previous check is still running. Failed checks preserve the last successful alert baseline so recovery can detect status changes without repeating existing alerts. Repeated identical monitor errors are logged at most once every five minutes, with an immediate log when the error changes or the source recovers. If a deployment still times out, set `COMMUNITY_ALERT_REQUEST_TIMEOUT_MS=60000` and restart; final errors include the host/deadline or the underlying network error code to help diagnose an upstream or connectivity issue.

---

## Server Permissions

When adding the bot to your Discord server via OAuth2 URL generator, ensure the following scopes and permissions are granted:

- **Scopes**: `bot`, `applications.commands`
- **Permissions**:
  - View Audit Log *(Required to identify the person who invited Alren)*
  - View Channels
  - Send Messages
  - Read Message History
  - Manage Roles *(Required for osu! verification role assignment)*
  - Manage Nicknames *(Required for username synchronization)*
  - Manage Messages

> **Role Hierarchy Note**: The bot's role in **Server Settings → Roles** must be placed above the role assigned to verified members. Discord prevents bots from assigning or managing roles equal to or above their own.

---

## Commands

Members must receive access from the person who invited Alren before using
commands, including `/help`, `/ping`, `/verify`, and `/map`. The inviter can use
`/access grant member:@member`, `/access revoke member:@member`, and `/access list`.
Access is scoped to this server and saved in SQLite. Granted members can use
ordinary commands; they cannot grant access, configure the server, or reset it.
Only the person who invited Alren can use `/setup` (including status), `/access`,
`/reset`, and legacy commands that change server settings.
Administrator and Manage Server permissions do not bypass this restriction.
Alren records the inviter in SQLite using the bot-add audit record; give the bot
**View Audit Log** permission. If the record is unavailable or expired, setup stays
locked until Alren is invited again and can identify the inviter. Saved settings
are preserved. Keep SQLite on persistent storage to retain the recorded inviter.

AI chat has been removed. The old AI configuration examples below are retained
for reference and are no longer used by the running bot.


### Slash Commands

| Command | Description |
| --- | --- |
| `/help` | Display the English command guide and documentation. |
| `/ping` | Check bot latency and online status. |
| `/verify [osu_user_id]` | Initiate osu! OAuth account verification. |
| `/verify-status` | View linked osu! account details for the current server. |
| `/map [map_status] [game_mode]` | Post a random beatmap matching given filters. |
| `/access grant member:@member` | Allow a server member to use Alren. Inviter only. |
| `/access revoke member:@member` | Remove a member's command access. Inviter only. |
| `/access list` | View members granted access. Inviter only. |
| `/reset` | Clear server settings after a 60-second confirmation. Keeps linked osu! accounts, access grants and inviter identity. Inviter only. |
| `/setup status` | Overview of server settings (verification, feed, alerts). |
| `/setup verify [verify_channel] [result_channel] [verified_role]` | Configure the verified role, result channel and channel with the Verify button. |
| `/setup osu-role [osu_category] [discord_role] [stop_assigning]` | View or configure automatic osu! profile roles. |
| `/setup osu-role-sync` | Check previously verified members in the background and post a summary. |
| `/setup beatmap [feed_channel] [map_status] [game_mode] [feed_enabled]` | Set up automatic beatmap filters per channel, or disable that channel’s feed. Defaults to the current channel. |
| `/setup bn-management [alert_channel] [game_mode]` | Set up BN and Mappers' Guild alerts channel. |

### Beatmap feed examples

Configure multiple beatmap feeds in the same server by running the command once per channel:

```text
/setup beatmap feed_channel:#mania game_mode:mania map_status:ranked
/setup beatmap feed_channel:#standard game_mode:osu map_status:ranked
/setup beatmap feed_channel:#taiko game_mode:taiko map_status:ranked
/setup beatmap feed_channel:#catch game_mode:catch map_status:ranked
```

`osu` is displayed as **Standard (osu!)** in the mode picker. Each channel keeps its own filters and posting history, so a set containing several modes can appear in each matching channel. Use `game_mode:any` (**All game modes**, without an icon) for all modes in one channel, and `map_status:all` for Ranked, Qualified, and Loved. Existing feed settings and history migrate automatically to their original channel.

Mode icons in bot messages and embeds use the Discord application emojis uploaded from `img/modes` at startup. The `*-emoji.png` assets are centered 128×128 crops of the original icons, with consistent padding for inline text. They use `alren_mode_*_v2` names so restarting the bot uploads the resized set while preserving the old emojis for existing messages. Slash-command choices display plain mode names because Discord does not support custom emoji in those choices.

For both **Ranked + Loved** in the same channel, choose `map_status:ranked_loved`:

```text
/setup beatmap feed_channel:#mania game_mode:mania map_status:ranked_loved
/setup beatmap feed_channel:#standard game_mode:osu map_status:ranked_loved
```

This watches Ranked and Loved separately and posts new maps from both statuses. You can also choose just `map_status:ranked` or `map_status:loved` per channel. `/map map_status:ranked_loved` randomly selects one of these two statuses, and `/map` inherits this option when saved for the current channel.

`/map` uses the current channel’s saved filters unless you supply overrides. Unconfigured channels default to any mode and Ranked. `/setup status` lists the configured feeds. To stop only one feed, run `/setup beatmap feed_channel:#mania feed_enabled:false`.

### Legacy Prefix Commands

To enable the verification panel, run `/setup verify verify_channel:#verify result_channel:#verify-done verified_role:@Verified` as the inviter. Allow members to view `#verify` and give Alren View Channel, Send Messages and Embed Links in both channels. Members click **Verify**, enter the numeric ID from their osu! profile URL, and receive a private link in `#verify`. After osu! confirms the account, Alren assigns the verified role and posts the linked Discord member and osu! profile in `#verify-done`. Run setup with `verify_channel` again to repost or move the panel.

For example, use `/setup osu-role osu_category:Ranked Mapper discord_role:@Ranked Mapper`. Repeat for each category you want to enable. Keep Alren's Discord role above the assigned roles. The bot checks the linked osu! profile on verification and adds matching configured roles. Run `/setup osu-role-sync` to check accounts already linked in this server. Sync adds eligible roles and leaves existing roles in place.

Prefix commands using `!` (such as `!help`, `!map`, and `!osuverify`) remain supported as fallbacks.

---

## Community Alerts API

The bot exposes a public health and community alerts endpoint on its HTTP server:

```http
GET /api/community-alerts
```

Returns cached JSON data with active BN request states and recent Mappers' Guild missions.

---

## Development

```bash
# Run full test suite
npm test

# Run specific tests
npm run test:osumap
npm run test:community

# Preview payload structures
npm run preview:osumap
npm run preview:community
```

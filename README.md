# Alren

Alren is a Discord bot featuring osu! account verification, private AI chat, beatmap discovery and realtime updates, and BN / Mappers' Guild community alerts.

---

## Features

- **osu! Verification**: One-click OAuth verification, automatic server role assignment, profile synchronization, and welcome messages.
- **Beatmap Feed & Discovery**: `/map` command with status/mode filters and automated realtime channel feeds for Ranked, Qualified, and Loved beatmaps.
- **Community Alerts**: Realtime notifications for Beatmap Nominator (BN) request status openings/closures and Mappers' Guild mission openings.
- **Private AI Chat**: Ephemeral and DM-based AI chat powered by OpenAI or OpenRouter models.
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
git clone https://github.com/Punuy/alren-discord.git
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
| `OSU_MAP_FEED_INTERVAL_MINUTES` | Polling interval for beatmap feed (minutes). | `15` |
| `COMMUNITY_ALERT_INTERVAL_MINUTES` | Polling interval for community alerts (minutes). | `5` |

---

## Commands

### Slash Commands

| Command | Description |
| --- | --- |
| `/help [language]` | Display interactive command guide and documentation. |
| `/ping` | Check bot latency and online status. |
| `/verify [osu_id]` | Initiate osu! OAuth account verification. |
| `/verify-status` | View linked osu! account details for the current server. |
| `/map [status] [mode]` | Post a random beatmap matching given filters. |
| `/setup status` | Overview of server settings (verification, feed, alerts). |
| `/setup verify <role> [channel]` | Configure verified role and public announcement channel. |
| `/setup beatmap [channel] [status] [mode]` | Set up automatic beatmap feed channel and filters. |
| `/setup alerts <channel> [bn_mode]` | Set up BN and Mappers' Guild alerts channel. |
| `/alren <message>` | Start a private conversational session with Alren. |
| `/alrenclear` | Clear conversation memory in the current channel. |

### Legacy Prefix Commands

Prefix commands using `!` (such as `!help`, `!alren <message>`, `!map`, and `!osuverify`) remain supported as fallbacks.

---

## Server Permissions

When adding the bot to your Discord server via OAuth2 URL generator, ensure the following scopes and permissions are granted:

- **Scopes**: `bot`, `applications.commands`
- **Permissions**:
  - View Channels
  - Send Messages
  - Read Message History
  - Manage Roles *(Required for osu! verification role assignment)*
  - Manage Nicknames *(Required for username synchronization)*
  - Manage Messages

> **Role Hierarchy Note**: The bot's role in **Server Settings → Roles** must be placed above the role assigned to verified members. Discord prevents bots from assigning or managing roles equal to or above their own.

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

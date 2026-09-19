# Alren

Alren is a Discord bot for private AI chat, osu! account verification, random beatmap discovery, automatic beatmap updates, and BN/Mappers' Guild community alerts.

## Community-alert quick start

Use this after the bot has its `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and Discord token configured:

1. In Supabase **SQL Editor**, run [`supabase/community_alert_settings.sql`](supabase/community_alert_settings.sql).
2. Restart Alren with `npm start` (or redeploy it on Railway). The bot registers the command when it connects.
3. In Discord, a member with **Manage Server** runs:

   ```text
   /community-alert-settings channel:#alerts bn_mode:Standard (osu!)
   ```

4. Confirm the saved configuration privately with `/community-alert-settings`.

Alren records the current public state at startup and only posts later BN openings or newly opened Mappers' Guild missions. There is no `COMMUNITY_ALERT_CHANNEL_ID` environment variable: the channel and BN mode are stored per Discord server.

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
3. Enable **Public Bot** if server owners other than the application owner should be able to install it.
4. Open **OAuth2 → URL Generator**.
5. Select the `bot` and `applications.commands` scopes.
6. Select these bot permissions:
   - View Channels
   - Send Messages
   - Read Message History
   - Manage Roles
   - Manage Nicknames
   - Manage Messages
7. Open the generated URL and add the bot to your server.

Slash commands are registered globally when Alren starts. The same commands therefore become available in every server that installs the bot, including servers added later without restarting Alren. Discord may take a few minutes to show newly registered global commands.

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

Use `/alren` or `!alren <message>` to chat with Alren. Mentioning the bot with a message also starts a chat.

- Slash replies are ephemeral. Prefix and mention replies are sent by DM so the conversation stays private.
- Slash replies delete automatically after five minutes.
- Use `/alrenclear`, `!alrenclear`, or `!reset` to clear your private chat memory in the current channel.
- Use `/alrenhelp` to open this guide privately.

## osu! verification

### For server administrators

Choose the Discord role members receive after a successful verification:

```text
/verify-role role:@role
```

The Alren role must be above the selected role in **Server Settings → Roles**.

### For members

1. Run either command in the Discord server:

```text
/osuverify
!osuverify
```

2. Alren sends a styled personal verification message with an OAuth button by DM.
3. Open the link and sign in to osu!. Alren detects the account ID and username automatically.
4. Alren gives the configured role, updates your Discord nickname to your osu! username when Discord allows it, and sends the result by DM.

When a new member joins a server that has a verification role configured, Alren automatically sends the same private OAuth onboarding message. Verification links last for 10 minutes and are tied to the Discord member who requested or received them. An optional osu! ID may still be supplied to `/osuverify` or `!osuverify` when the account should be preselected and checked before OAuth.

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

- BN request status from `bn.mappersguild.com`. A green notification is sent when a BN opens requests, and a red notification is sent when that BN later closes them.
- Mappers' Guild activity logs. A notification is sent when a new mission is opened.

Run [`supabase/community_alert_settings.sql`](supabase/community_alert_settings.sql) in Supabase SQL Editor once. Then, in Discord, an administrator with **Manage Server** can configure the alert destination and BN mode:

```text
/community-alert-settings channel:#alerts bn_mode:Standard (osu!)
```

Choose `Standard (osu!)`, `Taiko`, `Catch`, or `Mania` from the `bn_mode` menu. `All osu! modes` is also available when you want every BN opening. The command works directly in Discord chat; no server environment variable or terminal command is needed to change the channel or mode. The BN mode filter applies only to BN request-opening messages; new Mappers' Guild missions are always sent to the selected channel. Run the command again with no options to view the saved setting, or provide one option to change just that value.

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

Example response shape:

```json
{
  "checkedAt": "2026-09-17T00:00:00.000Z",
  "bnRequests": { "entries": [] },
  "missions": { "recentOpenings": [] }
}
```

## Commands

### Easy slash commands

These short commands cover the most common actions:

| Command | Description |
| --- | --- |
| `/help [language]` | Open a private dropdown to choose the Thai or English guide. |
| `/verify [osu_id]` | Start one-click osu! OAuth verification. The ID is optional. |
| `/map [status] [mode]` | Post a random beatmap with cover artwork. |
| `/setup` | View or configure Verify, Beatmap feed, and BN alerts in one private admin panel. |

Existing long-form slash commands and `!` commands remain available for compatibility.

| Command | Description |
| --- | --- |
| `/alren message` or `!alren message` | Start a private chat with Alren. Prefix replies are sent by DM. |
| `/alrenclear`, `!alrenclear`, or `!reset` | Clear your private Alren chat memory in the current channel. |
| `/alrenhelp` or `!alrenhelp` | Open a dropdown to choose the styled Thai or English command guide. |
| `/ping` or `!ping` | Check whether Alren is online. |
| `/verify-role role:@role` or `!verify-role @role` | Set the role awarded after osu! verification. Requires Manage Server. |
| `/verify-role-status` or `!verify-role-status` | Show the configured verification role. |
| `/osuverify [osu_user_id]` or `!osuverify [osu_user_id]` | Send an OAuth button by DM and automatically detect the signed-in osu! account. |
| `/osuverify-status` or `!osuverify-status` | Show the linked osu! account in this server. |
| `/osumap` or `!osumap [status] [mode]` | Post a random beatmap publicly using this server’s saved filters. |
| `/osumap status mode` | Post a map with temporary status and/or mode filters. |
| `/osumap-settings status mode` or `!osumap-settings [status] [mode]` | Set the current channel as the automatic beatmap feed. Requires Manage Server. |
| `/community-alert-settings channel bn_mode` or `!community-alert-settings #channel [mode]` | Configure BN/Mappers' Guild notifications. Requires Manage Server. |

## Troubleshooting

For Thai instructions covering Discord Bot Token reset, local `.env` setup, Railway updates, and `TokenInvalid`, see [`docs/DISCORD_TOKEN_SETUP_TH.md`](docs/DISCORD_TOKEN_SETUP_TH.md).

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

### Community alerts are not posting

- Run [`supabase/community_alert_settings.sql`](supabase/community_alert_settings.sql) in Supabase SQL Editor.
- Confirm the server configuration privately with `/community-alert-settings`.
- Give Alren **View Channel** and **Send Messages** in the selected channel.
- Wait for a future BN opening or mission-opening event; existing public entries are intentionally not posted after a restart.

## คู่มือทดสอบและดู Template

คำสั่งในส่วนนี้ต้องรันจากโฟลเดอร์หลักของโปรเจกต์ หลังจากติดตั้ง dependencies ด้วย `npm ci` แล้ว ระบบทดสอบและ preview ใช้ข้อมูลจำลอง จึงไม่เชื่อมต่อ Discord, osu! API, BN, Mappers' Guild หรือ Supabase และไม่ส่งข้อความจริง

### ทดสอบระบบทั้งหมด

ใช้คำสั่งนี้ก่อน deploy ทุกครั้ง:

```bash
npm test
```

เมื่อทำงานสำเร็จ บรรทัดสรุปด้านล่างต้องแสดง `fail 0` หากมี test ไม่ผ่าน ให้ดูชื่อ test และ error ที่แสดงอยู่ก่อนบรรทัดสรุป

### ทดสอบและดู Template ของ osu! beatmap

รันเฉพาะ test ของ `/osumap` และ automatic beatmap feed:

```bash
npm run test:osumap
```

Test ชุดนี้ตรวจสอบว่า:

- ระบบค้นหาแผนที่แล้วดึงรายละเอียด beatmapset เพิ่มจาก osu! API
- การ์ดแสดง Status, Modes, Difficulties, Nominators, Source, Genre และ Language
- ไม่มีช่อง `Mapper Tags`
- ชื่อ Nominator เชื่อมไปยังโปรไฟล์ osu!
- Genre และ Language เชื่อมไปยังหน้าค้นหา osu! ด้วยตัวกรองที่ถูกต้อง

ดู Discord embed payload ตัวอย่างโดยไม่เรียก API:

```bash
npm run preview:osumap
```

ผลลัพธ์เป็น JSON หนึ่งชุดซึ่งมี `title`, `description`, `fields`, `image` และ `thumbnail` เหมือน payload ที่บอทส่งให้ Discord ข้อมูลตัวอย่างแก้ไขได้ที่ [`scripts/preview-osumap.js`](scripts/preview-osumap.js) ส่วน test อยู่ที่ [`test/osu-maps.test.js`](test/osu-maps.test.js)

### ทดสอบและดู Template ของ BN และ Mappers' Guild

รันเฉพาะ test ของ community alerts:

```bash
npm run test:community
```

Test ชุดนี้ตรวจสอบว่า:

- สถานะ BN ถูกแปลงเป็น Open, Closed หรือ Unknown อย่างถูกต้อง
- การ์ด BN Open และ BN Closed แสดงข้อมูล รูป และลิงก์ที่เกี่ยวข้อง
- ตัวกรอง game mode ส่งแจ้งเตือนให้เซิร์ฟเวอร์ที่ตั้งค่าไว้เท่านั้น
- การเริ่มระบบครั้งแรกสร้าง baseline โดยไม่ส่งรายการเก่า
- ระบบแจ้งเฉพาะการเปลี่ยนสถานะ BN และ mission ที่เพิ่งเปิดใหม่
- การ์ด Mappers' Guild เชื่อมไปยังหน้า Missions

ดู template ทั้งสามแบบโดยไม่เรียก API:

```bash
npm run preview:community
```

JSON ที่แสดงแบ่งเป็นสามส่วน:

| Key | Template |
| --- | --- |
| `bnOpen` | BN เปิดรับ beatmap requests |
| `bnClosed` | BN ปิดรับ beatmap requests |
| `mapperGuildMission` | Mappers' Guild mission เปิดใหม่ |

ข้อมูลตัวอย่างแก้ไขได้ที่ [`scripts/preview-community.js`](scripts/preview-community.js) ส่วน test อยู่ที่ [`test/community-alerts.test.js`](test/community-alerts.test.js)

### วิธีแก้ Template

1. เปิดไฟล์ preview ของระบบที่ต้องการ
2. แก้เฉพาะข้อมูลจำลอง เช่น ชื่อ, mode, genre, language หรือ preferences โดยไม่ใส่ token และ secret จริง
3. รันคำสั่ง `preview:*` เพื่อดู payload ใหม่
4. รันคำสั่ง `test:*` ของระบบนั้น
5. รัน `npm test` อีกครั้งก่อน commit หรือ deploy

ไฟล์ preview ใช้สำหรับข้อมูลตัวอย่างเท่านั้น การเปลี่ยนรูปแบบการ์ดจริงต้องแก้ที่ [`src/osu-maps.js`](src/osu-maps.js) หรือ [`src/community-alerts.js`](src/community-alerts.js) แล้วปรับ test ให้ตรงกับพฤติกรรมที่ต้องการ

### Windows PowerShell รัน `npm` ไม่ได้

ถ้า PowerShell แสดงข้อความว่า `npm.ps1 cannot be loaded because running scripts is disabled` ให้ใช้ `npm.cmd` แทน เช่น:

```powershell
npm.cmd test
npm.cmd run preview:osumap
npm.cmd run preview:community
```

### Checklist ก่อน deploy

- `npm test` แสดง `fail 0`
- `npm run preview:osumap` แสดงข้อมูลและลิงก์ครบ
- `npm run preview:community` แสดง `bnOpen`, `bnClosed` และ `mapperGuildMission`
- ไม่มี token, secret หรือข้อมูลส่วนตัวจริงอยู่ในไฟล์ template

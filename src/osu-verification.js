const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { PermissionsBitField } = require('discord.js');
const {
  OSU_CLIENT_ID,
  OSU_CLIENT_SECRET,
  OSU_REDIRECT_URI,
  VERIFY_PORT,
} = require('./config');

const STATE_TTL_MS = 10 * 60 * 1000;
const VERIFIED_ROLE_NAME = 'verify';

function getConfigError() {
  if (!OSU_CLIENT_ID || !OSU_CLIENT_SECRET || !OSU_REDIRECT_URI) {
    return 'ยังไม่ได้ตั้งค่า osu! OAuth: OSU_CLIENT_ID, OSU_CLIENT_SECRET และ OSU_REDIRECT_URI';
  }
  return null;
}

function htmlPage(title, message, success = false) {
  const color = success ? '#ff66aa' : '#ef4444';
  const escapedTitle = escapeHtml(title);
  const escapedMessage = escapeHtml(message);
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${escapedTitle}</title>`
    + `<style>body{font-family:system-ui,sans-serif;background:#171923;color:#fff;display:grid;place-items:center;min-height:90vh;margin:0}.card{max-width:480px;padding:32px;border-radius:16px;background:#24283b;text-align:center}h1{color:${color}}</style>`
    + `</head><body><main class="card"><h1>${escapedTitle}</h1><p>${escapedMessage}</p><p>กลับไปที่ Discord ได้เลย</p></main></body></html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function safeJsonParse(contents) {
  try {
    return JSON.parse(contents);
  } catch {
    return {};
  }
}

function createOsuVerificationService({ bot }) {
  const pendingStates = new Map();
  const storagePath = path.join(process.cwd(), 'data', 'osu-verifications.json');
  let server;

  function readVerifications() {
    try {
      return safeJsonParse(fs.readFileSync(storagePath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw error;
    }
  }

  function saveVerification({ guildId, discordUserId, osuUser }) {
    const verifications = readVerifications();
    verifications[guildId] ??= {};
    verifications[guildId][discordUserId] = {
      osuUserId: osuUser.id,
      osuUsername: osuUser.username,
      verifiedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    const temporaryPath = `${storagePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(verifications, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporaryPath, storagePath);
  }

  async function getVerifiedRole(guild, me) {
    let role = guild.roles.cache.find((candidate) => candidate.name.toLowerCase() === VERIFIED_ROLE_NAME);
    if (role) return role;

    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      throw new Error('บอทยังไม่มีสิทธิ์ Manage Roles จึงสร้างยศ verify ไม่ได้');
    }
    role = await guild.roles.create({ name: VERIFIED_ROLE_NAME, reason: 'osu! verification role' });
    return role;
  }

  async function applyDiscordVerification({ guildId, discordUserId, osuUser }) {
    const guild = await bot.guilds.fetch(guildId);
    const member = await guild.members.fetch(discordUserId);
    const me = guild.members.me ?? await guild.members.fetchMe();
    const role = await getVerifiedRole(guild, me);

    if (role.position >= me.roles.highest.position) {
      throw new Error('ยศ verify ต้องอยู่ต่ำกว่ายศสูงสุดของบอท');
    }
    if (!me.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
      throw new Error('บอทยังไม่มีสิทธิ์ Manage Nicknames จึงเปลี่ยนชื่อใน Discord ไม่ได้');
    }
    if (!member.manageable) {
      throw new Error('บอทเปลี่ยนชื่อสมาชิกนี้ไม่ได้ (ยศของสมาชิกสูงกว่าหรือเท่ากับบอท)');
    }

    await member.roles.add(role, 'Verified through osu! OAuth');
    await member.setNickname(osuUser.username, 'Verified through osu! OAuth');
    saveVerification({ guildId, discordUserId, osuUser });
  }

  async function exchangeCodeForOsuUser(code) {
    const tokenResponse = await fetch('https://osu.ppy.sh/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_id: Number(OSU_CLIENT_ID),
        client_secret: OSU_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: OSU_REDIRECT_URI,
      }),
    });
    if (!tokenResponse.ok) throw new Error('osu! ปฏิเสธการยืนยันตัวตน กรุณาเริ่ม !verify ใหม่');
    const token = await tokenResponse.json();
    const profileResponse = await fetch('https://osu.ppy.sh/api/v2/me', {
      headers: { authorization: `Bearer ${token.access_token}`, accept: 'application/json' },
    });
    if (!profileResponse.ok) throw new Error('อ่านข้อมูลโปรไฟล์ osu! ไม่สำเร็จ');
    const profile = await profileResponse.json();
    if (!profile.id || !profile.username) throw new Error('osu! ส่งข้อมูลผู้ใช้ไม่ครบ');
    return profile;
  }

  async function handleCallback(request, response) {
    const requestUrl = new URL(request.url, OSU_REDIRECT_URI);
    if (requestUrl.pathname === '/health') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end('{"status":"ok"}');
      return;
    }
    if (requestUrl.pathname !== new URL(OSU_REDIRECT_URI).pathname) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    const state = requestUrl.searchParams.get('state');
    const code = requestUrl.searchParams.get('code');
    const pending = state && pendingStates.get(state);
    if (state) pendingStates.delete(state);

    if (!pending || Date.now() - pending.createdAt > STATE_TTL_MS || !code) {
      response.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
      response.end(htmlPage('ลิงก์หมดอายุ', 'กรุณากลับไปพิมพ์ !verify ใน Discord ใหม่'));
      return;
    }

    try {
      const osuUser = await exchangeCodeForOsuUser(code);
      await applyDiscordVerification({ ...pending, osuUser });
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(htmlPage('ยืนยันสำเร็จ!', `ยินดีต้อนรับ ${osuUser.username} — ตั้งชื่อและให้ยศ verify แล้ว`, true));
      const channel = await bot.channels.fetch(pending.channelId);
      if (channel?.isTextBased()) await channel.send(`✅ <@${pending.discordUserId}> ยืนยัน osu! เป็น **${osuUser.username}** เรียบร้อยแล้ว`);
    } catch (error) {
      console.error('osu! verification callback failed:', error);
      response.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
      response.end(htmlPage('ยืนยันไม่สำเร็จ', error.message));
    }
  }

  async function startServer() {
    const configError = getConfigError();
    if (configError) throw new Error(configError);
    if (server) return;
    const candidate = http.createServer((request, response) => {
      handleCallback(request, response).catch((error) => {
        console.error('Unexpected OAuth callback error:', error);
        response.writeHead(500);
        response.end('Internal server error');
      });
    });
    await new Promise((resolve, reject) => {
      candidate.once('error', reject);
      candidate.listen(VERIFY_PORT, () => {
        candidate.off('error', reject);
        resolve();
      });
    });
    server = candidate;
    console.log(`osu! verification callback listening on port ${VERIFY_PORT}`);
  }

  async function begin(message) {
    if (!message.inGuild()) {
      await message.reply('ใช้คำสั่งนี้ในเซิร์ฟเวอร์ Discord เท่านั้น');
      return;
    }
    const configError = getConfigError();
    if (configError || !server) {
      await message.reply(`${configError || 'ระบบ verify ยังไม่พร้อมใช้งาน'}\nผู้ดูแลบอทต้องตั้งค่าใน .env ก่อน`);
      return;
    }
    const state = crypto.randomBytes(32).toString('hex');
    pendingStates.set(state, {
      guildId: message.guildId,
      channelId: message.channelId,
      discordUserId: message.author.id,
      createdAt: Date.now(),
    });
    const authorizationUrl = new URL('https://osu.ppy.sh/oauth/authorize');
    authorizationUrl.search = new URLSearchParams({
      client_id: OSU_CLIENT_ID,
      redirect_uri: OSU_REDIRECT_URI,
      response_type: 'code',
      scope: 'public identify',
      state,
    }).toString();
    await message.reply(`กดลิงก์นี้เพื่อยืนยันบัญชี osu! ของคุณ (หมดอายุใน 10 นาที):\n${authorizationUrl}`);
  }

  async function showStatus(message) {
    if (!message.inGuild()) return;
    const record = readVerifications()[message.guildId]?.[message.author.id];
    if (!record) {
      await message.reply('คุณยังไม่ได้ยืนยัน osu! ใช้ `!verify` เพื่อเริ่มได้เลย');
      return;
    }
    await message.reply(`คุณยืนยันเป็น **${record.osuUsername}** แล้ว เมื่อ ${new Date(record.verifiedAt).toLocaleString('th-TH')}`);
  }

  return { begin, showStatus, startServer };
}

module.exports = { createOsuVerificationService };

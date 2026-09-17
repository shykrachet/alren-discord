const crypto = require('node:crypto');
const http = require('node:http');
const { PermissionsBitField } = require('discord.js');
const {
  OSU_CLIENT_ID,
  OSU_CLIENT_SECRET,
  OSU_REDIRECT_URI,
  VERIFY_PORT,
} = require('./config');

const STATE_TTL_MS = 10 * 60 * 1000;

function getConfigError(store) {
  if (!OSU_CLIENT_ID || !OSU_CLIENT_SECRET || !OSU_REDIRECT_URI) {
    return 'osu! OAuth is not configured: add OSU_CLIENT_ID, OSU_CLIENT_SECRET, and OSU_REDIRECT_URI.';
  }
  if (!store?.isConfigured) return 'Supabase is not configured: add SUPABASE_URL and SUPABASE_SECRET_KEY.';
  return null;
}

function htmlPage(title, message, success = false) {
  const color = success ? '#ff66aa' : '#ef4444';
  const escapedTitle = escapeHtml(title);
  const escapedMessage = escapeHtml(message);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapedTitle}</title>`
    + `<style>body{font-family:system-ui,sans-serif;background:#171923;color:#fff;display:grid;place-items:center;min-height:90vh;margin:0}.card{max-width:480px;padding:32px;border-radius:16px;background:#24283b;text-align:center}h1{color:${color}}</style>`
    + `</head><body><main class="card"><h1>${escapedTitle}</h1><p>${escapedMessage}</p><p>You can return to Discord now.</p></main></body></html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function createOsuVerificationService({ bot, store }) {
  let server;

  async function validateAssignableRole(guild, role) {
    if (!role || role.id === guild.id || role.managed) {
      throw new Error('Choose a normal role that the bot can assign.');
    }
    const me = guild.members.me ?? await guild.members.fetchMe();
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      throw new Error('The bot needs the Manage Roles permission to assign this role.');
    }
    if (role.position >= me.roles.highest.position) {
      throw new Error('The selected role must be lower than the bot\'s highest role.');
    }
    return me;
  }

  async function getVerificationRole(guild) {
    const roleId = await store.getVerificationRole(guild.id);
    if (!roleId) {
      throw new Error('An administrator must set the verification role first with `!verify-role @role`.');
    }
    const role = guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
      throw new Error('The configured verification role no longer exists. Set it again with `!verify-role @role`.');
    }
    const me = await validateAssignableRole(guild, role);
    return { role, me };
  }

  async function applyDiscordVerification({ guildId, discordUserId, osuUser }) {
    const guild = await bot.guilds.fetch(guildId);
    const member = await guild.members.fetch(discordUserId);
    const { role, me } = await getVerificationRole(guild);
    const canManageNicknames = me.permissions.has(PermissionsBitField.Flags.ManageNicknames);
    const isServerOwner = guild.ownerId === member.id;

    if (!canManageNicknames && !isServerOwner) {
      throw new Error('The bot needs the Manage Nicknames permission to update Discord nicknames.');
    }
    if (!member.manageable && !isServerOwner) {
      throw new Error('The bot cannot update this member\'s nickname because their role is equal to or higher than the bot\'s role.');
    }

    await member.roles.add(role, 'Verified through osu! OAuth');
    const nicknameUpdated = canManageNicknames && member.manageable;
    if (nicknameUpdated) {
      await member.setNickname(osuUser.username, 'Verified through osu! OAuth');
    }
    await store.saveVerification({ guildId, discordUserId, osuUser });
    return { nicknameUpdated, role };
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
    if (!tokenResponse.ok) throw new Error('osu! declined authentication. Please start `!osuverify <osu_user_id>` again.');
    const token = await tokenResponse.json();
    const profileResponse = await fetch('https://osu.ppy.sh/api/v2/me', {
      headers: { authorization: `Bearer ${token.access_token}`, accept: 'application/json' },
    });
    if (!profileResponse.ok) throw new Error('Could not read the osu! profile.');
    const profile = await profileResponse.json();
    if (!profile.id || !profile.username) throw new Error('osu! returned incomplete profile data.');
    return profile;
  }

  async function getPublicOsuUser(osuUserId) {
    const tokenResponse = await fetch('https://osu.ppy.sh/oauth/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id: OSU_CLIENT_ID,
        client_secret: OSU_CLIENT_SECRET,
        grant_type: 'client_credentials',
        scope: 'public',
      }),
    });
    if (!tokenResponse.ok) throw new Error('Could not connect to osu! to validate this ID. Please try again.');

    const token = await tokenResponse.json();
    const profileResponse = await fetch(`https://osu.ppy.sh/api/v2/users/${osuUserId}/osu?key=id`, {
      headers: { authorization: `Bearer ${token.access_token}`, accept: 'application/json' },
    });
    if (profileResponse.status === 404) throw new Error('That osu! ID was not found. Check the number in the profile URL and try again.');
    if (!profileResponse.ok) throw new Error('Could not read the osu! profile. Please try again.');

    const profile = await profileResponse.json();
    if (!profile.id || !profile.username || String(profile.id) !== osuUserId) {
      throw new Error('That osu! ID was not found. Check the number in the profile URL and try again.');
    }
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
    let pending;
    try {
      pending = state && await store.consumeVerificationRequest(state);
    } catch (error) {
      console.error('Could not read verification request from Supabase:', error);
      response.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
      response.end(htmlPage('Verification failed', 'Could not read the verification request. Please try again.'));
      return;
    }

    if (!pending || new Date(pending.expires_at).getTime() < Date.now() || !code) {
      response.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
      response.end(htmlPage('Link expired', 'Return to Discord and run !osuverify <osu_user_id> again.'));
      return;
    }

    try {
      const osuUser = await exchangeCodeForOsuUser(code);
      if (String(osuUser.id) !== pending.osu_user_id) {
        throw new Error(`The signed-in account has osu! ID ${osuUser.id}, but this link is for ID ${pending.osu_user_id}.`);
      }
      if (await store.findOtherOwner(pending.guild_id, pending.discord_user_id, osuUser.id)) {
        throw new Error('This osu! ID is already verified by another member of this server.');
      }
      const result = await applyDiscordVerification({
        discordUserId: pending.discord_user_id,
        guildId: pending.guild_id,
        osuUser,
      });
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      const completionMessage = result.nicknameUpdated
        ? `Welcome, ${osuUser.username}. Your Discord nickname and ${result.role.name} role have been set.`
        : `Welcome, ${osuUser.username}. Your ${result.role.name} role has been set. Discord does not allow bots to change a server owner's nickname.`;
      response.end(htmlPage('Verification complete!', completionMessage, true));
      const channel = await bot.channels.fetch(pending.channel_id);
      if (channel?.isTextBased()) {
        const nicknameNotice = result.nicknameUpdated ? '' : ' Their nickname was unchanged because they are the server owner.';
        await channel.send(`✅ <@${pending.discord_user_id}> verified as **${osuUser.username}** and received the <@&${result.role.id}> role.${nicknameNotice}`);
      }
    } catch (error) {
      console.error('osu! verification callback failed:', error);
      response.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
      response.end(htmlPage('Verification failed', error.message));
    }
  }

  async function startServer() {
    const configError = getConfigError(store);
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

  async function begin(message, osuUserId) {
    if (!message.inGuild()) {
      await message.reply('Use this command in a Discord server.');
      return;
    }
    if (!osuUserId || !/^\d{1,20}$/.test(osuUserId)) {
      await message.reply('Usage: `!osuverify <osu_user_id>` — for example, `!osuverify 66070220`.\nFind the ID in the profile URL, such as https://osu.ppy.sh/users/12852613');
      return;
    }
    const configError = getConfigError(store);
    if (configError || !server) {
      await message.reply(`${configError || 'The verification system is not ready.'}\nAn administrator must configure the bot first.`);
      return;
    }
    try {
      const guild = message.guild ?? await bot.guilds.fetch(message.guildId);
      await getVerificationRole(guild);
    } catch (error) {
      await message.reply(error.message);
      return;
    }
    try {
      if (await store.findOtherOwner(message.guildId, message.author.id, osuUserId)) {
        await message.reply('This osu! ID is already verified by another member of this server.');
        return;
      }
    } catch (error) {
      console.error('Could not check osu! verification:', error.message);
      await message.reply(error.message);
      return;
    }

    let osuProfile;
    try {
      osuProfile = await getPublicOsuUser(osuUserId);
    } catch (error) {
      console.error('Could not look up osu! user:', error.message);
      await message.reply(error.message);
      return;
    }

    const state = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString();
    try {
      await store.createVerificationRequest({
        channelId: message.channelId,
        discordUserId: message.author.id,
        expiresAt,
        guildId: message.guildId,
        osuUserId,
        state,
      });
    } catch (error) {
      console.error('Could not save verification request:', error.message);
      await message.reply(error.message);
      return;
    }
    const authorizationUrl = new URL('https://osu.ppy.sh/oauth/authorize');
    authorizationUrl.search = new URLSearchParams({
      client_id: OSU_CLIENT_ID,
      redirect_uri: OSU_REDIRECT_URI,
      response_type: 'code',
      scope: 'public identify',
      state,
    }).toString();
    try {
      await message.author.send(
        `Username IGN: **${osuProfile.username}**\nosu! ID: **${osuProfile.id}**\n\n[Click To verify](${authorizationUrl})\n\nThis link expires in 10 minutes and verifies only this osu! ID.`,
      );
      await message.reply('📩 Your private verification link was sent by DM. Enable direct messages from server members if you cannot find it.');
    } catch (error) {
      await store.deleteVerificationRequest(state).catch((deleteError) => {
        console.error('Could not remove failed verification request:', deleteError.message);
      });
      console.error('Could not send osu! verification DM:', error.message);
      await message.reply('I could not send you a DM. Enable “Allow direct messages from server members”, then run `!osuverify <osu_user_id>` again.');
    }
  }

  async function showStatus(message) {
    if (!message.inGuild()) return;
    const record = await store.getVerification(message.guildId, message.author.id);
    if (!record) {
      await message.reply('You have not verified an osu! account yet. Use `!osuverify <osu_user_id>` to begin.');
      return;
    }
    await message.reply(`You are verified as **${record.osu_username}** since ${new Date(record.verified_at).toLocaleString('en-US')}.`);
  }

  async function setVerificationRole(message) {
    if (!message.inGuild()) {
      await message.reply('Use this command in a Discord server.');
      return;
    }
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      await message.reply('Only members with the Manage Server permission can set the verification role.');
      return;
    }
    const role = message.mentions.roles.first();
    if (!role) {
      await message.reply('Usage: `!verify-role @role` — for example, `!verify-role @Verified`.');
      return;
    }

    try {
      await validateAssignableRole(message.guild, role);
      await store.saveVerificationRole(message.guildId, role.id);
      await message.reply(`The osu! verification role is now ${role}.`);
    } catch (error) {
      await message.reply(error.message);
    }
  }

  async function showVerificationRole(message) {
    if (!message.inGuild()) return;
    const roleId = await store.getVerificationRole(message.guildId);
    if (!roleId) {
      await message.reply('No verification role is configured. Use `!verify-role @role`.');
      return;
    }
    await message.reply(`The current osu! verification role is <@&${roleId}>.`);
  }

  return { begin, setVerificationRole, showStatus, showVerificationRole, startServer };
}

module.exports = { createOsuVerificationService };

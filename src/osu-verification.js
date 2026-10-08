const crypto = require('node:crypto');
const http = require('node:http');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField,
} = require('discord.js');
const {
  OSU_CLIENT_ID,
  OSU_CLIENT_SECRET,
  OSU_REDIRECT_URI,
  VERIFY_PORT,
} = require('./config');
const { modeIcon, modeLabel, normalizeMode } = require('./mode-icons');

const STATE_TTL_MS = 10 * 60 * 1000;

function osuProfileUrl(user) {
  return user?.id ? `https://osu.ppy.sh/users/${encodeURIComponent(user.id)}` : null;
}

function osuModePath(mode) {
  const normalized = normalizeMode(mode);
  return normalized === 'catch' ? 'fruits' : normalized;
}

function osuModeProfileUrl(user, mode) {
  const profileUrl = osuProfileUrl(user);
  const modePath = osuModePath(mode);
  return profileUrl && modePath ? `${profileUrl}/${encodeURIComponent(modePath)}` : profileUrl;
}

function osuCoverUrl(user) {
  return user?.cover_url || user?.cover?.custom_url || user?.cover?.url || null;
}

function addProfileArtwork(embed, user, fallbackAvatarUrl) {
  const avatar = user?.avatar_url || (user?.id ? `https://a.ppy.sh/${encodeURIComponent(user.id)}` : null);
  const cover = osuCoverUrl(user);
  if (avatar || fallbackAvatarUrl) embed.setThumbnail(avatar || fallbackAvatarUrl);
  if (cover) embed.setImage(cover);
  return embed;
}

function roleName(role) {
  return role?.name ? `**${role.name}**` : 'that role';
}

function botHighestRoleName(member) {
  return member?.roles?.highest?.name ? `**${member.roles.highest.name}**` : 'Alren\'s highest role';
}

function countryFlag(countryCode) {
  const code = String(countryCode || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return [...code]
    .map((letter) => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65))
    .join('');
}

function formatRank(rank) {
  const value = Number(rank);
  return Number.isFinite(value) && value > 0
    ? `#${Math.trunc(value).toLocaleString('en-US')}`
    : 'Unranked';
}

function preferredMode(osuUser) {
  return osuUser?.playmode || osuUser?.statistics?.mode || 'osu';
}

function modeStatistics(osuUser, mode) {
  const modePath = osuModePath(mode);
  return osuUser?.statistics
    || osuUser?.statistics_rulesets?.[mode]
    || osuUser?.statistics_rulesets?.[modePath]
    || null;
}

function countryName(osuUser) {
  const code = osuUser?.country_code;
  const flag = countryFlag(code);
  const name = osuUser?.country?.name || code || 'Unknown';
  return flag ? `${flag} ${name}` : name;
}

function createVerificationCompleteEmbed({
  botAvatarUrl,
  guildName,
  nicknameUpdated,
  osuUser,
  role,
}) {
  const mode = preferredMode(osuUser);
  const stats = modeStatistics(osuUser, mode);
  const profileUrl = osuModeProfileUrl(osuUser, mode) || osuProfileUrl(osuUser);
  const nicknameNotice = nicknameUpdated
    ? 'Your Discord nickname was updated to your osu! username.'
    : 'Your nickname was unchanged because Discord did not allow Alren to edit it in this server.';
  const embed = new EmbedBuilder()
    .setColor(0x22c55e)
    .setAuthor({
      name: `${guildName} • osu! verification`,
      ...(botAvatarUrl ? { iconURL: botAvatarUrl } : {}),
    })
    .setTitle(`✅ ${osuUser.username} verified`)
    .setURL(profileUrl)
    .setDescription(`You are verified as **${osuUser.username}** and received the **${role.name}** role.`)
    .addFields(
      { name: '👤 Player', value: `[${osuUser.username}](${profileUrl})`, inline: true },
      { name: `${modeIcon(mode)} Rank mode`, value: modeLabel(mode), inline: true },
      { name: '🌍 Country', value: countryName(osuUser), inline: true },
      { name: '⭐ Global rank', value: formatRank(stats?.global_rank), inline: true },
      { name: '🏳️ Country rank', value: formatRank(stats?.country_rank), inline: true },
      { name: '🏷️ Verified role', value: role.name, inline: true },
      { name: '🔗 Profile', value: `[Open osu! profile ↗](${profileUrl})` },
      { name: '✏️ Discord nickname', value: nicknameNotice },
    )
    .setFooter({ text: `osu! user #${osuUser.id} • Verified by Alren` })
    .setTimestamp();
  addProfileArtwork(embed, osuUser, botAvatarUrl);
  return embed;
}

function createVerificationSettingsEmbed({ channelId, roleId }) {
  return new EmbedBuilder()
    .setColor(roleId ? 0x22c55e : 0x5865f2)
    .setTitle('✅ osu! verification settings')
    .setDescription('Use `/setup verify` to update these values.')
    .addFields(
      { name: '🏷️ Verified role', value: roleId ? `<@&${roleId}>` : 'Not configured', inline: true },
      { name: '📣 Result channel', value: channelId ? `<#${channelId}>` : 'Not configured', inline: true },
    )
    .setFooter({ text: 'Members can verify with /verify' })
    .setTimestamp();
}

function createVerificationMessage({ authorizationUrl, botAvatarUrl, guildName, osuProfile, welcome = false }) {
  const identity = osuProfile
    ? `This link is prepared for **${osuProfile.username}** (osu! ID ${osuProfile.id}).`
    : 'Sign in to osu! and Alren will detect your account name automatically.';
  const embed = new EmbedBuilder()
    .setColor(0xff66aa)
    .setAuthor({
      name: 'Alren • Secure osu! verification',
      ...(botAvatarUrl ? { iconURL: botAvatarUrl } : {}),
    })
    .setTitle(welcome ? `👋 Welcome to ${guildName}` : '✅ Verify your osu! account')
    .setDescription(`${identity}\n\nClick the button below to continue securely through osu! OAuth.`)
    .addFields(
      { name: 'What happens next?', value: 'Alren reads your public osu! profile, gives you the configured role, and updates your Discord nickname when allowed.' },
      { name: 'Link lifetime', value: '10 minutes', inline: true },
      { name: 'Privacy', value: 'Sent only to you', inline: true },
    )
    .setFooter({ text: 'Alren verification • Never share this personal link' })
    .setTimestamp();
  const profileUrl = osuProfileUrl(osuProfile);
  if (profileUrl) embed.setURL(profileUrl);
  addProfileArtwork(embed, osuProfile, botAvatarUrl);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Verify with osu!')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Link)
      .setURL(authorizationUrl),
  );
  return { embeds: [embed], components: [row] };
}

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
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<style>*{box-sizing:border-box}body{font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:radial-gradient(circle at top,#4c1d5f,#111827 55%);color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}.card{width:min(520px,100%);padding:40px;border:1px solid #ffffff20;border-radius:24px;background:#171923e8;box-shadow:0 24px 70px #0008;text-align:center}.mark{display:grid;place-items:center;width:64px;height:64px;margin:0 auto 18px;border-radius:50%;background:${color};font-size:32px}h1{margin:0 0 12px;color:${color}}p{line-height:1.65;color:#d1d5db}.hint{font-size:14px;color:#9ca3af}</style>`
    + `</head><body><main class="card"><div class="mark">${success ? '✓' : '!'}</div><h1>${escapedTitle}</h1><p>${escapedMessage}</p><p class="hint">You can safely close this page and return to Discord.</p></main></body></html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function createOsuVerificationService({ apiHandler, bot, store }) {
  let server;

  function createAuthorizationUrl(state) {
    const authorizationUrl = new URL('https://osu.ppy.sh/oauth/authorize');
    authorizationUrl.search = new URLSearchParams({
      client_id: OSU_CLIENT_ID,
      redirect_uri: OSU_REDIRECT_URI,
      response_type: 'code',
      scope: 'public identify',
      state,
    }).toString();
    return authorizationUrl.toString();
  }

  async function validateAssignableRole(guild, role) {
    if (!role || role.id === guild.id || role.managed) {
      throw new Error('Choose a normal, manually created role that Alren can assign.');
    }
    const me = guild.members.me ?? await guild.members.fetchMe();
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      throw new Error('Alren needs the Manage Roles permission to assign verification roles. Reinvite the bot with Manage Roles or grant that permission in this server.');
    }
    if (role.position >= me.roles.highest.position) {
      throw new Error(`The selected role ${roleName(role)} must be lower than ${botHighestRoleName(me)}. In Server Settings > Roles, drag Alren's bot role above ${role.name || role.id}, then run /setup verify again.`);
    }
    return me;
  }

  async function getVerificationRole(guild) {
    const roleId = await store.getVerificationRole(guild.id);
    if (!roleId) {
      throw new Error('An administrator must set the verification role first with `/setup verify role:@Verified`.');
    }
    const role = guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
      throw new Error('The configured verification role no longer exists. Set it again with `/setup verify role:@Verified`.');
    }
    const me = await validateAssignableRole(guild, role);
    return { role, me };
  }

  async function applyDiscordVerification({ guildId, discordUserId, osuUser }) {
    const guild = await bot.guilds.fetch(guildId);
    const member = await guild.members.fetch(discordUserId);
    const { role, me } = await getVerificationRole(guild);
    const canManageNicknames = me.permissions.has(PermissionsBitField.Flags.ManageNicknames);

    await member.roles.add(role, 'Verified through osu! OAuth');
    const nicknameUpdated = canManageNicknames && member.manageable;
    if (nicknameUpdated) {
      await member.setNickname(osuUser.username, 'Verified through osu! OAuth');
    }
    await store.saveVerification({ guildId, discordUserId, osuUser });
    return { guildName: guild.name, nicknameUpdated, role };
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
    if (!tokenResponse.ok) throw new Error('osu! declined authentication. Please run /verify or !osuverify again.');
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
    const requestUrl = new URL(request.url, OSU_REDIRECT_URI || 'http://localhost');
    if (requestUrl.pathname === '/health') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end('{"status":"ok"}');
      return;
    }
    if (apiHandler && await apiHandler(request, response)) return;
    const redirectPath = OSU_REDIRECT_URI ? new URL(OSU_REDIRECT_URI).pathname : null;
    if (!redirectPath || requestUrl.pathname !== redirectPath) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    const configError = getConfigError(store);
    if (configError) {
      response.writeHead(503, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: configError }));
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
      response.end(htmlPage('Link expired', 'Return to Discord and run /verify or !osuverify again.'));
      return;
    }

    try {
      const osuUser = await exchangeCodeForOsuUser(code);
      if (String(pending.osu_user_id) !== '0' && String(osuUser.id) !== String(pending.osu_user_id)) {
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
        : `Welcome, ${osuUser.username}. Your ${result.role.name} role has been set. Discord did not allow Alren to change your nickname because of server permissions or role order.`;
      response.end(htmlPage('Verification complete!', completionMessage, true));
      await bot.users.fetch(pending.discord_user_id).then((verifiedUser) => {
        const completionEmbed = createVerificationCompleteEmbed({
          botAvatarUrl: bot.user?.displayAvatarURL?.(),
          guildName: result.guildName,
          nicknameUpdated: result.nicknameUpdated,
          osuUser,
          role: result.role,
        });
        return verifiedUser.send({ embeds: [completionEmbed] });
      }).catch((error) => {
        console.warn('Could not send private verification result:', error.message);
      });
      try {
        const settings = await store.getVerificationSettings?.(pending.guild_id);
        if (settings?.channel_id) {
          const channel = await bot.channels.fetch(settings.channel_id);
          if (!channel?.isTextBased() || typeof channel.send !== 'function') {
            throw new Error(`Configured verification channel ${settings.channel_id} is unavailable.`);
          }
          await channel.send({
            embeds: [createVerificationCompleteEmbed({
              botAvatarUrl: bot.user?.displayAvatarURL?.(),
              guildName: result.guildName,
              nicknameUpdated: result.nicknameUpdated,
              osuUser,
              role: result.role,
            })],
          });
        }
      } catch (error) {
        console.warn('Could not post public verification result:', error.message);
      }
    } catch (error) {
      console.error('osu! verification callback failed:', error);
      response.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
      response.end(htmlPage('Verification failed', error.message));
    }
  }

  async function startServer() {
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
    console.log(`HTTP API listening on port ${VERIFY_PORT}`);
    const configError = getConfigError(store);
    if (configError) console.warn(`osu! verification is disabled: ${configError}`);
  }

  async function begin(message, osuUserId) {
    if (!message.inGuild()) {
      await message.reply('Use this command in a Discord server.');
      return;
    }
    if (osuUserId && !/^\d{1,20}$/.test(osuUserId)) {
      await message.reply('The optional osu! ID must contain numbers only. You can also run `/verify` or `!osuverify` without an ID.');
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
    let osuProfile;
    if (osuUserId) {
      try {
        if (await store.findOtherOwner(message.guildId, message.author.id, osuUserId)) {
          await message.reply('This osu! ID is already verified by another member of this server.');
          return;
        }
        osuProfile = await getPublicOsuUser(osuUserId);
      } catch (error) {
        console.error('Could not look up osu! user:', error.message);
        await message.reply(error.message);
        return;
      }
    }

    const state = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString();
    try {
      await store.createVerificationRequest({
        channelId: message.channelId,
        discordUserId: message.author.id,
        expiresAt,
        guildId: message.guildId,
        osuUserId: osuUserId || '0',
        state,
      });
    } catch (error) {
      console.error('Could not save verification request:', error.message);
      await message.reply(error.message);
      return;
    }
    try {
      await message.author.send(createVerificationMessage({
        authorizationUrl: createAuthorizationUrl(state),
        botAvatarUrl: bot.user?.displayAvatarURL?.(),
        guildName: message.guild?.name || 'this server',
        osuProfile,
      }));
      await message.reply('📩 Your private verification link was sent by DM. Enable direct messages from server members if you cannot find it.');
    } catch (error) {
      await store.deleteVerificationRequest(state).catch((deleteError) => {
        console.error('Could not remove failed verification request:', deleteError.message);
      });
      console.error('Could not send osu! verification DM:', error.message);
      await message.reply('I could not send you a DM. Enable “Allow direct messages from server members”, then run `/verify` or `!osuverify` again.');
    }
  }

  async function sendWelcomeVerification(member) {
    if (!member || member.user.bot || getConfigError(store) || !server) return false;
    try {
      if (await store.getVerification(member.guild.id, member.id)) return false;
      await getVerificationRole(member.guild);
      const state = crypto.randomBytes(32).toString('hex');
      await store.createVerificationRequest({
        channelId: member.guild.systemChannelId || member.guild.id,
        discordUserId: member.id,
        expiresAt: new Date(Date.now() + STATE_TTL_MS).toISOString(),
        guildId: member.guild.id,
        osuUserId: '0',
        state,
      });
      try {
        await member.send(createVerificationMessage({
          authorizationUrl: createAuthorizationUrl(state),
          botAvatarUrl: bot.user?.displayAvatarURL?.(),
          guildName: member.guild.name,
          welcome: true,
        }));
        return true;
      } catch (error) {
        await store.deleteVerificationRequest(state).catch(() => {});
        console.warn(`Could not DM verification link to ${member.id}:`, error.message);
        return false;
      }
    } catch (error) {
      console.warn(`Could not prepare welcome verification in ${member.guild.id}:`, error.message);
      return false;
    }
  }

  async function showStatus(message) {
    if (!message.inGuild()) return;
    const record = await store.getVerification(message.guildId, message.author.id);
    if (!record) {
      await message.reply('You have not verified an osu! account yet. Use `/verify` or `!osuverify` to begin.');
      return;
    }
    let osuUser = {
      id: record.osu_user_id,
      username: record.osu_username,
    };
    try {
      osuUser = await getPublicOsuUser(String(record.osu_user_id));
    } catch (error) {
      console.warn('Could not refresh verified osu! profile artwork:', error.message);
    }
    const verifiedAt = Date.parse(record.verified_at || '');
    const verifiedText = Number.isNaN(verifiedAt)
      ? 'Previously verified'
      : `<t:${Math.floor(verifiedAt / 1000)}:R>`;
    const profileUrl = osuProfileUrl(osuUser);
    const embed = new EmbedBuilder()
      .setColor(0xff66aa)
      .setTitle(`✅ ${osuUser.username || record.osu_username}`)
      .setURL(profileUrl)
      .setDescription('Your Discord account is linked to this osu! profile.')
      .addFields(
        { name: '🎮 osu! ID', value: String(osuUser.id || record.osu_user_id), inline: true },
        { name: '🕒 Verified', value: verifiedText, inline: true },
        { name: '🔗 Profile', value: `[Open osu! profile ↗](${profileUrl})` },
      )
      .setFooter({ text: 'Alren osu! verification' });
    addProfileArtwork(embed, osuUser, bot.user?.displayAvatarURL?.());
    await message.reply({ embeds: [embed] });
  }

  async function configureVerificationRole(guild, role) {
    await validateAssignableRole(guild, role);
    await store.saveVerificationRole(guild.id, role.id);
    return role;
  }

  async function configureVerificationSettings(guild, { channel, role }) {
    const current = store.getVerificationSettings
      ? await store.getVerificationSettings(guild.id).catch((error) => {
        throw new Error(`Could not read verification settings. Apply the latest Supabase schema. ${error.message}`);
      }) || {}
      : { role_id: await store.getVerificationRole(guild.id) };
    let roleId = current.role_id;
    if (role) {
      await validateAssignableRole(guild, role);
      roleId = role.id;
    }
    const channelId = channel?.id || current.channel_id || null;
    if (!roleId) {
      throw new Error('Select a verified role the first time, for example `/setup verify role:@Verified channel:#verify-log`.');
    }
    await store.saveVerificationSettings(guild.id, { channelId, roleId });
    return { channelId, roleId };
  }

  async function setVerificationRole(message, selectedRole) {
    if (!message.inGuild()) {
      await message.reply('Use this command in a Discord server.');
      return;
    }
    const memberPermissions = message.memberPermissions || message.member?.permissions;
    if (!memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
      await message.reply('Only members with the Manage Server permission can set the verification role.');
      return;
    }
    const role = selectedRole || message.mentions?.roles?.first();
    if (!role) {
      await message.reply('Usage: `!verify-setting @Verified` or `/setup verify role:@Verified channel:#verify-log`.');
      return;
    }

    try {
      await configureVerificationRole(message.guild, role);
      await message.reply(`The osu! verification role is now ${role}.`);
    } catch (error) {
      await message.reply(error.message);
    }
  }

  async function showVerificationRole(message) {
    if (!message.inGuild()) return;
    const roleId = await store.getVerificationRole(message.guildId);
    if (!roleId) {
      await message.reply('No verification role is configured. Use `/setup verify role:@Verified`.');
      return;
    }
    await message.reply(`The current osu! verification role is <@&${roleId}>.`);
  }

  async function showVerificationSettings(message) {
    if (!message.inGuild()) return;
    let settings;
    try {
      settings = store.getVerificationSettings
        ? await store.getVerificationSettings(message.guildId)
        : { role_id: await store.getVerificationRole(message.guildId) };
    } catch (error) {
      await message.reply(`Could not read verification settings. Apply the latest Supabase schema.\nReason: ${error.message}`);
      return;
    }
    await message.reply({
      embeds: [createVerificationSettingsEmbed({
        channelId: settings?.channel_id,
        roleId: settings?.role_id,
      })],
    });
  }

  return {
    begin,
    configureVerificationSettings,
    configureVerificationRole,
    sendWelcomeVerification,
    setVerificationRole,
    showStatus,
    showVerificationSettings,
    showVerificationRole,
    startServer,
  };
}

module.exports = {
  createOsuVerificationService,
  createVerificationCompleteEmbed,
  createVerificationMessage,
  createVerificationSettingsEmbed,
};

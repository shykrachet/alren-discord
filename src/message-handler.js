const { setupAccess } = require('./setup-access');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const { createMapEmbed } = require('./osu-maps');
const { modeLabel } = require('./mode-icons');

const ALREN_COLOR = 0xff66aa;
const SUCCESS_COLOR = 0x22c55e;
const ERROR_COLOR = 0xef4444;
const COMMANDS_URL = 'https://www.alrenbot.xyz/commands';

function createAlrenEmbed(text, title = 'Alren') {
  const description = String(text || '...');
  return new EmbedBuilder()
    .setColor(ALREN_COLOR)
    .setAuthor({ name: title })
    .setDescription(description.length > 4096 ? `${description.slice(0, 4093)}...` : description)
    .setFooter({ text: 'Private conversation with Alren' })
    .setTimestamp();
}

function createStatusEmbed(title, description, color = ALREN_COLOR) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function errorReason(error) {
  const reason = String(error?.message || error || 'Unknown error').trim();
  return reason.length > 1500 ? `${reason.slice(0, 1497)}...` : reason;
}

function createHelpEmbed() {
  return new EmbedBuilder().setColor(ALREN_COLOR)
    .setTitle('📖 Alren Command Guide — English')
    .setURL(COMMANDS_URL)
    .setDescription('Your osu! companion. Discover maps, verify your account, and follow community updates.\n\n**Everyone can use the everyday commands below.**')
    .addFields(
      { name: '✅ Verify your account', value: '`/verify` — link your osu! account\n`/verify-status` — view your linked profile', inline: true },
      { name: '🎵 Discover beatmaps', value: '`/map` — find a random beatmap\nFilter by status and game mode.', inline: true },
      { name: 'ℹ️ Quick tools', value: '`/ping` — check bot latency\n`/help` — open this guide', inline: false },
      { name: '🔒 Setup · Inviter only', value: 'Only the person who invited Alren to this server can use `/setup` and legacy setup commands. Administrator and Manage Server permissions do not grant access.\n\n`/setup status` — review settings\n`/setup verify` — role and result channel\n`/setup beatmap` — feeds per channel\n`/setup bn-management` — community alerts' },
      { name: '📌 Feed example', value: '`/setup beatmap channel:#mania mode:mania status:ranked_loved`\nRepeat for each channel. Use `enabled:false` to stop a feed.' },
      { name: '🌐 Full command guide', value: `[Open the web guide](${COMMANDS_URL})` },
    )
    .setFooter({ text: 'Everyone: everyday commands • Inviter: server setup' });
}

function createCommandGuideButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Command website')
      .setEmoji('🌐')
      .setStyle(ButtonStyle.Link)
      .setURL(COMMANDS_URL),
  );
}

function createHelpComponents() {
  return [createCommandGuideButton()];
}

function formatHelp() {
  return [
    '**Alren commands**',
    `Full guide: ${COMMANDS_URL}`,
    '`/help` — easy slash-command menu',
    '`/verify` — one-click osu! OAuth verification',
    '`/map` — random beatmap with cover artwork',
    '`/setup status|verify|beatmap|bn-management` — inviter only: configure server features',
    '`!osuverify` — legacy prefix verify through osu! OAuth',
    '`/verify-status` or `!verify-status` — verification status',
    '`!verify-setting @role` — legacy prefix verification setup',
    '`!osumap [status] [mode]` — legacy prefix random beatmap',
    '`!osumap-settings [status] [mode]` — legacy prefix beatmap feed setup',
    '`!osumap-status` — legacy prefix beatmap feed status',
    '`!community-alert-settings #channel [mode]` — legacy prefix community alerts',
    '`/ping` or `!ping`',
  ].join('\n');
}

async function sendPrivate(message, payload, acknowledgement = '📩 I sent the result by DM.') {
  try {
    await message.author.send(payload);
    if (message.inGuild?.() && acknowledgement) {
      await message.reply({ content: acknowledgement, allowedMentions: { repliedUser: false } });
    }
    return true;
  } catch (error) {
    if (message.channel?.send) {
      await message.channel.send({
        content: `${message.author}, I could not send you a DM. Enable direct messages from server members and try again.`,
        allowedMentions: { users: [message.author.id] },
      });
    }
    return false;
  }
}

function parsePrefixCommand(message, bot) {
  const content = message.content.trim();
  if (!content.startsWith('!')) return null;
  const match = /^!([^\s]+)\s*(.*)$/s.exec(content);
  return match ? { command: match[1].toLowerCase(), args: match[2].trim() } : null;
}

function createMessageHandler({ bot, osuMaps, osuVerification, store }) {
  return async (message) => {
    if (message.author.bot) return;
    const parsed = parsePrefixCommand(message, bot);
    if (!parsed) return;
    const { command, args } = parsed;

    if (['verify-role', 'verify-setting', 'osumap-settings', 'community-alert-settings'].includes(command)) {
      if (!message.inGuild()) { await message.reply('Use setup commands in a server.'); return; }
      const denied = await setupAccess(message, store);
      if (denied) { await message.reply(denied); return; }
    }

    if (command === 'alrenhelp' || command === 'help') {
      await sendPrivate(message, {
        embeds: [createHelpEmbed()],
        components: createHelpComponents(),
      });
      return;
    }

    if (command === 'ping') {
      await message.reply({ embeds: [createStatusEmbed('🏓 Pong', `Latency: **${bot.ws.ping}ms**`, SUCCESS_COLOR)] });
      return;
    }

    if (command === 'osuverify') {
      await osuVerification.begin(message, args || undefined);
      return;
    }

    if (command === 'osuverify-status' || command === 'verify-status') {
      await osuVerification.showStatus(message);
      return;
    }

    if (command === 'verify-role' || command === 'verify-setting') {
      await osuVerification.setVerificationRole(message);
      return;
    }

    if (command === 'verify-role-status') {
      await osuVerification.showVerificationRole(message);
      return;
    }

    if (command === 'osumap') {
      if (!message.inGuild()) return;
      const values = args.toLowerCase().split(/\s+/).filter(Boolean);
      const status = values.find((value) => ['ranked', 'qualified', 'loved', 'ranked_loved', 'all'].includes(value));
      const mode = values.find((value) => ['any', 'osu', 'taiko', 'catch', 'mania'].includes(value));
      try {
        const result = await osuMaps.getRandomMap({ channelId: message.channelId, guildId: message.guildId, mode, status });
        await message.reply({ embeds: [createMapEmbed(result.map)] });
      } catch (error) {
        await message.reply({ embeds: [createStatusEmbed('Beatmap unavailable', error.message, ERROR_COLOR)] });
      }
      return;
    }

    if (command === 'osumap-status') {
      if (!message.inGuild()) return;
      try {
        const settings = await store.getMapSettings(message.guildId, message.channelId);
        await message.reply({
          embeds: [createStatusEmbed(
            '🎵 Beatmap feed settings',
            settings?.channel_id
              ? `Channel: <#${settings.channel_id}>\nStatus: **${settings.status_filter || 'ranked'}**\nMode: **${modeLabel(settings.mode_filter || 'any')}**`
              : 'Automatic beatmap feed is not configured yet.',
            settings?.channel_id ? SUCCESS_COLOR : ALREN_COLOR,
          )],
        });
      } catch (error) {
        await message.reply({ embeds: [createStatusEmbed('Could not read settings', error.message, ERROR_COLOR)] });
      }
      return;
    }

    if (command === 'osumap-settings') {
      const values = args.toLowerCase().split(/\s+/).filter(Boolean);
      const status = values.find((value) => ['ranked', 'qualified', 'loved', 'ranked_loved', 'all'].includes(value));
      const mode = values.find((value) => ['any', 'osu', 'taiko', 'catch', 'mania'].includes(value));
      try {
        const settings = await osuMaps.configureFeed({ channelId: message.channelId, guildId: message.guildId, mode, status });
        await message.reply({
          embeds: [createStatusEmbed('🎵 Beatmap feed configured', `Channel: <#${message.channelId}>\nStatus: **${settings.status}**\nMode: **${modeLabel(settings.mode)}**`, SUCCESS_COLOR)],
        });
      } catch (error) {
        await message.reply({ embeds: [createStatusEmbed('Could not save settings', error.message, ERROR_COLOR)] });
      }
      return;
    }

    if (command === 'community-alert-settings') {
      if (!store?.isConfigured) {
        await message.reply('Community alerts need a configured database.');
        return;
      }
      const selectedChannel = message.mentions.channels.first();
      const mode = args.toLowerCase().split(/\s+/).find((value) => ['all', 'osu', 'taiko', 'catch', 'mania'].includes(value));
      try {
        const current = await store.getCommunityAlertSettings(message.guildId);
        const channelId = selectedChannel?.id || current?.channel_id;
        const bnMode = mode || current?.bn_mode_filter || 'all';
        if (!channelId) {
          await message.reply('Usage: `!community-alert-settings #channel [all|osu|taiko|catch|mania]`');
          return;
        }
        if (selectedChannel || mode) await store.saveCommunityAlertSettings(message.guildId, { channelId, bnMode });
        await message.reply({
          embeds: [createStatusEmbed('🔔 Community alerts configured', `Channel: <#${channelId}>\nBN mode: **${bnMode}**`, SUCCESS_COLOR)],
        });
      } catch (error) {
        await message.reply({ embeds: [createStatusEmbed('Could not save alerts', error.message, ERROR_COLOR)] });
      }
    }
  };
}

module.exports = {
  COMMANDS_URL,
  createAlrenEmbed,
  createCommandGuideButton,
  createHelpEmbed,
  createHelpComponents,
  createMessageHandler,
  createStatusEmbed,
  formatHelp,
};

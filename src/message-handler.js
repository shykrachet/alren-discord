const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField,
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
    .setDescription('Start with `/help`, `/verify`, `/map`, and `/setup`. Existing long-form and `!` commands remain available.')
    .addFields(
      { name: '💬 Private chat', value: '`/alren message:...` or `!alren ...`\n`/alrenclear` or `!alrenclear`' },
      { name: '✅ osu! verification', value: '`/verify` — sign in with osu! OAuth automatically\n`/verify-status` or `!verify-status`' },
      { name: '🎵 Beatmaps', value: '`/map` — random beatmap using this channel’s filters\n`/setup beatmap channel:#mania mode:mania status:ranked_loved` — Ranked + Loved feed per channel; repeat for Standard, Taiko or Catch\n`/setup beatmap enabled:false` — disable this channel’s feed\n`/setup status` — view all channel feeds' },
      { name: '🛠️ Server setup', value: '`/setup status` — view all settings\n`/setup verify`, `/setup beatmap`, `/setup bn-management`' },
      { name: 'ℹ️ Utilities', value: '`/help` or `!alrenhelp`\n`/ping` or `!ping`' },
      { name: '🌐 Full command guide', value: `[Open the web guide](${COMMANDS_URL})` },
    )
    .setFooter({ text: 'Slash replies are private • Alren Help Center' });
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
    '`/setup status|verify|beatmap|bn-management` — configure server features',
    '`/alren` or `!alren <message>` — private AI chat',
    '`/alrenclear` or `!alrenclear` — clear chat memory',
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
  const mentionPattern = new RegExp(`^<@!?${bot.user.id}>\\s*`, 'i');
  if (mentionPattern.test(content)) {
    return { command: 'alren', args: content.replace(mentionPattern, '').trim() };
  }
  if (!content.startsWith('!')) return null;
  const match = /^!([^\s]+)\s*(.*)$/s.exec(content);
  return match ? { command: match[1].toLowerCase(), args: match[2].trim() } : null;
}

function hasManageServer(message) {
  return Boolean(message.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild));
}

function createMessageHandler({ bot, chat, osuMaps, osuVerification, store }) {
  return async (message) => {
    if (message.author.bot) return;
    const parsed = parsePrefixCommand(message, bot);
    if (!parsed) return;
    const { command, args } = parsed;

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

    if (command === 'alren' || command === 'chat') {
      if (!args) {
        await message.reply('Usage: `!alren <message>`');
        return;
      }
      if (!chat) {
        await message.reply('AI chat is not configured yet.');
        return;
      }
      if (message.deletable) await message.delete().catch(() => {});
      try {
        const answer = await chat.reply({
          channelId: message.channelId,
          userId: message.author.id,
          displayName: message.member?.displayName || message.author.username,
          prompt: args,
        });
        await sendPrivate(message, { embeds: [createAlrenEmbed(answer)] }, null);
      } catch (error) {
        console.error('Prefix chat request failed:', error.message);
        await sendPrivate(message, { embeds: [createStatusEmbed('Chat unavailable', `Reason: ${errorReason(error)}`, ERROR_COLOR)] }, null);
      }
      return;
    }

    if (command === 'alrenclear' || command === 'reset') {
      chat?.clearMemory(message.channelId, message.author.id);
      await sendPrivate(message, {
        embeds: [createStatusEmbed('✨ Fresh conversation', 'Your private Alren chat memory in this channel was cleared.', SUCCESS_COLOR)],
      });
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
      if (!message.inGuild() || !hasManageServer(message)) {
        await message.reply('You need the Manage Server permission to change beatmap settings.');
        return;
      }
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
      if (!message.inGuild() || !hasManageServer(message)) {
        await message.reply('You need the Manage Server permission to change community alerts.');
        return;
      }
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

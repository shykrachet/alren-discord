function getChatPrompt(message, bot) {
  const command = '!chat';
  const isChatCommand = message.content.toLowerCase().startsWith(command);
  const isMentioned = message.mentions.users.has(bot.user.id);

  if (!isChatCommand && !isMentioned) return null;

  return isChatCommand
    ? message.content.slice(command.length).trim()
    : message.content.replace(new RegExp(`<@!?${bot.user.id}>`, 'g'), '').trim();
}

async function replyInChunks(message, answer) {
  const chunks = answer.match(/[\s\S]{1,1900}/g) || [];

  for (const [index, part] of chunks.entries()) {
    if (index === 0) await message.reply(part);
    else await message.channel.send(part);
  }
}

function formatHelp() {
  return [
    '📖 **Alren Help**',
    '',
    '**General commands**',
    '`!ping` — Check whether the bot is online.',
    '`!chat <message>` or mention the bot — Chat with Alren.',
    '`/alren message:<message>` — Private chat visible only to you. The reply deletes automatically after 5 minutes.',
    '`!reset` — Clear your chat memory in this channel.',
    '`!version` — Show the bot version.',
    '',
    '**osu! Verify**',
    '`!verify-role @role` — Set the role awarded after verification. Requires Manage Server.',
    '`!verify-role-status` — Show the configured role.',
    '`!osuverify <osu_user_id>` — Verify an osu! account, for example `!osuverify 12852613`.',
    '`!osuverify-status` — Show your verified osu! account.',
    '',
    'Before verification, an administrator must set a role and place the bot role above it. Users receive a private verification link by DM.',
  ].join('\n');
}

function createMessageHandler({ bot, chat, osuVerification }) {
  return async (message) => {
    if (message.author.bot) return;

    if (message.content.trim().toLowerCase() === '!alrenhelp') {
      await message.reply(formatHelp());
      return;
    }

    if (message.content === '!verify-role-status') {
      await osuVerification.showVerificationRole(message);
      return;
    }

    if (/^!verify-role(?:\s|$)/i.test(message.content.trim())) {
      await osuVerification.setVerificationRole(message);
      return;
    }

    const verifyMatch = message.content.trim().match(/^!osuverify(?:\s+(.+))?$/i);
    if (verifyMatch) {
      await osuVerification.begin(message, verifyMatch[1]?.trim());
      return;
    }

    if (message.content === '!osuverify-status') {
      await osuVerification.showStatus(message);
      return;
    }

    if (message.content === '!ping') {
      await message.reply('pong 🏓');
      return;
    }

    if (message.content === '!version' || message.content === '!ver') {
      await message.reply(formatVersion());
      return;
    }

    if (message.content === '!reset') {
      chat?.clearMemory(message.channel.id, message.author.id);
      await message.reply('Your chat memory in this channel has been cleared. You can start a new conversation now. 🙂');
      return;
    }

    const prompt = getChatPrompt(message, bot);
    if (prompt === null) return;

    if (!prompt) {
      await message.reply('Mention me with a message, or use `!chat <message>`. 🙂');
      return;
    }

    if (!chat) {
      await message.reply('OpenAI is not configured yet. Add an API key to the environment variables.');
      return;
    }

    try {
      await message.channel.sendTyping();
      const answer = await chat.reply({
        channelId: message.channel.id,
        userId: message.author.id,
        displayName: message.author.displayName,
        prompt,
      });
      await replyInChunks(message, answer);
    } catch (error) {
      console.error('Chat request failed:', error.message);
      await message.reply('I cannot respond right now. Please try again shortly.');
    }
  };
}

module.exports = { createMessageHandler, formatHelp };
const { formatVersion } = require('./version');

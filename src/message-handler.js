function formatHelp() {
  return [
    '📖 **Alren User Guide**',
    '',
    '**1. Private chat**',
    'Use `/alren`, enter your message, and send it. Only you can see Alren’s reply. It deletes automatically after 5 minutes.',
    'Use `/alrenclear` to start a fresh private conversation in the current channel.',
    '',
    '**2. osu! verification**',
    '• An administrator runs `!verify-role @role` once to choose the verified role.',
    '• Run `!osuverify <osu_user_id>`, for example `!osuverify 12852613`.',
    '• Open the personal verification link sent by DM and sign in to the same osu! account.',
    '• Alren assigns the selected role and updates your nickname when Discord permits it.',
    '',
    '**Useful commands**',
    '`!verify-role-status` — Check the configured verification role.',
    '`!osuverify-status` — Check your verified osu! account.',
    '`!ping` — Check whether Alren is online.',
    '`!version` — Show the bot version.',
    '',
    'Use `/alrenhelp` to view this guide privately. Server owners can verify and receive a role, but Discord does not allow bots to change the owner’s nickname.',
  ].join('\n');
}

function createMessageHandler({ bot, osuVerification }) {
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

    const isLegacyChat = /^!chat(?:\s|$)/i.test(message.content.trim())
      || message.content.trim() === '!reset'
      || message.mentions.users.has(bot.user.id);
    if (isLegacyChat && message.deletable) {
      await message.delete().catch(() => {});
    }
  };
}

module.exports = { createMessageHandler, formatHelp };
const { formatVersion } = require('./version');

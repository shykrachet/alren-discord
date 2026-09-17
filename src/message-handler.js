function formatHelp() {
  return [
    '📖 **Alren User Guide**',
    '',
    '**1. Private chat**',
    'Use `/alren`, enter your message, and send it. Only you can see Alren’s reply. It deletes automatically after 5 minutes.',
    'Use `/alrenclear` to start a fresh private conversation in the current channel.',
    '',
    '**2. osu! verification**',
    '• An administrator runs `/verify-role` once to choose the verified role.',
    '• Run `/osuverify`, enter your osu! ID, and send it.',
    '• Open the personal verification link sent by DM and sign in to the same osu! account.',
    '• Alren assigns the selected role and updates your nickname when Discord permits it.',
    '',
    '**3. Beatmap feed**',
    '• Use `/osumap` to post a random osu! beatmap publicly in the current channel.',
    '• You can temporarily select a status and mode in `/osumap`.',
    '• An administrator uses `/osumap-settings` in the target channel to start automatic updates there.',
    '',
    '**Useful commands**',
    '`/verify-role-status` — Check the configured verification role privately.',
    '`/osuverify-status` — Check your verified osu! account privately.',
    '`/osumap` — Post a beatmap publicly in this channel.',
    '`/osumap-settings` — View or change the saved beatmap feed privately.',
    '`!ping` — Check whether Alren is online.',
    '`!version` — Show the bot version.',
    '',
    'Use `/alrenhelp` to view this guide privately. Server owners can verify and receive a role, but Discord does not allow bots to change the owner’s nickname.',
  ].join('\n');
}

function createMessageHandler({ bot }) {
  return async (message) => {
    if (message.author.bot) return;

    if (message.content.trim().toLowerCase() === '!alrenhelp') {
      await message.reply(formatHelp());
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

    const isLegacyPrivateCommand = /^!(?:chat|reset|osuverify(?:-status)?|verify-role(?:-status)?)(?:\s|$)/i.test(message.content.trim())
      || message.content.trim() === '!reset'
      || message.mentions.users.has(bot.user.id);
    if (isLegacyPrivateCommand && message.deletable) {
      await message.delete().catch(() => {});
    }
  };
}

module.exports = { createMessageHandler, formatHelp };
const { formatVersion } = require('./version');

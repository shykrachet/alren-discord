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

function createMessageHandler({ bot, chat }) {
  return async (message) => {
    if (message.author.bot) return;

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
      await message.reply('ล้างความจำของห้องนี้แล้ว เริ่มคุยใหม่ได้เลย 🙂');
      return;
    }

    const prompt = getChatPrompt(message, bot);
    if (prompt === null) return;

    if (!prompt) {
      await message.reply('แท็กฉันแล้วพิมพ์เรื่องที่อยากคุยได้เลย หรือใช้ `!chat ข้อความ` 🙂');
      return;
    }

    if (!chat) {
      await message.reply('ยังไม่ได้ตั้งค่า OpenAI API key ให้ฉันเลย ลองดู `.env.example` นะ');
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
      await message.reply('ตอนนี้ฉันคุยไม่ได้ชั่วคราว ลองใหม่อีกครั้งในสักครู่นะ');
    }
  };
}

module.exports = { createMessageHandler };
const { formatVersion } = require('./version');

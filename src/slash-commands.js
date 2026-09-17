const {
  MessageFlags, REST, Routes, SlashCommandBuilder,
} = require('discord.js');

const CHAT_COMMAND = new SlashCommandBuilder()
  .setName('alren')
  .setDescription('Chat privately with Alren. Replies delete automatically.')
  .addStringOption((option) => option
    .setName('message')
    .setDescription('What you want to say to Alren')
    .setRequired(true));

const COMMANDS = [CHAT_COMMAND.toJSON()];
const DEFAULT_DELETE_AFTER_SECONDS = 300;

function getDeleteAfterMs() {
  const requestedSeconds = Number(process.env.EPHEMERAL_CHAT_TTL_SECONDS || DEFAULT_DELETE_AFTER_SECONDS);
  const safeSeconds = Number.isFinite(requestedSeconds)
    ? Math.min(Math.max(requestedSeconds, 15), 3600)
    : DEFAULT_DELETE_AFTER_SECONDS;
  return safeSeconds * 1000;
}

function scheduleReplyDeletion(interaction) {
  const deletionTimer = setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, getDeleteAfterMs());
  deletionTimer.unref?.();
}

async function registerSlashCommands({ client, token }) {
  if (!client.user || !token) return;

  const rest = new REST({ version: '10' }).setToken(token);
  const guilds = [...client.guilds.cache.values()];
  await Promise.all(guilds.map((guild) => rest.put(
    Routes.applicationGuildCommands(client.user.id, guild.id),
    { body: COMMANDS },
  )));
  console.log(`registered /alren in ${guilds.length} server(s)`);
}

function createInteractionHandler({ chat }) {
  return async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'alren') return;

    if (!chat) {
      await interaction.reply({
        content: 'OpenAI is not configured yet. Add an API key to the environment variables.',
        flags: MessageFlags.Ephemeral,
      });
      scheduleReplyDeletion(interaction);
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const answer = await chat.reply({
        channelId: interaction.channelId,
        userId: interaction.user.id,
        displayName: interaction.member?.displayName || interaction.user.username,
        prompt: interaction.options.getString('message', true),
      });
      const content = answer.length > 1900 ? `${answer.slice(0, 1897)}...` : answer;
      await interaction.editReply({ content });
    } catch (error) {
      console.error('Slash chat request failed:', error.message);
      await interaction.editReply('I cannot respond right now. Please try again shortly.');
    }

    scheduleReplyDeletion(interaction);
  };
}

module.exports = { createInteractionHandler, registerSlashCommands };

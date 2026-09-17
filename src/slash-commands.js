const {
  MessageFlags, REST, Routes, SlashCommandBuilder,
} = require('discord.js');
const { formatHelp } = require('./message-handler');

const CHAT_COMMAND = new SlashCommandBuilder()
  .setName('alren')
  .setDescription('Chat privately with Alren. Replies delete automatically.')
  .addStringOption((option) => option
    .setName('message')
    .setDescription('What you want to say to Alren')
    .setRequired(true));

const CLEAR_CHAT_COMMAND = new SlashCommandBuilder()
  .setName('alrenclear')
  .setDescription('Clear your private Alren chat memory in this channel.');

const HELP_COMMAND = new SlashCommandBuilder()
  .setName('alrenhelp')
  .setDescription('Show Alren commands privately.');

const OSU_VERIFY_COMMAND = new SlashCommandBuilder()
  .setName('osuverify')
  .setDescription('Verify an osu! account privately.')
  .addStringOption((option) => option
    .setName('osu_user_id')
    .setDescription('The number from your osu! profile URL')
    .setRequired(true));

const OSU_VERIFY_STATUS_COMMAND = new SlashCommandBuilder()
  .setName('osuverify-status')
  .setDescription('Show your verified osu! account privately.');

const VERIFY_ROLE_COMMAND = new SlashCommandBuilder()
  .setName('verify-role')
  .setDescription('Set the osu! verification role privately.')
  .addRoleOption((option) => option
    .setName('role')
    .setDescription('The role verified members receive')
    .setRequired(true));

const VERIFY_ROLE_STATUS_COMMAND = new SlashCommandBuilder()
  .setName('verify-role-status')
  .setDescription('Show the configured verification role privately.');

const COMMANDS = [
  CHAT_COMMAND.toJSON(),
  CLEAR_CHAT_COMMAND.toJSON(),
  HELP_COMMAND.toJSON(),
  OSU_VERIFY_COMMAND.toJSON(),
  OSU_VERIFY_STATUS_COMMAND.toJSON(),
  VERIFY_ROLE_COMMAND.toJSON(),
  VERIFY_ROLE_STATUS_COMMAND.toJSON(),
];
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

function createPrivateCommandContext(interaction) {
  return {
    author: interaction.user,
    channelId: interaction.channelId,
    guild: interaction.guild,
    guildId: interaction.guildId,
    inGuild: () => interaction.inGuild(),
    member: interaction.member,
    memberPermissions: interaction.memberPermissions,
    reply: (content) => interaction.editReply({ content }),
  };
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

function createInteractionHandler({ chat, osuVerification }) {
  return async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'alrenhelp') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.editReply({ content: formatHelp() });
      scheduleReplyDeletion(interaction);
      return;
    }

    if (interaction.commandName === 'alrenclear') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      chat?.clearMemory(interaction.channelId, interaction.user.id);
      await interaction.editReply('Your private Alren chat memory in this channel has been cleared.');
      scheduleReplyDeletion(interaction);
      return;
    }

    if (['osuverify', 'osuverify-status', 'verify-role', 'verify-role-status'].includes(interaction.commandName)) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const context = createPrivateCommandContext(interaction);
      try {
        if (interaction.commandName === 'osuverify') {
          await osuVerification.begin(context, interaction.options.getString('osu_user_id', true));
        } else if (interaction.commandName === 'osuverify-status') {
          await osuVerification.showStatus(context);
        } else if (interaction.commandName === 'verify-role') {
          await osuVerification.setVerificationRole(context, interaction.options.getRole('role', true));
        } else {
          await osuVerification.showVerificationRole(context);
        }
      } catch (error) {
        console.error('Private verification command failed:', error.message);
        await interaction.editReply('I could not complete that verification request. Please try again shortly.');
      }
      scheduleReplyDeletion(interaction);
      return;
    }

    if (interaction.commandName !== 'alren') return;

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

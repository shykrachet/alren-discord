const { OPENAI_MODEL } = require('./config');
const friendInstructions = require('./persona');

const MAX_MEMORY_MESSAGES = 10;

function createChatService(openai) {
  const memories = new Map();

  function getMemoryKey(channelId, userId) {
    return `${channelId}:${userId}`;
  }

  function clearMemory(channelId, userId) {
    memories.delete(getMemoryKey(channelId, userId));
  }

  async function reply({ channelId, userId, displayName, prompt }) {
    const memoryKey = getMemoryKey(channelId, userId);
    const memory = memories.get(memoryKey) || [];
    const transcript = [...memory, { role: 'user', text: prompt }]
      .map(({ role, text }) => `${role === 'assistant' ? 'Kai' : displayName}: ${text}`)
      .join('\n');

    // Chat Completions works with both OpenAI and OpenRouter's OpenAI-compatible API.
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: friendInstructions },
        { role: 'user', content: transcript },
      ],
      max_tokens: 300,
    });
    const answer = completion.choices[0]?.message?.content?.trim()
      || 'Sorry, I do not have a response for that yet.';

    memories.set(memoryKey, [
      ...memory,
      { role: 'user', text: prompt },
      { role: 'assistant', text: answer },
    ].slice(-MAX_MEMORY_MESSAGES));

    return answer;
  }

  return { clearMemory, reply };
}

module.exports = { createChatService };

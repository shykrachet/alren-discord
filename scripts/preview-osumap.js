const { createMapEmbed } = require('../src/osu-maps');

const beatmapsetTemplate = {
  id: 1234567,
  artist: 'Sample Artist',
  title: 'Sample Title',
  creator: 'Sample Mapper',
  user_id: 100,
  status: 'ranked',
  ranked_date: '2026-09-17T00:00:00Z',
  beatmaps: [
    { difficulty_rating: 2.5, mode: 'osu', total_length: 125 },
    { difficulty_rating: 5.75, mode: 'mania', total_length: 180 },
  ],
  bpm: 180,
  covers: {
    cover: 'https://assets.ppy.sh/beatmaps/1234567/covers/cover.jpg',
    list: 'https://assets.ppy.sh/beatmaps/1234567/covers/list.jpg',
  },
  current_nominations: [
    { user_id: 42 },
    { user_id: 84 },
  ],
  genre: { id: 10, name: 'Electronic' },
  language: { id: 5, name: 'Instrumental' },
  related_users: [
    { id: 42, username: 'First Nominator' },
    { id: 84, username: 'Second Nominator' },
  ],
  source: 'Sample source',
};

console.log(JSON.stringify(createMapEmbed(beatmapsetTemplate).toJSON(), null, 2));

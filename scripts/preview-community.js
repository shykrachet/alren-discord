const {
  createBnClosedEmbed,
  createBnRequestEmbed,
  createMissionEmbed,
  normalizeBnRequests,
  normalizeMissionOpenings,
} = require('../src/community-alerts');

const [bnTemplate] = normalizeBnRequests({
  allUsersByMode: [{
    _id: 'osu',
    users: [{
      id: 'sample-bn',
      username: 'Sample BN',
      osuId: 123456,
      mode: 'osu',
      groups: 'bn',
      level: 'full',
      requestStatus: ['personalQueue'],
      requestLink: 'https://example.com/request-queue',
      requestInfo: 'Please read the queue rules before submitting.',
      lastOpenedForRequests: '2026-09-17T00:00:00Z',
      cover: 'https://example.com/bn-cover.jpg',
      languages: ['English', 'Thai'],
      genrePreferences: ['Rock', 'Electronic'],
      genreNegativePreferences: ['Country'],
      languagePreferences: ['Instrumental', 'Japanese'],
      osuStylePreferences: ['Tech', 'Streams'],
      detailPreferences: ['Featured artist'],
      mapperPreferences: ['New mapper'],
    }],
  }],
});

const [missionTemplate] = normalizeMissionOpenings({
  logs: [{
    id: 'sample-mission',
    category: 'mission',
    action: '"Sample Mappers\' Guild Mission" opened',
    createdAt: '2026-09-17T00:00:00Z',
  }],
});

const templates = {
  bnOpen: createBnRequestEmbed(bnTemplate).toJSON(),
  bnClosed: createBnClosedEmbed({ ...bnTemplate, status: 'closed' }).toJSON(),
  mapperGuildMission: createMissionEmbed(missionTemplate).toJSON(),
};

console.log(JSON.stringify(templates, null, 2));

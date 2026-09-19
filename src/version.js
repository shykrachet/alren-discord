const { version } = require('../package.json');

const releaseNotes = 'Rich osu! artwork, detailed BN cards, simple slash commands, and an interactive TH/EN help menu.';

function getReleaseChannel() {
  if (version.includes('-beta.')) return 'Beta';
  if (version.includes('-alpha.')) return 'Alpha';
  if (version.includes('-rc.')) return 'Release Candidate';
  return 'Stable';
}

function formatVersion() {
  return `Alren v${version} (${getReleaseChannel()})\n${releaseNotes}`;
}

module.exports = { formatVersion, getReleaseChannel, releaseNotes, version };

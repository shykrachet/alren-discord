const { version } = require('../package.json');

const releaseNotes = 'รุ่นทดสอบแรก: แชท AI, จดจำบริบท และคำสั่งพื้นฐาน';

function getReleaseChannel() {
  if (version.includes('-beta.')) return 'Beta';
  if (version.includes('-alpha.')) return 'Alpha';
  if (version.includes('-rc.')) return 'Release Candidate';
  return 'Stable';
}

function formatVersion() {
  return `อัลเรน v${version} (${getReleaseChannel()})\n${releaseNotes}`;
}

module.exports = { formatVersion, getReleaseChannel, releaseNotes, version };

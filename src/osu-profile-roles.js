const PROFILE_ROLES = {
  osu_team: 'osu! team',
  developers: 'Developers',
  featured_artist: 'Featured Artists',
  gmt: 'Global Moderation Team',
  technical_support: 'Technical Support Team',
  nat: 'Nomination Assessment Team',
  bn: 'Beatmap Nominators',
  alumni: 'osu! Alumni',
  project_loved: 'Project Loved Team',
  spotlight_curators: 'Beatmap Spotlight Curators',
  tournament_committee: 'Tournament Committee',
  loved_mapper: 'Loved Mapper',
  ranked_mapper: 'Ranked Mapper',
};

function activeOsuTeamIds(markdown) {
  const [core] = markdown.split(/^#{1,6}\s+Inactive core team members\s*$/im);
  const ids = new Set([...core.matchAll(
    /^\s*\|?\s*\[[^\]\n]+\]\((?:https:\/\/osu\.ppy\.sh)?\/users\/(\d+)\)\s*\|/gm,
  )].map((match) => match[1]));
  if (!ids.size) throw new Error('Could not read the active osu! team roster.');
  return ids;
}

function eligibleProfileRoles(profile, teamIds = new Set()) {
  const groups = Array.isArray(profile.groups) ? profile.groups : [];
  const hasGroup = (ids, identifiers, names) => groups.some((group) =>
    ids.includes(Number(group.id)) || identifiers.includes(group.identifier) || names.includes(group.name?.toLowerCase()));

  return new Set([
    teamIds.has(String(profile.id)) && 'osu_team',
    hasGroup([11], [], ['developers']) && 'developers',
    hasGroup([35], ['fa'], ['featured artist', 'featured artists']) && 'featured_artist',
    (profile.is_gmt === true || hasGroup([4], ['gmt'], ['global moderation team'])) && 'gmt',
    hasGroup([22], [], ['technical support team']) && 'technical_support',
    (profile.is_nat === true || hasGroup([7], ['nat'], ['nomination assessment team'])) && 'nat',
    (profile.is_bng === true || hasGroup([28, 32], ['bng', 'bng_limited'], ['beatmap nominators', 'beatmap nominators (probationary)'])) && 'bn',
    hasGroup([16], [], ['osu! alumni']) && 'alumni',
    hasGroup([31], ['loved', 'lvd'], ['project loved', 'project loved team']) && 'project_loved',
    hasGroup([48], [], ['beatmap spotlight curators']) && 'spotlight_curators',
    hasGroup([50], [], ['tournament committee']) && 'tournament_committee',
    profile.loved_beatmapset_count > 0 && 'loved_mapper',
    profile.ranked_beatmapset_count > 0 && 'ranked_mapper',
  ].filter(Boolean));
}

module.exports = { PROFILE_ROLES, activeOsuTeamIds, eligibleProfileRoles };

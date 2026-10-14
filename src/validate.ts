import type { ApiSchedule, Match, Source } from './types.js';
import { periodScore, teamOnSide } from './parse.js';

export function validateMatches(matches: Match[], source: Source): Match[] {
  // This separate API index is not inferred from the result records under test.
  const expected = new Set(
    source.eventUnits
      .filter(
        (u) =>
          u.code.startsWith('FBL') && u.type === 'HTEAM' && u.scheduled === 'Y',
      )
      .map((u) => u.code),
  );
  if (!expected.size) throw new Error('Empty football event-unit index');
  const schedules = new Map<string, ApiSchedule>();
  for (const row of source.schedules) {
    if (row.discipline.code !== 'FBL' || row.eventUnit.type !== 'HTEAM')
      continue;
    if (!expected.has(row.code))
      throw new Error('Unexpected schedule match: ' + row.code);
    const previous = schedules.get(row.code);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row))
      throw new Error('Conflicting schedule: ' + row.code);
    schedules.set(row.code, row);
  }
  const byId = new Map<string, Match>();
  const identities = new Set<string>();
  const numbers = new Set<string>();
  for (const match of matches) {
    if (!expected.has(match.id))
      throw new Error('Unexpected result: ' + match.id);
    const previous = byId.get(match.id);
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(match))
        throw new Error('Conflicting result: ' + match.id);
      continue;
    }
    const identity = JSON.stringify([
      match.gender,
      Date.parse(match.kickoff),
      match.round,
      match.home,
      match.away,
    ]);
    const number = match.gender + '-' + match.number;
    if (identities.has(identity) || numbers.has(number))
      throw new Error('Match identity collision: ' + match.id);
    identities.add(identity);
    numbers.add(number);
    byId.set(match.id, match);
    const schedule = schedules.get(match.id);
    if (!schedule?.result)
      throw new Error('Missing schedule result: ' + match.id);
    const home = teamOnSide(schedule.result.items, 'HOME');
    const away = teamOnSide(schedule.result.items, 'AWAY');
    const scheduleScore = {
      ...periodScore(schedule.result.periods, 'TOT'),
      halfTime: periodScore(schedule.result.periods, 'H1'),
    };
    if (
      home.participant.name !== match.home ||
      away.participant.name !== match.away ||
      home.participant.organisation.code !== match.homeCode ||
      away.participant.organisation.code !== match.awayCode ||
      JSON.stringify(scheduleScore) !== JSON.stringify(match.score)
    )
      throw new Error('Schedule/result mismatch: ' + match.id);
    const detail = source.results.find((r) => r.eventUnitCode === match.id)!;
    if (
      Date.parse(detail.schedule.startDate) !== Date.parse(match.kickoff) ||
      detail.schedule.venue.description !== match.venue ||
      detail.schedule.location.description !== schedule.location.description ||
      detail.eventUnit.shortDescription !== match.round
    )
      throw new Error('Detailed schedule mismatch: ' + match.id);
    if (
      match.home === match.away ||
      match.goals.some((g) => g.team !== match.home && g.team !== match.away)
    )
      throw new Error('Invalid teams');
    for (const side of ['home', 'away'] as const) {
      const goals = match.goals.filter((g) => g.team === match[side]);
      const knownFirstHalf = goals.filter(
        (g) =>
          g.minute !== null && Number(String(g.minute).split('+')[0]) <= 45,
      ).length;
      const unknown = goals.filter((g) => g.minute === null).length;
      if (
        goals.length !== match.score[side] ||
        knownFirstHalf > match.score.halfTime[side] ||
        knownFirstHalf + unknown < match.score.halfTime[side]
      )
        throw new Error('Goals/score mismatch: ' + match.id);
    }
  }
  for (const id of expected) {
    if (!schedules.has(id) || !byId.has(id))
      throw new Error('Missing schedule or result: ' + id);
  }
  return [...byId.values()];
}

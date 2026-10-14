import type { ApiPeriod, ApiResult, ApiTeam, Match, Source } from './types.js';
import {
  count,
  entry,
  parseGoals,
  parseLineup,
  requiredText,
} from './lineups.js';

export function teamOnSide(items: ApiTeam[], side: 'HOME' | 'AWAY'): ApiTeam {
  const teams = items.filter(
    (t) => entry(t.eventUnitEntries, 'HOME_AWAY') === side,
  );
  if (items.length !== 2 || teams.length !== 1)
    throw new Error('Expected one ' + side + ' team');
  return teams[0];
}
export function periodScore(
  periods: ApiPeriod[],
  code: string,
): { home: number; away: number } {
  const found = periods.filter((p) => p.p_code === code);
  if (found.length !== 1)
    throw new Error('Missing or duplicate score period: ' + code);
  return {
    home: count(found[0].home.score, 'home score'),
    away: count(found[0].away.score, 'away score'),
  };
}
export function parseMatches(source: Source): Match[] {
  const matches: Match[] = [];
  const rawResults = new Map<string, ApiResult>();
  for (const result of source.results) {
    const id = requiredText(result.eventUnitCode, 'result ID');
    if (!id.startsWith('FBL')) continue;
    const previous = rawResults.get(id);
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(result))
        throw new Error('Conflicting result: ' + id);
      continue;
    }
    rawResults.set(id, result);
    try {
      if (!/^FBL[MW]TEAM11[-A-Z0-9]+$/.test(id))
        throw new Error('Invalid football match ID');
      const schedule = source.schedules.find((s) => s.code === id);
      if (!schedule) throw new Error('Missing schedule');
      if (
        result.status.code !== 'OFFICIAL' ||
        schedule.status.code !== 'FINISHED'
      )
        throw new Error('Match is not final');
      const kickoff = requiredText(schedule.startDate, 'kickoff');
      if (
        !/^2024-(07|08)-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:00(?:Z|[+-]\d{2}:\d{2})$/.test(
          kickoff,
        ) ||
        !Number.isFinite(Date.parse(kickoff))
      )
        throw new Error('Invalid kickoff');
      const home = teamOnSide(result.items, 'HOME');
      const away = teamOnSide(result.items, 'AWAY');
      const venue = requiredText(schedule.venue.description, 'venue');
      const location = requiredText(schedule.location.description, 'location');
      const cityIndex = location.lastIndexOf(', ');
      if (cityIndex < 0 || !location.slice(cityIndex + 2).trim())
        throw new Error('Missing city in location');
      const number = count(schedule.unitNum, 'match number');
      if (number < 1) throw new Error('Invalid match number');
      matches.push({
        id,
        gender: id.startsWith('FBLM') ? 'Men' : 'Women',
        number,
        kickoff,
        round: requiredText(schedule.eventUnit.shortDescription, 'round'),
        venue,
        city: location.slice(cityIndex + 2),
        home: requiredText(home.participant.name, 'home name'),
        away: requiredText(away.participant.name, 'away name'),
        homeShort: home.participant.shortName ?? home.participant.name,
        awayShort: away.participant.shortName ?? away.participant.name,
        homeCode: requiredText(
          home.participant.organisation.code,
          'home country code',
        ),
        awayCode: requiredText(
          away.participant.organisation.code,
          'away country code',
        ),
        status: result.periods.some((p) => p.p_code === 'PSO')
          ? 'PEN'
          : result.periods.some((p) => p.p_code === 'ET-H2')
            ? 'AET'
            : 'FT',
        score: {
          ...periodScore(result.periods, 'TOT'),
          halfTime: periodScore(result.periods, 'H1'),
        },
        goals: parseGoals(result),
        homeLineup: parseLineup(home),
        awayLineup: parseLineup(away),
      });
    } catch (error) {
      throw new Error(id + ': ' + (error as Error).message);
    }
  }
  return matches;
}

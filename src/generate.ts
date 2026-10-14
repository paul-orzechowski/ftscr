import type { Match, Selection, Source } from './types.js';
import { validateMatches } from './validate.js';
import { parseMatches } from './parse.js';
import { selectMatches } from './filter.js';

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
export function sortMatches(matches: Match[]): Match[] {
  return [...matches].sort(
    (a, b) =>
      Date.parse(a.kickoff) - Date.parse(b.kickoff) ||
      compareText(a.gender, b.gender) ||
      compareText(a.round, b.round) ||
      compareText(a.home, b.home) ||
      compareText(a.away, b.away) ||
      compareText(a.id, b.id),
  );
}
export function generate(source: Source, selection: Selection = {}): string {
  // Validate the complete snapshot before narrowing it to the requested matches.
  const matches = validateMatches(parseMatches(source), source);
  const responses = sortMatches(selectMatches(matches, selection)).map(
    (match) => ({
      competition: {
        name: 'Olympic Games ' + match.gender,
        season: '2024',
        round: match.round,
      },
      venue: { name: match.venue, city: match.city },
      kickoff: match.kickoff,
      status: match.status,
      teams: { home: match.home, away: match.away },
      score: match.score,
      scorers: match.goals,
      lineups: { home: match.homeLineup, away: match.awayLineup },
    }),
  );
  return JSON.stringify(responses, null, 2) + '\n';
}

import type { Match, Selection } from './types.js';

export function selectMatches(matches: Match[], selection: Selection): Match[] {
  const { team, opponent, gender, date } = selection;
  if (opponent && !team) throw new Error('--opponent requires --team');
  if (date && !opponent)
    throw new Error('--date requires --team and --opponent');
  if (gender && !['men', 'women'].includes(gender.toLowerCase()))
    throw new Error('--gender must be men or women');
  if (
    date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date)
  )
    throw new Error('--date must be a valid YYYY-MM-DD date');
  const countryCode = (query: string): string => {
    const value = query.trim().toLowerCase();
    const codes = new Set<string>();
    for (const match of matches) {
      if (
        [match.home, match.homeShort, match.homeCode].some(
          (name) => name.toLowerCase() === value,
        )
      )
        codes.add(match.homeCode);
      if (
        [match.away, match.awayShort, match.awayCode].some(
          (name) => name.toLowerCase() === value,
        )
      )
        codes.add(match.awayCode);
    }
    if (codes.size !== 1)
      throw new Error(
        'Unknown or ambiguous country: ' +
          query +
          '. Use its English name or IOC code, e.g. France / FRA.',
      );
    return [...codes][0];
  };
  const code = team ? countryCode(team) : undefined;
  const other = opponent ? countryCode(opponent) : undefined;
  if (code && code === other) throw new Error('Choose two different countries');
  const selected = matches.filter(
    (m) =>
      (!gender || m.gender.toLowerCase() === gender.toLowerCase()) &&
      (!code || [m.homeCode, m.awayCode].includes(code)) &&
      (!other || [m.homeCode, m.awayCode].includes(other)) &&
      (!date || m.kickoff.slice(0, 10) === date),
  );
  if (!selected.length)
    throw new Error('No matches for the selected countries, gender and date');
  if (opponent && selected.length > 1) {
    throw new Error(
      'Multiple matches; choose --date and/or --gender: ' +
        selected
          .map((m) => m.kickoff.slice(0, 10) + ' ' + m.gender.toLowerCase())
          .join(', '),
    );
  }
  return selected;
}

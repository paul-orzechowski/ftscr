import type {
  ApiAction,
  ApiEntry,
  ApiResult,
  ApiTeam,
  Goal,
  Lineup,
  Minute,
} from './types.js';

export function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Missing ' + field);
  return value;
}
export function count(value: unknown, field: string): number {
  if (
    typeof value !== 'string' ||
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  ) {
    throw new Error('Invalid ' + field);
  }
  return Number(value);
}
export function entry(
  entries: ApiEntry[],
  code: string,
  position?: string,
): string | null {
  const values = entries.filter(
    (e) => e.eue_code === code && (!position || e.eue_pos === position),
  );
  if (values.length > 1) throw new Error('Duplicate entry: ' + code);
  return values[0]?.eue_value ?? null;
}
export function parseMinute(value: string): Minute {
  const match = /^(\d{1,3})'(?:\s*\+(\d{1,2}))?$/.exec(value);
  if (
    !match ||
    Number(match[1]) < 1 ||
    Number(match[1]) > 120 ||
    (match[2] &&
      (!['45', '90', '105', '120'].includes(match[1]) || Number(match[2]) < 1))
  ) {
    throw new Error('Invalid goal minute: ' + value);
  }
  return match[2]
    ? Number(match[1]) + '+' + Number(match[2])
    : Number(match[1]);
}
export function minuteOrder(minute: Minute): number {
  if (minute === null) return Infinity;
  const [base, added = '0'] = String(minute).split('+');
  return Number(base) * 1000 + Number(added);
}
export function parseLineup(team: ApiTeam): Lineup {
  const formation = entry(team.eventUnitEntries, 'FORMATION');
  const lineup: Lineup = {
    team: requiredText(team.participant.name, 'team name'),
    formation: formation === null ? null : requiredText(formation, 'formation'),
    coach: null,
    startingXI: [],
    bench: [],
  };
  const coaches = team.teamCoaches ?? [];
  const coach =
    coaches.find((c) => c.function.functionCode === 'SI_COA') ??
    coaches.find((c) => c.function.functionCode === 'COACH');
  if (coach) lineup.coach = requiredText(coach.coach.name, 'coach name');
  for (const athlete of team.teamAthletes ?? []) {
    const status = entry(athlete.eventUnitEntries, 'STATUS');
    if (status && ['ABSENT', 'SUSPEND', 'INJURED'].includes(status)) continue;
    const player = {
      name: requiredText(athlete.athlete.name, 'player name'),
      number: count(athlete.bib, 'shirt number'),
      position: requiredText(
        entry(athlete.eventUnitEntries, 'POSITION', '1'),
        'player position',
      ),
    };
    if (!['GK', 'DF', 'MF', 'FW'].includes(player.position))
      throw new Error('Invalid player position');
    (entry(athlete.eventUnitEntries, 'STARTER') === 'Y'
      ? lineup.startingXI
      : lineup.bench
    ).push(player);
  }
  const numbers = [...lineup.startingXI, ...lineup.bench].map((p) => p.number);
  const ids = (team.teamAthletes ?? []).map((p) => p.participantCode);
  if (
    lineup.startingXI.length !== 11 ||
    new Set(numbers).size !== numbers.length ||
    new Set(ids).size !== ids.length
  ) {
    throw new Error('Invalid or duplicate lineup players: ' + lineup.team);
  }
  lineup.startingXI.sort((a, b) => a.number - b.number);
  lineup.bench.sort((a, b) => a.number - b.number);
  return lineup;
}

export function parseGoals(result: ApiResult): Goal[] {
  const goals: Goal[] = [];
  const actions = new Map<string, ApiAction>();
  for (const period of result.playByPlay) {
    for (const action of period.actions) {
      if (action.pbpa_Result !== 'GOAL' || action.pbpa_period === 'PSO')
        continue;
      const id = requiredText(action.pbpa_id, 'goal action ID');
      const previous = actions.get(id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(action))
        throw new Error('Conflicting goal action: ' + id);
      actions.set(id, action);
    }
  }
  for (const action of actions.values()) {
    const ownGoal = action.pbpa_Action === 'OG';
    if (!['SHOT', 'PEN', 'FRD', 'OG'].includes(action.pbpa_Action))
      throw new Error('Unknown goal action type');
    if (action.competitors.length !== 1) throw new Error('Ambiguous goal team');
    const competitor = action.competitors[0];
    const team = result.items.find((t) => t.teamCode === competitor.pbpc_code);
    if (!team) throw new Error('Unknown goal team');
    const scorers = competitor.athletes.filter(
      (a) => ownGoal || a.pbpat_role === 'SCR',
    );
    const assists = competitor.athletes.filter(
      (a) => a.pbpat_role === 'ASSIST',
    );
    if (scorers.length !== 1 || assists.length > 1)
      throw new Error('Ambiguous scorer/assist');
    if (assists[0]?.pbpat_code === scorers[0].pbpat_code)
      throw new Error('A player cannot assist their own goal');
    const playerName = (code: string): string => {
      const player = team.teamAthletes?.find((p) => p.participantCode === code);
      return requiredText(player?.athlete.name, 'goal/assist player ' + code);
    };
    const credited = ownGoal ? result.items.find((t) => t !== team) : team;
    const goal: Goal = {
      team: requiredText(credited?.participant.name, 'credited goal team'),
      player: playerName(scorers[0].pbpat_code),
      minute: parseMinute(action.pbpa_When),
      type: ownGoal
        ? 'own_goal'
        : action.pbpa_Action === 'PEN'
          ? 'penalty'
          : action.pbpa_Action === 'FRD'
            ? 'free_kick'
            : null,
    };
    if (assists.length) goal.assist = playerName(assists[0].pbpat_code);
    goals.push(goal);
  }
  // The API's USA-Guinea timeline omits two goals. Per-player GF totals still
  // identify their scorers. Keep unknown minutes/types null; never invent events.
  for (const team of result.items) {
    for (const player of team.teamAthletes ?? []) {
      const stats = (player.statsItems ?? []).filter((s) => s.code === 'GF');
      if (stats.length > 1) throw new Error('Duplicate player goal statistic');
      const total = stats.length
        ? count(stats[0].value, 'player goal total')
        : 0;
      const recorded = goals.filter(
        (g) =>
          g.type !== 'own_goal' &&
          g.team === team.participant.name &&
          g.player === player.athlete.name,
      ).length;
      if (recorded > total)
        throw new Error(
          'Player goals/statistics mismatch: ' + player.athlete.name,
        );
      for (let missing = recorded; missing < total; missing++) {
        goals.push({
          team: team.participant.name,
          player: player.athlete.name,
          minute: null,
          type: null,
        });
      }
    }
  }
  return goals.sort(
    (a, b) =>
      minuteOrder(a.minute) - minuteOrder(b.minute) ||
      (a.player < b.player ? -1 : a.player > b.player ? 1 : 0),
  );
}

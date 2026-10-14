// Only the API fields used by the CLI are described here.
export interface ApiEntry {
  eue_code: string;
  eue_value?: string;
  eue_pos?: string;
}
export interface ApiStat {
  code: string;
  value?: string;
}
export interface ApiPlayer {
  bib: string;
  participantCode: string;
  startSortOrder: number;
  athlete: { code: string; name: string };
  eventUnitEntries: ApiEntry[];
  statsItems?: ApiStat[];
}
export interface ApiTeam {
  teamCode: string;
  participant: {
    name: string;
    shortName?: string;
    organisation: { code: string };
  };
  eventUnitEntries: ApiEntry[];
  teamAthletes?: ApiPlayer[];
  teamCoaches?: {
    function: { functionCode: string };
    coach: { name: string };
  }[];
}
export interface ApiPeriod {
  p_code: string;
  home: { score: string };
  away: { score: string };
}
export interface ApiAction {
  pbpa_id: string;
  pbpa_period: string;
  pbpa_Action: string;
  pbpa_Result?: string;
  pbpa_When: string;
  competitors: {
    pbpc_code: string;
    athletes: { pbpat_code: string; pbpat_role?: string }[];
  }[];
}
export interface ApiSchedule {
  code: string;
  unitNum?: string;
  startDate: string;
  discipline: { code: string };
  eventUnit: { type: string; shortDescription: string };
  venue: { description: string };
  location: { description: string };
  status: { code: string };
  result?: { periods: ApiPeriod[]; items: ApiTeam[] };
}
export interface ApiResult {
  eventUnitCode: string;
  status: { code: string };
  schedule: {
    startDate: string;
    venue: { description: string };
    location: { description: string };
  };
  eventUnit: { shortDescription: string };
  periods: ApiPeriod[];
  items: ApiTeam[];
  playByPlay: { subcode: string; actions: ApiAction[] }[];
}
export interface Source {
  eventUnits: { code: string; type: string; scheduled: string }[];
  schedules: ApiSchedule[];
  results: ApiResult[];
}
export type Gender = 'Men' | 'Women';
export type Minute = number | string | null;
export interface Player {
  name: string;
  number: number;
  position: string;
}
export interface Lineup {
  team: string;
  formation: string | null;
  coach: string | null;
  startingXI: Player[];
  bench: Player[];
}
export interface Goal {
  team: string;
  player: string;
  minute: Minute;
  assist?: string;
  type: 'penalty' | 'own_goal' | 'free_kick' | null;
}
export interface Match {
  id: string;
  gender: Gender;
  number: number;
  kickoff: string;
  round: string;
  venue: string;
  city: string;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  homeShort: string;
  awayShort: string;
  status: 'FT' | 'AET' | 'PEN';
  score: {
    home: number;
    away: number;
    halfTime: { home: number; away: number };
  };
  goals: Goal[];
  homeLineup: Lineup;
  awayLineup: Lineup;
}
export interface Selection {
  team?: string;
  opponent?: string;
  gender?: string;
  date?: string;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMatches } from '../dist/parse.js';
import { parseMinute } from '../dist/lineups.js';
import { generate } from '../dist/generate.js';
const source = JSON.parse(readFileSync('fixtures/source.json', 'utf8'));
const matches = parseMatches(source);
const find = (id) => matches.find((m) => m.id === id);

test('both tournaments cover all group, knockout and medal rounds', () => {
  for (const gender of ['Men', 'Women'])
    assert.deepEqual(
      [
        ...new Set(
          matches.filter((m) => m.gender === gender).map((m) => m.round),
        ),
      ].sort(),
      (gender === 'Men'
        ? ['Group A', 'Group B', 'Group C', 'Group D']
        : ['Group A', 'Group B', 'Group C']
      )
        .concat([
          'Quarter-final',
          'Semi-final',
          'Bronze Medal Match',
          'Gold Medal Match',
        ])
        .sort(),
    );
});

test('reads extra time and stoppage time without confusing the first-half score', () => {
  const match = find('FBLMTEAM11------------FNL-000100--');
  assert.equal(match.status, 'AET');
  assert.deepEqual(match.score, {
    home: 3,
    away: 5,
    halfTime: { home: 1, away: 3 },
  });
  assert.equal(
    match.goals.find((g) => g.player === 'MATETA Jean-Philippe').minute,
    '90+3',
  );
  assert.deepEqual(match.goals.at(-1), {
    team: 'Spain',
    player: 'CAMELLO Sergio',
    minute: '120+1',
    assist: 'TENAS Arnau',
    type: null,
  });
});

test('shoot-out kicks stay separate from the match score and goals', () => {
  const match = find('FBLMTEAM11------------QFNL000200--');
  assert.equal(match.status, 'PEN');
  assert.deepEqual(match.score, {
    home: 1,
    away: 1,
    halfTime: { home: 0, away: 0 },
  });
  assert.equal(match.goals.length, 2);
});

test('own goals credit the opponent and direct free kicks use the explicit FRD code', () => {
  const own = matches
    .flatMap((m) => m.goals)
    .filter((g) => g.type === 'own_goal');
  assert.equal(own.length, 4);
  assert.deepEqual(
    own.find((g) => g.player === 'HAMANO Maika'),
    undefined,
  );
  assert.ok(
    own.some((g) => g.team === 'Israel' && g.player === 'DIALLO Hamidou'),
  );
  assert.equal(
    matches.flatMap((m) => m.goals).filter((g) => g.type === 'free_kick')
      .length,
    6,
  );
});

test('missing formation and head/stand-in coach remain null; unavailable players are excluded', () => {
  const changed = structuredClone(source);
  const t = changed.results[0].items[0];
  t.eventUnitEntries = t.eventUnitEntries.filter(
    (e) => e.eue_code !== 'FORMATION',
  );
  t.teamCoaches = [];
  const match = parseMatches(changed)[0];
  assert.equal(match.homeLineup.formation, null);
  assert.equal(match.homeLineup.coach, null);
  for (const m of matches) assert.equal(m.homeLineup.startingXI.length, 11);
  const colombia = find('FBLWTEAM11------------GPA-000600--');
  assert.ok(
    !colombia.homeLineup.bench.some((p) => p.number === 9 || p.number === 11),
  );
});

test('complete minute parsing rejects invalid suffixes and preserves added time', () => {
  assert.equal(parseMinute("45' +2"), '45+2');
  assert.equal(parseMinute("61'"), 61);
  for (const minute of [
    "90'+oops",
    "61'junk",
    "45'+0",
    "44'+3",
    "121'",
    'unknown',
  ])
    assert.throws(() => parseMinute(minute), /minute/);
});

test('rejects malformed players, unknown assist IDs and ambiguous scorers', () => {
  for (const change of [
    (s) => {
      s.results[0].items[0].teamAthletes[0].bib = 'oops';
    },
    (s) => {
      s.results[0].items[0].teamAthletes[0].athlete.name = '';
    },
    (s) => {
      const goal = s.results[0].playByPlay
        .flatMap((p) => p.actions)
        .find(
          (a) =>
            a.pbpa_Result === 'GOAL' &&
            a.competitors[0].athletes.some((p) => p.pbpat_role === 'ASSIST'),
        );
      goal.competitors[0].athletes.find(
        (p) => p.pbpat_role === 'ASSIST',
      ).pbpat_code = 'unknown';
    },
    (s) => {
      const goal = s.results[0].playByPlay
        .flatMap((p) => p.actions)
        .find((a) => a.pbpa_Result === 'GOAL');
      goal.competitors[0].athletes.push({ ...goal.competitors[0].athletes[0] });
    },
  ]) {
    const changed = structuredClone(source);
    change(changed);
    assert.throws(() => generate(changed));
  }
});

test('formation must be a string or null, never a different JSON type', () => {
  for (const value of [442, '']) {
    const changed = structuredClone(source);
    changed.results[0].items[0].eventUnitEntries.find(
      (e) => e.eue_code === 'FORMATION',
    ).eue_value = value;
    assert.throws(() => generate(changed), /formation/);
  }
});

test('rejects a player assisting their own goal', () => {
  const changed = structuredClone(source);
  const r = changed.results.find(
    (r) => r.eventUnitCode === 'FBLMTEAM11------------GPA-000100--',
  );
  const a = r.playByPlay
    .flatMap((p) => p.actions)
    .find((a) => a.pbpa_Result === 'GOAL' && a.pbpa_When === "61'");
  const players = a.competitors[0].athletes;
  players.find((p) => p.pbpat_role === 'ASSIST').pbpat_code = players.find(
    (p) => p.pbpat_role === 'SCR',
  ).pbpat_code;
  assert.throws(() => generate(changed), /assist/);
});

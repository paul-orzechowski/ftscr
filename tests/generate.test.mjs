import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generate, sortMatches } from '../dist/generate.js';
import { minuteOrder } from '../dist/lineups.js';
const source = JSON.parse(readFileSync('fixtures/source.json', 'utf8'));

test('matches a complete independently checked API golden response and example field names', () => {
  const result = JSON.parse(generate(source));
  const golden = JSON.parse(
    readFileSync('tests/fixtures/france-usa.json', 'utf8'),
  );
  assert.deepEqual(
    result.find(
      (m) =>
        m.teams.home === 'France' &&
        m.teams.away === 'United States of America',
    ),
    golden,
  );
  const example = JSON.parse(readFileSync('example.json', 'utf8'));
  for (const match of result) {
    assert.deepEqual(Object.keys(match), Object.keys(example));
    for (const field of ['competition', 'venue', 'teams', 'score', 'lineups'])
      assert.deepEqual(Object.keys(match[field]), Object.keys(example[field]));
    for (const side of ['home', 'away']) {
      assert.deepEqual(
        Object.keys(match.lineups[side]),
        Object.keys(example.lineups[side]),
      );
      for (const p of [
        ...match.lineups[side].startingXI,
        ...match.lineups[side].bench,
      ])
        assert.deepEqual(Object.keys(p), ['name', 'number', 'position']);
    }
  }
});

test('output is byte-identical after reversing API records, teams, players and timeline events', () => {
  const first = generate(source);
  assert.equal(first, generate(source));
  const reversed = structuredClone(source);
  reversed.eventUnits.reverse();
  reversed.schedules.reverse();
  reversed.results.reverse();
  for (const r of reversed.results) {
    r.items.reverse();
    r.playByPlay.reverse();
    for (const p of r.playByPlay) p.actions.reverse();
    for (const t of r.items) t.teamAthletes.reverse();
  }
  assert.equal(first, generate(reversed));
});

test('sorts by kickoff instant and stable ties; unknown goal minutes sort last', () => {
  const a = {
    id: 'b',
    kickoff: '2024-07-25T00:30:00+02:00',
    gender: 'Men',
    round: 'Group A',
    home: 'France',
    away: 'USA',
  };
  const b = { ...a, id: 'a', kickoff: '2024-07-24T23:00:00Z' };
  const c = { ...a, id: 'c', gender: 'Women' };
  const d = { ...a, id: 'a' };
  assert.deepEqual(
    sortMatches([b, c, a, d]).map((m) => m.id),
    ['a', 'b', 'c', 'a'],
  );
  assert.ok(minuteOrder('45+10') < minuteOrder(46));
  assert.ok(minuteOrder('90+12') < minuteOrder(91));
  assert.ok(minuteOrder(null) > minuteOrder('120+10'));
});

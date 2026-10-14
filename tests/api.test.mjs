import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMatches } from '../dist/parse.js';
import { generate } from '../dist/generate.js';

const source = JSON.parse(readFileSync('fixtures/source.json', 'utf8'));

test('API-only source covers 58 matches and excludes medal ceremonies', () => {
  const matches = parseMatches(source);
  assert.equal(source.schedules.length, 60);
  assert.equal(matches.length, 58);
  assert.equal(matches.filter((m) => m.gender === 'Men').length, 32);
  assert.equal(matches.filter((m) => m.gender === 'Women').length, 26);
  assert.equal(matches.flatMap((m) => m.goals).length, 172);
});

test('uses formations and stand-in coaches supplied by the API', () => {
  const matches = parseMatches(source);
  const france = matches.find(
    (m) => m.id === 'FBLMTEAM11------------GPA-000100--',
  );
  assert.equal(france.homeLineup.formation, '4-2-3-1');
  assert.equal(france.away, 'United States of America');
  const canada = matches.find(
    (m) => m.id === 'FBLWTEAM11------------GPA-000600--',
  );
  assert.equal(canada.awayLineup.coach, 'SPENCE Andy');
});

test('preserves the API timeline gap as null minutes using explicit player goal totals', () => {
  const match = parseMatches(source).find(
    (m) => m.id === 'FBLMTEAM11------------GPA-000600--',
  );
  assert.deepEqual(match.score, {
    home: 3,
    away: 0,
    halfTime: { home: 2, away: 0 },
  });
  assert.deepEqual(
    match.goals
      .filter((g) => g.minute === null)
      .map((g) => g.player)
      .sort(),
    ['MIHAILOVIC Djordje', 'PAREDES Kevin'],
  );
  assert.equal(match.goals.find((g) => g.minute === 75).assist, 'McGLYNN Jack');
});

test('supports all, country and country-versus-country output', () => {
  assert.equal(JSON.parse(generate(source)).length, 58);
  assert.equal(
    JSON.parse(generate(source, { team: 'fra', gender: 'men' })).length,
    6,
  );
  const one = JSON.parse(
    generate(source, { team: 'France', opponent: 'ESP', gender: 'men' }),
  );
  assert.equal(one.length, 1);
  assert.deepEqual(one[0].score, {
    home: 3,
    away: 5,
    halfTime: { home: 1, away: 3 },
  });
});

test('ambiguous country pair requires a date instead of picking an arbitrary match', () => {
  assert.throws(
    () =>
      generate(source, { team: 'USA', opponent: 'Germany', gender: 'women' }),
    /date/,
  );
  const one = JSON.parse(
    generate(source, {
      team: 'USA',
      opponent: 'GER',
      gender: 'women',
      date: '2024-08-06',
    }),
  );
  assert.equal(one.length, 1);
  assert.equal(one[0].status, 'AET');
});

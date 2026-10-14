import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generate } from '../dist/generate.js';
import { parseMatches } from '../dist/parse.js';
import { validateMatches } from '../dist/validate.js';
const source = JSON.parse(readFileSync('fixtures/source.json', 'utf8'));

test('reconciles every match against the independent event-unit index', () => {
  assert.equal(validateMatches(parseMatches(source), source).length, 58);
  const missing = structuredClone(source);
  const id = missing.results.pop().eventUnitCode;
  missing.schedules = missing.schedules.filter((s) => s.code !== id);
  assert.throws(() => generate(missing), /Missing schedule or result/);
  assert.throws(
    () => generate({ eventUnits: [], schedules: [], results: [] }),
    /Empty/,
  );
});

test('ignores other sports and excludes non-match ceremony units', () => {
  const mixed = structuredClone(source);
  mixed.schedules.push({
    ...structuredClone(source.schedules[0]),
    code: 'HBL-example',
    discipline: { code: 'HBL' },
  });
  mixed.results.push({
    ...structuredClone(source.results[0]),
    eventUnitCode: 'HBL-example',
  });
  mixed.eventUnits.push({ code: 'HBL-example', type: 'HTEAM', scheduled: 'Y' });
  assert.equal(generate(mixed), generate(source));
});

test('deduplicates exact API records and rejects conflicting result or schedule records', () => {
  const exact = structuredClone(source);
  exact.schedules.push(structuredClone(exact.schedules[0]));
  exact.results.push(structuredClone(exact.results[0]));
  assert.equal(generate(exact), generate(source));
  exact.results.at(-1).items[0].teamCoaches[0].coach.name = 'Changed';
  assert.throws(() => generate(exact), /Conflicting result/);
  const badSchedule = structuredClone(source);
  badSchedule.schedules.push({
    ...badSchedule.schedules[0],
    startDate: '2024-07-24T22:00:00+02:00',
  });
  assert.throws(() => generate(badSchedule), /Conflicting schedule/);
});

test('rejects unexpected results and collisions of match identity', () => {
  const bad = structuredClone(source);
  bad.eventUnits = bad.eventUnits.filter(
    (u) => u.code !== bad.results[0].eventUnitCode,
  );
  assert.throws(() => generate(bad), /Unexpected/);
  const matches = parseMatches(source);
  const index = {
    ...source,
    eventUnits: [
      ...source.eventUnits,
      { code: 'FBLMTEAM11--OTHER', type: 'HTEAM', scheduled: 'Y' },
    ],
  };
  assert.throws(
    () =>
      validateMatches(
        [...matches, { ...matches[0], id: 'FBLMTEAM11--OTHER' }],
        index,
      ),
    /collision/,
  );
});

test('checks scores, kickoff, teams and player goal totals across API responses', () => {
  for (const change of [
    (s) => {
      s.results[0].periods.find((p) => p.p_code === 'TOT').home.score = '99';
    },
    (s) => {
      s.results[0].schedule.startDate = '2024-08-09T19:00:00+02:00';
    },
    (s) => {
      s.results[0].items[0].participant.organisation.code = 'XXX';
    },
    (s) => {
      s.results[0].items[0].teamAthletes
        .find((p) => p.statsItems?.some((x) => x.code === 'GF'))
        .statsItems.find((x) => x.code === 'GF').value = '0';
    },
    (s) => {
      s.schedules[0].startDate = '2024-07-24T25:00:00+02:00';
    },
  ]) {
    const changed = structuredClone(source);
    change(changed);
    assert.throws(() => generate(changed));
  }
});

test('selecting a country does not conceal an incomplete full snapshot', () => {
  const changed = structuredClone(source);
  changed.results.pop();
  assert.throws(() => generate(changed, { team: 'FRA' }), /Missing/);
});

test('conflicting duplicate detail metadata fails regardless of record order', () => {
  const changed = structuredClone(source);
  const duplicate = structuredClone(changed.results[0]);
  duplicate.schedule.startDate = '2024-08-10T12:00:00+02:00';
  changed.results.push(duplicate);
  assert.throws(() => generate(changed), /Conflicting result/);
  changed.results.reverse();
  assert.throws(() => generate(changed), /Conflicting result/);
});

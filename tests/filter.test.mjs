import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generate } from '../dist/generate.js';
const source = JSON.parse(readFileSync('fixtures/source.json', 'utf8'));

test('country selector accepts case-insensitive English names, short names and IOC codes', () => {
  assert.equal(
    generate(source, { team: '  france ' }),
    generate(source, { team: 'FRA' }),
  );
  assert.equal(
    generate(source, { team: 'United States' }),
    generate(source, { team: 'USA' }),
  );
  assert.equal(JSON.parse(generate(source, { team: 'France' })).length, 10);
  assert.equal(
    JSON.parse(generate(source, { team: 'France', gender: 'women' })).length,
    4,
  );
});

test('country pair is independent of home/away order', () => {
  assert.equal(
    generate(source, { team: 'FRA', opponent: 'ESP', gender: 'men' }),
    generate(source, { team: 'Spain', opponent: 'France', gender: 'men' }),
  );
});

test('rejects unknown countries, invalid filters, no match and ambiguity', () => {
  for (const [selection, pattern] of [
    [{ team: 'Poland' }, /Unknown/],
    [{ opponent: 'ESP' }, /requires/],
    [{ team: 'FRA', date: '2024-08-09' }, /requires/],
    [{ gender: 'kids' }, /men or women/],
    [{ team: 'FRA', opponent: 'France' }, /different/],
    [{ team: 'FRA', opponent: 'ESP', gender: 'women' }, /No matches/],
    [{ team: 'USA', opponent: 'GER', gender: 'women' }, /Multiple matches/],
    [{ team: 'USA', opponent: 'GER', date: '2024-02-30' }, /valid/],
  ])
    assert.throws(() => generate(source, selection), pattern);
});

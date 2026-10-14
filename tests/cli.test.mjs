import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
function cli(...args) {
  return spawnSync(process.execPath, ['dist/cli.js', ...args], {
    encoding: 'utf8',
    maxBuffer: 5_000_000,
  });
}

test('real CLI produces all matches and keeps the source-quality warning on stderr', () => {
  const result = cli('generate', '--input', 'fixtures/source.json');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).length, 58);
  assert.match(result.stderr, /2 goals have no API timeline minute/);
  assert.equal(
    result.stdout,
    cli('generate', '--input', 'fixtures/source.json').stdout,
  );
});

test('real CLI supports country and single-match modes', () => {
  const country = cli(
    'generate',
    '--input',
    'fixtures/source.json',
    '--team',
    'France',
    '--gender',
    'men',
  );
  assert.equal(country.status, 0, country.stderr);
  assert.equal(country.stderr, '');
  assert.equal(JSON.parse(country.stdout).length, 6);
  const one = cli(
    'generate',
    '--input',
    'fixtures/source.json',
    '--team',
    'USA',
    '--opponent',
    'GER',
    '--gender',
    'women',
    '--date',
    '2024-08-06',
  );
  assert.equal(one.status, 0, one.stderr);
  assert.equal(JSON.parse(one.stdout).length, 1);
  const ambiguous = cli(
    'generate',
    '--input',
    'fixtures/source.json',
    '--team',
    'USA',
    '--opponent',
    'GER',
    '--gender',
    'women',
  );
  assert.equal(ambiguous.status, 1);
  assert.equal(ambiguous.stdout, '');
  assert.match(ambiguous.stderr, /2024-07-28.*2024-08-06/);
});

test('help documents all modes; invalid arguments and missing files fail clearly', () => {
  const help = cli('--help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--team/);
  assert.match(help.stdout, /--opponent/);
  for (const args of [
    [],
    ['unknown'],
    ['generate', '--input', 'missing.json'],
    ['generate', '--unknown'],
    ['fetch'],
    ['generate', '--team', ''],
    ['fetch', '--output', 'x.json', '--team', 'FRA'],
  ]) {
    const result = cli(...args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.length > 0);
  }
});

test('file output matches stdout and failed validation preserves an existing output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'footyscores-cli-'));
  try {
    const output = join(directory, 'matches.json');
    const result = cli(
      'generate',
      '--input',
      'fixtures/source.json',
      '--output',
      output,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(
      readFileSync(output, 'utf8'),
      cli('generate', '--input', 'fixtures/source.json').stdout,
    );
    const input = join(directory, 'bad.json');
    writeFileSync(input, '{"eventUnits":[],"schedules":[],"results":[]}');
    writeFileSync(output, 'keep me');
    const failure = cli('generate', '--input', input, '--output', output);
    assert.equal(failure.status, 1);
    assert.equal(failure.stdout, '');
    assert.equal(readFileSync(output, 'utf8'), 'keep me');
    assert.equal(
      cli('generate', '--input', input, '--output', input).status,
      1,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

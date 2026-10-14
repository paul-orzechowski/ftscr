import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fetchSource, readSource, apiHeaders } from '../dist/source.js';
import { generate } from '../dist/generate.js';
const source = JSON.parse(readFileSync('fixtures/source.json', 'utf8'));

function apiResponse(url) {
  if (url.includes('/GLO_EventUnits~'))
    return { eventUnits: source.eventUnits };
  if (url.includes('/SCH_DaysByDiscipline~'))
    return {
      competition_schedule: [
        ...new Set(source.schedules.map((s) => s.startDate.slice(0, 10))),
      ].map((date) => ({ date, discipline: { code: 'FBL' } })),
    };
  if (url.includes('/SCH_ByDisciplineH2H~')) {
    const date = url.match(/~date=(.+)\.json$/)[1];
    return {
      schedules: source.schedules.filter(
        (s) => s.startDate.slice(0, 10) === date,
      ),
    };
  }
  if (url.includes('/RES_ByRSC_H2H~')) {
    const id = url.match(/~rscResult=([^~]+)/)[1];
    return { results: source.results.find((r) => r.eventUnitCode === id) };
  }
  throw new Error('Unexpected API request: ' + url);
}

test('fetch follows official API IDs and dates and writes a reproducible, complete snapshot', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'footyscores-api-fetch-'));
  const original = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(new URL(url).origin, 'https://stacy.olympics.com');
      assert.deepEqual(options.headers, apiHeaders);
      calls.push(url);
      return new Response(JSON.stringify(apiResponse(url)), { status: 200 });
    };
    const output = join(directory, 'source.json');
    await fetchSource(output);
    assert.equal(calls.length, 73);
    assert.equal(new Set(calls).size, 73);
    assert.equal(generate(await readSource(output)), generate(source));
    const manifest = JSON.parse(
      readFileSync(join(directory, 'manifest.json'), 'utf8'),
    );
    assert.equal(manifest.responses.length, 73);
    assert.match(manifest.snapshotSha256, /^[a-f0-9]{64}$/);
  } finally {
    globalThis.fetch = original;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('failed API requests and reserved filenames do not overwrite existing files', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'footyscores-api-fail-'));
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response('Access denied', { status: 403 });
    const output = join(directory, 'source.json');
    writeFileSync(output, 'keep me');
    await assert.rejects(fetchSource(output), /API HTTP 403/);
    assert.equal(readFileSync(output, 'utf8'), 'keep me');
    const reserved = join(directory, 'manifest.json');
    writeFileSync(reserved, 'keep manifest');
    await assert.rejects(fetchSource(reserved), /reserved/);
    assert.equal(readFileSync(reserved, 'utf8'), 'keep manifest');
  } finally {
    globalThis.fetch = original;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects malformed snapshots before parsing', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'footyscores-api-read-'));
  try {
    const input = join(directory, 'bad.json');
    for (const value of [
      'not json',
      'null',
      '{}',
      '{"eventUnits":[null],"schedules":[],"results":[]}',
    ]) {
      writeFileSync(input, value);
      await assert.rejects(readSource(input));
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import type { ApiResult, ApiSchedule, Source } from './types.js';
import { generate } from './generate.js';

const base = 'https://stacy.olympics.com/OG2024/data/';
export const apiHeaders = {
  accept: 'application/json',
  'user-agent': 'Mozilla/5.0',
  referer: 'https://stacy.olympics.com/en/paris-2024/competition-schedule',
};
function checksum(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
export async function readSource(filename: string): Promise<Source> {
  const source: unknown = JSON.parse(await readFile(filename, 'utf8'));
  if (!source || typeof source !== 'object')
    throw new Error('Source must be a JSON object');
  for (const key of ['eventUnits', 'schedules', 'results'] as const) {
    const rows = (source as Source)[key];
    if (
      !Array.isArray(rows) ||
      rows.some((row) => !row || typeof row !== 'object')
    ) {
      throw new Error('Source ' + key + ' must be an array of API objects');
    }
  }
  return source as Source;
}
export async function fetchSource(output: string): Promise<void> {
  if (basename(output).toLowerCase() === 'manifest.json')
    throw new Error('manifest.json is a reserved output filename');
  const responses: { url: string; sha256: string }[] = [];
  async function request<T>(name: string): Promise<T> {
    const url = base + name;
    const response = await fetch(url, {
      headers: apiHeaders,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new Error('API HTTP ' + response.status + ': ' + url);
    const text = await response.text();
    const data: T = JSON.parse(text);
    responses.push({ url, sha256: checksum(text) });
    return data;
  }
  const units = await request<{ eventUnits: Source['eventUnits'] }>(
    'GLO_EventUnits~comp=OG2024~disc=FBL~lang=ENG.json',
  );
  const days = await request<{
    competition_schedule: { date: string; discipline: { code: string } }[];
  }>('SCH_DaysByDiscipline~comp=OG2024~disc=FBL~lang=ENG.json');
  const source: Source = {
    eventUnits: units.eventUnits,
    schedules: [],
    results: [],
  };
  for (const day of days.competition_schedule.filter(
    (d) => d.discipline.code === 'FBL',
  )) {
    const data = await request<{ schedules: ApiSchedule[] }>(
      'SCH_ByDisciplineH2H~comp=OG2024~disc=FBL~lang=ENG~date=' +
        day.date +
        '.json',
    );
    source.schedules.push(...data.schedules);
  }
  const ids = [
    ...new Set(
      units.eventUnits
        .filter(
          (u) =>
            u.type === 'HTEAM' &&
            u.scheduled === 'Y' &&
            u.code.startsWith('FBL'),
        )
        .map((u) => u.code),
    ),
  ].sort();
  // A simple sequential loop keeps load on the public source low.
  for (const id of ids) {
    const data = await request<{ results: ApiResult }>(
      'RES_ByRSC_H2H~comp=OG2024~disc=FBL~rscResult=' + id + '~lang=ENG.json',
    );
    source.results.push(data.results);
  }
  generate(source); // Validate everything before replacing an existing snapshot.
  const text = JSON.stringify(source, null, 2) + '\n';
  const manifest = {
    retrievedAt: new Date().toISOString(),
    source: 'Official Paris 2024 website JSON API',
    schedulePage: apiHeaders.referer,
    responses,
    snapshotSha256: checksum(text),
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, text);
  await writeFile(
    join(dirname(output), 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
}

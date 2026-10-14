#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSource, readSource } from './source.js';
import { generate } from './generate.js';

const help = `ftscr — Paris 2024 football reference generator (Node.js 24+)

  node dist/cli.js fetch --output fixtures/source.json
  node dist/cli.js generate [--input fixtures/source.json] [--output matches.json]
  node dist/cli.js generate --team FRA [--gender men]
  node dist/cli.js generate --team USA --opponent GER --gender women --date 2024-08-06

fetch     Download and validate official API JSON.
generate  Read the saved API snapshot offline. Default: all matches.
--team    All matches involving this country (English name or IOC code).
--opponent  Select one match against this country, regardless of home/away.
--gender  men or women; default both. Use to resolve an ambiguous pair.
--date    YYYY-MM-DD; use with --team and --opponent when the pair met twice.
--help    Show this help.

All modes write a JSON array. JSON goes to stdout unless --output is given.
Diagnostics go to stderr. Exit codes: 0 success, 1 error.
`;
async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean' },
      input: { type: 'string' },
      output: { type: 'string' },
      team: { type: 'string' },
      opponent: { type: 'string' },
      gender: { type: 'string' },
      date: { type: 'string' },
    },
  });
  if (values.help) {
    process.stdout.write(help);
    return;
  }
  if (positionals.length !== 1)
    throw new Error('Specify generate or fetch. Use --help.');
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === 'string' && !value.trim())
      throw new Error('Empty --' + name);
  }
  if (positionals[0] === 'fetch') {
    if (
      !values.output ||
      values.input ||
      values.team ||
      values.opponent ||
      values.gender ||
      values.date
    ) {
      throw new Error(
        'fetch requires --output and accepts no selection options',
      );
    }
    await fetchSource(values.output);
    process.stderr.write(
      'Saved validated API snapshot and manifest to ' +
        dirname(values.output) +
        '\n',
    );
  } else if (positionals[0] === 'generate') {
    const input =
      values.input ??
      fileURLToPath(new URL('../fixtures/source.json', import.meta.url));
    if (values.output && resolve(input) === resolve(values.output))
      throw new Error('Input and output must be different files');
    const result = generate(await readSource(input), values);
    if (values.output) {
      await mkdir(dirname(values.output), { recursive: true });
      await writeFile(values.output, result);
    } else process.stdout.write(result);
    const missing = JSON.parse(result)
      .flatMap((m: { scorers: { minute: unknown }[] }) => m.scorers)
      .filter((g: { minute: unknown }) => g.minute === null).length;
    if (missing)
      process.stderr.write(
        'Source warning: ' +
          missing +
          ' goals have no API timeline minute; see README.\n',
      );
  } else
    throw new Error('Unknown command: ' + positionals[0] + '. Use --help.');
}
main().catch((error: unknown) => {
  process.stderr.write(
    'Error: ' + (error instanceof Error ? error.message : String(error)) + '\n',
  );
  process.exitCode = 1;
});

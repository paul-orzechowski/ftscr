# ftscr

[![Verify ftscr](https://github.com/paul-orzechowski/ftscr/actions/workflows/ci.yml/badge.svg)](https://github.com/paul-orzechowski/ftscr/actions/workflows/ci.yml)

A TypeScript CLI that generates reference JSON response bodies for all **58 Paris
2024 Olympic football matches**: 32 men's and 26 women's matches. Data comes from
the official Olympic website's JSON API. Generation works offline from a committed
snapshot; refreshing the source is an explicit command.

## Install and run

Requires **Node.js 24** and npm. If using nvm, run `nvm install && nvm use`.

```bash
git clone https://github.com/paul-orzechowski/ftscr.git
cd ftscr
npm ci
npm run build
node dist/cli.js generate --output output/matches.json
```

The result is a JSON array following [example.json](example.json). The default
command validates and exports all 58 matches. A warning about two unavailable
goal minutes is expected; see the source limitations below.

## Select matches

```bash
# All matches, both tournaments
node dist/cli.js generate --output output/matches.json

# All matches involving a country
node dist/cli.js generate --team France
node dist/cli.js generate --team FRA --gender men

# One match between two countries (either home/away order)
node dist/cli.js generate --team FRA --opponent ESP --gender men

# A repeated pairing needs a date
node dist/cli.js generate --team USA --opponent GER --gender women --date 2024-08-06

node dist/cli.js --help
```

- Countries accept English names, short names or **IOC codes**, ignoring case and
  surrounding spaces: `France`, `fra`, `USA`, `United States`. Use `GER`, not `DE`.
- `--gender men|women` defaults to both tournaments.
- `--opponent` requires `--team`; `--date YYYY-MM-DD` requires both countries and
  refers to the local kickoff date. Ambiguous pairs fail and list available dates
  and genders. Unknown countries and empty selections also fail.
- Every mode returns an array, including a single match. Without `--output`, JSON
  goes to stdout; diagnostics go to stderr. Exit codes: **0** success, **1** error.
- The full snapshot is validated before filtering or writing output. Invalid
  source data does not replace an existing output file.

## Source and refresh

The source is the JSON API used by the [official Paris 2024 competition
schedule](https://stacy.olympics.com/en/paris-2024/competition-schedule).

| Feed | Purpose |
| --- | --- |
| [GLO_EventUnits](https://stacy.olympics.com/OG2024/data/GLO_EventUnits~comp=OG2024~disc=FBL~lang=ENG.json) | Independent index of scheduled football match IDs. |
| [SCH_DaysByDiscipline](https://stacy.olympics.com/OG2024/data/SCH_DaysByDiscipline~comp=OG2024~disc=FBL~lang=ENG.json) | The 13 football dates. |
| [SCH_ByDisciplineH2H](https://stacy.olympics.com/OG2024/data/SCH_ByDisciplineH2H~comp=OG2024~disc=FBL~lang=ENG~date=2024-07-24.json) | Daily schedules, teams, kickoff, venue, round and scores. |
| [RES_ByRSC_H2H](https://stacy.olympics.com/OG2024/data/RES_ByRSC_H2H~comp=OG2024~disc=FBL~rscResult=FBLMTEAM11------------GPB-000100--~lang=ENG.json) | Detailed results, lineups, coaches, formations, goals and player statistics. |

The schedule has 58 matches and two medal ceremonies. Ceremonies (`type: NONE`)
are excluded. Completeness is checked against the separate event-unit index;
match IDs, teams, dates, venues and scores are reconciled across API records.

```bash
node dist/cli.js fetch --output output/refreshed/source.json
node dist/cli.js generate --input output/refreshed/source.json --output output/refreshed/matches.json
```

`fetch` makes 73 sequential GET requests and validates the dataset before saving
it. It uses public `Accept`, `User-Agent` and `Referer` headers, without cookies,
login or an API key. Bare requests returned HTTP 403 during source investigation;
the configured headers succeeded. Future network or access errors are reported.
The service is a website data API, with no assumed long-term availability promise.

[fixtures/source.json](fixtures/source.json) groups unmodified API records into
`eventUnits`, `schedules` and `results`. [fixtures/manifest.json](fixtures/manifest.json)
records the original retrieval time, 73 source URLs, response hashes and snapshot
SHA-256. No browser capture or PDF data is included. `manifest.json` is reserved
for provenance and cannot be used as the snapshot filename. Review refreshed data
before replacing the committed fixtures so expected test values do not drift.

## Assumptions / Discussion points

The assignment calls these values “endpoints”, but supplies a JSON response
example and no target API URL. This solution therefore produces **response
bodies**, one per match. It preserves the example's fields, with nullable values
where the official source cannot establish a fact. The following conventions
should be agreed with the owner of the target FootyScores API:

| Topic | Decision |
| --- | --- |
| Competition | `Olympic Games Men` / `Olympic Games Women`, season `2024`. |
| Names and time | Preserve API spelling/capitalization and scheduled kickoff with its explicit timezone offset. |
| Status | `FT`, `AET` or `PEN`, based on the result periods. |
| Score | `TOT` includes extra time and excludes the shoot-out; `H1` supplies half-time. |
| Shoot-out | `PSO` kicks are excluded from scorers. The example has no field for shoot-out tally or winner. |
| Minutes | Ordinary minutes are numbers; added time is a string such as `"90+3"`. Unavailable minutes are `null`. |
| Formations | Read `FORMATION`; missing → `null`. All 116 team lineups currently have a value. |
| Coaches | Prefer `SI_COA` (stand-in), then `COACH`; missing → `null`. An assistant alone is not a head coach. |
| Players | `STARTER=Y` identifies the first eleven. Exclude `ABSENT`, `SUSPEND`, `INJURED`; `BOOKED` remains eligible. |
| Positions | Preserve broad source codes `GK`, `DF`, `MF`, `FW`; do not infer tactical roles. |
| Goal types | `PEN` → `penalty`, `OG` → `own_goal`, `FRD` → `free_kick`; `SHOT` → `null` because it does not distinguish header/open play. |
| Own goals | Keep the actual scorer and credit the benefiting team. |
| Assists | Include only explicitly linked `ASSIST` events; otherwise omit the optional field. |
| Incomplete timeline | Explicit player `GF` totals may establish a missing scorer; minute/type remain `null`, with a warning on stderr. |

**Known source gap:** USA–Guinea, men's group A, 30 July. The score is 3–0 and player
statistics identify one goal by MIHAILOVIC Djordje and two by PAREDES Kevin. The
timeline contains only Paredes's 75th-minute goal. All three goals are included,
with **two `minute: null` values**. Their missing times, types and assist links are
not inferred from another source.

Three players also have an aggregate assist count without a linked goal event:
ILAIX Moriba (Guinea–New Zealand), AARONSON Paxten (USA–Guinea) and ABELLEIRA Teresa
(Spain–Nigeria). Those aggregates cannot establish a specific assisted goal. The
output has **172 goals, 170 known minutes and 101 explicitly linked assists**.

Malformed supplied minutes, contradictory scores or player goal totals cause an
error. Missing facts remain distinguishable from a real zero. No comparison with
a live FootyScores API is claimed because its URL and schema were not supplied.

## Implementation

```text
official JSON API → fetch → saved snapshot
                                ↓
                    parse → validate → select → sort → JSON
```

| File | Responsibility |
| --- | --- |
| `src/cli.ts` | Arguments, commands, output and diagnostics. |
| `src/source.ts` | Download, provenance and snapshot loading. |
| `src/parse.ts` | Map source results into match objects. |
| `src/lineups.ts` | Players, coaches, goals, assists and missing values. |
| `src/validate.ts` | Completeness, consistency, duplicates and identity checks. |
| `src/filter.ts` | Country, opponent, gender and date selection. |
| `src/generate.ts` | Stable ordering and response serialization. |
| `src/types.ts` | Source and output interfaces. |

The code uses functions and interfaces with **no production dependencies**.
Official match IDs stay internal. Exact duplicate records are deduplicated;
conflicting records and identity collisions fail validation.

Matches sort by kickoff instant, tournament, round, home, away and official ID.
Text ordering is locale-independent. Players sort by shirt number within the
starting eleven and bench. Goals sort by minute, then player name, with unknown
minutes last; `45+10` precedes `46`. JSON uses two-space indentation and a final
newline. The same snapshot and selectors produce identical bytes.

## Validation and AI workflow

```bash
npm run check   # TypeScript, ESLint, build and tests
npm test       # Build and tests only
```

Tests cover real API records, an independently checked golden match, completeness,
conflicting records, scoring rules, missing data, selectors, nested input
permutations, CLI subprocesses and mocked network failures. They run offline.
GitHub Actions repeats the checks on Node 24/Linux and publishes `matches.json`
as the **ftscr-paris-2024** artifact.

Work follows **plan → implementation → validation**, documented in
[AGENTS.md](AGENTS.md), the [submission plan](docs/plan.md) and the
[verification record](docs/verification.md). AI assisted with the original API
investigation, implementation and tests, and with preparing and independently
reviewing this submission. The existing API-only prototype was reused; the plan
records the preparation of this repository rather than claiming a fresh rewrite.
Match facts come from official API records, not AI-generated data.

## Deployment / distribution

This CLI runs as a step in a testing pipeline; no web service is needed. From a
versioned checkout, run `npm ci`, `npm run build`, then
`node dist/cli.js generate --output output/matches.json`. Pass the resulting JSON
to the target API test suite as its expected response data.

For an offline runtime bundle, copy `dist/`, `fixtures/` and `package.json`
together. Node 24 is sufficient to run it without `node_modules`. Fetching a new
snapshot additionally requires outbound HTTPS access.

Original task inputs: [assignment](docs/assignment.md) and [example](example.json).

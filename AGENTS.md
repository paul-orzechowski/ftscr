# Working on ftscr

Use three phases: **plan → implement → validate**. Keep each phase reviewable in
Git. A plan records intent; a validation report records only checks actually run.

## 1. Plan

- Read `docs/assignment.md`, `example.json` and the README assumptions first.
- Before changing behavior, record the problem, affected files, expected behavior
  and verification commands in `docs/plan.md` (or a new dated plan for later work).
- Resolve uncertain source fields from official API records. Document a missing
  fact instead of guessing it. Keep source facts separate from output conventions.
- Prefer small functions and explicit types. Do not introduce a framework,
  service, database or dependency without a concrete requirement.

## 2. Implement

- Follow the plan in small commits. Record meaningful changes of scope in it.
- For a bug or behavior change, first reproduce the problem with a failing test.
  For documentation or formatting, use the existing checks and inspect the diff.
- Keep `fetch` (network) separate from `generate` (offline). Validate the complete
  source before selecting matches or writing output.
- Preserve `example.json` fields, deterministic ordering, JSON-only stdout and
  diagnostics on stderr. Keep unknown facts distinct from zero or empty text.
- Refresh fixtures explicitly. Preserve their provenance manifest; never commit
  browser captures, credentials, local paths or generated build directories.

## 3. Validate

- Use Node.js 24. Run `npm ci` and `npm run check` from a clean checkout.
- Exercise all matches, a country's matches, a country pair and an ambiguous
  pair. Compare repeated output and verify snapshot/output checksums.
- Review the change independently when another reviewer is available. Check
  source mappings and failure cases, not only test counts.
- Record commands, observed results and limitations in `docs/verification.md`.
  Do not claim a live fetch or CI run passed unless it actually did.
- Before publishing, inspect tracked files and links, run CI, and verify its
  generated artifact. Never present source gaps as complete data.

# PROMPT — A7 REASSIGNMENT — Persistence polish (Worker A is unavailable)

You are taking over **A7 (+ A7b)** because the original Worker A is no longer available. The manager
has temporarily transferred Worker A's ownership zone to you for THIS task only. You have never seen
this file before — treat this prompt as fully self-contained. This is the LAST Phase 3
implementation task; you currently hold the exclusive file lock.

## 0. Orient first (before editing)
- Open `Sources Handoff/TalariaV16.jsx` (~59k lines). Your temporary zone: the top-of-file bank/name
  helpers and the strategy Builder lifecycle block. Locate by NAME:
  `findStrategyBankNameDuplicate`, `normalizeStrategyBankNameKey`, `saveBuilder` (the duplicate
  check is invoked in `saveBuilder`).
- Run `git diff -- "Sources Handoff/TalariaV16.jsx"` and check whether the departed Worker A left
  any PARTIAL A7 edits. If partial work exists, finish/repair it rather than duplicating. Report
  what you found.

## 1. Working rules (critical — shared 1-file project)
- You hold an EXCLUSIVE lock on the file. Only you edit it this turn.
- DO NOT switch git branches, `git stash`, `git checkout`, or revert. ALL prior work from other
  workers (Phases 1–2 and C3/C4/B5/D3/D4) lives as UNCOMMITTED changes and MUST be preserved. The
  manager handles all git/commits centrally.
- Re-locate every symbol by NAME (line numbers drift). No new dependencies.
- NEVER weaken `@jwt_required`, CSRF, or size limits.
- Backend uniqueness is Director decision **D-3 = client-side only this release** → do NOT
  implement backend uniqueness.

## 2. A7 — Duplicate-name normalization alignment
`findStrategyBankNameDuplicate` currently uses an exact lowercase match, while session-metrics
linking uses `normalizeStrategyBankNameKey` (punctuation-insensitive). Align the duplicate check to
the normalized key so names differing only by punctuation/case (e.g. "My Strat!" vs "My Strat") are
treated consistently by the save guard.
- Watch for false positives on legitimately distinct names — if a case is genuinely ambiguous,
  prefer a WARN path over a hard block, and note the decision in your report.

## 3. A7b — tiny dead-state sweep (manager-added)
Worker D (D3) removed the Strategy Bank's use of `sessSortOpen`, leaving
`const [sessSortOpen, setSessSortOpen] = useState(false);` (~line 11972) declared-but-unused.
Grep BOTH `sessSortOpen` and `setSessSortOpen`; if the only occurrence is that declaration, remove
it. If any real reference remains, leave it and explain why.

## 4. Verify (static this turn; runtime/browser deferred to Phase 4)
- Names differing only by punctuation/case are detected as duplicates by the save guard;
  legitimately distinct names still save.
- `sessSortOpen`/`setSessSortOpen` removed with zero remaining references (or justified if kept).
- `ReadLints` on `Sources Handoff/TalariaV16.jsx` → no new diagnostics (retry once if the tool
  times out on the large file; note it).
- `git diff --check` clean; `git diff` shows your hunks are limited to the name-duplicate helper +
  the `sessSortOpen` removal.

## 5. Report
Write `docs/strategy-ship-plan/reports/A/A7.md` using the task-report format:
- What changed (file, symbols, current line ranges, nature)
- Whether you found/finished any partial Worker-A work
- WARN-vs-block decision for the duplicate check
- Zone compliance, any ICR filed
- Verification table, lint result, `git diff` presence
- Status: DONE / BLOCKED (with exact blocker)

Then hand the file back to the manager.

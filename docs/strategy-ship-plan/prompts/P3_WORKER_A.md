# PROMPT — Worker A — Phase 3 (Persistence polish) — A7

You are Worker A. Do A7 in ONE turn. You are LAST in the Phase 3 serial order (C→B→D→A) —
only start once the manager confirms D has returned the file.

## Working rules
- Exclusive edit of `Sources Handoff/TalariaV16.jsx` while you hold it. DO NOT switch branches /
  stash / revert — all prior work is uncommitted and MUST be preserved. `git diff` before DONE.
- Zone: top-of-file bank/name helpers + builder lifecycle block (re-locate by name). No new deps.
- Never weaken auth/CSRF/size limits.

## A7 — Duplicate-name normalization alignment
`findStrategyBankNameDuplicate` uses exact lowercase match, while session-metrics linking uses
`normalizeStrategyBankNameKey` (punctuation-insensitive). Align the duplicate check to the
normalized key so "My Strat!" and "My Strat" are treated consistently.
- Watch for false positives on legitimately distinct names — if a case is ambiguous, prefer a
  WARN path rather than a hard block, and note it in your report.
- Backend uniqueness is Director decision **D-3 = client-side only this release** → do NOT
  implement backend uniqueness.

## A7b — tiny follow-up sweep (manager-added)
D3 removed the Strategy Bank's use of `sessSortOpen`, leaving `const [sessSortOpen, setSessSortOpen]
= useState(false);` (~line 11972) declared-but-unused. Confirm it has ZERO remaining references
(grep both `sessSortOpen` and `setSessSortOpen`) and remove the dead declaration. If any reference
still exists, leave it and note why.

## Verify (static this turn; runtime → P4)
- Names differing only by punctuation/case are detected as duplicates by the save guard.
- Legitimately distinct names still save.
- `sessSortOpen`/`setSessSortOpen` removed and zero references remain (or justified if kept).
- `ReadLints` clean; `git diff` shows hunks in-zone.

## Report
`reports/A/A7.md`: symbols + line ranges, verification table, note on WARN-vs-block decision,
lint result, `git diff` presence. Status DONE.

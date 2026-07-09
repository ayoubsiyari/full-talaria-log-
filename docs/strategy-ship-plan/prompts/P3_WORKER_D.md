# PROMPT — Worker D — Phase 3 (Bank polish) — D3 + D4

You are Worker D. Do D3 and D4 in ONE turn. You are THIRD in the Phase 3 serial order (C→B→D→A) —
only start once the manager confirms B has returned the file.

## Working rules
- Exclusive edit of `Sources Handoff/TalariaV16.jsx` while you hold it. DO NOT switch branches /
  stash / revert — all prior work is uncommitted and MUST be preserved. `git diff` before DONE.
- Zone: strategy state + Strategy Bank page render, tabs, sorts, skeletons, card/row renderers,
  action menus (re-locate by name). No new deps. Keep visual language; no layout redesigns.
- Guardrails: do NOT delete backend community routes / fetch plumbing (dormant, gated by
  COMMUNITY_ENABLED from D1). Do NOT change `mergeV16StrategyBankRows` usage (A owns that).

## D3 — Sort/filter honesty (manager-approved defaults)
- My Strategies sort menu: **REMOVE** the options that sort on fields own strategies don't have
  ("Win Rate", "Avg R:R", "Most Saved"). (Default = remove; do not wire fake metrics.)
- Give the Strategy Bank sort dropdown **its own open-state** instead of sharing `sessSortOpen`
  with the Sessions page.
- Saved-list sort: COMMUNITY_ENABLED is false (D1), so the Saved path is gated off — skip.
- Demo mode badge: **"My Strategies" tab badge counts REAL rows only** (built-in template previews
  may still show, but must not inflate the badge). (Default confirmed.)

## D4 — Dead-code sweep in zone
- Remove unused `stratStyleFilter` + `STYLES` filter state (no filter UI this release).
- Remove unused `normalizeStrategyBankName` alias (do NOT touch A's `mergeV16StrategyBankRows`).
- Template-preview delete path (`hiddenTemplateIds`) lacks confirm → add the same `openAppConfirm`
  used for real deletes, OR relabel the action "Hide". (Pick one; note which in report.)

## Verify (static this turn; runtime → P4)
- Sort menu shows only honest options; bank sort dropdown independent from Sessions sort.
- Badge equals real row count in demo mode.
- Removed dead state has zero remaining references; page behavior identical except intended changes.
- `ReadLints` clean; `git diff` shows hunks in-zone.

## Report
`reports/D/D3.md` and `reports/D/D4.md`: symbols + line ranges, verification tables, lint result,
`git diff` presence, any ICR filed. Status DONE per task.

# T6 step 4 (Lane 3) — RC-6 Phase 3: indicator settings-apply invalidation (M3)

## Context
RC-6 6-phase plan. Landed: Phase 1 store (3502177c, M1), Phase 2 visibility (M2). This step = **Phase 3: M3 — settings bypass invalidation** (indicator settings changes don't reliably invalidate/repaint). Freeze-safe (indicator engine/UI only).

## Step 0
Confirm Phase 2 committed/clean; state it. Commit only your own indicator paths file-scoped — never `git add -A`.

## Tasks
1. Implement **Phase 3 (M3)**: route indicator settings-apply through the `IndicatorLifecycleStore` update path so a settings change always invalidates + repaints the indicator (no stale render). Fix the bypass where settings mutate config without triggering invalidation.
2. Kill-switch (dedicated Phase-3 switch or the RC-6 rollout switch — state which; cover every file incl. React, I13).
3. RED-first: scenario fails on the bypass (stale render after settings change) and passes when routed through the store (real assertion / switch-OFF RED-again, I15).
4. Report tickets discharged + remaining mechanisms (M4 replay recalc, M5 persist race, M6 panel layout — M6 parked with re-migration).

## Guardrails
- Indicator engine/UI files only. Do NOT touch chart.js replay/cadence (Lane 2), multichart-parent (M6 parked), order-entry, or `known-failing.json` — report deltas to Lane 4.
- I8/I9 mirrored trees + SHA256.

## Report — WORKER-REPORT-STANDARD.md
Phase-3 design, files + switch, RED→GREEN (how actuated / what measured), tickets, remaining-mechanism note, Lane-4 deltas.

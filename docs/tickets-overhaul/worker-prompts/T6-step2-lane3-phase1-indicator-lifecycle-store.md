# T6 step 2 (Lane 3) — RC-6 Phase 1: central IndicatorLifecycleStore

## Context
RC-6 diagnostic (T4 step 11 Part C) found the root gap: indicators use ad-hoc `emitIndicatorsChanged` + scattered UI paths, with **no central store** (unlike T1's `ToolLifecycleStore`). 6-phase plan. This step = **Phase 1: the IndicatorLifecycleStore** — the single source of truth for indicator add/update/remove/rehydrate. Freeze-safe (indicator engine/UI modules only).

## Step 0
Confirm order-entry commit baf2ab12 is clean; state it. Commit only your own indicator files by explicit path this step — never `git add -A` (other lanes share the tree).

## Tasks
1. Implement **Phase 1** from your RC-6 plan: introduce `IndicatorLifecycleStore` as the authoritative registry for indicator instances (add / update / remove / rehydrate), mirroring the ToolLifecycleStore pattern. Route the existing ad-hoc paths through it **behind a kill-switch** `__TALARIA_RC6_INDICATOR_LIFECYCLE_STORE` (default ON), covering every file touched incl. any React (I13).
2. RED-first: a scenario that fails on the ad-hoc path and passes through the store (real assertion / switch-OFF RED-again, I15). Address mechanism **M1 (no central store)** first; note which of M2–M6 Phase 1 sets up.
3. Report tickets discharged / set up for later phases.

## Guardrails
- Indicator engine/UI files only. Do NOT touch multichart-parent (Phase 6 is parked), `chart.js` replay/cadence regions, order-entry, or `known-failing.json` — report row deltas to Lane 4.
- I8/I9 mirrored trees + SHA256.

## Report — WORKER-REPORT-STANDARD.md
Phase-1 store design, files + kill-switch coverage, RED→GREEN (how actuated / what measured), mechanisms addressed vs set-up, tickets, and Lane-4 deltas.

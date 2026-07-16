# T6 step 3 (Lane 3) — RC-6 Phase 2: indicator visibility unification (M2)

## Context
RC-6 6-phase plan. Phase 1 `IndicatorLifecycleStore` landed (commit 3502177c, M1). This step = **Phase 2: M2 — dual visibility flags** (the store now exists; route visibility through one authoritative path so hide/show is consistent). Freeze-safe (indicator engine/UI only).

## Step 0
Confirm Phase 1 (3502177c) is committed/clean; state it. Commit only your own indicator paths file-scoped — never `git add -A`.

## Tasks
1. Implement **Phase 2 (M2)** from your RC-6 plan: unify the dual indicator visibility flags into one source of truth driven through the `IndicatorLifecycleStore` (`VisibilityChanged`). Eliminate the desync that causes hide/show inconsistencies.
2. Behind kill-switch (reuse `__TALARIA_RC6_INDICATOR_LIFECYCLE_STORE` if Phase 2 is part of the same rollout, or a dedicated Phase-2 switch — state which, cover every file incl. React, I13).
3. RED-first: a scenario that fails on the dual-flag desync and passes when unified (real assertion / switch-OFF RED-again, I15).
4. Report tickets discharged (the user-visible hide/show rows) + which mechanisms remain for Phases 3–6.

## Guardrails
- Indicator engine/UI files only. Do NOT touch chart.js replay/cadence (Lane 2), multichart-parent (Phase 6 parked), order-entry, or `known-failing.json` — report row deltas to Lane 4.
- I8/I9 mirrored trees + SHA256.

## Report — WORKER-REPORT-STANDARD.md
Phase-2 design, files + switch, RED→GREEN (how actuated / what measured), tickets discharged, remaining-mechanism note, Lane-4 deltas.

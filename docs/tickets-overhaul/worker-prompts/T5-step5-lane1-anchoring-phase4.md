# T5 step 5 (Lane 1) — RC-3 anchoring: Phase 4 (next phase of the 6-phase plan)

## Context
RC-3 anchoring-unification, 6-phase plan (T5 step 1 diagnostic). Landed so far:
- Phase 1 `__TALARIA_RC3_VOLUME_RENDER_RESOLVE` (caf42f4f)
- Phase 2 `__TALARIA_RC3_CLAMP_POLICY` + `resolveAnchoredVolumeProfileRange`
- Phase 3 `__TALARIA_RC3_PASTE_TIMESTAMP_OFFSET` (clipboard timestamp preservation; discharged TAL-01383, TAL-00253)

This step = **Phase 4**. Freeze-safe (engine/drawing/anchoring files only).

## Step 0 — read the plan
Open the T5 step 1 diagnostic; state exactly what Phase 4 covers at the top of your report before implementing.

## Tasks
1. Implement **Phase 4**. RED-first, honest probe (I15 — do NOT lean on H-S40/H-S41, still being fixed by Lane 4). Behind its own kill-switch covering every file touched incl. any React (I13).
2. Report which registry rows / tickets Phase 4 discharges.

## Guardrails
- Engine/drawing/anchoring files only. Do NOT edit `known-failing.json` / harness scenario ids — report row deltas to Lane 4.
- **Stay clear of Lane 2's `chart.js` replay/cadence regions** (`_panelPlayFollowContinuousOffsetX`, replay tick path). If Phase 4 needs `chart.js`, report exact line-regions for Lane 4 integration reconcile.
- I8/I9 mirrored trees + SHA256.

## Report — WORKER-REPORT-STANDARD.md
Phase-4 statement, RED→GREEN (how actuated / what measured), kill-switch coverage, registry discharge, and any known-failing deltas for Lane 4.

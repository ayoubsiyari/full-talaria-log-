# T5 step 6 (Lane 1) — RC-3 anchoring: Phase 6 (labels) — NOT Phase 5

## Sequencing decision (important)
Do **Phase 6 (labels)** this step. **Skip Phase 5 (multichart parity) for now** — Phase 5 touches multichart-parent code that is under the deploy freeze / fallback-B and overlaps Lane 2's replay regions + the pending RC-4 re-migration. Phase 5 will be folded into the multichart re-migration track later. Do NOT touch multichart-parent code.

## Context
RC-3 anchoring, 6-phase plan. Landed: Phase 1 volume-render-resolve, Phase 2 clamp policy, Phase 3 paste-timestamp, Phase 4 fractional-place (`__TALARIA_RC3_FRACTIONAL_PLACE`). This step = **Phase 6 labels**. Freeze-safe (engine/drawing/label files only).

## Step 0
Confirm Phase 4 is committed file-scoped (`drawing-tools-base.js`, `drawing-tools-manager.js` + mirrors) — commit only your own paths, never `git add -A` (other lanes share the tree). Report the hash.

## Tasks
1. Read the T5 step 1 diagnostic; state exactly what **Phase 6 (labels)** covers at the top.
2. Implement Phase 6 — label anchoring/positioning unification. RED-first, honest probe (I15, not H-S40/H-S41). Own kill-switch covering every file touched incl. any React (I13).
3. Report registry rows / tickets discharged.

## Guardrails
- Engine/drawing/label files only. Do NOT touch multichart-parent, `chart.js` replay/cadence regions, or `known-failing.json` — report row deltas to Lane 4.
- I8/I9 mirrored trees + SHA256.

## Report — WORKER-REPORT-STANDARD.md
Phase-6 statement, RED→GREEN (how actuated / what measured), kill-switch coverage, registry discharge, Lane-4 deltas. Note that **Phase 5 (multichart parity) remains deferred to the re-migration track** so the RC-3 plan status reads 5/6 with Phase 5 explicitly parked.

# T5 step 3 (Lane 1) — RC-3 anchoring: land Phase 1, advance to next phase + H-S25 seam

## Context (RC-3 = anchoring unification)
Diagnostic (T5 step 1) root: volume render mutates `points.x`, corrupting anchoring. 6-phase plan. Phase 1 = volume-render-resolve (greens H-S40/41/42). Freeze-safe (engine/drawing files only — no multichart-parent, no React, no `panel-cmd-bridge.js`).

## Step 0 — surface prior work (mandatory)
State whether T5 step 2 Phase 1 is committed / greens confirmed (H-S40/41/42). If uncommitted, land + verify it FIRST and report proof before starting the next phase. Do not discard prior work.

## Tasks
1. **Confirm Phase 1** greens (H-S40/41/42) hold on a fresh gate run; report proof (real assertion, I15).
2. **Advance to Phase 2** of the T5 diagnostic plan (next anchoring fix in the 6-phase sequence). Behind its own kill-switch covering **every file touched incl. any React** (I13). RED-first scenario before the fix.
3. **H-S25 (deterministic eased-follow seam defect, RC-3):** this is NOT a flake — `maxStepDeviceDelta==candleSpacing` at bar seams. Assess whether it belongs to this anchoring phase. If your fix greens it, prove it; if not, add a PER-BUG-REGISTRY row with the mechanism.

## Guardrails
- Engine/drawing/anchoring files only. Do NOT edit harness scenario ids or `known-failing.json` — **report row deltas to Lane 4** (single-owner rule).
- Coordinate: you may touch `chart.js` anchoring regions; Worker 2 is design-doc-only this step (no `chart.js` code), so no conflict — but flag exact line regions in your report.
- I8/I9 mirrored trees + SHA256.

## Report — WORKER-REPORT-STANDARD.md
Phase-1 confirm proof, Phase-2 fix + kill-switch coverage, RED→GREEN evidence (how actuated / what measured, I15), H-S25 disposition, and any known-failing row deltas for Lane 4.

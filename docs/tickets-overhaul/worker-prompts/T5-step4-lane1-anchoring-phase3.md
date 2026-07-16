# T5 step 4 (Lane 1) — RC-3 anchoring: Phase 3 (next phase of the 6-phase plan)

## Context
T5 step 1 diagnostic laid out a 6-phase RC-3 anchoring-unification plan. Phase 1 (`__TALARIA_RC3_VOLUME_RENDER_RESOLVE`, committed caf42f4f) + Phase 2 (`__TALARIA_RC3_CLAMP_POLICY`, clamp + `resolveAnchoredVolumeProfileRange`) landed. This step = **Phase 3** of that plan. Freeze-safe (engine/drawing/anchoring files only).

## Step 0 — read the plan
Open the T5 step 1 diagnostic report and confirm exactly what Phase 3 covers; state it at the top of your report before implementing.

## Tasks
1. Implement **Phase 3** of the RC-3 plan. RED-first scenario BEFORE the fix. Behind its own kill-switch covering **every file touched incl. any React** (I13).
2. **Do NOT depend on H-S40/H-S41 for verification** — those probes are being fixed by Lane 4 (they read `data[round(x)].t` not `timestampPoints`). Use an honest probe for your Phase-3 RED (real anchored end-state, I15); if your scenario needs the same `timestampPoints` read, note it for Lane 4 rather than editing scenarios yourself.
3. Report which registry rows / tickets Phase 3 discharges.

## Guardrails
- Engine/drawing/anchoring files only. Do NOT edit `known-failing.json` or harness scenario ids — **report row deltas to Lane 4** (single-owner).
- `chart.js` coordination: Lane 2 (T8 step 13 cadence impl) also touches `chart.js` replay regions. **Report your exact line-regions** and stay clear of the replay-follow / cadence code (`_panelPlayFollowContinuousOffsetX` and the replay tick path belong to Lane 2 right now).
- I8/I9 mirrored trees + SHA256.

## Report — WORKER-REPORT-STANDARD.md
Phase-3 statement, RED→GREEN (how actuated / what measured, I15), kill-switch coverage, `chart.js` line-region map for integration, and known-failing row deltas for Lane 4.

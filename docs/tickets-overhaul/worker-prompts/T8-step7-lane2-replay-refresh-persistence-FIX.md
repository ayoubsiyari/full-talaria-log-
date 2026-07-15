# T8 step 7 (Lane 2) — replay refresh-persistence FIX (PLAN2-FOUND#5), two tracks

## Authorization
From the step-6 diagnostic (pre-existing, not a3). Two roots, both genuine bug fixes (not policy changes). Freeze-exempt (replay/host path). Staging-only while the D-012 deploy freeze holds.

## Intended behavior (P6 — spec, do NOT guess)
On a page **refresh mid-replay**: restore the replay **playhead to where replay actually was**, in the **paused** state. Do **not** auto-jump to the refresh-point date; do **not** auto-resume playing. The user presses Play to continue from the restored playhead. **PO CONFIRMED this spec (2026-07-15): restore paused, no auto-jump, no auto-play.** If it conflicts with anything you find, STOP and report, do not improvise.

## Track A (PRIMARY) — session replay playhead save/restore
- **Symptom:** fresh session plays fine; after refresh the replay position is not persisted → Play jumps to the refresh-point date + catch-up leaps many candles.
- **Task:** persist the replay playhead/session position on unload and restore it on boot (trace the save-on-unload vs restore-on-boot path from step 6). Restore paused at the correct playhead per the spec above.
- **RED FIRST:** build a host harness scenario reproducing it — advance replay N candles → simulate reload → assert the restored `replayTimestamp` equals the pre-reload playhead (not the refresh point), and that no catch-up candle-leap fires. RED before, GREEN after, RED with the switch OFF.
- **Kill-switch:** `window.__TALARIA_REPLAY_SESSION_PLAYHEAD_RESTORE` (default = fix ON), covering every file touched (I13).

## Track B (SECONDARY, ship with A if PO uses multichart on reload) — boot host reanchor
- **Symptom:** on **multichart** refresh the viewport drifts / content hides off-screen (H-S28: `drift=612px`, `reanchorPasses=0`).
- **Task:** the reanchor fix already exists at `chart.js:17080–17241` behind `__TALARIA_MC_DISABLE_BOOT_HOST_REANCHOR` but **does not actuate in the probe** — find why it doesn't fire on boot and make it actuate so H-S28 goes GREEN (`reanchorPasses>0`, drift ~0).
- **RED:** H-S28 is already the RED — turn it GREEN; confirm the switch A/B reverts it.

## Acceptance
- Track A RED→GREEN + switch A/B; Track B H-S28 GREEN + switch A/B.
- Full `npm run gate` green (no new regressions; fence H-S17/H-S19/H-S19b/H-S20 stays green); coordinate any baseline delta with Lane 4 (owns `known-failing.json`).
- **PO staging live-confirm** on a new build: refresh mid-replay (single chart AND multichart) → playhead restores correctly, no jump, no drift/hide.

## Guardrails
- I8 both trees byte-identical; SHA256. I9 gate. I13 switch coverage.
- Do NOT touch `react-parity-lib.mjs`.
- Not a mirror-policy guard — do not add guard #21; these are scoped persistence/boot fixes.

## Report — WORKER-REPORT-STANDARD.md (8 sections)
Per-track diff + switch coverage, Track A RED→GREEN evidence + the new scenario, Track B H-S28 GREEN + why it wasn't actuating, gate result, both trees SHA256, and the staging build id for PO confirm.

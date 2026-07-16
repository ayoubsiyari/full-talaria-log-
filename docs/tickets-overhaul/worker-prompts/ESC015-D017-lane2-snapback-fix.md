# D-017 (Lane 2) — pan-release snap-back fix (TAL-01579), standalone gated

## Authorization
D-017 approved. Policy: **once the user has panned, the released viewport wins** — nothing may recenter toward the grab point or a host anchor. **Standalone gated fix**, runs now (independent of the re-migration phases). PO staging confirm at the end.

## The precise rule (from D-017)
- On pan release when `userHasPanned`: **no post-release index-pin and no prepend compensation may recenter** toward grab-time or host anchors.
- **Prepend compensation is NOT deleted — it is RE-BASED to the post-drag viewport.** Its real job (keeping bars steady when left-history loads) stays; only the **stale pre-drag baseline** is dropped.
- Applies to **host AND panels**.

## Tasks
1. Implement per the step-11 diagnostic mechanism (`chart.js` pan-release ~32387+, `replay-system.js` `userHasPanned` ~5748, `_scheduleReplayPanLoadLeft` ~25750+, `_applyMultichartMirrorPrependCompensation` / `_tryExtendReplayMasterFromParent` ~2490–2527/5862–5880). Re-base prepend compensation to the post-drag viewport; suppress index-pin recenter when `userHasPanned`.
2. Behind its own kill-switch (e.g. `__TALARIA_DISABLE_PAN_RELEASE_ANCHOR_HOLD`, default fix ON) covering every file touched incl. any React (I13).
3. **RED-first: H-S82** (pan-snapback RED — Lane 4-reserved id). Assert settled `offsetX ≈ release offsetX`, not grab-time, after pan-load settle. Real actuation / switch-OFF RED-again (I15). Coordinate the id with Lane 4.
4. **Do NOT fold in H-S73** — per D-017 it stays its own registered defect (B-FIX-C prepend compensation, separate). Keep it tracked separately.

## Guardrails / coordination
- Touches `chart.js` / `replay-system.js`. **Re-migration Phase 1 (Lane 1) also touches `chart.js`** — land + commit this file-scoped BEFORE Phase 1 starts so chart.js is clean (coordinate order with me). T8 replay is on hold pre-b1, so no live T8 collision now.
- I8/I9 mirrored + SHA256. Cut a staging build for PO confirm; report build id.

## Report — WORKER-REPORT-STANDARD.md
Files + kill-switch, H-S82 RED→GREEN (how actuated / what measured), host+panel coverage, staging build id, chart.js line-regions for integration, Lane-4 deltas.

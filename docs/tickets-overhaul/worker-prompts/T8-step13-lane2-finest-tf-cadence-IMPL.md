# T8 step 13 (Lane 2) — finest-TF unified replay clock: IMPLEMENTATION (per D-016)

## Authorization
D-016 approved the unified finest-TF clock; T8 step 12 design + cost column cleared the frame budget (**WITHIN BUDGET**), so implementation proceeds — **it does NOT return to the Director** unless the real measured AFTER numbers break the budget. Freeze-exempt; staging-only.

## Build to the approved design (`T8-FINEST-TF-CADENCE-DESIGN.md`)
1. **Clock:** replay clock ticks at `min(TF)` across **all present panels (incl. different-symbol)**; **speed still anchored to the selected panel** (4h @ "1 candle/sec" feel unchanged — the 1m panel plays its 240 smoothly inside that second). **Parity invariant:** all panels share the same market timestamp every tick.
2. **Coalesce (mandatory):** coarse forming-candle updates go through the existing `maybePanelPlayViewportFollow` + `scheduleCoalescedSeek` path so sub-pixel 1m ticks → ~0 extra repaints. Do NOT add a per-tick repaint path.
3. **Live re-derivation:** recompute `min(TF)` on add / close / re-TF a panel, **without jolting any viewport**.
4. **Kill-switch:** `window.__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` (default = fix ON). Must cover **every file touched, incl. React** (I13).

## Scenario id — COLLISION FIX (do this)
The cadence RED is **H-S83**, NOT H-S82. **H-S82 is already assigned to the pan-snapback RED** (Lane 4 T0 step 16). Coordinate the id with Lane 4 (sole scenario-id owner) — report the row so Lane 4 registers H-S83.

## RED-first + real AFTER numbers
- **H-S83:** host + real tick play; assert (a) all panels share market ts, (b) finer panel advances 1m-by-1m while coarse forms progressively, (c) coarse render count stays bounded per coarse bar (BL-13 / H-S19b bound).
- **Re-run the cost probe (`t8-step12-cadence-cost-probe.mjs`) for REAL AFTER numbers.** Design was a projection; if the measured AFTER breaks the frame budget, STOP and escalate with data (D-016).
- **Must include the PO's actually-broken path:** **4h-focused → 1m sub-advance** (the design BEFORE only measured host-already-1m). Prove the cadence-wrong jump path is cured, not just render cost.

## Guardrails / coordination
- Touches replay-cadence code (`panel-cmd-bridge.js`, `chart.js` replay regions). **Lane 1 (T5 step 3) also touches `chart.js`** anchoring/volume regions — **report your exact line regions** so Lane 4 can reconcile at integration; avoid Lane 1's anchoring regions.
- Do NOT edit `known-failing.json` or `react-parity-lib.mjs` — report row deltas to Lane 4.
- I8/I9 mirrored trees + SHA256.

## Staging + acceptance
Cut a staging build (bump `__TALARIA_CHART_BUILD_ID`, mirror to dist-v9). PO acceptance = **staging A/B**: flip `__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` on/off in one session on a mixed-TF layout **incl. a 4h-focused play**, confirm the new cadence is the intended feel.

## Report — WORKER-REPORT-STANDARD.md
Files + kill-switch coverage, H-S83 RED→GREEN (how actuated / what measured, I15), the REAL measured AFTER cost table with verdict, staging build id, `chart.js` line-region map for Lane 4, and any known-failing deltas.

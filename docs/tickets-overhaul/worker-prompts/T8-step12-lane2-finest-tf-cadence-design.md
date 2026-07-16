# T8 step 12 (Lane 2) — finest-TF unified replay clock: DESIGN DOC + measured cost (per D-016)

## Authorization
D-016 APPROVED the unified finest-TF shared clock. **Design doc FIRST, with a measured cost column** — implementation only after the numbers clear the frame budget (if they don't, it returns to the Director with data, no silent degrade). Freeze-exempt; staging-only.

## The approved design (from D-016 — build to this, don't re-litigate)
- **Unified finest-TF clock:** the shared replay clock ticks at `min(TF)` across **all present panels, including different-symbol panels**. Coarse panels form their candle **progressively** over the finer ticks.
- **Renders track pixel-column crossings, NOT ticks (mandatory):** route coarse-panel forming-candle updates through the **existing pixel-column-crossing coalesce path** (Plan-1 rule). A 1m tick on a 4h panel is sub-pixel → must coalesce to ~zero repaint. The building blocks exist: hosts already keep a 1m master; tick animation already renders forming bars.
- **Speed unchanged:** the speed control keeps today's perceived pace, **anchored to the selected panel** (host 4h @ "1 candle/sec" still forms one 4h candle/sec; the 1m panel plays its 240 smoothly inside that same second).
- **Parity invariant:** all panels ALWAYS show the same market timestamp.
- **Live re-derivation:** clock re-computes `min(TF)` when a panel is added / closed / re-TF'd — **without jolting any viewport**.
- **Kill-switch:** `window.__TALARIA_MC_FINEST_TF_REPLAY_CADENCE` (default decision at impl; design names it).

## Deliverable — `docs/tickets-overhaul/T8-FINEST-TF-CADENCE-DESIGN.md`
1. **Clock ownership design:** where `min(TF)` is computed, how the shared clock drives all panels at the parity timestamp, how the selected-panel speed anchor maps finer ticks into the same wall-clock pace. Cite the existing 1m-master + tick-animation + coalesce hooks (file:line).
2. **Coalesce proof plan:** exactly how coarse-panel forming updates go through the pixel-column-crossing path so ticks ≠ renders.
3. **Live re-derivation:** the add/close/re-TF recompute path + how viewport jolt is avoided.
4. **MEASURED COST COLUMN (mandatory, D-016 gate):** frame times on a **4-panel 1m/4h layout at max speed, BEFORE vs AFTER** (or a faithful prototype/estimate if not yet implemented) — plus render-count per coarse bar to prove coalescing holds. If projected cost breaks the frame budget, **STOP and report with the numbers** (returns to Director).
5. **RED scenario spec** (host + real tick play): assert all panels share the market timestamp; assert finer panel advances 1m-by-1m while coarse forms progressively; assert render count on coarse panels stays bounded per coarse bar.
6. **Kill-switch + I8/I9 plan.**

## Guardrails
- Design + measurement only this step; no product fix yet (implementation is the next step, gated on the cost numbers).
- If it touches iframe-panel coordination at impl → I14. Do NOT touch `react-parity-lib.mjs`.
- Not a mirror-frame guard — it's the cadence policy.

## Report — WORKER-REPORT-STANDARD.md
The design doc, the measured/projected cost column with verdict (within budget vs returns-to-Director), the RED spec, and the kill-switch/gate plan.

# T8 step 8 (Lane 2) — multichart panel TF/data restore mismatch on refresh (READ-ONLY) — PLAN2-FOUND#6

## Symptom (PO, staging a4, multichart) — REFINED by PO follow-up
Fresh session: two panels, both 15m same symbol (EUR/USD) — correct. **After a page refresh:**
- **Panel A restores perfectly.**
- **Panel B's DATA is actually fine** — the candles are the correct 15m, and pressing Play snaps it fully correct. **The bug is purely the TF INDICATOR/selector: it is stuck showing `1m` while the chart is really 15m.**

So this is **NOT a data-restore bug** — it is a **TF-label/selector UI desync**: on reload the panel restores the correct 15m data but the TF control initializes to a default (`1m`) and never syncs to the actual/persisted panel TF. Focus there.

This is distinct from the step-7 Track A fix (host replay playhead). It's the **panel TF-control state hydration** — the label vs the applied resolution. May overlap **T3 contract row 13** (layout persistence, TAL-01571).

## Task — DIAGNOSTIC ONLY (no product edits)
1. **Regression vs pre-existing (step 0):** reproduce on a4 vs pre-step-7 / fallback. Did step-7 touch panel TF-control hydration? Confirm or refute (data restores fine, so likely unrelated to Track A).
2. **TF-control state source:** what drives the panel's TF label/selector display? Where does the panel restore its TF on reload, and where does the TF *control UI* read its value from? Find the point where the **applied resolution (correct, 15m) and the control's displayed value (stuck 1m) diverge.**
3. **Hydration order:** is the TF control initialized to a default (`1m`) at panel mount and then NOT updated when the persisted 15m TF is applied to the data? Or is the persisted TF applied to data but a separate `activeTimeframe`/label state never set? Cite file:line (`MultichartGrid`/`TalariaV8bLive` panel TF state, `panel-cmd-bridge` boot, the TF-selector component).
4. **Why Play "fixes" it (or appears to):** does pressing Play push a frame that re-syncs the label, or does it only correct data while the label stays wrong? Confirm the exact post-Play state of the label.
5. **RC + fix recommendation:** almost certainly a **label/selector-state sync bug** (set the TF control from the persisted/applied TF on hydration), scoped and low-risk. Name the track (T8 vs T3 row-13), confirm no data-path change is needed, and propose the RED scenario (reload → assert panel TF control === applied resolution).

## Guardrails
- READ-ONLY. No product/harness edits. Do NOT touch `react-parity-lib.mjs`.
- Freeze-exempt (data/persistence path) — but if the fix later touches iframe-panel coordination, I14 (postMessage bridges only) applies; note it.
- Not a mirror-frame guard — belongs in persistence/hydration, not guard #21.

## Report — WORKER-REPORT-STANDARD.md
Step-0 verdict, the per-panel persistence save/restore map, mechanism for both the TF-desync and the wrong-data, RC/track + fix recommendation, and proposed RED scenario(s).

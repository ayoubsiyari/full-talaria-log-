# T8 step 6 (Lane 2) — main-chart replay refresh-persistence diagnostic (READ-ONLY) — PLAN2-FOUND#5

## Why
PO on staging `20260715a3`, **main (host) chart** replay:
- Plays normally, then **jumps many candles at once** after a short while.
- **Switching TF during replay → the chart drifts and hides** (content off-screen).
- **Key repro:** a **fresh session works correctly**; after a **page refresh** the replay position is **not saved** — on Play it **jumps to the date where the refresh happened**, not where replay actually was.

This looks like a **replay-state persistence gap across reload** (playhead/anchor not persisted or restored to the wrong anchor), with the candle-jump and TF-switch drift/hide as downstream effects. It is on the **host/main chart**, NOT the panel bridge, so it is separate from the D-015 edge-park fix.

**PO CONFIRMED (2026-07-15): a FRESH session never shows this — it is STRICTLY refresh/reload-triggered.** That rules out a host-tick cadence bug (a fresh session would show it too) and points squarely at the **reload restore path restoring the replay playhead to the wrong anchor** (the refresh-point date), with the candle-jump = catch-up reconciling that wrong playhead. Focus the trace on save-on-unload vs restore-on-boot of the replay position.

## STRONG LEAD — H-S28 (from T0 step 15 baseline reconcile)
Lane 4 just classified **H-S28** as a known defect: **"boot reanchor absent — `reanchorPasses=0`, ~612px drift."** That is very likely the **harness reproduction of this exact bug** (boot/reload not reanchoring the replay position → drift). START by reading H-S28's scenario + assertion and the `reanchor`/boot-commit path it exercises — it may already pin the mechanism and give you a RED to fix against. Also check H-S6 (RC-8: all panels self-fetch on 1m→1h fan-out) and H-S27/H-S30 (newly baselined) for overlap.

## FIRST — regression vs pre-existing (mandatory step 0)
Establish whether this is **introduced by a3/D-015** or **pre-existing**:
- Reproduce on `20260715a3`, then on a **pre-D-015 build** (or fallback-B / last known-good). The D-015 fix is in `panel-cmd-bridge.js` (panels), so the main-chart host path *should* be untouched — confirm or refute. Report the verdict clearly; if a3-introduced, it is urgent and blocks acceptance.

## Diagnostic (read-only, no product edits)
1. **Replay-state persistence on refresh:** find where the replay playhead / current-candle / session position is (or isn't) saved and restored across reload. What key/blob (localStorage / `chart_panel_state` / session)? Is the last replay timestamp persisted at all, or is it re-derived from the viewport/URL/refresh point on boot? Cite file:line (`replay-system.js`, boot/commit path, session-restore).
2. **"Jumps many candles after a bit":** is this the catch-up/coalesced-seek firing to reconcile a wrong restored playhead, or a cadence bug on the host tick? Distinguish.
3. **TF-switch drift/hide during replay:** trace why switching TF mid-replay drifts the viewport and hides content — viewport anchor lost on the TF refetch (ties T5 anchoring / TAL-01575 replay-start viewport shift), or the restored playhead is outside the loaded window.
4. **Mechanism report + fix recommendation:** is the root a single persistence gap (persist+restore the replay playhead on refresh) that makes the other two symptoms vanish, or three separate issues? Name the RC (RC-8 replay policy vs RC-3 anchoring vs a boot/persistence gap) and whether the fix is T8, T5, or a new persistence task. If it changes shipped behavior → escalation candidate.

## Guardrails
- READ-ONLY. No product/harness edits. Do NOT touch `react-parity-lib.mjs`.
- Freeze-exempt (replay/data path).
- Do not add guard #21 — if it's mirror-policy it belongs in the table; if it's persistence it's a scoped fix.

## Report — WORKER-REPORT-STANDARD.md
Regression-vs-pre-existing verdict (step 0), the persistence save/restore map, mechanism trace for all three symptoms, and the RC/track + fix recommendation with any escalation candidate named.

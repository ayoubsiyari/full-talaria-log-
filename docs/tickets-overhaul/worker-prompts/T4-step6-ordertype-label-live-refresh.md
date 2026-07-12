# WORKER PROMPT — T4 step 6 (Lane 3): order-type label live-refresh during drag

> Hand to the Lane 3 (order-entry) worker. Follow-up to T4 step 5 (D-005). The reclassification LOGIC is correct and shipped; this fixes the **label not refreshing continuously during an active drag.**

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T4 step 6**, Lane 3.

## SYMPTOM (PO live, `20260712b3`)
Dragging a buy/sell entry reclassifies the order type correctly (Limit/Stop/Market), but the on-screen **label updates only intermittently** — "works sometimes then stuck" until the user pauses or releases. Console during drag shows:
```
Skipping updatePreviewLines() - currently dragging
```
So the label/preview refresh is throttled/skipped mid-drag while the type is (correctly) recomputed.

## READ FIRST (binding)
- `docs/tickets-overhaul/worker-reports/T4-step5-order-type-reclassify-report.md` — reclassification decision points + kill-switch
- `docs/tickets-overhaul/DIRECTOR-DECISIONS.md` — D-005 (semantics: below=Limit/above=Stop/at=Market, 1-tick tolerance, per-leg)
- `docs/tickets-overhaul/INVARIANTS.md` — binding; **I7** (every render-relevant mutation ends in an invalidation), **I12**, **P6**

## MECHANISM (to confirm, then fix)
`order-manager.js` skips `updatePreviewLines()` while dragging (perf throttle). The order-type label/button text is coupled to that skipped update, so it doesn't repaint each drag frame. The reclassification itself already runs (T4 step 5).

## TASK — one gated fix
Decouple the **cheap** order-type label/button repaint from the **throttled** `updatePreviewLines()` recompute, so on every drag-move the label reflects the current classification — without un-throttling the heavy preview recompute (keep the perf guard).

- **Kill-switch:** `window.__TALARIA_DISABLE_ORDERTYPE_LIVE_LABEL_FIX` (default unset = fix ON). Keep it **separate** from `__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2` and the step-1/step-2 switches.
- **I7:** the reclassification-on-move must end in a label invalidation every frame it changes; no "updates when the user releases."
- Do not remove the `updatePreviewLines` drag throttle — only route the lightweight label/type text update outside it.

## BINDING CONSTRAINTS
- **RC-5 only.** Don't touch aggregate math (step 1), display/parse (step 2), or the reclassification decision logic (step 5) except to read/call.
- **I8:** both `order-manager.js` trees byte-identical (SHA256 both).
- **Build id:** do NOT run `bump-dist-v9-cache.mjs` — report the diff, Manager bumps (D-003).
- **I9:** multichart gate stays green. **L2:** production trees only.
- **P6:** if you assert any product-behavior invariant, quote the source ticket (TAL-00752 #17 for the label-must-update behavior).

## DELIVER (report as `.md`: `docs/tickets-overhaul/worker-reports/T4-step6-ordertype-label-live-refresh-report.md`)
1. Mechanism confirmation + file:line (where the label repaint was gated behind the drag throttle; how you decoupled it).
2. RED-first evidence: a repro showing the label not updating each drag-move (harness scenario if feasible, else scripted repro + exact steps/build id); GREEN after; RED again with the kill-switch.
3. State matrix (I5): single + multi-entry, replay off/paused/playing, host + panel.
4. SHA256 both trees; `node --check` clean; build-id diff left for Manager.
5. PO live spot-check steps: slow-drag a buy entry across all three zones and confirm the label tracks **continuously**, not just on release.

## STOP CONDITIONS
If continuous label refresh can't be decoupled from the heavy preview recompute without a perf regression → report the trade-off, don't force it. If the mechanism turns out to be the chart render pipeline (RC-2 / `scheduleRender`) rather than order-manager's own preview path → report; it may belong to T2/Lane 1.

# Lane 3 — DIAGNOSTIC (read-only, freeze-safe): trades-panel duplication (multichart + refresh) + wrong Duration

## Defect (PO live report + screenshot)
In a **multichart** layout, the trades panel (Open Positions) shows **duplicated trades**, and duplication also appears/worsens **after refresh (F5)**. Evidence: the tab header reads "Open Positions **4**" while the list renders ~8-10 identical rows (same EUR/USD Long @ 1.10449). Separately, the **Duration** column is wrong — same-timestamp trades ("Sep 4 10:06/19:04") show wildly different durations (5138h0m, 90h51m, 80h51m…).

Two likely-independent defects. Diagnose both.

## Constraints
- **READ-ONLY. No code edits, no fix.** Deploy frozen.
- Do NOT edit chart.js / replay-system.js / harness lib (Lane 4 owns harness during bless).
- Honest actuation (I15): reproduce via the real place-order → multichart → refresh path, not a synthetic stub.

## Defect 1 — duplication
Working hypotheses (confirm/refute with evidence):
- **H-A (multichart per-panel aggregation):** each panel iframe has its own order-manager instance; the host positions panel aggregates positions across panels, counting the same order once per panel. Check: is `updatePositionsPanel` rendering from a per-panel-aggregated source while the count uses deduped `openPositions`?
- **H-B (render source ≠ deduped source):** the tab count (4) and the list (8-10) disagree → the list iterates a different/duplicated array than the count. Find both sources.
- **H-C (refresh restore multiplies):** `restoreRuntimeOrderStateFromSession` (order-manager.js:4248) assigns (doesn't append), but is it called more than once (A6-2 bootstrap at ~5278 + another path), or once per panel from shared sessionStorage? Is there any dedupe-by-id before render?
Questions:
1. Exactly which array does the positions-panel list render from, and where is the "Open Positions N" count computed? Do they match?
2. In multichart, how many order-manager instances exist, and do they each restore from the same sessionStorage key?
3. Is duplication present WITHOUT multichart (single chart + refresh)? WITHOUT refresh (multichart, fresh)? Isolate the trigger(s).
4. Bisect against `__TALARIA_DISABLE_ORDER_PERSISTENCE_V1` (A6-2) and any multichart order-mirror switch: is this a regression from A6-2 persistence, or pre-existing multichart aggregation?

## Defect 2 — Duration
- Where is Duration computed for the open-positions row? (`now - openTime`?) Which clock — real `Date.now()` or the session/replay clock?
- Are restored `openTime` values in consistent units (ms vs s)? Do live-created vs session-restored orders differ? (5138h ≈ 214 days smells like a unit/base mismatch or wrong epoch.)
- Why do same-timestamp trades show different durations — does each duplicated copy carry a different/corrupted openTime, linking Defect 2 to Defect 1?

## Deliverable report
`docs/tickets-overhaul/worker-reports/ORD-DUP-DURATION-diagnostic-report.md`:
- Defect 1 root: exact render source vs count source (file:line), multichart instance model, refresh restore call count, whether regression (A6-2) or pre-existing. Isolation matrix (single/multi × fresh/refresh).
- Defect 2 root: duration formula site, clock used, openTime unit/base inconsistency (file:line).
- Whether the two defects share a root (duplicated copies with bad openTime) or are independent.
- Ranked freeze-safe fix menu per defect (each: kill-switch name, cost, freeze-risk). Flag anything needing a Director scope call.
- Proposed RED ids (e.g. `RC5-ORD-DUP-1` multichart no-dup, `RC5-ORD-DUP-2` refresh no-dup, `RC5-ORD-DURATION-1` correct duration).

Do the isolation matrix first (single/multi × fresh/refresh) — it tells us the trigger fastest. STOP after the report.

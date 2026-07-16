# Lane 3 — DIAGNOSTIC (read-only, freeze-safe): order/pending level not visible on chart until price reaches it

## Defect (PO live report)
When an order or **pending** order is placed, it shows correctly in the **trades panel**, but on the **chart** no level line is drawn. The level only appears once price moves to (hits) that level.

Registered as `ORD-LEVEL-VIS` in `docs/tickets-overhaul/RESOLUTION-TRACKER.csv`.

## Constraints
- **READ-ONLY. No code edits.** Tree is deploy-frozen. This is diagnosis only.
- Do not touch chart.js, replay-system.js, or the re-migration engine files.
- Honest actuation only (I15): if you build a probe, it must reproduce the real place-order → render path, not a synthetic stub.

## Working hypothesis (confirm or refute — do not assume)
The chart Y-axis autoscale computes its visible price **domain from candle + indicator data only**, and **does not include active order / pending-order levels**. Result: `yScale(entryPrice)` for a level far from current price lands **outside the plot area** and is clipped/off-canvas, so the line is invisible until price moves and the level enters the visible domain.

## Questions to answer
1. When a pending order is placed off-screen (far from current price), is `drawPendingOrderLine` actually called and does it create the `<line>` elements? (Confirm via the existing `🎨 Drawing pending ...` log at `order-manager.js:33222`.)
2. If created, what is the computed Y pixel for the line vs. the plot height? Is it outside `[0, plotHeight]` / clipped by an SVG clip-path?
3. Where is the Y-axis domain computed, and does it consider `this.orderLines` / `this.pendingOrders` entry prices? (Trace the autoscale/yDomain path — likely in chart core, not order-manager.)
4. Does an open (filled) order behave the same, or only pending orders?
5. Is there any existing off-screen edge-marker/arrow affordance that is failing, or none at all?
6. Multichart: does the same happen in panel-B, or main chart only?

## Deliverables (report file)
Write `docs/tickets-overhaul/worker-reports/ORD-LEVEL-VIS-diagnostic-report.md` containing:
- Confirmed root cause with exact file:line references.
- Whether line elements are created-but-clipped vs. never-created.
- The Y-domain computation site and whether it can include order levels.
- A ranked fix menu with cost + kill-switch name + freeze-risk for each:
  - (A) include active order levels in Y-autoscale domain
  - (B) off-screen edge marker (arrow + price at axis edge)
  - (C) both
- Which option you recommend and why, and whether it needs a Director decision (scope) or is a straight bug-fix.
- Proposed RED scenario id(s) for the harness that reproduce the invisible-level (e.g. place pending far from price → assert level line within plot bounds).

STOP after the report. Do not implement.

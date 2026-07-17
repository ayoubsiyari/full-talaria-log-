# Lane 2 — DIAGNOSTIC (READ-ONLY): multichart replay time-axis vs chart-content desync

## Symptom (PO live, S2 retest on blessed 20260717b16)
Multichart (2x2, EUR/USD 5m all panels), replay running. During play, in a panel:
- the **time axis advances/scrolls** (new time labels appear), BUT
- the **candles / chart content stay fixed** (viewport does not follow the playhead) —
- until the user clicks the blue **reset-scale / return-to-latest (▶)** button, at which point axis + chart re-sync.
PO expects the chart to follow the replay automatically, in step with the axis.

Screenshot on file: 4-panel 5m, blue "05:00" markers on the right price axis, ▶ buttons bottom-right of each panel.

## Task (read-only, honest actuation I15 — real multichart replay, no stub)
Characterize the desync and PLACE it:
1. **Is this the known-open H-S25 (panel replay-follow seam)?** H-S25 is IN-TRACK / NEEDS-REFIX (post-b1 landing order item 1) — NOT in the shipped STAGED batch. If this is H-S25, it's a known-open item, not a b16 regression, and the other S2 rows can still pass around it.
2. **Or a STAGED-row regression** (H-S18/20/28/79/82/83 or the D-015/016 cadence tickets)? If a row we just verified is actually broken, that's serious — say so.
3. **Or new?**
Trace the mechanism: how does the panel viewport follow the playhead during replay — the follow-offset / `_panelPlayFollowContinuousOffsetX` path (panel-cmd-bridge), the finest-TF cadence tick, and why the time axis updates while the price/candle viewport does not. Identify what the blue reset-scale button does that the auto-follow does not.

## Deliverable
`docs/tickets-overhaul/worker-reports/S2-replay-axis-chart-desync-diagnostic-report.md`: repro recipe, verdict (H-S25 known-open vs STAGED regression vs new) with file:line evidence, and a proposed switch-gated fix scope if actionable. NO product code changes.

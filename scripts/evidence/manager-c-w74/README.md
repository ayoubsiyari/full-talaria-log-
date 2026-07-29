# Manager C — W74 evidence (slim)

PO-workload HEAP-CYCLE calibration + replay interval budget.

| File | What |
|---|---|
| `w74-heap-b85-po-hand.slim.json` | **P1** pinned b85 raw hot heap (no GC); mean ~21 vs PO ~13 |
| `w74-heap-b85-soft-gc.slim.json` | **P1** pinned b85 soft-GC×1; mean 7.5, late +41.9≈PO; calib GREEN |
| `w74-heap-b99-po-hand.slim.json` | **P2 ship** b99 soft-GC×1 PO workload; HEAP RED / calib GREEN |
| `w74-interval-budget-b99.slim.json` | **P2** interval budget on b99 — GREEN (vs b90 RED) |
| `w74-interval-budget-b90.slim.json` | GATE-01: budget RED on known-bad b90 |
| `w74-heap-b90-po-workload.slim.json` | pinned b90 forced-GC PO workload |
| `w74-heap-po-workload-6cycle.slim.json` | earlier drifting canary (b95 era) |
| `w74-interval-budget.slim.json` | earlier interval on drifting surface |
| `pinned-canary/` | B handoff + SSH-key bringup |

Grade only with verified `__TALARIA_CHART_BUILD_ID` after bringup. Restore ship tip (`b99`) after historical pins.

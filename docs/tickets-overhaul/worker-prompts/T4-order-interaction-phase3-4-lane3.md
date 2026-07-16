# T4 — Order-interaction landing Phases 3→4 (Lane 3) — continue D-020 series

Phases 0–2 landed (`84926d3e`, `b50d45d4`, `b6b4473d`). Continue the same `order-manager.js` region series. Same discipline: one phase per commit, file-scoped, both trees I8, RED-first → GREEN → switch-OFF RED-again, real actuation + order end-state (I15).

## Phase 3 — #5 keyboard-pan × replay draft desync (TAL-00752#5)
Switch `__TALARIA_DISABLE_ORDER_DRAFT_SCALE_REFRESH_FIX` (default ON).
- On chart scale/offset change (keyboard pan during replay), `updatePreviewLinePositions` repositions draft preview lines **from store prices only** — never `invert(mouse)` → store.
- `updateOrderPanelPrice` already skips limit/stop (~17047) — preserve; ensure keyboard pan does not trigger a spurious market-entry overwrite.
- Respect the provisional guard (`_oiShouldRefreshDraftGeometryOnly` from Phase 0) — refresh SVG geometry, no store commit on scale change.
- **Optional chart.js hook:** if OM cannot observe viewport change via an existing render/scale hook, a thin `orderManager.onChartViewportChanged()` call may be needed. **Flag it — do NOT force a chart.js edit** into this freeze-safe slot; if required, report it as a separate micro-slot for Manager scheduling.
- RED (RC5-OI-3): replay active, draft limit/stop visible, keyboard-pan → preview lines float off candles until click. GREEN: lines track store prices; limit entry numeric unchanged.

## Phase 4 — A6-3 order-half: price-axis must not mutate order prices (TAL-01615, order-side only)
Switch `__TALARIA_DISABLE_ORDER_PRICE_AXIS_ISOLATION_FIX` (default ON).
- **D-019/D-020 scope:** the axis-side Defect D (price-label drag) is CANCELLED — this is **only** the order-side isolation. RED asserts **order-line invariance**, not axis behavior.
- `updateOrderLines` repositions from store prices only; `makeLineDraggable` mousemove skips store write when `chart._isPriceAxisZoomDragging?.()` (read-only probe).
- **chart-half flag** (`_isPriceAxisZoomDragging` setter) is a SEPARATE gated PR post-combined-build — do NOT add it here. OM-only phase tests store immutability under a simulated flag.
- RED (RC5-OI-4): open position with SL, drag price-axis → assert `openPositions[id].stopLoss` / `openPrice` unchanged (pixel Y may change). Switch OFF → store price changes on axis drag.

## Guardrails
- `order-manager.js` + `order-interaction-guard.mjs` + aggregates ONLY. No replay-system.js, multichart-parent, chart.js (except the flagged optional #5 hook — report, don't commit), known-failing.json.
- Reconcile RED ids RC5-OI-3 / RC5-OI-4 with the A6 contract; no duplicate harness ids. Lane 4 registers after RED.

## Report — WORKER-REPORT-STANDARD.md
Deliverable: `docs/tickets-overhaul/worker-reports/T4-order-interaction-phase3-4-report.md` — per-phase RED→GREEN + switch A/B, commit hashes + SHA256 (both trees), any flagged chart.js dependency for #5, and NEEDS-LIVE items for the combined build. Then confirm the freeze-safe order-interaction series is complete (A6-2 F5 persist is the next separate task).

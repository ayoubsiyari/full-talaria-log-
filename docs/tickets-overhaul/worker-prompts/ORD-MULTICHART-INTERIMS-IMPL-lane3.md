# Lane 3 — Multichart order parity: freeze-safe INTERIM fixes (morning implementation)

## Source of truth (read all three first)
- `docs/tickets-overhaul/worker-reports/ORD-MULTICHART-PARITY-diagnostic-report.md` (lockout + dual-replay PnL)
- `docs/tickets-overhaul/worker-reports/ORD-DUP-DURATION-diagnostic-report.md` (duplication + duration)
- `docs/tickets-overhaul/A6-4-HOST-CANONICAL-ORDER-STORE-DESIGN.md` (unifying architecture + interim catalog)

All three converge: root = per-panel `OrderManager` clones + shared non-panel-scoped session key (A6-4). Full host-canonical rework is **post-unfreeze, Director-sequenced** — do NOT attempt it here. This ticket lands ONLY the freeze-safe interims (no `chart.js` edit, each independently kill-switched).

## Scope — implement as separate, independently-switchable hunks, each with its own switch-OFF RED
1. **Duplication on refresh** — `__TALARIA_DISABLE_ORDER_MC_RESTORE_DEDUPE_V1`
   - id-dedupe in `registerOpenOrder` (`order-service.js:336-339`); rebuild `orders[]` from restored `openPositions` on A6-2 restore (`order-manager.js:4320-4321`); make `addOrder` mirror dedupe check `openPositions`, not just `orders[]` (`panel-cmd-bridge.js:3505-3511`, `MultichartGrid.jsx:4713-4714`).
2. **Persistence panel-scoping** — `__TALARIA_MC_ORDER_PERSIST_PANEL_SCOPE_V1`
   - panel-scope the session key `chart_orders_runtime_session_v1:${sessionId}` (`order-manager.js:19-22`) so iframes don't echo/persist each other's rows; iframe skips restore on embed (host is the single persistence writer).
3. **Wrong duration** — `__TALARIA_DISABLE_TRADE_DURATION_NORM_V1`
   - add `normalizeEpochMs` to the React row builder `orderManagerTradeRows.js` (`21-27`, `1206-1209`, `1272-1295`) to match the legacy dock (`order-manager.js:41650-41686`); stop the `Date.now()` fallback producing wall-clock-vs-replay deltas.
4. **Dual-replay PnL stall** — `__TALARIA_MC_REPLAY_PNL_HOST_AGG_V1`
   - host rail must aggregate per-panel PnL, not read `window.chart.orderManager` only (`TalariaV8bLive.jsx:11981-11998`); ensure the background mark path works in the multichart embed (lazy `_miSeriesByFileId`/`panelManager` absent).
5. **Panel-B lockout** — replay-ready gate on Execute + focus-loss provisional cancel
   - gate Execute until iframe replay is active (`panel-cmd-bridge.js:3478-3479` defer race); clear stuck A6-1 provisional / `multichartDraftDragBusy` on focus loss so panel B can accept a new order.

## Rules
- Both I8 trees byte-identical; rebuild dist; bump build id.
- Each switch OFF = honest RED reproducing that symptom; ON = fixed. Name the discriminator per row (D-023).
- File-scoped commits per hunk (order-manager/order-service/bridge vs. React-path `orderManagerTradeRows.js`/`TalariaV8bLive.jsx`).
- Honest actuation (I15): reproduce in the real 2-panel/2-ticker multichart embed, not a stub. Where a hunk can only be dev-verified, mark NEEDS-LIVE for PO.
- If any hunk turns out to require host-canonical rework to be correct (not just interim-safe), STOP that hunk and flag it — Manager escalates A6-4 pull-forward rather than half-doing it.

## Deliverable
`docs/tickets-overhaul/worker-reports/ORD-MULTICHART-INTERIMS-IMPL-report.md`: per-hunk switch, files/lines, RED/GREEN discriminator evidence, build id, commit hashes, NEEDS-LIVE list for PO.

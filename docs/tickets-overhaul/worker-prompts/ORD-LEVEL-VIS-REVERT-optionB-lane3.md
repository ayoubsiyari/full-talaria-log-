# Lane 3 — REVERT ORD-LEVEL-VIS Option B (off-screen order edge markers) — PO request

## Decision
PO does not want the off-screen order edge markers (▲/▼ + price at chart edge). **Remove the feature entirely** — revert to the prior behavior (an off-screen order/TP/SL/entry level simply is not drawn until price brings it into the visible range).

Feature was added in commit `6fe92e25` (ORD-LEVEL-VIS Option B, D-025), files:
- `order-manager.js` — off-screen marker rendering (`.om-offscreen-marker`, ▲/▼ pill), `__TALARIA_DISABLE_ORDER_OFFSCREEN_MARKER_V1` switch
- `order-offscreen-marker.{mjs,test.mjs}` (both trees)

## Constraints — surgical, NOT a blind git revert
- `order-manager.js` changed AFTER `6fe92e25` (TDZ fix `51bd2a3d`/b11; SL/TP-drag v2 `7722a71f`/b2). **Do NOT disturb those fixes.** Remove ONLY the off-screen-marker hunks + the switch + the marker draw/position calls.
- Delete `order-offscreen-marker.{mjs,test.mjs}` from BOTH trees (I8).
- BOTH trees byte-identical after (I8). Rebuild `dist-v9`, bump build id.
- Confirm no dangling references to the marker function / switch remain (grep `om-offscreen-marker`, `OFFSCREEN_MARKER`, the marker fn name → zero hits after).

## Proof
- Place an order/TP/SL far off the visible range → **no edge marker** appears (reverts to hide-until-in-range).
- Multi-entry (b11 TDZ fix) still works — no `splitOrderType` error.
- Open SL/TP drag (b2 v2 fix) still works — full line follows during drag, commits on release.
- Console clean.

## Deliverable
`docs/tickets-overhaul/worker-reports/ORD-LEVEL-VIS-REVERT-report.md`: the removed hunks (both trees), deleted files, grep-clean confirmation, TDZ + SL/TP-drag no-regression check, build id bump, file-scoped commit hash. NEEDS-LIVE (PO: confirm markers gone).

## Note
This reopens the original ORD-LEVEL-VIS report (levels invisible until price reaches them). Per D-025, the eventual answer is Option A ("keep orders in view", opt-in, default OFF) post-unfreeze — NOT the edge marker. Manager will inform the Director that Option B was pulled at PO request.

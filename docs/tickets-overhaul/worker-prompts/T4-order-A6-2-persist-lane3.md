# T4 — A6-2 order persistence across refresh (Lane 3)

The freeze-safe order-interaction series (Phases 0–4) is complete. Next contract row: **A6-2 — orders survive F5**, per D-019 spec.

## Spec (D-019, binding)
- **Pending AND open orders both survive a page refresh (F5).**
- **Session-scoped:** persistence lives for the session (survives refresh/reload within the session); it is NOT permanent cross-session storage. Use `sessionStorage` (cleared on tab close / new session), not `localStorage`.
- On restore: pending limit/stop orders reappear at their prices; open positions reappear with SL/TP intact; no duplicate/ghost orders; replay state interplay per existing P6 refresh spec (restore paused, no auto-jump).

## STEP 0 — region map FIRST (do not blind-edit chart.js)
A6-2 needs a save trigger + a boot/restore hook. Order state save/restore belongs in `order-manager.js`, but the **restore call on boot** may need a chart.js/app-shell hook.
1. Map exactly where orders are constructed on load and where the restore call must fire.
2. **Confirm the chart.js touch region (if any) is DISJOINT from:** re-migration Phase-1 (`chart.js` ~2349–2365), D-017 snap-back (2456–2526, 17296–17357), T8 replay/cadence/TF regions (21157+). 
3. If the restore hook can live entirely in `order-manager.js` init (no chart.js edit) → proceed freeze-safe. **If it requires a chart.js edit in a contested region → STOP and report for Manager scheduling** (do not create a merge hazard against re-migration).

## Implement (if region clear)
- Switch `__TALARIA_DISABLE_ORDER_PERSISTENCE_V1` (default ON).
- Save order state (pending + open, with SL/TP/splits) to `sessionStorage` on mutation/commit; restore on boot behind the switch.
- I8 mirror both trees; file-scoped commit.

## Proof (I15)
- RED-first: place 1 pending limit + 1 open position with SL/TP → F5 → assert both restored with correct prices (real reload in harness or documented manual repro).
- Switch OFF → orders gone after refresh (RED-again).
- Property test the pure save/restore serialization; end-state = restored order store, not call-count.

## Guardrails
- `order-manager.js` + aggregates + (only if STEP 0 clears it) a discrete chart.js/app-shell restore hook. No replay-system.js, no multichart-parent, no re-migration/T8 regions, no known-failing.json.

## Report — WORKER-REPORT-STANDARD.md
Deliverable: `docs/tickets-overhaul/worker-reports/T4-order-A6-2-persist-report.md` — STEP 0 region map + disjoint confirmation (or STOP escalation), RED→GREEN + switch A/B, commit hash + SHA256 both trees, NEEDS-LIVE PO steps (place pending+open → F5 → both survive, per D-019). This closes the freeze-safe half of the A6 order-interaction contract.

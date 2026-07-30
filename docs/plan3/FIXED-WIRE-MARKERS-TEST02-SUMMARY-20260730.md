# Fixed-wire markers — TEST-02 discriminating set (b113)

**Prior TEST-01:** 43/50 “on-wire” using any present needle.  
**TEST-02:** only needles **absent on b103 pretest** and **present on wire** certify.

## Discriminating and on b113 wire (certify)

| Needle | Path |
|---|---|
| `__TALARIA_DISABLE_M24_DISPLAY_ID_STABILITY_V1` | order-manager.js |
| `_resolveJournalDisplayTradeId` | order-manager.js |
| `__TALARIA_DISABLE_ORDER_STABLE_LABEL_HOVER_DOM_V1` | order-manager.js |
| `__TALARIA_DISABLE_ORDER_PENDING_PROTECTION_CLEAR_V1` | order-manager.js |

## Discriminating and off b113 wire (next train / B)

| Needle | Rows |
|---|---|
| `__TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1` | Rayan #8 |
| `__TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1` | Rayan #8 |
| `_assertExplicitPlaceAudit` | Rayan #8 |
| `__TALARIA_DISABLE_ORDER_PAIR_SWITCH_VISUAL_REBIND_V1` | TAL-01807b |

## Thrown out as vacuous (present on b103)

28 needles — full list in `WIRE-AUDIT-TEST02-20260730b113.json` → `vacuousNeedlesThrownOut`.  
Notable: `_m24ReconcileOrderIdCounter` (must never certify Rayan #8).

## Special rows

| Ticket | Disposition |
|---|---|
| Rayan #2 | no discriminating textual marker; runtime source-contract non-discriminating vs b103 → browser PO |
| TAL-01896 | **needs a better marker** |
| M24 / TAL-01926 | live API probe (`backend-journal-prune-live-probe.mjs`) |

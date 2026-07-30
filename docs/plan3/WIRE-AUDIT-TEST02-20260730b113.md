# WIRE-AUDIT TEST-02 (amended) — 20260730b113

**Tip:** `9c3c13834`  
**Schema:** `talaria.wire-audit-test02.v2`  
**Reference:** `<fix-commit>^` per marker (git history) — **not** b103  
**Correction:** `CORRECTION-B103-IS-NOT-A-PRE-FIX-CORPUS-…-1635.md`  
**Prior mistaken TEST-02 (b103 corpus):** 10/50 → **corrected:** **39/50** discriminating on-wire

## Summary

| Verdict | Count |
|---|---:|
| on-wire | 39 |
| partial | 0 |
| off-wire | 2 |
| wire-unproven | 7 |
| delivery-unserved | 1 |
| backend-needs-api-probe | 1 |

## Money-path rows

| Ticket | Verdict | Detail |
|---|---|---|
| Rayan #2 | on-wire | behavioural primary: host order survives peer remove (sim); live MC bytes do not clear openPositions near removeChart; RED sim under retainGuard=false fails by construction |
| Rayan #8 | off-wire | behavioural primary blocked: gap + place-audit product bytes absent on live OM — cannot observe fixed behaviour on pre-fix wire; text fallback confirms off-wire; B next train |
| TAL-01896 | delivery-unserved | orderManagerTradeRows is NOT served on the canary surface (HTML traps on chart paths; zero Next chunk hits; not inlined into chart.js/OM). Delivery/routing item for B — larger than a marker rewrite. |
| TAL-01807b | off-wire | discriminating markers absent on wire (fix not in deployed bytes) |
| M24 / TAL-01926 | backend-needs-api-probe | GET /api/sessions/1/state → HTTP 401 (no token). Endpoint present; write discriminator needs --token + disposable session. Coordinate with B — do not wait. |

## Discriminating on wire

- `TALARIA_DISABLE_TRADE_MARKER_CANONICAL_PROJECTION_V1`
- `__TALARIA_DISABLE_M14_FIB_SETTINGS_LEVELS_PERSIST_V1`
- `__TALARIA_DISABLE_M24_DISPLAY_ID_STABILITY_V1`
- `__TALARIA_DISABLE_M24_ORDER_ID_ALLOCATOR_V1`
- `__TALARIA_DISABLE_ORDER_BALANCE_FLOOR`
- `__TALARIA_DISABLE_ORDER_BALANCE_FLOOR_V1`
- `__TALARIA_DISABLE_ORDER_BE_PLACE_ANCHOR_V1`
- `__TALARIA_DISABLE_ORDER_CANCEL_BEFORE_CONFIRM_V1`
- `__TALARIA_DISABLE_ORDER_ENTRY_NEW_DRAFT_LEVELS_RESET_V1`
- `__TALARIA_DISABLE_ORDER_ENTRY_SCREENSHOT_IDEMPOTENT_V1`
- `__TALARIA_DISABLE_ORDER_LIFECYCLE_EVENT_OWNERSHIP_V1`
- `__TALARIA_DISABLE_ORDER_LINE_EDGE_VISIBILITY_V1`
- `__TALARIA_DISABLE_ORDER_MULTI_TP_COINCIDENT_STACK_V1`
- `__TALARIA_DISABLE_ORDER_PAIR_SWITCH_DRAFT_REBIND_V1`
- `__TALARIA_DISABLE_ORDER_PENDING_CLOSE_NETTING_V1`
- `__TALARIA_DISABLE_ORDER_PENDING_PROTECTION_CLEAR_V1`
- `__TALARIA_DISABLE_ORDER_PNL_RESTORE_STABLE_V1`
- `__TALARIA_DISABLE_ORDER_PREVIEW_LIVE_RECALC_V1`
- `__TALARIA_DISABLE_ORDER_RISK_QTY_ON_SL_COMMIT_V1`
- `__TALARIA_DISABLE_ORDER_SEL01_EXACT_TEARDOWN_V1`
- `__TALARIA_DISABLE_ORDER_SINGLE_TP_AFTER_TRAIL`
- `__TALARIA_DISABLE_ORDER_SINGLE_TP_AFTER_TRAIL_V1`
- `__TALARIA_DISABLE_ORDER_SPLIT_ENTRY_HOVER_STICK_V1`
- `__TALARIA_DISABLE_ORDER_STABLE_LABEL_HOVER_DOM_V1`
- `__TALARIA_DISABLE_ORDER_TYPE_ONE_TICK_PENDING_V1`
- `__TALARIA_DISABLE_TRADE_MARKER_CANONICAL_PROJECTION_V1`
- `__TALARIA_MC_DISABLE_CANONICAL_REPLAY_MARK_V1`
- `_allocateOrderId`
- `_applyCanonicalReplayMarkFromDetail`
- `_claimOrderLifecycleEvent`
- `_emitPendingMirrorSync`
- `_m24ReconcileOrderIdCounter`
- `_pendingTpDeleteSelector`
- `_resolveJournalDisplayTradeId`
- `_stopLossFillPrice`
- `resolveEffectiveCurrentPrice`

## Discriminating off wire

- `__TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1`
- `__TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1`
- `__TALARIA_DISABLE_ORDER_PAIR_SWITCH_VISUAL_REBIND`
- `__TALARIA_DISABLE_ORDER_PAIR_SWITCH_VISUAL_REBIND_V1`
- `_assertExplicitPlaceAudit`

## Method

For each marker needle: locate introducing commit via ledger/marker candidates or
`git log -G`; require **absent at `commit^`** and **present on deployed wire**.
Money rows prefer runtime/behavioural probes (overlay) when present.

# WIRE-AUDIT TEST-02 — 20260730b113

**Tip:** `f2d60a461`  
**Schema:** `talaria.wire-audit-test02.v1`  
**Pre-fix corpora:** `artifacts/wire-pretest/b103` + `artifacts/wire-pretest/ckpt`  
**Prior TEST-01 strict on-wire:** 43 → **TEST-02 strict on-wire:** **10**

## Summary

| Verdict | Count |
|---|---:|
| on-wire | 10 |
| partial | 0 |
| off-wire | 2 |
| wire-unproven | 37 |
| backend-needs-api-probe | 1 |

## Money-path rows (priority)

| Ticket | Verdict | Detail |
|---|---|---|
| Rayan #2 | wire-unproven | runtime source-contract holds on live MC bytes, but identical contract already holds on b103 — not discriminating; needs browser PO (host order survives peer removeChart) |
| Rayan #8 | off-wire | gap reconcile + explicit-place audit flags absent on live OM (discriminating vs b103) — route to B next train; no browser substitute for missing product bytes |
| TAL-01896 | wire-unproven | duration-norm kill-switch exists in tip AND b103 TradeRows source, but is not on a fetchable canary module (HTML trap / not shipped at /chart/.../orderManagerTradeRows.js). Not "needs a build" for missing product — needs a better marker (served bundle path or live journal duration probe). Still routed to B next train for auditable ship. |
| TAL-01807b | off-wire | discriminating markers absent on wire (fix not deployed or not in served bytes) |
| M24 / TAL-01926 | backend-needs-api-probe | GET /api/sessions/1/state → HTTP 401 (no token). Endpoint present; write discriminator needs --token + disposable session. Coordinate with B — do not wait. |

## Discriminating markers on wire

- `__TALARIA_DISABLE_M24_DISPLAY_ID_STABILITY_V1`
- `__TALARIA_DISABLE_ORDER_PENDING_PROTECTION_CLEAR_V1`
- `__TALARIA_DISABLE_ORDER_STABLE_LABEL_HOVER_DOM_V1`
- `_resolveJournalDisplayTradeId`

## Discriminating markers off wire (need next train / B)

- `__TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1`
- `__TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1`
- `__TALARIA_DISABLE_ORDER_PAIR_SWITCH_VISUAL_REBIND_V1`
- `_assertExplicitPlaceAudit`

## Vacuous needles thrown out (present on b103)

28 needles. See JSON `vacuousNeedlesThrownOut`.

## Method

For each marker: present on b103 pretest bytes → **vacuous**, discarded.  
Structural needles (`removeChart`, `openPositions`, …) never certify.  
Only discriminating markers (absent b103, present wire) can yield `on-wire`.

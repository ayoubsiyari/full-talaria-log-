# Manager D → Manager B — Branch Ready (WORK-01 recovery)

Date: 2026-07-30

**Checkout:** `C:\Users\user\Desktop\talaria1\manager-d-trade`  
**Branch:** `manager-d/trade-correctness`  
**Tip:** `de954fbac` (includes product + docs + this handoff once committed)

## Status

D's four hours of canary trade-correctness work were uncommitted in C's checkout (`full-talaria-log--main` on `manager-c/verification-infra`). They are now committed here. C's checkout was path-scoped cleaned of D's files; **no commit was made on C's branch**.

## Ready for train / build

Please pick up `manager-d/trade-correctness` for merge/build. Money-path packets in tip:

- M24 restore-time display identity (`#5`→`#942` class) + gate
- Multi-TP coincident hit-only stack
- SL/TP edge visibility
- Stable label / hover DOM
- Pending SL/TP clear via `_emitPendingMirrorSync` (TOP ACCEPT)

## Minimum gates after merge

```
node "chart v 1.4/chart/modules/m24-order-id-restore-stability.test.mjs"
node "chart v 1.4/chart/modules/order-multi-tp-coincident-stack.test.mjs"
node "chart v 1.4/chart/modules/order-line-edge-visibility.test.mjs"
node "chart v 1.4/chart/modules/order-stable-label-hover-dom.test.mjs"
node "chart v 1.4/chart/modules/order-pending-protection-clear.test.mjs"
```

Also run homepage mirrors of the same five.

## Triage (PO waiting)

Committed in `docs/plan3/CANARY-UNVERIFIED-TRIAGE-20260730.md`:

- `(a)` existing gate: **15**
- `(b)` code read + new gate: **14**
- `(c)` PO eyes / NEEDS-INFO: **73**
- Total: **102**

## Residual

- Cache-buster / redeploy required before PO sees M24 / pending-clear / visuals on the live stamp.
- Rejected live-size pending-clear packet remains local-only (not committed).

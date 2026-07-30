# TAL-01896 — delivery answer (TEST-02 corrected)

**Date:** 2026-07-30  
**Ticket:** TAL-01896 (trade duration norm)  
**Named verdict:** **not served on the canary surface** (delivery / B routing)

---

## Delivery census (`WIRE-RUNTIME-PROBES-20260730b113.json`)

| Probe | Result |
|---|---|
| `/chart/talaria-design/src/orderManagerTradeRows.js` | HTML trap / not a JS module |
| Other guessed chart paths | not a module |
| Homepage `/_next/static/*` chunks linked from `/` | **0** hits for `tradeDurationNormV1Enabled` |
| Inlined into served `order-manager.js` / `chart.js` | **no** |

**Conclusion:** this is not a marker-vocabulary problem. The module is not delivered on the
canary surface D can audit. Routed to B with #8 / 01807b for the next train; skip register
stays armed.

## Not “needs a build” of the kill-switch

The kill-switch already exists in git (including b103 tree). Shipping an **auditable served
path** (static module or chunk that contains the marker) is the B delivery item.

# TAL-01896 — TEST-02 resolution

**Date:** 2026-07-30  
**Ticket:** TAL-01896 (trade duration norm)  
**Named verdict:** **needs a better marker**

---

## Not “needs a build” (product invention)

`__TALARIA_DISABLE_TRADE_DURATION_NORM_V1` / `tradeDurationNormV1Enabled` are already present in the **b103** tree at `chart v 1.4/talaria-design/src/orderManagerTradeRows.js` (commit ancestry includes `cf32a86d3`). Re-shipping the same kill-switch is not the missing piece.

## Why the TEST-01 audit said off-wire

The canary does not serve that file as a fetchable chart module at the guessed URLs (`/chart/talaria-design/src/orderManagerTradeRows.js` returns an HTML shell). Static wire scan → HTML trap → classified off-wire. That is a **method/marker** failure, not proof the homepage never bundles the helper.

## Better marker (required)

1. **Preferred:** locate the served homepage/`_next` chunk (or chart embed surface) that contains `tradeDurationNormV1Enabled` and add that path to `wire-audit-fixed.mjs` PATH_HINTS.  
2. **Runtime:** live journal duration cell probe on the open session (observe norm’d duration formatting with kill off vs on) once a disposable session is available.  
3. **Still routed to B** for the next train so the freeze build exposes an auditable path — D does not wait on B to name this verdict.

## Freeze

Skip register keeps TAL-01896 open on b113; `--freeze` fails while it remains skipped.

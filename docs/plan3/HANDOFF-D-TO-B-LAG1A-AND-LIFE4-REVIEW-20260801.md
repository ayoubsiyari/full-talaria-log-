# Handoff D -> B - LAG-1a and LIFE-4 Review

**From:** Manager D  
**To:** Manager B  
**Date:** 2026-08-01  
**Reason:** money-path review required by Director ruling; E PROC-3 sweep remains a seal precondition.

## Review Scope

LAG-1a changed:

- `chart v 1.4/chart/modules/order-manager.js`
- `homepage/public/chart/modules/order-manager.js`
- `scripts/lag1a-marker-index-cache-gate.mjs`
- `scripts/tests/lag1a-marker-index-cache-gate.test.mjs`
- `package.json`

The implementation caches `_chartIndexForCloseMarkerOnChart` marker time lookups against the active
`chart.data` array behind `__TALARIA_MARKER_INDEX_CACHE_V1`. It does not touch A's caller-side row in
`chart.js` and does not touch `replay-system.js`.

LIFE-4/M8 remains the prior D delivery:

- `HANDOFF-D-TO-B-M8-CLIENT-MIRROR-WRITES-20260731.md`
- `M8-STATE-BOUND-GUARD-20260731.md`

D reran mirror proof through the LAG-1a test suite for `order-manager.js`; the M8 state-bound guard remains
the review packet for `chart.js` plus `order-manager.js` hydrate provenance. KILL-04 does not apply to either
row: both touch trades/orders/journal authority and must walk through B review and E PROC-3.

PROC-3 axes for E:

- Present: LAG-1a cache helpers are in both order-manager mirrors; M8 hydrate guards are in backend plus both
  client mirrors.
- Bound: LAG-1a is called by `_chartIndexForCloseMarkerOnChart`; M8 is called by the live state hydrate route
  and consumed by client journal provenance.
- Mirrored: order-manager and chart mirrors pass byte-identity checks; M8 specifically proves both mirrors
  byte-identical because the prior one-mirror miss is a named PROC-3 failure mode.
- Discriminating: LAG-1a keeps wrong-instrument RED-armed; M8 rejects failed/partial hydrate as empty-history
  durable authority.

## Evidence For Review

Run:

`npm run test:lag1a-marker-index-cache`

`npm run preflight:lag1a-marker-index-cache`

Observed D preflight:

- zero-trade arm: 0.1 -> 0.0 ms/s, GREEN.
- trade-heavy arm: 92.5 -> 3.9 ms/s, GREEN.
- wrong-instrument trade arm: RED-armed.
- trade-heavy arm carries 43 real orders on `chart.orderManager`.
- source-reverted mutant goes RED: trade-heavy 131.8 -> 170.5 ms/s.

Review ask:

- Confirm the cache keying cannot cross instruments or stale bar arrays.
- Confirm `__TALARIA_MARKER_INDEX_CACHE_V1` is acceptable as the row switch.
- Confirm the wrong-instrument RED arm is sufficient for B's merge train before seal.

# LAG-1a — Marker Index Cache

**Owner:** D  
**Switch:** `__TALARIA_MARKER_INDEX_CACHE_V1`  
**Verdict:** GREEN in D preflight; B review and E PROC-3 sweep required before seal.

## What Changed

`_chartIndexForCloseMarkerOnChart` now resolves marker timestamps through a cache keyed by the active
`chart.data` array. The cache is held in a `WeakMap`, rebuilds when the bar-array identity/shape changes,
and falls back to the legacy scan if the array is not monotonic.

Changed mirrors:

- `chart v 1.4/chart/modules/order-manager.js`
- `homepage/public/chart/modules/order-manager.js`

No `chart.js` or `replay-system.js` changes were made. LAG-1b caller-side gating remains A's row.

## PROC-3 Packet

- Present: `_markerIndexCacheV1Enabled`, `_markerIndexCacheForData`, and `_findCandleIndexForTimeCached`
  exist in both `order-manager.js` mirrors.
- Bound: `_chartIndexForCloseMarkerOnChart` calls `_findCandleIndexForTimeCached` on the marker render path.
- Mirrored: `git diff --no-index --quiet "chart v 1.4/chart/modules/order-manager.js" "homepage/public/chart/modules/order-manager.js"` passed.
- Discriminating: the gate measures cache off vs on in Edge, requires both regimes green, and keeps
  `NC-LAG1A-WRONG-INSTRUMENT` RED-armed.

KILL-04 does not apply to this row. LAG-1a touches orders/trades and remains money-path: both-regime oracle,
B review, wrong-instrument RED arm, then E PROC-3.

## Evidence

Command:

`npm run preflight:lag1a-marker-index-cache`

Browser:

`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`

Result:

- `LAG-ZT-ZERO-TRADE`: 0.1 -> 0.0 ms/s, GREEN, no regression.
- `LAG-1A-TRADE-HEAVY`: 92.5 -> 3.9 ms/s, GREEN, improvement 88.6 ms/s.
- Trade arm carried 43 real orders on `chart.orderManager`, 6,242 bars, 5,160 marker lookups/s.
- `NC-LAG1A-WRONG-INSTRUMENT`: RED by construction and RED-armed.
- Source-reverted mutant (`_chartIndexForCloseMarkerOnChart` bound back to `_findCandleIndexForTime`) went RED:
  trade-heavy 131.8 -> 170.5 ms/s, no-regression false, improved false.

Focused tests:

`npm run test:lag1a-marker-index-cache`

The test suite asserts both order-manager mirrors are byte-identical and both carry
`__TALARIA_MARKER_INDEX_CACHE_V1`, `_markerIndexCacheForData`, and `_findCandleIndexForTimeCached`.

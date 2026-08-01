# Handoff D to E - PROC-3 Sweep for LAG-1a and LIFE-4

**From:** Manager D  
**To:** Manager E  
**Date:** 2026-08-01  
**Ruling:** `RULING-FULL-ROSTER-BEFORE-SEAL-SOAK-01-QUIESCENCE-AND-KILL-04-20260801-0935.md`

KILL-04 does not apply to D's two current rows. LAG-1a and LIFE-4/M8 are money-path rows, so they require
oracle green in both regimes where applicable, B review, wrong-instrument RED arm for trade gates, and E's
PROC-3 present/bound/mirrored/discriminating sweep.

## LAG-1a

Files:

- `chart v 1.4/chart/modules/order-manager.js`
- `homepage/public/chart/modules/order-manager.js`
- `scripts/lag1a-marker-index-cache-gate.mjs`
- `scripts/tests/lag1a-marker-index-cache-gate.test.mjs`

PROC-3 axes:

- Present: `__TALARIA_MARKER_INDEX_CACHE_V1`, `_markerIndexCacheForData`, and
  `_findCandleIndexForTimeCached` are in both `order-manager.js` mirrors.
- Bound: `_chartIndexForCloseMarkerOnChart` calls `_findCandleIndexForTimeCached` on the marker render path.
- Mirrored: `git diff --no-index --quiet "chart v 1.4/chart/modules/order-manager.js" "homepage/public/chart/modules/order-manager.js"` passed.
- Discriminating: `npm run preflight:lag1a-marker-index-cache` uses Edge, cache off vs on, two regimes, and
  `NC-LAG1A-WRONG-INSTRUMENT` RED-armed.

Latest D measurement:

- zero-trade: 0.1 -> 0.0 ms/s.
- trade-heavy: 92.5 -> 3.9 ms/s with 43 real orders on `chart.orderManager`.
- source-reverted mutant: RED, trade-heavy 131.8 -> 170.5 ms/s.

## LIFE-4 / M8

Files:

- `chart v 1.4/chart/chart.js`
- `homepage/public/chart/chart.js`
- `chart v 1.4/chart/modules/order-manager.js`
- `homepage/public/chart/modules/order-manager.js`
- `chart v 1.4/chart/session_journal_store.py`
- `chart v 1.4/chart/api_server.py`

PROC-3 axes:

- Present: bounded state-hydrate backend helpers and client hydrate provenance guards exist.
- Bound: `/api/sessions/{id}/state` calls `resolve_session_journal_for_state_hydrate` and applies returned
  metadata; client hydrate consumes completeness/heavy-field metadata before assigning durable provenance.
- Mirrored: M8 specifically proves both client mirrors byte-identical:
  - `git diff --no-index --quiet "chart v 1.4/chart/chart.js" "homepage/public/chart/chart.js"` passed.
  - `git diff --no-index --quiet "chart v 1.4/chart/modules/order-manager.js" "homepage/public/chart/modules/order-manager.js"` passed.
  - `npm run test:m8-state-bound` includes the mirror identity invariant.
- Discriminating: `npm run preflight:m8-state-bound` checks failed/partial/slim hydrate cannot be interpreted
  as an empty journal with durable delete authority.

B review packet:

- `HANDOFF-D-TO-B-M8-CLIENT-MIRROR-WRITES-20260731.md`
- `HANDOFF-D-TO-B-LAG1A-AND-LIFE4-REVIEW-20260801.md`

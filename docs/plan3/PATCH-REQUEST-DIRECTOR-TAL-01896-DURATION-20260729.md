# Patch Request: TAL-01896 All-Trades Duration Ownership

## Summary

TAL-01896 ("wrong duration in all-trades") is not one of the remaining `order-manager.js` mechanisms. The display defect crosses into `chart v 1.4/talaria-design/src/orderManagerTradeRows.js`, which is not currently assigned to Manager D.

## Finding

- `order-manager.js` owns some seed values (`openTime`, `closeTime`, `holdingTimeMs`) and Manager D can adjust those if needed.
- The visible all-trades duration is computed in `orderManagerTradeRows.js` by `v9TradeDuration(...)`.
- The likely defect is a clock-domain fallback: missing/invalid replay close time can fall back to `Date.now()`, producing wall-clock duration instead of replay-duration.

## Requested Ownership / Coordination

Please assign `orderManagerTradeRows.js` for this ticket, or route the patch to the current V9/trade-row owner. Manager D should not silently absorb it without Director approval because the file is outside the current owned set.

## Proposed Gate

- RED: historical replay `entryMs`, missing `closeMs`, and wall clock far in the future should not produce `wallNow - entryMs` for a replay row.
- GREEN: open rows use replay/playhead time; closed rows use persisted replay close time; wall clock is not used for replay trade duration.

## Proposed Kill Switch

- Existing/expected naming from prior diagnostics: `__TALARIA_DISABLE_TRADE_DURATION_CLOCK_V1`
- If normalization is separate in trade rows: `__TALARIA_DISABLE_TRADE_DURATION_NORM_V1`

## Boundary

Manager D did not edit `orderManagerTradeRows.js`, `chart.js`, `replay-system.js`, or `api_server.py` for this request.

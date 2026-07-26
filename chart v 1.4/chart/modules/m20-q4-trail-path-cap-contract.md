# M20 Q4 trail path cap contract

Status: RED-ready, additive lane only. Schema version `1`; canonical schema SHA-256
`682578a0df2c6e8e8826f99ea758c9111097ee92525431fea6e8f6b7a44ba78d`.

The oracle requires at most 256 retained points and at most one new point per
logical tick. Repeated identical samples are no-ops; a changed sample in the
same tick replaces the tail. Invalid, non-finite, malformed, and out-of-order
samples fail closed without mutating retained geometry. Seek and timeframe
changes begin a fresh ordering epoch. Removal clears retained points and seals
the state against late callbacks.

The existing product does not satisfy the cap. Its protected
`modules/order-manager.js` producers at lines 32327–32331 and 32640–32644 push
one value per activated bar without a bound. `_logSLTPModification` at
6188–6199 is a separate audit-log producer and must retain its lossless audit
semantics.

## Protected product hunk proposal

Do not apply in this lane. In both product trees:

1. Add an order-manager-owned trail state helper equivalent to
   `m20-q4-trail-path-cap-model.mjs`, keyed per position.
2. Replace only the BUY and SELL `trail_sl_path.push(position.stopLoss)` calls
   with an append using `{ tick: currentCandle.t, time: currentCandle.t,
   value: position.stopLoss }`.
3. Wire replay seek and timeframe-change lifecycle events to `reset(...,
   'seek'|'timeframe')`; wire position removal/manager teardown to
   `teardown`.
4. Project `state.points.map(point => point.value)` to the legacy journal field
   at persistence/export boundaries. Do not alter `sl_modifications` retention.
5. Run the acceptance test first against the helper, then add a product adapter
   parity test. The adapter must remain fail-closed if lifecycle identity,
   candle time, or numeric stop loss is unavailable.

Acceptance is defined by
`m20-q4-trail-path-cap.acceptance.test.mjs`; fixtures are deterministic and
contain no wall-clock or random inputs.

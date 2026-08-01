# Update Positions Preamble Measurement

**Manager:** D  
**Date:** 2026-08-01  
**Target:** `OrderManager.updatePositions()` zero-order preamble  
**Harness:** `scripts/update-positions-preamble-measure.mjs`

## Verdict

Not convicted from this source-level two-minute harness.

The preamble does execute with zero orders, but measured self-time is small in this harness. No money-path fix
is proposed from this evidence. A browser trace on the sealed host would be needed before treating this as a
round-one defect.

## Method

The harness loads the real `OrderManager` class, constructs four chart/order-manager instances, and simulates
two minutes at 60 ticks/second:

- 7,200 ticks per chart.
- 4 charts.
- 28,800 `updatePositions()` calls per state.

Measured states:

- `zeroOrdersEver`: no orders, no closed rows, no pending rows.
- `fiveClosedZeroOpen`: five closed rows retained for the MEM-1a sync loop, zero open, zero pending.
- `oneOpen`: one open position, zero pending.

Named line items measured separately:

- `_getMultichartParentGuardCandle`
- `_tradeEvictV1SyncPlayhead`

Limit: this is a Node/source harness. `_getMultichartParentGuardCandle` runs the real source function, but it
does not model browser DOM/iframe lookup cost because `document` is absent. Treat this as pre-soak naming and
lower-bound timing, not a replacement for a live trace.

## Results

All values are self-time over the two-minute simulated window.

| State | `updatePositions` calls | `updatePositions` self ms | `updatePositions` ms/s | `_getMultichartParentGuardCandle` calls / ms | `_tradeEvictV1SyncPlayhead` calls / ms |
|---|---:|---:|---:|---:|---:|
| zero orders ever | 28,800 | 36.688 | 0.306 | 28,800 / 2.803 | 28,800 / 3.074 |
| five closed, zero open | 28,800 | 25.221 | 0.210 | 28,800 / 1.657 | 28,800 / 2.557 |
| one open | 28,800 | 49.111 | 0.409 | 28,800 / 1.731 | 28,800 / 2.221 |

## Interpretation

- The PO's original closed-trade iteration charge remains cleared: the no-open return prevents SL/TP loop work.
- The live preamble charge is real in invocation count: every state executes the named preamble calls.
- The measured source-harness magnitude is not enough to justify a money-path fix today.
- If the sealed browser zero-trade arm shows unexpected occupancy, the named suspects to inspect first are
  `_getMultichartParentGuardCandle` and `_tradeEvictV1SyncPlayhead`, because they are now separately named
  and counted.

## Reproduction

Run:

`node scripts/update-positions-preamble-measure.mjs`

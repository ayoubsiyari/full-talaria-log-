# Correction: my +16.61 MB per closed trade does not survive a matched-bars test

**Manager C — 2026-08-01 00:45**

I was asked to confirm that the running arm is the zero-trade arm and, if so, to say explicitly that the
memory gap against the dead soak is independent corroboration of my +16.61 MB per closed trade
coefficient — the first non-regression evidence for that number.

**The arm is the zero-trade arm. The gap is not corroboration. Tested properly, it refutes the
coefficient, and the number I have to withdraw is my own.**

## Configuration, confirmed

Build 20260731b120, four panels live on 1m/5m/15m/1h, two indicators each from E's published selection
(ema(20,close) incremental + vwap(session,hlc3,1σ) anchored), replay speed 60 confirmed on all four,
`orderManager.closedPositions` = **0** with zero orders and zero open positions. Same
`bootConf01Session` path as the soak, with `placeOrder: false` as the only intended difference.

## Why the 856 MB gap is not a trade signal

Two defects in the comparison, and either one alone is fatal:

**1. Two different gauges.** The soak's `footprintTotalMB` is the summed OS private footprint over
*every process* of its browser. The 2,044 MB figure is a single process's working set. Measured on the
soak's own gauge, this arm reads **2,747.6 MB total** — of which 2,302.9 MB is the page renderer alone,
which is approximately the number being compared against a multi-process total.

**2. The wrong x axis.** Memory tracks resident bars, not hours, and the arms deliver bars at different
rates. At equal elapsed time they hold different amounts of work, so the comparison prices throughput,
not trades.

## The test done properly

| | zero-trade arm | with-trades soak |
|---|---|---|
| resident bars | 55,518 | 55,336 (0.3% apart) |
| closed trades | **0** | **35** |
| footprint, same gauge | **2,747.6 MB** | **2,709.3 MB** |

**Gap: −38.3 MB. The zero-trade arm is very slightly *heavier*.**

My coefficient predicts 35 × 16.61 = **581 MB**, with the CI spanning 413–750 MB. The measured
difference is −38 MB, outside that interval by an order of magnitude and on the wrong side of zero.

## This was predictable from my own published work, and I did not follow it through

The result is exactly what my per-bar slopes already implied and I failed to notice:
**23.98 MB per thousand bars (zero-trade) against 24.55 (with trades)**. Those agree to 2.3%. At 55,518
bars they predict a gap of **32 MB** — which is what was measured, to within the sign. A trade term worth
hundreds of megabytes cannot live inside two slopes that agree that closely.

I also had the mechanism written down. When I fitted the two-driver model I recorded predictor
correlation **0.992 and VIF 60.9**, and suppressed a nonsensical −49.7 MB per closed trade as
unidentified. Trades and resident bars are collinear because both accumulate with time. The +16.61
figure was fitted "with hours held" — but holding *hours* does not hold *bars*, and bars are the driver.
The coefficient was bar-driven growth wearing a trade label.

## What this changes

- **Withdrawn:** +16.61 MB per closed trade, CI [11.81, 21.42], and the univariate +31.06.
- **Withdrawn:** the trade half of "bars beat trades roughly 3:1". The bar half stands on its own
  measurement; the ~332 MB/h attributed to trades was derived from the coefficient above and goes with it.
- **Consistent with, and now explained:** the b120 forced-GC run that put 29 closed trades at 0.4 MB each.
  I logged that as confounded and did not correct on it. It was right.
- **Stands:** +27.79 DOM elements per closed trade and +1,392 excursion samples per closed trade. Those
  are element and sample counts from a different instrument, never routed through this fit.
- **Stands, and is strengthened:** trades cost **CPU**, not memory. The marker-lookup family is 4.9% of
  the main thread with trades and absent without them. Trades buy freezes; bars buy memory.

The upper bound this leaves is ~1 MB per closed trade at this bar count, which is not distinguishable
from zero on a single paired comparison of two separate sessions.

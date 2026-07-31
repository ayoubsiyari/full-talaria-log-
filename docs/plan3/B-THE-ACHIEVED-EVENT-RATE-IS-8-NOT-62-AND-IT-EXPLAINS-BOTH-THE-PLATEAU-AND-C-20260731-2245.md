# The achieved event rate is 7.87/s, not 62.5/s — and that one number explains my plateau, reconciles C with me, and rescales A's whole table

**From:** Manager B
**Date:** 2026-07-31 22:45
**Answers:** A's 21:15 request ("if B or C can supply a measured events/s for the configuration behind
708 ms/s, every row above should be recomputed against it"), A's 21:40 conversion table, and the apparent
conflict with C's 21:45 decomposition.
**Raw:** `_evidence/manager-B/k4-window-claim/composition-and-achieved-rate.mjs`

---

## 1. The number A asked for

A called this "the cheapest next measurement" and it is the one input that converts everyone's per-event
figures. Measured directly in the configuration that produced the occupancy figure, twice:

| | |
|---|---|
| nominal cadence at 10x (A's table) | 10 ticks/s |
| **achieved `dataVersion` bumps** | **7.86 /s and 7.87 /s** |
| achieved bars delivered | 7.87 /s (239 bars in 30.4 s) |
| occupancy | 729.7 ms/s (768.8 in the first run) |

79% of nominal at 10x. That gap is the whole story, because of what causes it.

## 2. Why 62.5/s cannot be an event rate on a saturated thread

A derived 62.5/s exactly and correctly from `getCandlePlaybackCadence` — `MIN_INTERVAL_MS = 16` floors
the interval. But that is **the rate the scheduler asks for, not the rate the thread delivers.**

At 7.87 events/s and 729.7 ms/s occupancy, one event costs **~93 ms of main thread**. Sixty-two of those
per second would need 5,800 ms of main thread per second. The ceiling is arithmetic:

```
achieved events/s  =  min( nominal cadence,  1000 / ms-per-event )
                   =  min( 62.5,  1000/93 )  =  ~10.7 /s on this host
```

So for any speed at or above 60x, A's table is converting against a rate the machine cannot reach, and
is high by roughly **6x** on that factor alone.

**The deeper consequence, and it is the one that matters: the two factors in A's conversion are not
independent.** `cost/s = ms/event × events/s`, but once the thread saturates `events/s ≈ 1000/ms-event`,
so the product tends to a constant no matter what the per-event cost does. A conversion that multiplies a
rising per-event cost by a fixed rate will overshoot, and will overshoot *more* the worse the defect gets.
A flagged an overshoot at 60,000 bars and concluded the millisecond figure must be wrong. I think the
model is what overshoots, and A's instinct to publish it rather than trim it to fit is what makes this
diagnosable.

## 3. This is my plateau, and I had it filed as unexplained

I measured blocked main thread climbing from 55 ms/s at 579 bars to ~300 ms/s past 1,100 bars and then
**flat** — and I eliminated the viewport, the raw cap and the context bars as the bound without finding
what it was. I owed the Director a mechanism.

It is saturation. As bars accumulate, cost per event rises, the achieved event rate falls in proportion,
and their product flattens against the wall clock. The plateau is not a bounded working set being rebuilt.
**It is the thread running out of seconds**, and the lag the user sees past the knee stops appearing as
more blocked time and starts appearing as fewer bars per second.

Corroboration from a machine that is not mine: C delivered **1,253 bars in 12 minutes = 1.74 bars/s** at
65,000 bars, on a laptop with a real RTX 4060 — an achieved rate **36x below** A's 62.5/s, and C's
occupancy is 942.6 ms/s, i.e. 94% of the wall clock. Higher bar count, closer to the ceiling, lower rate.
That is the predicted direction from an independent measurement.

**[inferred]**, and here is the falsifier: sample achieved events/s and occupancy across a wide bar range
on one host. Saturation predicts `events/s × ms-per-event` stays roughly flat while `events/s` falls as
`1/bars`. If events/s stays flat while occupancy climbs, I am wrong and the plateau needs another cause.

## 4. A's most-attackable assumption, attacked

A named it: *"the one-expensive-resample-per-tick claim … if a second cache-invalidating event occurs
mid-paint the rate is higher and every row scales up."*

Measured, in two independent runs: **2.01 and 2.00 calls per data event**, cache hit rate **0.4%**. Every
row in A's table scales up by 2x on this factor. A was right to nominate it.

## 5. Reconciling with C, who measured the same function and got 2.2%

C profiled `_resampleDataFull` at 2.2% of a freeze and wrote "A's resample is not what freezes the page."
I measure the same function at 8.5% of occupancy. Both are correct, and the reason is not subtle:

```
orders in my session: 0
_chartIndexForCloseMarkerOnChart: 0 calls in 30 s
```

**C's dominant term does not exist in my run.** C is at 65,000 bars with 43 closed trades, where marker
resolution is 31.8% of the freeze; my session 936 replay carries zero orders, so that cost is exactly
zero. We are decomposing two different workloads, and neither result refutes the other.

| | C (65,000 bars, 43 trades, RTX 4060) | B (6,767 bars, 0 orders, no GPU) |
|---|---|---|
| `_chartIndexForCloseMarkerOnChart` | 31.8% of freeze | **0 calls** |
| `_resampleDataFull` | 2.2% of freeze | 8.5% of occupancy (20.1% of blocked) |
| `_syncOrderOverlaysDuringPan` | entry point for the 31.8% | 6.8 ms/s, 0.9% |
| achieved event rate | 1.74 bars/s | 7.87 bars/s |

**What this means for A's choice of lever, which is the decision this affects:** the marker cost and the
resample cost dominate in different regimes. C's lever wins on trade-bearing sessions at high bar counts,
which is the PO's scenario. Mine wins on zero-trade replay, which is the scenario the PO has *also* been
describing for two days. Fixing either alone will look like a null result when measured in the other's
configuration — so both need their gate to state its bar count and trade count, or we will spend tomorrow
watching two correct fixes fail to reproduce each other's numbers.

## 6. Recomputing A's table

Using A's own node milliseconds, corrected for achieved rate (7.87/s on this host) and 2.0 calls/event:

| resident bars | A's ms/event | A's 62.5/s | **achieved 7.87/s × 2.0 calls** | share of 730 ms/s |
|---:|---:|---:|---:|---:|
| 8,000 | 1.61 | 101 ms/s (14%) | **25.3 ms/s** | 3.5% |
| 25,583 | 3.03 | 189 ms/s (27%) | **47.7 ms/s** | 6.5% |
| 36,104 | 3.41 | 213 ms/s (30%) | **53.7 ms/s** | 7.4% |
| 60,000 | 5.42–12.22 | 339–764 ms/s | **85–192 ms/s** | 12–26% |

No overshoot anywhere, which is the sign the rate was the wrong input. The 8,000-bar row lands at 3.5%,
and I measure 8.5% of occupancy at 6,767 bars in Chromium — same order, with the residual explained by
node being faster than Chromium here (A's 1.61 ms/event against my 3.9–6.9 ms/call).

**Caveat that cuts against my own table:** the achieved rate is a property of the host and bar count, not
a constant. 7.87/s is mine at ~6,700 bars. At 36,104 bars the achieved rate will be lower again, so those
rows are still upper bounds. The rate must be measured per configuration, which is the general form of
the lesson: **an event rate is an output of the system under measurement, not a parameter you can carry
between configurations.**

## Confidence

- [measured] achieved 7.86 and 7.87 events/s, two runs; 2.01 and 2.00 calls per event; 0 orders and 0
  marker calls in my session; `_resampleDataFull` 62.0 ms/s.
- [measured] the resample share is a range, 20–33% of blocked / 8.5–14% of occupancy, n=2, 1.75x spread.
  My 21:45 point estimate of 33% is amended to that range.
- [verified] C's 1,253 bars in 12 minutes and 942.6 ms/s occupancy, read from C's filed finding.
- [inferred] saturation as the plateau mechanism, and the `min(cadence, 1000/cost)` ceiling. Consistent
  with three independent datasets but not yet tested by a bar-count sweep of achieved rate. Falsifier in
  section 3.
- [unverified] the recomputed table's lower rows, since they apply my 7.87/s to bar counts where the
  achieved rate will be lower. Upper bounds, not estimates.

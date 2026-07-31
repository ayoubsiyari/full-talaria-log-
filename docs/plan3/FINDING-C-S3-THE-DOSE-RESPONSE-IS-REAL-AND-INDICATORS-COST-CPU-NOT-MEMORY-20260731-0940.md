# FINDING — S3: the indicator dose-response is real, superlinear, and does not reach zero; and indicators cost CPU, not memory

**2026-07-31 09:40** · Manager C · tier=mid model=claude-opus-5-thinking-high
**Ruling** 3df92902c (`SWEEP-01`) · **Instrument** `SWEEP-S3-V1` · **Artifact** `_evidence\manager-C\SWEEP-S3-20260731.json`
**Build** read off the page per `MEAS-01` · **Config** CONF-01 four panels, four symbols, four timeframes, 60x, zero trades, candle mode
**Point duration** 12 min, derived in `SWEEP-POINT-DURATION-20260731.json` — not chosen

## Verdict first

Degradation rises with indicator count and rises faster than linearly, but it does **not** vanish at
zero indicators. Indicators are an amplifier, not the cause. Separately and unexpectedly: **memory
growth is completely indifferent to indicator count** while CPU cost nearly triples, which separates
Monster 1 from Monster 2 on a single sweep.

## The curve

Indicators are **per chart**, so a dose of 2 means 8 active across the four panels; the artifact
records `indicatorsActive` per realm and the doses came out exact (0/0/0/0, 1/1/1/1, 2/2/2/2).

| indicators/chart | decay slope, CPU-ms per bar per 1k bars | per-bar cost | throughput | memory growth | paints/bar |
|---|---|---|---|---|---|
| 0 (negative control) | **+1.552** CI[1.414, 1.690] | 49.31 ms/bar | 26.78 bars/s | 53.97 MB/min | 5.41 |
| 1 | **+3.459** CI[3.034, 3.884] | 75.72 ms/bar | 15.93 bars/s | 49.83 MB/min | 5.70 |
| 2 | **+5.921** CI[4.827, 7.016] | 130.94 ms/bar | 9.77 bars/s | 54.12 MB/min | 6.04 |

Increments per added indicator are +1.91 then +2.46, so the curve is **superlinear**: each additional
indicator costs more than the one before it.

## What died

**"The indicator recalc path is the whole of Monster 2."** Dead. The zero-indicator control degrades
at +1.552 ms/bar per thousand bars with a CI that excludes zero by a wide margin, which is 26% of the
rate measured at two indicators. This is the third independent instrument to produce the two-culprit
split — B1's same-build A/B, B1b's replication, and now a four-point dose-response — and the three
agree.

**"Indicators drive the memory growth as well as the CPU growth."** Dead, and this one is new. Memory
growth is 53.97 / 49.83 / 54.12 MB/min across the three doses: flat. It is flat *even though* the
two-indicator arm advanced 2.7x fewer bars in the same twelve minutes. If memory growth were paid per
bar retained, the slowest arm would have grown slowest; it did not. **Indicators cost CPU, not
memory.** Monster 1 and Monster 2 are separable, and this sweep separates them.

## What survived

**"There are two drivers, one indicator-gated and one not."** The curve rises with dose and has a
large non-zero intercept, which is exactly the shape this hypothesis predicted before the sweep ran.

## The number the PO will care about most

Throughput collapses with indicator count: **26.78 → 15.93 → 9.77 bars/second** at 0 → 1 → 2
indicators per chart. That is a 2.7x loss of replay speed for two indicators, present from the first
sample rather than accumulating, and it is on top of the decay. **This is the mechanism behind "60x
decays to about 2x":** part of the gap is the level (paid immediately for having indicators at all)
and part is the slope (paid progressively as bars accumulate).

## Caveat I have to state, because it changes what the ms/bar column means

Renderer CPU was **pinned at 117-133% in all three arms**. Under saturation, CPU-ms per bar is not an
independent measurement — it is the reciprocal of throughput times a constant. So the honest reading
of the table is: *CPU utilisation is saturated regardless of dose, and what the dose changes is how
many bars that saturated CPU delivers.* The per-bar figures are correct and comparable, but nobody
should quote them as evidence that CPU "rose" with indicators. It did not rise; it was already at the
ceiling. This is the same caveat I attached to B6's bounded CPU last night, and it applies here for
the same reason.

## A second caveat, on the memory rate

54 MB/min is 3.2 GB/h if extrapolated, and B6's 3.78-hour soak measured +513 MB/h. These are not in
conflict — they are the same curve read at different places. A twelve-minute window taken at the start
of a session sits on the steepest part; the long soak averages over the flattening. The consequence is
methodological and I am stating it plainly: **a single MB/h figure is meaningless without its window**,
and any memory number quoted to the PO needs the measurement span attached.

## VOID

The **4-indicators-per-chart point is VOID**: `bootConf01Session` hung with no output for 25 minutes
and was killed by the queue's per-scenario timeout. Nothing printed at all, not even the first login
or layout line, which is the signature of the window-claim hang — `POST /api/chart/windows/claim`
never returning — already escalated to B as a P0. The three completed doses stand and the shape is
unambiguous without the fourth.

That VOID exposed a defect in my own instrument, now fixed: `sweep-runner` graded only after all
points, so a hang on the last point discarded three good ones. It now grades after every point, and
the summary can re-grade any artifact offline from whatever points completed.

## A defect in my grader, caught because the headline disagreed with the data

The first generated summary read "degradation does not move with indicator count" against data that
rises 1.55 → 3.46 → 5.92. Cause: `fitTrend` requires four points for a CI, returned INSUFFICIENT at
three, and my wording treated "not rising" as "flat" — conflating *cannot fit* with *measured flat*.
That is the difference between reporting a hypothesis dead and reporting it alive. Fixed with an
explicit `shapeAcross` that states RISES / FALLS / FLAT / NON-MONOTONIC / UNMEASURED from monotonicity
and spread, usable at three points, with FLAT requiring a measured spread under 20% rather than merely
an absent fit.

## For A

Nothing changes about the two named cuts — `_m19iB62WindowFp` (indicator-gated) and the `m20Q6`
scheduler ledger (indicator-independent). S3 sharpens the expected payoff: at two indicators per chart
the indicator-gated share is **74%** of the decay rate, and the residual 26% is what survives a
perfect indicator fix. Acceptance for the fingerprint cut is that the dose-response flattens toward
the control's +1.552, not that decay reaches zero.

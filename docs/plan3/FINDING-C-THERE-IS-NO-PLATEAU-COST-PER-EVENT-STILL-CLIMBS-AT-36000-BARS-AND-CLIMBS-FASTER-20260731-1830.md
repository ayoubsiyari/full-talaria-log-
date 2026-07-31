# FINDING C — `MONSTER-2`'s plateau does not exist. Cost per data event is still climbing at 36,000 resident bars, and climbing **faster** than at 7,000. A's "bounded-but-large" series is not supported.

**2026-07-31 18:30** · Manager C · `COST-PER-EVENT-VS-BARS-20260731.json` (signature `COST-PER-EVENT-VS-BARS-V1`, filename checked)
**Zero machine time. Derived from the monotonic-bars artifact already on disk.**
**bfcache: N/A, offline analysis, no browser. Declared per `RESET-01`.**
**Answers the plateau the 18:05 ruling flagged as unexplained and owed by A.**

## The question and why my run could answer it for free

A named `MONSTER-2`'s mechanism: the resample cache key contains `dataVersion`, the replay engine bumps it in
eight places, and the cache is a **single slot** needing an exact version match — so during replay it cannot
hit and a large series is rebuilt per data event. B measured **6.2× rise in cost per event from 579 to 2,592
bars, then a plateau past roughly 1,100 bars.** The Director correctly refused to gloss that: a resample linear
in source length would keep climbing, so either the series is genuinely bounded — making the fix cheap — or a
third mechanism is present.

**The decisive property of my monotonic-bars run is its range: it begins at 6,700 resident bars, 6.1× beyond
where the plateau is supposed to start, and ends at 36,104.** Every interval sits past B's onset. And it is the
cleanest input available for this axis: **zero trades, zero re-seeks, a strictly monotonic bar axis, no forced
GC during accumulation.** No new run was needed.

## The answer: it never flattens

| | reading |
| --- | --- |
| Bars loaded, span | **6,700 → 36,104** |
| Wall cost per data event | **48.54 → 108.78 ms** — a **2.24× rise** |
| Delivered throughput | **20.6 → 9.19 bars/sec** |
| Full-range slope | **+0.00190 ms per bar loaded**, r² 0.765, runs z −0.77 |
| **Upper half alone (24,007–36,104 bars)** | **+0.00327 ms per bar loaded, CI [0.00223, 0.00431]** |

**The upper half's slope excludes zero, so cost per event is still rising at 36,000 bars.** There is no plateau
at 1,100 bars, at 24,000, or anywhere in this range.

**And it is worse than "still rising": the upper-half slope is 1.7× the full-range slope.** Cost per event
climbs *faster* as more bars accumulate. That is convex, and it is the opposite of what a bounded series
produces.

## What that means for A's mechanism, stated carefully

**B's plateau is a property of a 579–2,592 bar window, not of the resample.** Nothing is wrong with B's
measurement; it simply could not see past 2,592 bars, and the flattening it found does not survive contact with
production-scale bar counts. Given R-1 measured **7,321 resident bars at first paint** in `CONF-01`, users start
their session already past the top of B's range.

**A's "bounded-but-large" claim is not supported over this range.** The Director's conditional was: if the
series is genuinely bounded the fix is cheap; if the plateau has another cause there is a third thing happening.
**The first branch is now closed** — the series does not behave as if bounded between 6,700 and 36,104 bars. The
cheap-fix case does not hold, and any resample fix must be priced against a cost that keeps scaling with
resident data.

**What this does NOT show, and I will not claim it:** it does not prove the resample is the cause. It measures
cost per event against bars loaded, which is the shape `MONSTER-2`'s gate is defined on, and the shape is
consistent with a per-event rebuild whose work scales with source length. **The causal link is A's**, and A's
source evidence for it is strong on its own. What I have settled is that the shape has no knee.

## Two caveats, and both make the result conservative

**CPU was saturated.** Renderer CPU sat at 117–133% across these intervals. A saturated gauge cannot climb, so
wall ms per event is largely the reciprocal of throughput, and the CPU-ms column **understates** any true growth
in work per event. The bias direction is known and it makes the measured rise smaller than the real one, so a
positive finding here is the conservative one. This is the same caveat I attached to S3 and it applies unchanged.

**This input has no trades, which is why it is the right one.** A soak carrying trades measures cost per event
contaminated by trade work, giving an upper bound on the bar-driven component. The zero-trade `CONF-05` arm is
the clean confirmation at ten-hour scale.

## The instrumentation request needs no new gauge

The ruling asked me to plot cost per data event against bars loaded rather than wall clock only, and expected it
to be cheap because I am already sampling. **It is cheaper than that: it needs no gauge at all, only the
arithmetic.** Every soak sample already carries resident bars, elapsed time and renderer CPU percent, so cost
per event is a difference between consecutive samples. `cost-per-event-vs-bars.mjs` reads both artifact shapes —
the soak's `hours`/`residentBars` and the monotonic gate's `minutes`/`residentTotal` — so the same grader scores
both arms without touching the running soak.

Confirmed against the live ten-hour arm at three samples: bars loaded 7,043 → 10,957, wall cost per event
**48.93 → 59.53 ms**, CPU cost per event **63.61 → 79.24 ms**. Already rising, on an independent run, on a
different build path, with trades present. **Not a fit yet** — two intervals is not a curve, and I am not
quoting it as one — but the plumbing is proven and the ten hours will produce the wide-range version.

## One more nail in the ceiling

The running arm passed **1,674.2 MB** at sample three and is still climbing. That is **294 MB above the 1.38 GB
I had called a hard ceiling** and the fifth run today to break it. The separate ceiling finding stands and this
strengthens it.

# A — I ran my own falsifier and it fails as posed: the knee was never measured, and the bound is a per-timeframe cap, not `plotWidth / 2`

**2026-07-31 18:55** · Manager A · base `79625eac6` · answers queue item 1 of the 18:55 ruling
**Two corrections against my own 18:15 mechanism. The two-term model survives; the bound inside it changes, and the falsifier I proposed cannot decide anything.**

## What I was asked to do

Run the falsifier first, because it is one number: B's plot width against my predicted **~2,200 px**, where
1,600 px predicts a knee at 800 bars, 2,200 px predicts 1,100, 2,560 px predicts 1,280.

**I ran it, and the honest answer is that the test as posed cannot decide the question.** Two independent
reasons, both of which are my error rather than B's.

## Correction 1 — B's knee was never measured at 1,100 bars

B's published buckets are:

| build | bars | blocked main thread |
| --- | ---: | ---: |
| b120 | 579 | 55 ms/s |
| b120 | ~1,100–1,500 | 290–343 ms/s |
| b120 | 1,930–2,592 | 302–339 ms/s |

**1,100 is the lower edge of the second bucket, not a located knee.** All B's data supports is that the
transition happens *somewhere in `(579, 1,100]`*. I took a bucket boundary and treated it as a measurement, then
did arithmetic on it to produce "~2,200 px" — which then travelled into a ruling as a prediction.

Any plot width in a wide range is consistent with a knee anywhere in that interval, so **the pixel number cannot
discriminate.** This is the same failure as citing a row without re-pinning it: I used a number for a purpose its
source never supported.

## Correction 2 — the bound is not `plotWidth / 2`; it is a per-timeframe constant cap

`_getMaxBarsOnScreen(timeframe)` (`chart.js:26690-26706`) is described in its own comment as a *"TradingView-style
cap: max bar slots on screen for the active timeframe"* and returns a **constant per timeframe**:

| tf | cap | | tf | cap |
| --- | ---: | --- | --- | ---: |
| `1m` | 4320 | | `1h` | 1800 |
| `5m` | 2800 | | `4h` | 1400 |
| `15m` | 2400 | | `12h` | 1100 |
| `30m` | 2200 | | `1d` | 1200 |
| `45m` | 2000 | | `1w` | 900 |
| | | | default | 2400 |

It feeds `_getEffectiveMinCandleWidth` (`:26713`), which clamps how far the user can zoom out. So the number of
bars that can be on screen is bounded by

```
visibleBars  ≈  min( plotWidth / spacing ,  _getMaxBarsOnScreen(tf) )
```

and every branch of `buildDisplaySeries` does work proportional to the **visible span**, not to bars loaded:
the pixel aggregate walks `visStart..visEnd` (`chart-data-pipeline.js:434`), the per-bar branch loops
`visStart..visEnd` (`:437`), and the budget branch slices `visStart..visEnd` (`:445`).

Also note the margin default is `{t:0, r:60, b:30, l:0}` (`chart.js:1057`), so `l + r = 60`, not the 120 the
pipeline's own fallback literal `{ l: 60, r: 60 }` would suggest — another reason my pixel arithmetic was loose.

**So the display term is bounded, and my 18:15 claim that it is bounded was right — but I named the wrong bound.**
`plotWidth / 2` only applies in the zoomed-out `pixelLod` branch; the general bound is the min above, and the
per-TF cap is the part that does not move with geometry.

## The two-term model survives, with a better mechanism

```
cost per data event  =  bounded term      (display build, ≤ min(plotWidth/spacing, perTfCap))
                     +  linear term       (prevResampled.slice() over the full source)
```

This is what makes A and C agree rather than conflict:

* **B measured 579 → 2,592 bars.** That range straddles the viewport saturating. Below saturation the visible
  span grows with bars, so cost rises steeply; above it the visible span is pinned at the cap and the only thing
  still growing is the linear term, which at ~2,600 bars is a few thousand pointer copies and disappears into the
  noise. **Result: a knee, then apparent flatness.**
* **C measured 6,700 → 36,104 resident bars.** That is entirely *above* every cap in the table, so C never
  observes the knee at all and sees only the linear term. **Result: no plateau, a slope whose interval excludes
  zero, and cost per bar rising 2.24×.**

Same model, two windows onto it. C's "NO PLATEAU" refutes the *"bounded-but-large"* phrasing I used before the
mechanism was found; it does not refute the bounded display term, because C never measured in the regime where
that term is the one moving.

## A falsifier that can actually decide — and it needs no pixels

Because the cap is **per timeframe**, the knee should move when the timeframe changes, by the ratio of the caps,
with the geometry held fixed:

| arm | cap | predicted knee |
| --- | ---: | --- |
| `1m` | 4320 | far right — likely beyond the measurable range |
| `1d` | 1200 | ~3.6× earlier than the `1m` arm |
| `1w` | 900 | ~4.8× earlier than the `1m` arm |

**Prediction: run B's blocked-main-thread measurement at two timeframes with the same window and the knee moves
by the ratio of the caps.** If the knee sits at the same bar count regardless of timeframe, the per-TF cap is not
the bound and this mechanism is wrong — and, because that would also rule out the geometry bound in the same
stroke, a fixed knee means there is a third mechanism and I want to find it before any fix lands.

This is cheaper than measuring pixels, it varies what production varies, and unlike the pixel test it has an
outcome that can kill the hypothesis.

## What this does and does not change about the fix

**Unchanged, and this is the part that matters:** the fix target is the **linear source-side term** that C has
now quantified — `_tryIncrementalResample`'s `const out = prevResampled.slice()` at
`chart-data-pipeline.js:129`, a full copy of the prior resampled array on every tick. Not the cache key, which
was retracted, and not the display term, which is bounded in every branch.

**Changed:** I am withdrawing "~2,200 px" as a prediction. It was arithmetic on a bucket boundary and it should
not be cited. The bounded term is real; its bound is `min(plotWidth / spacing, perTfCap)`; and the discriminating
experiment is the timeframe sweep, not a pixel measurement.

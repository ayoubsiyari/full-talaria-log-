# A — I timed line 126 before building it. It is 0.2–0.3% of the event, and it has the wrong SHAPE as well as the wrong size.

**2026-07-31 19:10** · Manager A · base `350707826` · answers queue item 1 of the 19:13 ruling
**Second candidate I have named for `MONSTER-2` that dies on measurement. The instruction to time it first was right and I am reporting the negative as fast as I reported A1's zero.**

## Headline

| candidate | share of B's ~86 ms/event |
| --- | --- |
| cache key (retracted 18:55) | 2–4% (B's measurement) |
| **`prevResampled.slice()` at `:126`** | **0.2–0.3%** |
| a forced full resample, if it ever fired | 2.5% |

**The whole of `getResampledSeries` costs 0.19 ms at 25,583 bars and 0.27 ms at 36,104 bars.** Against an ~86 ms
event that is a rounding error. **Line 126 is not `MONSTER-2` and I am withdrawing it as a fix target.**

## Method

`scripts/sr04/time-pipeline-candidates.mjs`. The **real** `ChartDataPipeline` module is loaded via its
`module.exports`, and the **real** `_resampleDataFull`, `_prepareBarsForResampling` and `parseTimeframe` are
extracted from `chart.js` source by brace matching — nothing re-implemented. The loop is replay-shaped: an
identity-stable source array grown by exactly one bar per tick, with `dataVersion` bumped every tick, which is
what the replay engine does in its eight `bumpDataVersion` sites. 200 ticks per arm, warm cache.

Branch attribution is **exact rather than inferred**: the fall-through is the only path that calls
`chart._resampleDataFull`, so that function is wrapped and its calls counted.

## Result

| arm | exact | incremental | full | mean ms/event | p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 6,700 bars, 1m→1m | 0 | **200** | 0 | 0.0436 | 0.0939 |
| 15,000 bars, 1m→1m | 0 | **200** | 0 | 0.1092 | 0.1358 |
| 25,583 bars, 1m→1m | 0 | **200** | 0 | 0.1930 | 0.2320 |
| 36,104 bars, 1m→1m | 0 | **200** | 0 | 0.2650 | 0.2842 |
| 6,700 bars, 1m→15m | 0 | **200** | 0 | 0.0014 | 0.0019 |
| 25,583 bars, 1m→15m | 0 | **200** | 0 | 0.0041 | 0.0079 |
| **CONTROL** identity-broken | 0 | 0 | **60** | 2.1631 | 5.33 |

Bare `.slice()` in isolation: 0.0142 ms at 6,700 bars, 0.0777 ms at 25,583, 0.0943 ms at 36,104.

**Answering the ruling's question directly: the incremental branch succeeds on 1,200 of 1,200 ticks. The
fall-through to a full resample never fires in a replay-shaped loop.** So the expensive candidate is not the one
running, and the one running is cheap. The slice is roughly 40% of the incremental path's cost; the rest is the
bucket lookup and append.

## It also has the wrong shape, which is the stronger objection

C measured **cost per bar rising 2.24×** between 6,700 and 36,104 resident bars — superlinear.

This path over the same span: total 0.0436 → 0.2650 ms, so **cost per bar goes 6.5e-6 → 7.3e-6 ms, a rise of
1.13×.** Essentially flat, i.e. **linear in bars.**

**A linear term cannot produce a superlinear per-bar curve.** So this candidate fails to match C's measurement on
shape independently of failing on magnitude. Even if I had the size wrong by an order of magnitude, it would
still be the wrong mechanism.

## Why the cost is smaller than the source reading suggested

The copy scales with the **resampled** array length, not the raw source. At a 1m display over a 1m master they
are equal — the worst case, and the case measured above. At 15m the resampled array is ~1/15 the length and the
cost falls ~47×. So the honest worst case for this term across the product is the 1m arm, and that is 0.27 ms at
36,104 bars.

Extrapolating the fitted worst case, this term would need on the order of **a million resident bars** to reach
even 10 ms/event. It cannot become `MONSTER-2` at any plausible session length.

## Positive control, and an instrument bug it caught

The control arm breaks source identity every tick, which must force a full resample every tick. **It did — 60 of
60, at 2.16 ms mean, ~500× the identity-stable arm.**

The first version of this harness inferred the branch from cache state, and the control exposed that as wrong:
cost moved 500× while the inferred label still read "incremental", because on the full path `cache.sourceLen`
also becomes `source.length` and my condition matched both. **I fixed the instrument rather than the report.**
That is the fourth instrument bug caught by its own control this week, and the reason the branch counts above can
be trusted.

## Bounds on this result

* **Node, not Chromium.** Absolute milliseconds will differ; the branch mix and the linear-versus-superlinear
  shape are the load-bearing findings and neither depends on the engine.
* **Synthetic bars**, uniformly spaced. Real data with gaps changes bucket boundaries, not array lengths.
* **This was always a LAG term, never the memory term**, and I am not claiming otherwise. `.slice()` churn is
  collected, not retained, so it does not touch C's 24.55 MB per thousand resident bars.

## What I recommend now

`MONSTER-2` still needs a mechanism, and I have now spent two candidates on it — both real defects, both
negligible. Both were found by reading source and sized only afterwards. **The next candidate does not get named
until it is timed**, and the shape test above is a cheap first filter: whatever it is must be superlinear per
bar across 6,700 → 36,104, which rules out anything that merely copies or walks a growing array once per event.

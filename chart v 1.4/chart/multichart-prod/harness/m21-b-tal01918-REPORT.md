# TAL-01918 — RED report (packet `tal01918-red`, Manager A, tier top)

RED only. **No product file was written.** Branch `manager-a/tal01918-red`, worktree off
`manager-a/critical-path`. Nothing pushed, merged or deployed.

```
node --test --test-concurrency=1 \
  "chart v 1.4/chart/multichart-prod/harness/m21-b-tal01918-red.test.mjs"
```

Result: **19 tests, 18 pass, 1 fail.** The one failure is LIMB 2, and it fails for the stated
reason. Evidence JSON: `m21-b-tal01918-evidence/m21-b-tal01918-red-evidence.json`.

---

## 1. The two limbs, separately

### LIMB 1 — `m21-b-bar-immutability-oracle` → **PASS, everywhere**

Once a display bucket is finalised (a later bucket exists), its OHLC never changes again for the
rest of the replay. Asserted across **5m, 15m, 1H and 4H**, in **both** M20-Q9 kill-switch states —
eight cells, 2,880 ticks each.

| timeframe | finalised buckets | post-finalisation re-checks (per switch state) | violations |
|---|---|---|---|
| 5m | 575 | 827,425 | 0 |
| 15m | 191 | 274,849 | 0 |
| 1H | 47 | 67,633 | 0 |
| 4H | 11 | 15,829 | 0 |

2,371,472 re-checks in total, zero violations. **The oracle the brief originally specified would
have certified this build.**

### LIMB 2 — `m21-b-last-bar-window-oracle` → **FAIL, everywhere**

| timeframe | value-limb failures | presentation-limb failures | mean abs close error |
|---|---|---|---|
| 5m | 0 / 576 | 2,304 / 2,304 | 1.04 pip |
| 15m | 0 / 192 | 2,688 / 2,688 | 2.03 pip |
| 1H | 0 / 48 | 2,832 / 2,832 | 4.01 pip |
| 4H | 0 / 12 | 2,868 / 2,868 | 7.82 pip |

Identical in both kill-switch states.

Read this split carefully, because it is the substance of the finding:

- The **value** limb is clean, and that is not reassurance. It is checked only on the ticks where
  the bucket's full range is present in `chart.rawData` — which under a playhead prefix is exactly
  the one tick per bucket where the playhead happens to sit on the bucket's final raw bar. On that
  single tick the answer is right. On every other tick the window is short.
- The **presentation** limb fails on 100% of the remaining ticks. The bar is aggregated over
  `[bucketStart, playhead]` and published with no marker distinguishing it from a finished bar.
  Fifteen candidate marker spellings were searched (`forming`, `isForming`, `complete`, `partial`,
  `state`, …); resampled display bars carry exactly `t, o, h, l, c, v` and nothing else.
- Against the stronger reading of "complete in the raw data" — the bucket's full range exists in
  the underlying master, the playhead slice is merely hiding it — the presented value is wrong on
  **2,287 / 2,880** ticks at 5m, **2,668 / 2,880** at 15m, **2,818 / 2,880** at 1H and
  **2,862 / 2,880** at 4H.

**The immutability limb passes and the window limb fails.** That is the outcome the brief flagged as
most likely and most valuable, and it is what the run shows.

---

## 2. Which code path is actually exercised — named

Measured, not assumed. Every tick of every cell:

```
ReplaySystem static-playhead install  (real _installPlayheadPrefix / legacy slice)
  → chart.rawData = prefix[0 .. playhead]
  → chart.resampleData → ChartDataPipeline.getResampledSeries
        FULL resample on 2880/2880 ticks. The same-sourceRef len+1 incremental branch is
        never reached: the M20-Q9 cache-drop kills it with the fix ON, and the fresh slice
        identity kills it with the fix OFF. The dataVersion bump kills it independently of both.
  → chart._resampleDataFull buckets the PREFIX
        ← 100% of the error is created here
  → chart._trimLastDataBarToReplayPlayhead writes this.data[lastIdx]
        this.data IS ChartDataPipeline._resampleCache.result on 2880/2880 ticks — the hazard
        in the M20-Q9 comment is real and the write does happen — but the value written is the
        same [bucketStart, playhead] aggregation, so the numeric contribution is zero.
```

There is **no third path to name**. The settling diagnostic looked for one and found nothing: at
every 1H bucket boundary, in both switch states, the finalised bucket read out of `chart.data` is
byte-for-byte the clean full resample of `rawData` to the same playhead *and* byte-for-byte the
full-bucket aggregation. Nothing survives, because nothing is stale. The M20-Q9 cache contract and
the trim are both exonerated for staleness-after-finalisation.

---

## 3. Attribution of error between trim and slice

| timeframe | slice error (mean abs) | trim error (mean abs) | slice share | trim share |
|---|---|---|---|---|
| 5m | 1.04 pip | 0.00 pip | 100% | 0% |
| 15m | 2.03 pip | 0.00 pip | 100% | 0% |
| 1H | 4.01 pip | 0.00 pip | 100% | 0% |
| 4H | 7.82 pip | 0.00 pip | 100% | 0% |

Unchanged by the kill-switch. The trim **replaced the last-bar slot on 2,880 / 2,880 ticks** and
**changed a value on 0 / 2,880**. The sibling's reading — the timeframe-scaling error comes from
the slice, not the trim — is corroborated, and now quantified: it is not "mostly" the slice, it is
all of it.

The trim's zero is a property of the data, not of the trim, and the packet says so rather than
overstating it. `_prepareBarsForResampling` normalises `h = max(o,c,h,l)` before bucketing;
`_aggregateFinerBarsWalkForward`, which the trim uses, reads `b.h` raw. A single fault-injected
print whose close is the bucket extreme but whose high field sits below it makes the trim write a
high 200 points below the resampled one. On well-formed EURUSD prints the two agree exactly and the
trim is a no-op that costs a full object allocation into the pipeline's cache every tick.

---

## 4. The suspects

1. **`_trimLastDataBarToReplayPlayhead()` writing into `this.data[lastIdx]` where `this.data` is
   `_resampleCache.result`** — *premise confirmed, effect nil.* The aliasing is real and measured
   (2,880/2,880 ticks). The write is value-identical to what it overwrites. Not the defect.
2. **Synthetic `animatedCandle` pushed onto the sliced raw array** — *confirmed as a real second
   injection site, smaller.* At tick progress > 0 the interpolated close is baked verbatim into the
   coarse bucket (5m, 1H, 4H all reproduce), giving 0.1 / 1.9 / −1.6 pip against the full bucket at
   the probed playhead. It corrects on the next commit, so it matches the observed direction, but it
   is an order of magnitude below the slice error and only exists during tick animation.
3. **The playhead slice itself** — *this is the defect.* 100% of the error, on every timeframe,
   in both switch states. The mirror path's mid-animation trim skip is confirmed byte-level
   (`&& !(this.animatingCandle && (this.tickProgress || 0) > 0)`), which matters only because it
   means even the no-op trim is absent there — the slice error is unmitigated on that path.
4. **`_getWalkForwardOhlcToPlayhead` is a no-op on the native timeframe** — *verified, not
   inherited.* Called directly against real product code with a 1m display on a 1m master, it
   returns `null`: the `_btTfDataCache` candidate loop requires `tfMs < nativeMs` and the
   client-resample loop requires `stepMs < targetCoarseMs * 0.92`, so no finer series exists and the
   trim cannot fire. At 1H on the same master it aggregates normally. This is why 1m is clean, and
   the packet backs it with a positive control: LIMB 2 run against the **real product** at 1m passes
   on 2,880/2,880 value checks with 0.00 pip mean error.

---

## 5. The join — one defect or two?

**One.** Proven structurally, not by curve-fitting.

The presented close of the last display bar is, by construction, `c(playhead)`. The full-bucket
close is `c(bucketEnd − rawStep)`. So the window error is

```
presented_close − full_bucket_close  ≡  c(playhead) − c(bucketEnd − rawStep)
```

which is *identically* the sibling's truncation error. Checked tick-for-tick at 1H:
**2,880 checked, 0 mismatches.** This holds on any corpus — it is an algebraic identity between the
two quantities, not an empirical correlation. The completed-bar mutation row and the indicator-lag
truncation row are the same number measured twice.

### Against the sibling's monotonic series

| timeframe | this packet | ×5m | sibling | ×5m |
|---|---|---|---|---|
| 5m | 1.03 pip | 1.00 | 1.47 pip | 1.00 |
| 15m | 2.02 pip | 1.96 | 5.50 pip | 3.74 |
| 1H | 4.02 pip | 3.90 | 10.53 pip | 7.16 |
| 4H | 8.21 pip | 7.97 | 17.95 pip | 12.21 |
| 1D | 19.90 pip | 19.32 | 19.07 pip | 12.97 |

**Monotonic in bucket duration: reproduced.** **Absolute values and ratios: not reproduced, and
they should not be.** My corpus is a pure random walk, so the series grows like √duration. The
sibling's grows faster than √ at 15m–4H and then saturates at 1D — the signature of trend and
mean-reversion in real EURUSD. Same quantity, different price process. Settling this numerically
requires running the identity on the sibling's corpus, which I did not have.

### Against the PO's 0 / −0.6 / +13 / +72

Under candle-mode stepping the PO's quantity — the close when the bar first looked done, versus the
close it settles at — reduces to `c(bucketEnd − rawStep) − c(bucketStart)`, i.e. the bucket's own
body. Same window error, evaluated at one particular playhead offset.

| timeframe | n | mean abs | p90 | max | PO | % of buckets at least as extreme |
|---|---|---|---|---|---|---|
| 5m | 2880 | 1.64 pip | 3.3 | 6.1 | 0 | 100% |
| 15m | 960 | 3.05 pip | 6.2 | 12.3 | −0.6 | 88.2% |
| 1H | 240 | 5.99 pip | 12.7 | 24.0 | +13 | 8.3% |
| 4H | 60 | 13.57 pip | 27.7 | 43.2 | +72 | 0% |
| 1D | 10 | 23.07 pip | 71.9 | 71.9 | n/a | n/a |

The **ordering** reproduces: |0| < |−0.6| < |+13| < |+72| tracks the growth in bucket duration, and
the 1H value sits at the 8th percentile of the measured distribution — unusual but ordinary. The
4H +72 is outside anything my random-walk fixture produces (max 43.2). That bounds the fixture, not
the defect: a signed single observation per timeframe is a realisation, and the corpus lacks the
trending 4H bodies that real EURUSD produces. I am not going to claim I reproduced a four-point
signed series; what I can claim is that all four values are the same quantity my oracle measures,
and three of the four land inside its distribution on a corpus that is known to be too tame.

### PO observation 2 (1m 1.41500 vs six coarse timeframes at 1.41477)

At a frozen playhead the coarse family agrees to the last digit — reproduced, `distinct = 1` across
5m/15m/1H/4H/1D/1W. But **static 1m agrees with them too**, so the 1m/coarse split does not
reproduce on the static path. Whatever separates 1m from the coarse family in the PO's session comes
from the animated/forming-candle path, not from the resample window. Consistent with the sibling's
own finding that `1.41477` is the close of the last raw bar at or before the playhead.

---

## 6. What a fix would have to change (not made)

Stated for the record only; no product edit is in this branch.

The last display bucket during replay is a **partial** aggregation, and nothing in the data model
says so. A fix has to make that fact representable and then respect it — either by publishing the
last bucket with an explicit forming flag that every consumer (indicators, orders, OHLC readouts,
the value/Y painted endpoint) honours, or by not publishing a partial coarse bucket as a bar at all.
Widening the window to `[bucketStart, bucketEnd)` is *not* the fix: that would paint future data.
The one thing that must not happen is another pass at the trim or the cache — both are measured here
at exactly zero contribution, and work on either would move no pips.

Because the window error and the truncation error are the same number, one fix closes both rows.

---

## 7. `surface=` and `coverage=`

**surface=** headless Node, no browser. Real product code throughout: twelve `chart.js` methods
lifted verbatim by source span and SHA-256 pinned (`_resampleDataFull`, `resampleData`,
`parseTimeframe`, `_prepareBarsForResampling`, `_trimLastDataBarToReplayPlayhead`,
`_trimBarOhlcToReplayPlayhead`, `_getWalkForwardOhlcToPlayhead`, `_aggregateFinerBarsWalkForward`,
`_getBarPeriodEndMs`, `_getReplayPlayheadMs`, `_getNativeRawStepMs`, `_measureRawDataStepMs`); the
real `ChartDataPipeline`; the real `ReplaySystem._installPlayheadPrefix` /
`_m20Q9PrefixSliceFixEnabled` / `_m20Q9DropConsumerResampleCache`. The tick driver is a
transcription of `updateChartDataFast`'s static-playhead sequence whose eight source needles are
asserted against the live `replay-system.js` and `chart.js` on every run, so it cannot drift
silently. Single host chart, backtest replay, candle-mode stepping. Timeframes 5m/15m/1H/4H at
stride 1 over a 2-day 1m corpus (2,880 ticks per cell), plus 1m as a positive control, plus
5m/15m/1H/4H/1D at stride 7 over a 10-day corpus for the join. Both M20-Q9 kill-switch states, with
the product helper's own return value recorded as `true` and `false` so the control is proven to
have controlled, and the allocation discriminator confirmed (1 prefix identity ON, 2,880 OFF).
Deterministic pinned fixture corpus, integer 1e-5 point arithmetic end to end, no wall clock, no
RNG, no UUID, no rAF, no float equality in any assertion payload.

**coverage= what I did not measure.**

- **No browser, no canvas, no rAF.** Nothing about what is *painted* is measured — only what is in
  `chart.data`. The value/Y painted-endpoint limb is untouched.
- **No panels, no multichart grid, no iframes.** `syncPanelCharts` and the real
  `applyMultichartMirrorFrame` were not driven; the mirror's mid-animation trim skip is confirmed by
  source needle only, and the animated-candle bake is a transcription of that branch, not a run of
  it.
- **The `_btTfDataCache` branch of `_getWalkForwardOhlcToPlayhead` is not exercised.**
  `currentFileId` is `null` by construction, so only the client-resample candidate loop runs. If a
  cached finer series with a *different* bar period were present, the trim's aggregation could
  differ from the resample's and the 0% trim share could move. Unmeasured.
- **Tick/animation mode is only partly covered.** The main matrix is candle-mode stepping. The
  animated-candle probe is a single playhead at a single tick progress on three timeframes; there is
  no animation sweep, no `tickProgress` scan, no `tp > 1` in-place mutation branch
  (`last.c = animatedCandle.c`) driven end to end.
- **One corpus, one shape.** A pure random walk with no trend, no fat tails, no gaps, no weekends,
  no session boundaries, one instrument, one price level. This is why the absolute pip series does
  not match the sibling's and why the PO's 4H +72 falls outside my range. The identity result is
  corpus-independent; every *magnitude* in this report is not.
- **1W and 1Mo are not run.** The PO's frozen-playhead observation names 1W; I covered it only in
  the frozen-playhead probe, not in either limb.
- **No orders, no trades, no indicators, no TP/SL.** The consequence of the wrong window for
  execution — which is what `_trimBarOhlcToReplayPlayhead`'s docstring says it exists to prevent —
  is entirely unmeasured.
- **No backward seek, no timeframe switch mid-replay, no dataset swap.** Forward advance only.
- **Both sides of the differential share `_prepareBarsForResampling` semantics** in the reference
  aggregation. If the product's bucketing convention is itself wrong (bucket boundary placement,
  `parseTimeframe`'s 30-day month), this packet cannot see it.
- **Single process, single host.** No cross-clock or cross-machine limb.

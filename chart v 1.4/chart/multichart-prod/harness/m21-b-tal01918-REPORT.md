# TAL-01918 — RED report (packet `tal01918-red`, Manager A, tier top)

RED only. **No product file was written.** Branch `manager-a/tal01918-red`, worktree off
`manager-a/critical-path`. Nothing pushed, merged or deployed.

```
node --test --test-concurrency=1 \
  "chart v 1.4/chart/multichart-prod/harness/m21-b-tal01918-red.test.mjs"
```

Result: **23 tests, 21 pass, 2 fail.** The two failures are LIMB 1 and LIMB 2, each failing for its
own stated reason. Evidence JSON:
`m21-b-tal01918-evidence/m21-b-tal01918-red-evidence.json`, byte-identical across runs.

> **Revision note.** The first cut of this packet was built against the retracted framing and
> reported LIMB 1 as a clean pass. That pass was worthless for two independent reasons, both now
> fixed and both demonstrated numerically rather than asserted: the subject was a bar the trim can
> never write, and the stepping mode was raw rather than candle-mode. Section 8 lists exactly what
> was discarded.

---

## 1. Subjects, stated up front

| oracle | subject | instant |
|---|---|---|
| `m21-b-bar-immutability-oracle` (primary) | `chart.data[length - 1]` | the **last tick that bucket occupies the last slot** |
| `m21-b-bar-immutability-oracle` (control) | `chart.data[length - 2]` | every tick after first appearing as historical |
| `m21-b-last-bar-window-oracle` | `chart.data[length - 1]` | every tick |

The control subject exists only to demonstrate the tautology. The trim writes one slot —
`const lastIdx = this.data.length - 1; … this.data[lastIdx] = trimmed;` — so `length - 2` is
unreachable by it. Reported below with its own numbers so no reader can mistake it for evidence.

---

## 2. The two limbs

### LIMB 1 — `m21-b-bar-immutability-oracle` → **FAIL under candle-mode stepping**

Phase offset = one third of the bucket (20 minutes at 1H, matching the reviewer's trace).

| timeframe | raw stepping | coarse (candle-mode) stepping | mean abs movement | max |
|---|---|---|---|---|
| 5m | 0 / 575 | **575 / 575** | 1.48 pip | 4.5 pip |
| 15m | 0 / 191 | **191 / 191** | 2.54 pip | 8.5 pip |
| 1H | 0 / 47 | **47 / 47** | 4.90 pip | 18.3 pip |
| 4H | 0 / 11 | **11 / 11** | 10.59 pip | 28.2 pip |

Identical with the M20-Q9 kill-switch ON and OFF. Every bucket moves, without exception.

**The raw-stepping column is not a pass in any interesting sense.** Under raw stepping the last tick
a bucket occupies the last slot is its own final raw bar, so the window is complete at exactly that
instant and there is nothing to see. That column is in the table to show that step mode alone flips
the verdict — which is itself the mechanism signature.

**The tautology, reproduced on purpose.** In the same eight cells, the `length - 2` control subject
records **0 violations across 2,740,084 comparisons**. It passes everywhere, including the cells
where the corrected subject records 18-pip movements. That is the failure mode that blocked the
sibling packet, demonstrated here rather than argued about.

### LIMB 2 — `m21-b-last-bar-window-oracle` → **FAIL, everywhere, both step modes**

| timeframe | raw stepping | coarse stepping | mean abs close error (coarse) |
|---|---|---|---|
| 5m | 2,304 / 2,304 | 576 / 576 | 1.48 pip |
| 15m | 2,688 / 2,688 | 192 / 192 | 2.53 pip |
| 1H | 2,832 / 2,832 | 48 / 48 | 4.96 pip |
| 4H | 2,868 / 2,868 | 12 / 12 | 10.62 pip |

All failures are on the presentation clause: the bar is aggregated over `[bucketStart, playhead]` and
carries no marker distinguishing it from a finished bar. Fifteen candidate marker spellings were
searched; resampled display bars carry `t, o, h, l, c, v` and nothing else. Under coarse stepping the
value clause is never even reachable (0 checks) — the playhead never lands on a bucket's final raw
bar, so **every single published coarse bar is a partial presented as final**.

---

## 3. The mechanism signature — 1H phase sweep

This is the discriminator between a wrong window and a stale value, and it is clean.

| playhead phase into the 1H bucket | violations | mean abs movement |
|---|---|---|
| +0 min | 47 / 47 | 4.91 pip |
| +1 min | 47 / 47 | 4.92 pip |
| +20 min *(reviewer's trace)* | 47 / 47 | 4.90 pip |
| +30 min | 47 / 47 | 4.73 pip |
| +58 min | 44 / 47 | 0.85 pip |
| **+59 min — the bucket's final raw bar** | **0 / 47** | **0.00 pip** |

The movement vanishes **exactly** at the bucket's final raw bar and nowhere else. A staleness defect
would not be phase-dependent. Confirms the signature the correction identified as the most useful
single fact available.

---

## 4. Which code path is exercised, and the attribution

Measured every tick of every cell:

```
ReplaySystem static-playhead install  (real _installPlayheadPrefix / legacy slice)
  → chart.rawData = prefix[0 .. playhead]
  → chart.resampleData → ChartDataPipeline.getResampledSeries
        FULL resample on every tick. Incremental branch: 0 attempts, 0 hits under coarse
        stepping across all 8 cells.
  → chart._resampleDataFull buckets the PREFIX      ← 100% of the error is created here
  → chart._trimLastDataBarToReplayPlayhead writes this.data[lastIdx], which IS
        ChartDataPipeline._resampleCache.result on every tick — but writes back the same
        [bucketStart, playhead] aggregation, so its numeric contribution is zero.
```

| timeframe (coarse) | slice error | trim error | slice share |
|---|---|---|---|
| 5m | 1.48 pip | 0.00 pip | 100% |
| 15m | 2.53 pip | 0.00 pip | 100% |
| 1H | 4.96 pip | 0.00 pip | 100% |
| 4H | 10.62 pip | 0.00 pip | 100% |

The trim replaced the last-bar slot on 100% of ticks and changed a value on 0%. The zero is a
property of the data, not of the trim: `_prepareBarsForResampling` normalises `h = max(o,c,h,l)`
before bucketing while `_aggregateFinerBarsWalkForward` reads `b.h` raw, and a single fault-injected
print whose close is the bucket extreme but whose high sits below it makes the trim write a high 200
points off. Stated so the 0% is not over-read.

**"Baked in at finalization" does not reproduce, and the counter says why.** Under coarse stepping
the pipeline's incremental branch recorded **0 attempts and 0 hits** in every cell: the source grows
by a whole display period per install, so `sourceLen === source.length - 1` can never match and the
cached prior bucket is never reused. Cited as instructed, and confirmed by counting rather than by
reading the code.

---

## 5. Render cadence is not inert

Confirmed against the real methods rather than assumed. `render()` is the only writer that clears
`chart._frameDisplaySeries` (`chart.js:28764` in this tree). `getDisplaySeries()`
(`chart.js:25434-25447`) returns that latched array whenever it is set, and nothing on the data path
clears it.

Driven end to end: install at tick 1000, read `getDisplaySeries()`, then install at tick 1100 with a
full resample, trim and `bumpDataVersion()` — and `getDisplaySeries()` still returns the **same array
object**, 3.2 pips stale against `chart.data`, at both 1H and 15m. Clearing the latch restores
agreement immediately. `_shouldUseDisplayPipeline()` returns true in backtest mode, so this is the
live consumer path, not a corner.

This matters for the fix: correcting the resample window alone would still be read one frame late by
every consumer that goes through `getDisplaySeries()`.

---

## 6. Truth-column independence — the trap that blocked the sibling

This packet's reference (`referenceBucketsPoints`) is a separate implementation, not a call into
`_resampleDataFull`. Demonstrated rather than claimed: driving the **real** `_resampleDataFull` at 1w
and diffing bucket starts against an independent UTC-calendar implementation shows product weeks
start on **UTC day 4 (Thursday)**, 259,200,000 ms off the Monday anchor, on every bucket —
`parseTimeframe('1w')` returns 604,800,000 ms and `_resampleDataFull` floors it from the Unix epoch.
A shared-implementation truth column cancels that defect out; this one sees it.

Stated in the open rather than buried: for intraday timeframes the reference shares the epoch-floor
*convention*, and the packet proves that convention is equivalent to the UTC calendar for
5m/15m/1H/4H/1D (verified bar by bar over the whole corpus). It does not share it for 1w.

The settling diagnostic is the one place a same-implementation comparison remains, because the brief
asked for a "clean full resample of `rawData` to the same playhead". It is reported under the name
`productVsSameImplementationPoints`, alongside the independent column, and its subject is
`chart.data[length - 2]` — so it is labelled twice over as unable to see this defect.

---

## 7. Suspects and the join

**Suspect 4** verified directly, not inherited: at 1m display on a 1m master
`_getWalkForwardOhlcToPlayhead` returns `null` (60000 ≥ 55200, both candidates skip). LIMB 2 run
against the real product at 1m passes 2,880/2,880 value checks at 0.00 pip — the positive control.

**Suspect 2** is a real but smaller second injection site: at tick progress > 0 the interpolated
close is baked verbatim into the coarse bucket (0.1 / 1.9 / −1.6 pip at 5m/1H/4H).
**Suspect 3**'s mid-animation trim skip is confirmed byte-level.

### One defect or two — one

The last-slot movement is algebraically the truncation error: the presented close is `c(playhead)`
and the full-bucket close is `c(bucketEnd − rawStep)`, so
`presented − fullBucket ≡ c(playhead) − c(bucketEnd − rawStep)`. Checked tick for tick at 1H:
**2,880 checked, 0 mismatches.** This is an identity, not a correlation, so it holds on any corpus.
**Treat TAL-01918 and the indicator-lag row as one root cause.**

### Against the sibling's corrected series and the PO

| timeframe | this packet, phase-averaged | at the third-phase offset | sibling | PO |
|---|---|---|---|---|
| 5m | 1.02 pip | 1.43 | 2.57 | 0 |
| 15m | 2.01 pip | 2.49 | 8.06 | −0.6 |
| 1H | 4.14 pip | 4.86 | 14.60 | +13 |
| 4H | 8.39 pip | 10.06 | 19.71 | +72 |
| 1D | 20.30 pip | 22.47 | 31.67 | n/a |

At 1H: PO 13, reviewer 21.3, sibling 14.60, this packet 4.14 phase-averaged and 4.86 at the
reviewer's 20-minute phase.

**Monotonicity reproduces. Magnitudes do not, and I am not going to pretend they do.** My fixture's
mean absolute 1m close-to-close change is 0.87 pip — a quiet pure random walk. The sibling's series
exceeds mine by ×2.52 / ×4.01 / ×3.53 / ×2.35 / ×1.56 at 5m / 15m / 1H / 4H / 1D. That is not a
constant factor, so the gap is *both* a volatility-scale difference and an autocorrelation-shape
difference — real EURUSD trends within a bucket and then mean-reverts across days, a random walk does
neither. The quantity is the same; the price process is not. Settling the magnitudes numerically
needs this identity run on the sibling's corpus, which I do not have.

The PO's signed values are single realisations of the same quantity. Three of the four land inside
the distribution my corpus produces; the 4H +72 exceeds my maximum of 43.2 pip, which bounds the
fixture rather than the defect.

**PO observation 2**: the coarse family agrees to the last digit (reproduced, `distinct = 1` across
5m/15m/1H/4H/1D/1W), but static 1m agrees with them too. The 1m/coarse split needs the animated or
the render path, not the resample window.

---

## 8. What was salvaged and what was discarded

**Discarded.**

- The old LIMB 1 subject (first-seen-while-historical, i.e. `length - 2` in effect) and its headline
  "PASS across 2.37M re-checks". It was a tautology. It is retained only as the labelled control.
- Raw-only stepping as the matrix's sole mode, and every conclusion that depended on it.
- The claim that "the immutability limb passes and the window limb fails" — that was an artefact of
  those two errors. **Both limbs fail.**
- The claim that "there is no third path to name". The settling diagnostic that produced it is
  blind by construction, and render cadence turns out to be a live contributor.
- The old join framing against the sibling's pre-correction 1.47/5.50/10.53/17.95/19.07.

**Salvaged unchanged.** The product loader and its SHA-256 pinned method spans; the
source-needle-verified transcription; the deterministic integer-point corpus; LIMB 2 in full,
including the 1m positive control; the slice-vs-trim attribution and its ill-formed-bar bound; the
exercised-path naming; suspects 2, 3 and 4; the window-error/truncation-error identity; the
kill-switch differential and allocation discriminator.

---

## 9. What a fix would have to change (not made)

The last display bucket during replay is a partial aggregation and nothing in the data model says so.
Either publish it with an explicit forming flag that every consumer honours, or do not publish a
partial coarse bucket as a bar. Widening the window to `[bucketStart, bucketEnd)` is not the fix —
that paints future data. Two things follow from the measurements: work on the trim or the M20-Q9
cache moves zero pips, and a data-side fix alone is still read one frame late through
`getDisplaySeries()`.

---

## 10. `surface=` and `coverage=`

**surface=** headless Node, no browser. Real product code throughout: fourteen `chart.js` methods
lifted verbatim by source span and SHA-256 pinned (`_resampleDataFull`, `resampleData`,
`parseTimeframe`, `_prepareBarsForResampling`, `_trimLastDataBarToReplayPlayhead`,
`_trimBarOhlcToReplayPlayhead`, `_getWalkForwardOhlcToPlayhead`, `_aggregateFinerBarsWalkForward`,
`_getBarPeriodEndMs`, `_getReplayPlayheadMs`, `_getNativeRawStepMs`, `_measureRawDataStepMs`,
`getDisplaySeries`, `_shouldUseDisplayPipeline`); the real `ChartDataPipeline` including
`buildDisplaySeries`; the real `ReplaySystem._installPlayheadPrefix` /
`_m20Q9PrefixSliceFixEnabled` / `_m20Q9DropConsumerResampleCache`. The tick driver is a
transcription of `updateChartDataFast`'s static-playhead sequence whose eight source needles are
asserted against live `replay-system.js` and `chart.js` on every run. Single host chart, backtest
replay. Matrix: 5m/15m/1H/4H × {raw stepping, coarse candle-mode stepping at the third-phase offset}
× {kill-switch ON, OFF} = 16 cells over a 2-day 1m corpus, plus 1m as a positive control, plus a
six-point 1H phase sweep, plus 5m/15m/1H/4H/1D phase sweeps (5–24 phases each) over a 10-day corpus
for the join. Product kill-switch helper observed returning both `true` and `false`; allocation
discriminator confirmed at 1 prefix identity ON versus 2,880 OFF. Deterministic pinned fixture,
integer 1e-5 point arithmetic end to end, no wall clock, no RNG, no UUID, no rAF, no float equality
in any assertion payload.

**coverage= what I did not measure.**

- **No browser, no canvas, no real rAF.** Nothing painted is measured. The render-cadence limb is
  driven by clearing `_frameDisplaySeries` by hand to stand in for `render()`; actual frame timing,
  frame ordering and paint are unmeasured.
- **No panels, no multichart grid, no iframes.** `syncPanelCharts` and the real
  `applyMultichartMirrorFrame` were not driven; the mirror's mid-animation trim skip is confirmed by
  source needle only, and the animated-candle bake is a transcription of that branch, not a run.
- **The `_btTfDataCache` branch of `_getWalkForwardOhlcToPlayhead` is not exercised.**
  `currentFileId` is `null`, so only the client-resample candidate loop runs. With a cached finer
  series of a different bar period the trim's 0% share could move.
- **Tick/animation mode is only partly covered.** No `tickProgress` sweep and no end-to-end run of
  the `tp > 1` in-place mutation branch.
- **One corpus, one shape, one price level.** Pure random walk, 0.87 pip mean 1m move, no trend, no
  fat tails, no gaps, no weekends, no sessions. This is why every magnitude here is smaller than the
  sibling's and why the PO's 4H +72 falls outside my range. The identity result is corpus-independent;
  no magnitude in this report is.
- **1W and 1Mo appear only in the frozen-playhead and bucket-alignment probes**, not in either limb.
  The 1w Monday misalignment is reported as an incidental finding and is **not** part of TAL-01918.
- **No orders, trades, indicators or TP/SL.** The execution consequence of the wrong window —
  precisely what `_trimBarOhlcToReplayPlayhead` exists to prevent — is unmeasured.
- **No backward seek, no mid-replay timeframe switch, no dataset swap.** Forward advance only.
- **The coarse-stepping driver advances the playhead by exactly one display period.** Real
  candle-mode stepping may land on session or gap boundaries differently; that is unmodelled.
- **Single process, single host.** No cross-clock limb.

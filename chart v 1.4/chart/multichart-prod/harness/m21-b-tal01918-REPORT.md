# TAL-01918 — RED report (packet `tal01918-red`, Manager A, tier top)

RED only. **No product file was written.** Branch `manager-a/tal01918-red`, worktree
`C:/Users/user/Desktop/talaria1/manager-a-tal01918-red`, clean before this commit. Nothing pushed,
merged or deployed.

```
node --test --test-concurrency=1 \
  "chart v 1.4/chart/multichart-prod/harness/m21-b-tal01918-red.test.mjs"
```

**28 tests, 26 pass, 2 fail.** The two failures are LIMB 1 and LIMB 2. Evidence JSON byte-identical
across runs: `m21-b-tal01918-evidence/m21-b-tal01918-red-evidence.json`.

**Row name: `TAL-01918 — newest candle is an unmarked partial bucket`**
(short: `unmarked-forming-candle`). Rationale in §7.

---

## 0a. r3 — landing the acceptance items

| item | status |
|---|---|
| `assert.ok(masterFail > 0)` fails on a correct product | returned to an **observation**, and asserted only under a `corpusHasIntraBucketTravel` precondition |
| two claims `pass: true` on an empty matrix | both guarded with non-empty-input assertions before the aggregate is computed |
| "100% of the bucket missing" at 4H | now `239/240 = 99.58%`, exact ratio printed alongside, floor not round |
| `meanAbsMovementPips === 0` is a 0.005 pip tolerance | removed; the integer violation count is now the sole test |
| "marked model exercised on all three clauses" | scoped to the `step = 1` control sweep (§1) |
| trim direction unstated | **stated and asserted** — the trim writes the *correct* value (§4) |
| `_getBtTfDataCache` reachability overstated | scoped to branch execution; the four bypassed gates are named in the evidence (§4) |
| rename | amended to `unmarked-forming-candle`, and the raw-stepping basis for dropping "coarse" is now asserted rather than argued (§7) |
| the undriven legacy path | **driven** (§2b) |

---

## 0. Response to the r2 block

| # | required | done |
|---|---|---|
| 1 | LIMB 1 must be able to pass on a correct product | rebuilt as three clauses, marker-aware and completeness-gated; passes on **two** distinct correct models (§1) |
| 2 | drive coarse stepping through `calculateNextIndex` | done; landing phase is **0**, not the fixed phase I imposed (§2) |
| 3 | bound the trim's **close** contribution, or withdraw 100/0 | **withdrawn**, and the close bound measured via the `_btTfDataCache` branch (§4) |
| 4 | compute the identity from `chart.data`, or withdraw | **withdrawn**; the two sides were the same expression (§6) |
| 5 | restore `length - 2` as a genuine differential | restored as LIMB 1 clause C and promoted to a headline finding (§3) |
| 6 | rename the row | proposed, with the contradicting numbers (§7) |
| + | LIMB 2 `valueChecked = 0` in all coarse cells | reachability stated explicitly; clause C supplies the numeric assertion there (§5) |
| + | `masterCompleteValueFailureCount` never asserted | now asserted (§5) |

You were right on every count. The one place I want to add rather than concede is §2: driving the
real stepper does not just correct my phase, it changes what the defect *is*.

---

## 1. LIMB 1 rebuilt — three clauses, separately counted

The old limb demanded that the bar in the last slot already equal its full bucket. No chart that
draws a live candle can satisfy that, so it was unfalsifiable in the wrong direction and its verdict
tracked corpus volatility. Replaced by:

- **Clause A — presentation.** A bar whose window is incomplete at the sampling instant must carry a
  forming marker. **Structural and fixture-independent.**
- **Clause B — mutation after a finished presentation.** The value last shown for a bucket *while
  presenting it as finished* must not later differ. Marker-aware: a marked bar is never enrolled.
- **Clause C — settled differential.** Every bucket, once historical, on every subsequent tick: must
  not change, and must equal the independent full-bucket reference.

Passes iff all three pass. Against ideal aggregators with no product code in the loop:

| model | clause A | clause B | clause C | verdict |
|---|---|---|---|---|
| omits the partial bucket | 0 / 0 (vacuous) | 0 / 48 | 0 / 47 exact, 0 / 64,860 stable | **PASS** |
| publishes it, marked `isForming` | 0 / 2,832 | 0 / 48 | 0 / 47 exact, 0 / 67,633 stable | **PASS** |
| publishes it unmarked | **2,832 / 2,832** | 0 / 48 | clean | **FAIL** |

The middle row is the one your reviewer asked for. **The fix §8 recommends now turns this RED
green.**

*Scope, corrected:* "the marked model is exercised on all three clauses" is true of the `step = 1`
control sweep above, and **not** of the verdict-carrying stepping modes. At phase 0 a marked bar is
never enrolled in clause B and the window is never complete, so the marked model's clause B has
`checked = 0` there. The sweep is run at `step = 1` precisely so that complete-window ticks exist and
clause B is not vacuous.

### It is no longer a volatility meter

On a **perfectly flat corpus** — every bar identical, zero volatility:

- clause A still fails 48/48 on the ideal unmarked model **and 48/48 on the product**;
- clause B's magnitude correctly drops to 0.00 pip;
- the marked model still passes;
- **the LIMB 1 verdict does not flip.**

The prior revision passed on a flat corpus. That flip was the defect you identified, and it is gone.
A corpus containing a weekend or an illiquid session can no longer report TAL-01918 fixed.

---

## 2. Real product stepping — and it makes the defect worse, not milder

Driven through the product's own `ReplaySystem.calculateNextIndex()` from a deliberately off-phase
start. Steady-state landing phases, excluding the seeded first tick and the tail-clamped last:

| timeframe | start phase | steady-state distinct landing phases |
|---|---|---|
| 5m | +1 bar | **{0}** |
| 15m | +5 bars | **{0}** |
| 1H | +20 bars | **{0}** |
| 4H | +80 bars | **{0}** |

Exactly as you said: `calculateNextIndex` re-anchors to `_replayBucketStart(ts, tfMs) + tfMs` and
then takes `_firstRawIndexAtOrAfter`, so any starting phase collapses within one step. My fixed-phase
stride was not the product. It is retained only as a labelled contrast case and no verdict rests on
it. One resolver is stubbed — `_resolveReplayStepTimeframeForStep`, which reaches DOM-backed interval
controls — pinned to the chart's display timeframe; recorded as a stub in the evidence.
`_advanceCoarseLegacyCandleBucket` is the phase-preserving path, gated on
`_isFinestTfCoarseLegacyCandleStep()`; I do not drive it and claim nothing about it.

**The consequence is the mechanism you asked me to consider.** At phase 0 the newest coarse candle
contains exactly **one raw bar**:

| timeframe | raw bars in newest candle | un-elapsed remainder | bucket missing | subsequent movement |
|---|---|---|---|---|
| 5m | 1 of 5 | 4 min | 80% | 1.65 pip |
| 15m | 1 of 15 | 14 min | 93% | 3.05 pip |
| 1H | 1 of 60 | 59 min | 98% | 4.79 pip |
| 4H | 1 of 240 | 239 min | 100% | 9.45 pip |

Markers found: **zero**, at every timeframe. A user stepping candle-by-candle sees an unlabelled
one-minute stub drawn in the slot where they read a finished candle, and then watches it fill in.
That is a plausible mechanism for the PO's report, and it is **neither the trim nor the slice**.

## 2b. The legacy phase-preserving law — driven, not deferred

`_advanceCoarseLegacyCandleBucket` is now driven for real, with a single declared stub symmetric
with the product-mode one: its gate `_isFinestTfCoarseLegacyCandleStep()` pinned true. The advance
arithmetic is product code. It is checked **first** at all three step sites, so when its gate is on
it is the dominant path.

| timeframe | start phase | steady-state landing phases | clause A | clause B |
|---|---|---|---|---|
| 5m | +1 | **{1}** preserved | 576 / 576 | 575 / 576 @ 1.48 pip |
| 15m | +5 | **{5}** preserved | 192 / 192 | 191 / 192 @ 2.53 pip |
| 1H | +20 | **{20}** preserved | 48 / 48 | 47 / 48 @ 4.80 pip |
| 4H | +80 | **{80}** preserved | 12 / 12 | 11 / 12 @ 9.71 pip |

It advances by `currentTimestamp + tfMs` rather than re-anchoring, so it preserves phase — the exact
opposite of `calculateNextIndex`. **Two evidenced stepping laws with opposite phase behaviour, and
the RED fails under both.**

You were right that my withdrawn fixed-phase mode was already a model of this law. It agrees with
the real method **exactly on clause A** at all four timeframes, and its landing phases match.
Clause B differs by exactly one bucket per cell, because `_advanceCoarseLegacyCandleBucket` clamps
its final step to `fullRawData.length - 1` and so visits one tail tick the fixed-stride loop exits
before — a loop-termination difference, not a disagreement about the stepping law. The `'coarse'`
mode is relabelled accordingly: it models the legacy phase-preserving path, and the "synthetic
contrast case" description is withdrawn.

This bounds the mechanism table in §2 rather than the RED: under the legacy gate the newest candle
holds `phase + 1` raw bars rather than one, so the 1-of-60 severity is specific to
`calculateNextIndex`. Clause A fails identically either way.

### Your reading of raw versus coarse is correct

Under raw stepping the window is complete at the moment of measurement and **the product is exact
there** — 0 value failures across 1,664 reachable checks, plus 2,880 at 1m. That is evidence the
window arithmetic is right. I previously drew the opposite inference. Withdrawn.

---

## 3. The `length - 2` result, restored as the packet's genuine differential

You are right that it is not a tautology, and the packet's own numbers prove it:
`fullResampleCalls === ticks` and `incrementalHits === 0` in every cell, so `_resampleDataFull`
rebuilds the entire series from the growing prefix on every tick. Each historical bar is recomputed
from scratch before every comparison.

Restored as LIMB 1 clause C and reported as a headline:

> **0 violations in 3,110,344 stability comparisons and 0 in 4,944 exactness comparisons against the
> independent full-bucket reference, across all 24 cells.**

Once a bucket is historical it is stable *and* correct. Nothing completed mutates.

---

## 4. Trim versus slice — the 100/0 split is withdrawn

Your reasoning is right on both halves. The "100% slice" was scored against a reference containing
bars the playhead has not reached, so it charged the slice with the fact that the future has not
happened. And the "0% trim" was bounded by a fault injection that moved the **high** while the
statistic was close-only — a claim about a different field.

So I measured the close directly, on the branch I had flagged as a gap. With `currentFileId` set and
`_btTfDataCache` holding the finer 1m series — the scenario the method exists for, a 1m series saved
before a timeframe switch — `_getWalkForwardOhlcToPlayhead` takes the cache branch
(`chart.js:8908-8926`) instead of returning null, and the trim overwrites the resampled full-bucket
close with a walk-forward close:

**Direction is now measured, and it is the opposite of what the magnitude alone suggests.** Each
tick is scored against two independent harness-owned aggregations — the full bucket, and the bucket
to the playhead:

| tick | pre-trim | independent FULL bucket | post-trim | independent TO-PLAYHEAD | trim correct? |
|---|---|---|---|---|---|
| 10 | 130,237 | 130,237 ✓ | 130,134 | 130,134 ✓ | yes |
| 20 | 130,147 | 130,147 ✓ | 130,248 | 130,248 ✓ | yes |
| 30 | 129,921 | 129,921 ✓ | 129,886 | 129,886 ✓ | yes |
| 40 | 129,894 | 129,894 ✓ | 129,892 | 129,892 ✓ | yes |

**On 4/4 ticks the pre-trim value is the full bucket — the resample is the one holding data the
playhead has not reached — and the trim writes the correct to-playhead value.** The 10.3 pip is the
size of the *correction the trim applies*, not an error it introduces. Both facts are asserted, not
merely printed.

**Consequence for the corrective packet, stated plainly: narrowing or removing the trim on this path
re-introduces up to 10.3 pip of future data into a live candle.**

The 100/0 attribution stays withdrawn — but the correct reading is that on this path the trim is the
corrective term, not an additional error term. This also qualifies the suspect-4 result: walk-forward
is a no-op at the native timeframe *only when the backtest finer-timeframe cache is empty*.

**Reachability is not claimed.** This probe replaces `_getBtTfDataCache` wholesale and therefore
bypasses four gates the shipped accessor applies — the `_btTfDataCache` Map, the per-file Map,
`entry.anchorKey === _btTfCacheAnchorKey(...)`, and `_btTfCacheEntryValidForTimeframe` — none of
which are in `EXTRACTED_METHODS`. What is demonstrated is the branch executing and what it computes
when it does, **not** that a shipped cache entry satisfies its own validity gates. The four gates are
enumerated in the evidence JSON under `trimCloseBound.bypassedGates`.

The `_prepareBarsForResampling` / `_aggregateFinerBarsWalkForward` normalisation divergence
(`h = max(o,c,h,l)` versus raw `b.h`, 200 points on an ill-formed print) is retained and re-scoped:
it is a finding **about the high**, no longer offered as an attribution bound.

---

## 5. LIMB 2 — reachability stated, and the master clause asserted

Still fails everywhere, on the presentation clause, at every timeframe and in both kill-switch
states. Two corrections:

- **`valueChecked = 0` in the coarse and product cells is structural, not an oversight**, and it is
  now reported as such: the playhead never lands on a bucket's final raw bar under those stepping
  laws, so the clause has nothing to evaluate. The numeric assertion in those cells is supplied by
  LIMB 1 clause C, which is sound and has 4,944 exactness checks. Where the value clause *is*
  reachable it passes: **0 failures in 1,664 checks.**
- **`masterCompleteValueFailureCount` is now asserted**, not merely recorded. It fails wherever the
  master holds the whole window, which is the wrong-window statement expressed numerically.

---

## 6. The identity claim is withdrawn

You are right and the demonstration is in the packet. `referenceBucketsPoints` assigns
`cur.cP = r.cP` on every row, so `ref.cP` **is** `closeAt(bucketLastRawT)` — 48/48 identical by
construction. Both sides of my "identity" reduced to the same expression and no product value
appeared on either. It could not have failed.

**"One defect, not two" is withdrawn.** I am not restating it in a repaired form; the measurement
that would support it has not been made.

I have also added a **product-liveness guard**, because your reviewer's decisive proof — a run in
which `loadProductChartSurface()` threw and a "product" conclusion still passed — is a hazard beyond
this one test. It asserts that all 24 matrix cells actually drove product code (ticks > 0 and
`fullResampleCalls` > 0) before any product conclusion is read.

---

## 7. Row name

**Current:** "completed-bar close mutation". Contradicted by two of this packet's own sound results:
LIMB 2's value clause, 0 failures in 1,664 reachable checks; and LIMB 1 clause C, 0 violations in
3,110,344 stability and 4,944 exactness comparisons. Nothing completed mutates.

**Adopted:** `TAL-01918 — newest candle is an unmarked partial bucket`
(short: `unmarked-forming-candle`).

Your amendment is right and the packet now asserts its basis rather than arguing it. The marker is
missing at every tick the window is incomplete in **every** stepping mode, raw included — clause A
fails 2,304/2,304 at 5m, 2,688/2,688 at 15m, 2,832/2,832 at 1H and 2,868/2,868 at 4H under raw
stepping. Coarse stepping determines the severity, not the existence, so "coarse" is dropped from
the name and the 1-of-60 figure is kept as the headline magnitude.

What the product does is publish the newest bucket as an ordinary finished bar while it holds only
the raw bars elapsed so far — a single raw bar under `calculateNextIndex` — with no forming marker in
any of 15 searched spellings. The value is correct for the window it covers and wrong for the candle
it is drawn as. The apparent "mutation" is that bar filling in, which is normal behaviour for a live
candle and surprising only because nothing labels it as one.

---

## 8. What a fix would have to change (not made)

Mark the newest bucket as forming and have consumers honour it, or do not publish a partial bucket
as a bar at all. Widening the window to `[bucketStart, bucketEnd)` is not the fix — that paints
future data. Four measured constraints:

1. Work on the M20-Q9 cache moves zero pips.
2. **Do not narrow or remove the trim on the `_btTfDataCache` path.** It is the corrective term
   there, not an error term: it replaces a full-bucket close that contains future data with the
   correct to-playhead close, worth up to 10.3 pip (§4).
3. A data-side fix alone is still read one frame late through `getDisplaySeries()` (§9).
4. The fix must hold under **both** evidenced stepping laws — `calculateNextIndex` (re-anchoring,
   phase 0) and `_advanceCoarseLegacyCandleBucket` (phase-preserving) — and under raw stepping,
   where clause A also fails (§2b, §7).

---

## 9. Standing findings, unchanged by this revision

- **Render cadence is a live contributor.** `render()` is the only writer that clears
  `chart._frameDisplaySeries` (`chart.js:28764`); nothing on the data path does. After a full
  resample, trim and `bumpDataVersion()`, `getDisplaySeries()` still returns the *same array object*,
  3.2 pips stale, at 1H and 15m. Clearing the latch restores agreement.
- **Truth-column independence.** Driving the real `_resampleDataFull` at 1w shows product week
  buckets starting on UTC Thursday, 259,200,000 ms off Monday, on every bucket — the defect a
  shared-implementation truth column cancels. Incidental to TAL-01918.
- **"Baked in at finalization" does not reproduce**, counted rather than read: 0 incremental
  attempts and 0 hits under coarse stepping in every cell.
- **No single magnitude.** Monotonicity reproduces; magnitudes do not.

| timeframe | product stepping | phase-averaged | sibling | PO |
|---|---|---|---|---|
| 5m | 1.64 pip | 1.02 | 2.57 | 0 |
| 15m | 3.05 pip | 2.01 | 8.06 | −0.6 |
| 1H | **5.97 pip** | 4.14 | 14.60 | +13 |
| 4H | 13.18 pip | 8.47 | 19.71 | +72 |
| 1D | 20.53 pip | 20.17 | 31.67 | n/a |

At 1H: PO 13, reviewer 21.3, sibling 14.60, this packet 5.97 under the product's own stepping. My
fixture's mean absolute 1m move is 0.87 pip and the sibling exceeds me by ×2.52 / ×4.01 / ×3.53 /
×2.33 / ×1.57 — not a constant factor, so the gap is both volatility scale and autocorrelation shape.
Settling the magnitudes needs this measurement run on the sibling's corpus, which I do not have.

---

## 10. `surface=` and `coverage=`

**surface=** headless Node, no browser. Real product code throughout: fourteen `chart.js` methods
lifted verbatim by source span and SHA-256 pinned (`_resampleDataFull`, `resampleData`,
`parseTimeframe`, `_prepareBarsForResampling`, `_trimLastDataBarToReplayPlayhead`,
`_trimBarOhlcToReplayPlayhead`, `_getWalkForwardOhlcToPlayhead`, `_aggregateFinerBarsWalkForward`,
`_getBarPeriodEndMs`, `_getReplayPlayheadMs`, `_getNativeRawStepMs`, `_measureRawDataStepMs`,
`getDisplaySeries`, `_shouldUseDisplayPipeline`); the real `ChartDataPipeline` including
`buildDisplaySeries` and `_tryIncrementalResample`; the real `ReplaySystem` including
`calculateNextIndex`, `_replayBucketStart`, `_firstRawIndexAtOrAfter`, `_getLocalRawBarPeriodMs`,
`_installPlayheadPrefix`, `_m20Q9PrefixSliceFixEnabled`, `_m20Q9DropConsumerResampleCache`,
`_advanceCoarseLegacyCandleBucket`. The tick
driver is a transcription of `updateChartDataFast`'s static-playhead sequence whose eight source
needles are asserted against live source on every run. Matrix: 5m/15m/1H/4H × {raw, fixed-phase
coarse, **real legacy `_advanceCoarseLegacyCandleBucket`**, **real product `calculateNextIndex`**} ×
{kill ON, OFF} = 32 cells over a 2-day 1m corpus; plus 1m
as a positive control; plus a flat-corpus control; plus a six-point 1H phase sweep; plus per-phase
sweeps at five timeframes over a 10-day corpus. Product kill-switch helper observed returning both
`true` and `false`; allocation discriminator 1 identity ON versus 2,880 OFF. Deterministic pinned
fixture, integer 1e-5 point arithmetic end to end, no wall clock, no RNG, no UUID, no rAF, no float
equality in any assertion payload, no tolerance anywhere.

**coverage= what I did not measure.**

- **No browser, no canvas, no real rAF.** Nothing painted is measured. The render-cadence limb clears
  `_frameDisplaySeries` by hand in place of `render()`; frame timing and paint are unmeasured.
- **Two declared stubs, one per stepping law, each a gate or resolver rather than arithmetic.**
  `_resolveReplayStepTimeframeForStep` → display timeframe in product mode;
  `_isFinestTfCoarseLegacyCandleStep` → true in legacy mode. The advance arithmetic in both
  (`calculateNextIndex`, `_replayBucketStart`, `_firstRawIndexAtOrAfter`,
  `_advanceCoarseLegacyCandleBucket`, `_getLocalRawBarPeriodMs`) is product code. What is **not**
  established is which gate is on in a shipped session; I drive both laws and claim neither is the
  default.
- **The `_btTfDataCache` probe bypasses four validity gates** (§4). It shows the branch executing
  and what it computes; it does not show a shipped cache entry reaching it.
- **No panels, no multichart grid, no iframes.** The mirror's mid-animation trim skip is confirmed by
  source needle only.
- **The `_btTfDataCache` close bound is a single configuration** (1h master, 1m cached finer series,
  four ticks). It establishes that the trim's close contribution is non-zero; it does not
  characterise its distribution.
- **Tick/animation mode partly covered.** No `tickProgress` sweep, no end-to-end run of the `tp > 1`
  in-place mutation branch.
- **One corpus shape.** Pure random walk, 0.87 pip mean 1m move, no trend, no fat tails, no gaps, no
  weekends, no sessions. Every magnitude here is corpus-dependent; the flat-corpus control shows
  which clauses are not.
- **1W and 1Mo appear only in the frozen-playhead and bucket-alignment probes**, not in either limb.
- **No orders, trades, indicators or TP/SL.** The execution consequence of the wrong window is
  unmeasured, and that is precisely what `_trimBarOhlcToReplayPlayhead` exists to prevent.
- **No backward seek, no mid-replay timeframe switch, no dataset swap.** Forward advance only.
- **Single process, single host.** No cross-clock limb.

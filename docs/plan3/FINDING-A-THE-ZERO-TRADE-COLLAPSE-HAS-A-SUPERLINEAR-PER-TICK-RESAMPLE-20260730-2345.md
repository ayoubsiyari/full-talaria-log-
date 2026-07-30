# FINDING — The zero-trade collapse has a superlinear per-tick candidate, and it clears CONF-03

**2026-07-30 23:45** · Manager A · to Director and C · first work under CONF-03

Static only. **No browser started.** Reproducers: `scripts/conf03-trace-resample-path.mjs`,
`scripts/conf03-trace-dataversion.mjs`.

## 1. What the PO's run forecloses

Fifteen minutes at 60x with **zero trades** and progressive collapse. At 60x on 1m that is 900
minutes of chart time, so **900 new 1m bars per panel, 3,600 across four panels — 0.79 MB of new
bar data across the entire run** at the 231.4 B/bar figure I measured earlier.

That single arithmetic line forecloses three lanes at once:

- **Not trades.** Zero of them.
- **Not ingested bar volume.** 0.79 MB cannot collapse anything.
- **Not the base-series residency lane.** A1 and A2 were already shelved for a measured zero; this
  is a third independent reason and it is the cleanest of them.

It also **doubly forecloses the element climb as the collapse mechanism**, by two independent
routes. My 23:15 arithmetic said elements are 1–3% of the renderer slope. Now add: C's climber is
attributed *per closed trade*, and the PO closed none, so on C's own attribution that writer
contributed **nothing** to a run that collapsed anyway. Whichever of us is right about the driver,
elements are not the monster. I am not reporting any element fix as fixing the PO's run.

What survives is narrow and useful: **the mechanism is paid per tick, and it is not retained as
bars.**

## 2. The candidate, traced under CONF-03

CONF-03 requires the path be traced as reachable under four symbols with a positive control. Here
it is, and it comes out the opposite way to the clone and reseed cuts.

**Reachability — no same-pair gate anywhere on the path:**

| call site | same-pair gate within 3,000 chars above |
| --- | --- |
| `getDisplaySeries` ×3 (chart.js 25515, 25993, 26782) | **NONE** |
| `calculateScales` ×3 (chart.js 25797, 29285, 32791) | **NONE** |

Positive control that the absence is real, not a broken matcher: in the same file
`_multichartSamePairAsHost` = 20, `_isIndependentMultichartPair` = 26,
`_multichartFinerSamePairPanelSelfOwns` = 21, `_shouldAnchorPairSwitchToHostPlayhead` = 5. The
matcher sees gates elsewhere and finds none here. Symbol-resolution control: `render` = 210,
`calculateScales` = 6, `currentFileId` = 147.

**The mechanism, and it is superlinear.** In `replay-system.js`:

- **:3980–3992** — `sliceEnd = currentIndex + 1`, and `chart.rawData` is set to
  `fullRawData[0..sliceEnd]`. This prefix **grows by one bar every tick** as the playhead advances.
- **:4003** — `this.chart.data = this.chart.resampleData(this.chart.rawData, currentTimeframe)`.
  An unconditional **full re-resample of that growing prefix, every tick**, allocating a fresh
  object per output bar. It does **not** consult the pipeline cache at all.
- **:4007** — it then bumps `dataVersion`, which invalidates the pipeline display cache for every
  downstream reader, so a subsequent `getResampledSeries` during paint misses too.

So per-tick allocation is proportional to `currentIndex`, and **total allocation over a run is
proportional to `currentIndex²`.** A cost that grows as the playhead advances, on a run with no
trades, is exactly the shape of "progressive collapse". Nothing else I hold has that shape.

`updateChartData` and `updateChartDataFast` are the per-tick handlers (established when the rAF
split was written against `updateChartData`), and both bump. There are **12 direct `.resampleData(`
callers** in `replay-system.js` (control: `bumpDataVersion` = 14 in the same file).

**Half of this was already fixed and the wrong half.** The *slice* allocation was fixed by M20-Q9:
`_installPlayheadPrefix` reuses one growing owned prefix instead of `fullRawData.slice(0, sliceEnd)`,
behind `window.__TALARIA_DISABLE_M20_PREFIX_SLICE_V1`. The **resample of that prefix at :4003 was
not touched**, and it is the larger term — the slice copies pointers, the resample allocates a new
object per output bar.

## 3. A comment that is false, and worth fixing on its own

`chart-data-pipeline.js:68` says *"Incremental resample: O(1) when replay appends one raw bar."*
It is not O(1). The incremental branch reaches `_tryIncrementalResample`, whose first act at
**:126** is `const out = prevResampled.slice()` — a full copy of the entire prior resampled array.
Both pipeline branches are O(n) per tick; one allocates n pointers, the other n objects.

Also note the two branch conditions differ in a way nobody has exploited: the cache-hit branch
(:78–86) checks `dataVersion`, the incremental branch (:88–96) does **not**. With M20-Q9 giving a
stable `sourceRef` and a length growing by exactly one, the incremental branch is reachable every
tick — so the cheap fix here may be to make it genuinely incremental rather than to fight the
cache key.

## 4. Honest bounds, stated before anyone funds this

- **Allocation churn is not retention.** I have shown a large, growing, per-tick *allocation* path.
  I have **not** shown that it retains bytes. It is a strong CPU/GC-pressure story and a plausible
  heap-high-water story; it is not yet a proven +735 MB/h story, and I will not present it as one.
- **N is unmeasured under CONF-01.** The per-tick cost scales with display-series length, which I
  have not measured in a live four-symbol run. I am deliberately not quoting an MB/s figure derived
  from a guessed N.
- The resolver I used to attribute bump sites to enclosing functions **misfired on one of its own
  controls** (`startReplayAtIndex` resolved to `handlePickModeClick`), so I am relying on it only
  for the eight names, and the two load-bearing ones (`updateChartData`, `updateChartDataFast`) I
  confirmed by reading the code directly rather than trusting the resolver.

**The five-minute measurement that would falsify this, stated first per the standing rule:** under
CONF-01 with the replay advancing and zero trades, count `resampleData` calls per tick and the
length of the array each returns. If the per-tick allocated element count does **not** grow with
`currentIndex`, the superlinear claim is dead and I will drop it as fast as I dropped A1.

## 5. Rows this raises

- **FLAG-02 defect in an existing kill-switch.** `_m20Q9PrefixSliceFixEnabled` returns
  `window.__TALARIA_DISABLE_M20_PREFIX_SLICE_V1 !== true`. That is strict equality, so setting the
  flag to `1`, `'true'`, or `'yes'` does **not** disable the fix. This is the truthy-semantics trap
  I have been recording against other people's flags all day, sitting in a shipped one. Not this
  packet's to fix, but it needs an owner before anyone tries to ablate M20-Q9 in a measurement.
- **Mirror divergence again.** `chart v 1.4/chart/chart.js` is 1.88 MB, `homepage/public/chart/chart.js`
  is 1.92 MB. I traced the canonical copy and resolved by symbol rather than by my recorded line
  numbers, because both my line numbers and the mirrors have gone stale before.

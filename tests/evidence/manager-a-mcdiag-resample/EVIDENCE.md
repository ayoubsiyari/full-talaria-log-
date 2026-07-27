# M20-Q9 per-tick full-resample measurement — evidence

Manager: A (critical path) · Packet: `mcdiag-resample-measurement` · Tier 2
Row: M20-Q9 per-tick full resample measurement
Worktree: `C:\Users\user\Desktop\talaria1\manager-a-mcdiag` on `manager-a/mcdiag-resample-measurement`
Base: `manager-a/critical-path` @ `634448817`
Harness: `chart v 1.4/chart/multichart-prod/harness/m20-q9-mcdiag-resample-measurement.mjs`
Raw output: `cellset-1500base.{json,txt}`, `cellset-4600scale.{json,txt}` (this directory)

`chart.js` line references below are as of this worktree (the instrumentation
added ~25 lines near the top of the file, so they sit slightly later than on
`manager-a/critical-path`). `replay-system.js` and `chart-data-pipeline.js`
references are unaffected.

---

## VERDICT: **CONFIRMED**, with one material amendment that changes the remedy

The hypothesis as stated is confirmed: during replay the pipeline's incremental
branch **never fires** and **every tick performs a full resample of the entire
sliced raw history**, in both display timeframes and in **both** kill-switch
states.

The amendment: the M20-Q9 consumer-cache drop is **sufficient but not necessary**
for this. A second, independent mechanism — the render path re-entering
`getResampledSeries` with a *different* source array — defeats the incremental
branch on its own. Measured directly (cell D3): with the M20-Q9 cache drop
neutralized, a render frame per tick still yields **0 incremental hits and 2.0
full resamples per tick**. **Reverting or relaxing the M20-Q9 correction alone
would recover nothing on the real render-active product surface.**

---

## 0. The counter as briefed is unusable — measured, not argued

`_mcDiag.resamples` was left exactly as it was. These three separated counters
were added by this packet:

| counter | site | counts |
|---|---|---|
| `_mcDiag.replayTicks` | `chart.js` `mcDiagUpdateChartDataWrapper` + new `mcDiagUpdateChartDataFastWrapper` | one per replay tick, both normal and fast-mode entry points |
| `_mcDiag.fullResamples` | `chart.js` `_resampleDataFull` body | every full resample, **every caller**, including the pipeline-internal `chart._resampleDataFull()` call that bypasses `resampleData()` |
| `_mcDiag.incrementalResamples` | `chart-data-pipeline.js` `getResampledSeries` incremental-branch success | incremental hits, measured not inferred |

The legacy field is worse than ambiguous — it is **degenerate**. Three cells with
three different ground truths all read exactly **2.00 per tick**:

| cell | `_mcDiag.resamples` per tick | ACTUAL full resamples per tick |
|---|---|---|
| D1 (control, cache-drop neutralized, no render) | 2.00 | **0** |
| A1 (product, tick path only) | 2.00 | **1** |
| B1 (product, tick + render frame) | 2.00 | **2** |

So the corrected rule "≈2 increments per tick confirms the hypothesis" is also
unsound: 2.00/tick is observed at 0, 1 and 2 real full resamples per tick. The
reason is that `resampleData()` increments `resamples` even when the pipeline
then serves the request from cache or incrementally, while pipeline-internal
full resamples never reach the field at all. **No verdict should ever be derived
from `_mcDiag.resamples`.** Every number below comes from the separated counters.

Cross-check: an independent second instrument (harness-side wraps of the same
real functions) agreed with the in-product counters on `fullResamples` and
`incrementalResamples` in **every cell of every repeat** (`instrumentsAgree: true`).

---

## 1–3. Cell matrix — base set

Dataset: 3000 native **1m** raw bars, deterministic (pure function of index,
fixed epoch `2024-01-02T00:00:00Z`). Playhead starts at index 1500, **300 ticks**
driven (indices 1501→1800). Sliced raw history grows 1502→1801 bars, mean 1651.5.
**3 repeats per cell; all counts IDENTICAL across all 3 repeats in all cells.**

Polarity observed in code (`replay-system.js:3808`):
`_m20Q9PrefixSliceFixEnabled()` returns `window.__TALARIA_DISABLE_M20_PREFIX_SLICE_V1 !== true`.
→ **switch absent/false = fix ENABLED** (prefix reuse + cache drop per install);
**switch = true = fix DISABLED** (legacy `master.slice(0, end)`, no cache drop).

### A cells — replay tick path only

| cell | replayTicks | fullResamples | incrementalResamples | full/tick | incr/tick |
|---|---|---|---|---|---|
| A1 1m, fix ON (switch absent) | 300 | 300 | **0** | 1.000 | 0 |
| A2 1m, fix OFF (switch=true) | 300 | 300 | **0** | 1.000 | 0 |
| A3 1H, fix ON (switch absent) | 300 | 300 | **0** | 1.000 | 0 |
| A4 1H, fix OFF (switch=true) | 300 | 300 | **0** | 1.000 | 0 |

### B cells — same, plus one render frame per tick

The render path is active during replay: `startBacktest`/replay boot sets
`isBacktestMode = true` (`chart.js:2391`, `:5189`), and `_shouldUseDisplayPipeline()`
returns `true` unconditionally in backtest mode (`chart.js:25413`). `render()`
clears `_frameDisplaySeries` once per frame (`chart.js:28764`), so each frame
performs one `buildDisplaySeries()` → `getResampledSeries(chart.data, …)`.

| cell | replayTicks | fullResamples | incrementalResamples | full/tick | incr/tick |
|---|---|---|---|---|---|
| B1 1m, fix ON + render | 300 | 600 | **0** | 2.000 | 0 |
| B2 1m, fix OFF + render | 300 | 600 | **0** | 2.000 | 0 |
| B3 1H, fix ON + render | 300 | 600 | **0** | 2.000 | 0 |
| B4 1H, fix OFF + render | 300 | 600 | **0** | 2.000 | 0 |

### D cells — positive controls (NOT product configurations)

`_m20Q9DropConsumerResampleCache` neutralized at instance level, everything else
real. These exist to prove the incremental counter *can* register hits (§A5
four-state spirit) and to size the headroom.

| cell | replayTicks | fullResamples | incrementalResamples | full/tick | incr/tick |
|---|---|---|---|---|---|
| D1 1m, cache-drop neutralized | 300 | **0** | **300** | 0 | 1.000 |
| D2 1H, cache-drop neutralized | 300 | **0** | **300** | 0 | 1.000 |
| D3 1m, cache-drop neutralized **+ render frame** | 300 | **600** | **0** | 2.000 | 0 |

D1/D2 prove the instrument is live. **D3 is the amendment**: with the M20-Q9
drop removed, adding the product's own render frame returns the system to 2.0
full resamples per tick and 0 incremental hits.

### Scale set — raw history near `REPLAY_RAW_CAP`

5000 raw 1m bars, playhead 4600, 300 ticks (4602→4901 bars, mean 4751.5), 3 repeats,
all IDENTICAL. Every count identical to the base set: A cells 300/300/0
(1.000 full/tick), B cells 300/600/0 (2.000 full/tick), D1/D2 300/0/300.
**Full resamples per tick do not depend on history length — only the cost of each
one does.**

---

## 5. Does the incremental branch fire at all? Measured directly: NO

`incrementalResamples` = **0** in all eight product cells (A1–A4, B1–B4), at both
scales, across all 3 repeats. Harness-side instrumentation additionally shows the
branch is **not even attempted** — `_tryIncrementalResample` was called 0 times —
because the `cache.sourceRef === source` guard fails before it. Two distinct
reasons, one per switch state:

- **Fix ON (switch absent):** `_installPlayheadPrefix` calls
  `_m20Q9DropConsumerResampleCache` on every install → `sourceRef = null`,
  `sourceLen = -1`. Measured `cacheDrops = 300` per 300 ticks (exactly one per tick);
  `distinctRawDataIdentities = 1` (the prefix-reuse allocation win is real and intact).
- **Fix OFF (switch=true):** legacy `master.slice(0, end)` returns a new array every
  tick → `cache.sourceRef` can never match. Measured `cacheDrops = 0`,
  `distinctRawDataIdentities = 300` (one fresh array per tick).

The M20-Q9 correction therefore costs the allocation of a per-tick slice but buys
back nothing in resample work: **1.000 full resamples per tick in both states.**

In cell D3 the branch is likewise **not attempted** (`_tryIncrementalResample`
called 0 times) even with the cache drop neutralized: after the render frame
resamples `chart.data`, `cache.sourceRef` holds `chart.data`, so the next tick's
`getResampledSeries(chart.rawData, …)` fails the identity guard, and vice versa.
The pipeline's single-slot cache is shared between two permanently different
source arrays and thrashes every frame.

Also measured: `cacheHitReturns = 0` in **every** cell. No
`getResampledSeries` call in any configuration was ever served from the
exact-match cache; every call did real work.

---

## 4. Allocation scale per full resample — and why 1m is the worst case

`_resampleDataFull` allocates **one `_prepareBarsForResampling` object per RAW bar**
(plus an `Array.prototype.sort` over them) and then **one output object per display
bucket**. The prepared-object cost is O(raw history) in *both* timeframes; only the
output count differs.

Base set (mean 1651.5 raw bars in the slice), per tick:

| | output bars per full resample | prepared objects per tick | total objects per tick (tick path) | with render frame |
|---|---|---|---|---|
| **1m** | **1651.5** | 1651.5 | **3303** | **6606** |
| **1H** | **28.0** | 1651.5 | **1679.5** | 1735.5 |

Scale set (mean 4751.5 raw bars), output bars per full resample: **1m = 4751.5**,
**1H = 79.7**.

So the output-object ratio is **59.0× (1m vs 1H)** — one output bar per raw bar
versus one per 60 — but total object churn per tick is only **1.97×** on the tick
path, because the O(raw) prepared-array allocation and sort are paid identically
in both timeframes. With the render frame included the 1m disadvantage widens to
**3.81×**, because 1m's second resample re-prepares the full 1651.5-bar
`chart.data` while 1H's second resample only re-prepares 28 bars.

**1m is the worst case, but the mechanism is not purely "more output bars" — the
per-raw-bar prepare-and-sort pass is a floor that a coarse display timeframe does
not escape.** Any fix that only reduces output bars will not help 1H much and will
not remove the floor on 1m.

---

## "Incremental fired" does NOT imply "cheap" — requested explicitly, confirmed

`chart-data-pipeline.js` `_tryIncrementalResample` opens with:

```
const out = prevResampled.slice();
```

That is a **full-length copy of the entire previous resampled series on every
incremental hit**, so the branch is O(display bars), not O(1). Measured in the
control cells as copied elements per incremental hit:

| control cell | copied bars per incremental hit |
|---|---|
| D1 1m, base set | **1650.5** |
| D1 1m, scale set | **4750.5** |
| D2 1H, base set | **28.0** |
| D2 1H, scale set | **79.7** |

It is a shallow copy of references rather than a rebuild of objects, which is why
it is still far cheaper in wall-clock than a full resample — but on 1m it
allocates a fresh ~1.6k–4.8k element array every tick and grows without bound
with session length. The pipeline docblock's claim of an "incremental O(1)"
branch is **not accurate as written**; it is O(n) with a much smaller constant.

---

## Advisory wall-clock (NON-deterministic, one host, excluded from all verdicts)

Reported per §A5 as advisory only; no assertion depends on it. Base set, ms per tick:
1m tick-path 5.15, 1m tick+render 10.53, 1H tick-path 6.91, 1H tick+render 10.22,
control D1 1m 0.22. Scale set: 1m tick-path 15.46, 1m tick+render 30.32,
control D1 1m 0.089. Direction is consistent (the full-resample path is ~20–170×
the control) but these are Node numbers on a stub-DOM host and must not be quoted
as product frame budgets.

---

## Code-path honesty statement

**What executed is real product code.** The harness loads
`chart v 1.4/chart/chart.js`, `modules/replay-system.js` and
`modules/chart-data-pipeline.js` unmodified into a `node:vm` context with a stub
DOM, then drives the real `ReplaySystem.prototype.updateChartData` — the
production replay tick entry point — against a real `Chart` instance
(`Object.create(Chart.prototype)`, the same technique the existing
`m20-q9-prefix-slice.test.mjs` uses). Real functions on the measured path:
`updateChartData`, `_installPlayheadPrefix`, `_m20Q9PrefixSliceFixEnabled`,
`_m20Q9DropConsumerResampleCache`, `getResampledSeries`,
`_tryIncrementalResample`, `invalidateResampleCache`, `resampleData`,
`_resampleDataFull`, `_prepareBarsForResampling`, `parseTimeframe`,
`_trimLastDataBarToReplayPlayhead`, `bumpDataVersion`, `_mcDiagWrapReplaySystem`,
`_ensureMcDiag`, `getDisplaySeries`, `buildDisplaySeries`,
`_shouldUseDisplayPipeline`. Nothing on the resample path is reimplemented.

**What was NOT exercised — caveats that bound the claim:**

1. **No browser.** No canvas, no rAF scheduler, no real layout. A Chromium
   corroboration run was not performed (`puppeteer` is a declared devDependency of
   the harness package but the browser download was not verified present, and the
   Node result is unambiguous). The counters now exist in the product files, so a
   browser run can read `__mcDiagReport()` directly and should be done before this
   is treated as a closed row under §A4b/§A8.
2. **DOM/UI/persistence/panel-sync methods reached by `updateChartData` are stubbed
   at instance level** (prototype untouched): `_clampCurrentIndexToReplayTimestamp`,
   `updateSliderRange`, `updateSlider`, `updateTimeDisplay`,
   `_syncCompareOverlaysForReplay`, `_scheduleReplayIndicatorRecalc`,
   `syncReplayViewportToPlayhead`, `_applyPlaybackViewportLock`,
   `_renderReplayChartUpdate`, `syncPanelCharts`, `updateAutoScrollIndicator`,
   `_persistReplayStateThrottled`, `_resolveCanonicalReplayMark`,
   `_multichartBroadcastReplayFrame`; on the chart: `constrainOffset`,
   `_markScalesDirty`, `_invalidateIndicatorLayerCache`,
   `_syncReplayPlayheadCrosshairValues`. All run after (or beside) the
   prefix-install + resample work and cannot change the reported counters.
3. **Playhead advance** is `currentIndex += 1` per tick rather than
   `_advanceReplayPlayheadOneStep()` (which needs peer/cadence state). The
   resample-relevant input, `sliceEnd = currentIndex + 1`, is identical.
4. **Single chart only.** `syncPanelCharts` is stubbed, so **no panel resamples are
   included**. Per-panel multiplication of these figures is un-measured here; the
   product calls `_installPlayheadPrefix(pc._panelFullRawData, …)` per panel
   (`replay-system.js:6449`, `:9019`), so the per-tick full-resample count is
   expected to scale with panel count. **Not measured — do not assume.**
5. **Render frames per tick = 1** in the B/D3 cells. Real playback may coalesce or
   issue additional renders, so the render-path contribution is best read as
   "+1 full resample **per render frame**", not strictly "+1 per tick".
6. **No indicators and no open trades** (§A9.1 requires those variables for a
   memory cell). This packet measures resample counts only and does **not** close
   the §A9 memory row.
7. **Fast mode not driven.** `updateChartDataFast` is the ≥60× playback path; it
   uses the same `_installPlayheadPrefix` → `chart.resampleData` sequence
   (`replay-system.js:5761-5765`), and `replayTicks` now counts it, but no cell
   drove it.

## Product edits in this packet (instrumentation only, dual-tree mirrored)

- `chart v 1.4/chart/chart.js` — added `replayTicks` / `fullResamples` /
  `incrementalResamples` to `MC_DIAG_COUNTER_FIELDS` and `_ensureMcDiag()`;
  `replayTicks++` in the existing `updateChartData` wrapper and in a new
  `updateChartDataFast` wrapper (which does **not** touch `resamples`);
  `fullResamples++` at the top of `_resampleDataFull`.
- `chart v 1.4/chart/modules/chart-data-pipeline.js` — `incrementalResamples++` on
  incremental-branch success.
- Both mirrored byte-identically to `homepage/public/chart/` (verified identical to
  each other at HEAD and after the edit).
- `replay-system.js` **not modified**.
- No behaviour change: counters only. `m20-q9-prefix-slice.test.mjs` 19/19 pass
  after the edits, including the correction oracle and the dual-tree parity test.
- Not written, as instructed: `scripts/module-contracts.json`.

## Reproduce

```
node "chart v 1.4/chart/multichart-prod/harness/m20-q9-mcdiag-resample-measurement.mjs" \
  --repeats 3 --ticks 300 --raw 3000 --start 1500 --json out.json
node "chart v 1.4/chart/multichart-prod/harness/m20-q9-mcdiag-resample-measurement.mjs" \
  --repeats 3 --ticks 300 --raw 5000 --start 4600 --json out-scale.json
```

## What this implies for the C3a decision (classification, not a design)

The dominant per-tick cost measured here is **O(raw history) resample work
repeated every tick**, not per-panel duplication. It is present on a **single
chart** with **one** panel, which matches Rayan's §A9 single-layout 1m report
better than a per-panel-copy mechanism does. Two independent causes must both be
addressed for incrementality to become reachable at all: the M20-Q9 consumer-cache
drop **and** the display pipeline's single-slot cache being shared between two
different source arrays (`chart.rawData` on the tick, `chart.data` on the render
frame) — the latter thrashes the cache every frame regardless of M20-Q9. And even
then, the incremental branch as written copies the whole output series per hit, so
it caps the win rather than removing the per-tick O(n).

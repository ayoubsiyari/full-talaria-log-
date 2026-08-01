# A — the `MONSTER-2` plateau: the display series is bounded by PIXELS, and the resample cache has a second branch that does not check `dataVersion`

**2026-07-31 18:15** · Manager A · base `79625eac6` (B's ship tip) · owed under the 18:05 ruling
**Answers the plateau. Corrects the mechanism in the ruling — the fix is cheaper and aimed elsewhere than ruled.**

## Summary

Three findings, in order of how much they change the fix:

1. **The plateau is real and its mechanism is pixels, not bars.** `buildDisplaySeries` bounds its output at
   `plotWidth / 2`. Predicted plateau for B's ~1,100 bars is a **~2,200 px plot** — stated as a falsifier below.
2. **The ruling's chain does not hold on the shipping base.** The cited line numbers belong to a different
   function here, and there are **two** caches in the path, not one.
3. **The single-slot cache has a second hit branch that does not check `dataVersion`** and is designed to be the
   one that fires during replay. So "the cache never hits during replay" is not right as stated, and a fix aimed
   at the cache key would have been aimed at the wrong thing. `MONSTER-2` survives with a **smaller** mechanism.

## 1. The plateau

`chart-data-pipeline.js` constants:

```
RENDER_BAR_BUDGET     = 500     (:8)
VIEWPORT_BUFFER_BARS  = 48      (:9)
LARGE_SERIES_THRESHOLD= 8000    (:11)
ZOOMED_OUT_SLOT_PX    = 2       (:15)
```

`buildDisplaySeries` computes a budget from the **plot width in pixels** (`:380-389`):

```js
const plotWidth = Math.max(1, (chart.w || 800) - m.l - m.r);
const pixelLod  = spacing < ZOOMED_OUT_SLOT_PX;
const maxBudget = pixelLod
    ? Math.ceil(plotWidth / ZOOMED_OUT_SLOT_PX)
    : (chart.isBacktestMode ? RENDER_BAR_BUDGET : Math.min(RENDER_BAR_BUDGET * 2, RENDER_BAR_BUDGET + 400));
```

and once the viewport span exceeds it, routes through a pixel-slot aggregate rather than a per-bar walk
(`:430-434`):

```js
const usePixelAggregate = pixelLod || visSpan > plotWidth || visSpan > maxBudget;
... display = this._pixelSlotAggregateFromRange(resampled, visStart, visEnd, plotWidth, m, offsetX, spacing);
```

`_pixelSlotAggregateFromRange` walks `visStart..visEnd` only — the **viewport**, not the source. So the
display-building term is bounded by `plotWidth / ZOOMED_OUT_SLOT_PX` = **`plotWidth / 2`**, independent of how
many bars are loaded. That is the plateau, and "bounded-but-large" was right about the output while being silent
about the bound; the bound is pixels.

### Falsifier, stated before the fix

B measured the knee at **~1,100 bars**. `plotWidth / 2 = 1,100` predicts a plot **~2,200 px** wide.

* If B's plot was ~2,200 px, the mechanism is confirmed by an independent number.
* If B's window was, say, 1,600 px wide, the predicted knee is **800 bars**, not 1,100, and **this mechanism is
  wrong and there is a third thing happening.**

**Requested from B: the plot width (`chart.w` minus left/right margin) at the time of that run.** One number
settles it either way. I am not assuming it.

## 2. Correction: the chain in the ruling is not the shipping chain

The ruling cites `chart.js:25463, 25481` as `getDisplaySeries()` delegating to
`getResampledSeries(data, timeframe, this.dataVersion)`. **On `79625eac6` those lines are inside
`_refetchBacktestTimeframeCore`.** The shipping path has an extra layer:

| step | location on this base |
| --- | --- |
| `getDisplaySeries()` | `chart.js:26481` — memoised per frame via `this._frameDisplaySeries` (`:26485-26492`) |
| → `buildDisplaySeries({ source, timeframe })` | `chart.js:26488` |
| → **display cache**, 10-part composite key incl. `dv` | `chart-data-pipeline.js:397-412` |
| → `getResampledSeries(source, tf, dv)` | `chart-data-pipeline.js:414` |
| → **resample cache**, single slot | `chart-data-pipeline.js:70-119` |

**There are two caches, not one.** The ruling describes the second. The first (`_displayCache`) keys on ten
components including `dataVersion`, source length, offset, spacing and plot width — it also cannot hit during
replay, for the same reason plus several more.

Note also `getDisplaySeries` is memoised **per frame** (`_frameDisplaySeries`), so within a single frame the work
happens once regardless of how many consumers call it.

## 3. The load-bearing correction: the resample cache has TWO hit branches

`getResampledSeries` (`chart-data-pipeline.js:70-119`):

**Branch 1 — exact hit (`:78-86`)** requires `cache.dataVersion === dv`. The ruling is correct that this cannot
hit during replay, because the replay engine bumps the version on every data event.

**Branch 2 — incremental (`:88-96`)** requires:

```js
cache.sourceRef === source          // same array identity
&& cache.tf === tf
&& cache.sourceLen === source.length - 1   // exactly one new bar
&& Array.isArray(cache.result) && cache.result.length > 0
```

**It does not check `dataVersion` at all.** So the version bump defeats branch 1 and falls straight into branch
2, which is *designed* to be the branch that serves replay — there is an instrumentation counter at `:101`
incrementing `chart._mcDiag.incrementalResamples` to measure exactly that firing.

**Consequence for the fix.** A fix aimed at the cache key (making `dataVersion` not participate, or making the
cache multi-slot) would target branch 1, which is not the branch replay uses. The cost is in branch 2.

## What `MONSTER-2` actually is

`_tryIncrementalResample`'s first act (`:129`):

```js
const out = prevResampled.slice();
```

**A full copy of the prior resampled array on every tick.** Linear per tick, quadratic per session — but in
**pointer copies** rather than **object construction**, so the constant is far smaller than the full resample the
ruling assumed. The module's own comment at `:68` claiming the incremental path is `O(1)` is **false**, now
re-verified on this base rather than on the sha my earlier row was written against.

**This also reconciles the plateau with a linear term.** Total cost per data event is:

```
  (linear term)  prevResampled.slice()        — grows with bars, cheap per element
+ (bounded term) pixel-slot aggregate         — capped at plotWidth/2, expensive per element
```

At B's 2,592 bars the linear term is a few thousand pointer copies and disappears under the bounded term, which
is why the curve looks flat. **It is the ten-hour soak, not B's window, where the linear term becomes the
story.** So B's plateau and `MONSTER-2` are consistent, and neither refutes the other.

## Bound I am putting on my own claim

I have shown a **growing per-event allocation and copy** path. I have **not** shown that it retains bytes. This
is a CPU/GC and heap-high-water argument, not a proven contributor to a MB/h slope, and I will not cite it as
one. Sizing it against bars loaded is the next item and it belongs to the `MONSTER-2` gate — cost per data event
measured against bars loaded during replay — not to `L1`.

## Why this cannot leak into `L1`

Structural, and worth building into the `L1` gate as a control: on a **static** dataset `dataVersion` never
bumps and `source.length` never grows, so **neither** branch of `getResampledSeries` runs and the per-frame
memo holds. **The resample fix is inert by construction on the `L1` scenario.** If the `L1` gate moves when this
fix lands, the `L1` gate is measuring the wrong thing and should be rejected on that basis.

# Talaria — Zoom & Pan Lag Fixes

> Based on audit of `chart-zoom-pan-load-flow.md`.  
> Goal: smooth 60fps zoom and pan at max zoom-out, like TradingView / FXReplay.

## Implementation status (2026-06-06)

| Fix | Status | Notes |
|-----|--------|-------|
| ZOOM-FIX-1 | ✅ Done | Indicator recalc deferred 100ms; `_scheduleIndicatorRecalcAfterInteraction()` skips sync recalc during pan/wheel |
| ZOOM-FIX-2 | ✅ Done | Incremental resample on pan merge + `_commitLoadedBars` mergeDirection paths |
| ZOOM-FIX-3 | ✅ Fixed | Display cache kept; **pan pixel-shift cache removed** (shifted buckets without rebuilding = candles vanish on pan) |
| ZOOM-FIX-4 | ✅ Done | Zoom-out fill threshold **82% → 90%** |
| ZOOM-FIX-5 | ✅ Adjusted | `panFast` drawings during pan (skip-only reverted — caused stuck vertical feel) |
| ZOOM-FIX-6 | ✅ Done | Near-edge threshold: `max(200, min(600, plotWidth * 0.3))` |
| ZOOM-FIX-7 | ✅ Done | Wheel burst **350ms**; post-burst timer **400ms** |
| ZOOM-FIX-8 | ✅ Done | Replay pan load debounce **90ms → 200ms** |
| ZOOM-FIX-9 | ✅ Fixed | Cheap X path (horizontal) + Y snap+offset path (vertical drag); no blind skip of scales |
| ZOOM-FIX-10 | ✅ Done | `_getRawDataCap()` — 5000 for 1m/5m, 6000 for 15m/30m, 8000 above |

**Deploy:** `npm run build:chart-v9` → rebuild `homepage` → hard refresh.

---

## Why TradingView feels smooth (the real reason)

TV never recalculates indicators, merges bars, or resamples data **during** any interaction.
Every heavy operation is **deferred until the user stops**. During the interaction itself,
TV only moves pixels. That's the standard to match.

---

## 🔴 Critical Fixes

---

### ZOOM-FIX-1 — `recalculateIndicators` is called on EVERY zoom-out data merge

**File:** `chart v 1.4/chart/chart.js`

**Problem:**
After `_applyZoomOutBars` merges new bars into `rawData`, the flow is:
```
merge → resampleData → recalculateIndicators → scheduleRender
```
`recalculateIndicators` on a full dataset (up to 8000 bars × multiple indicators) is
**the single most expensive operation in the render pipeline**. It runs synchronously
on the main thread, blocking all painting until it finishes. This is why zooming out
feels like it "freezes" — the browser is stuck computing indicators before it can draw
a single frame.

**The 450ms defer (`_deferIndicatorRecalcAfterZoomFill`) only applies to the post-fill
recalc — the merge itself still triggers a synchronous recalc first.**

**Fix — skip indicator recalc entirely during zoom interaction; defer 100% to after stop:**

```javascript
// In _applyZoomOutBars() — find the line that calls resampleData or recalculateIndicators:

// BEFORE (current):
this._mergeRawDataZoomOut(newBars);
this.resampleData();
this.recalculateIndicators();   // ← REMOVE THIS LINE
this.scheduleRender();

// AFTER:
this._mergeRawDataZoomOut(newBars);
this.resampleData();
// Do NOT recalculate indicators here — deferred below
this.scheduleRender();          // paint immediately with old indicator values
this._deferIndicatorRecalcAfterZoomFill(100); // recalc 100ms after data merge
```

Also shorten the existing defer from **450ms → 100ms** — 450ms is why indicators
visibly "snap in" half a second after zooming:

```javascript
// Find _deferIndicatorRecalcAfterZoomFill and change the timeout:
// BEFORE:
setTimeout(() => { this.recalculateIndicators(); this.scheduleRender(); }, 450);
// AFTER:
setTimeout(() => { this.recalculateIndicators(); this.scheduleRender(); }, 100);
```

**Expected result:** Zoom out merges data instantly, paints immediately, indicators
update 100ms later. No freeze.

---

### ZOOM-FIX-2 — `resampleData` runs on full `rawData` (up to 8000 bars) on every merge

**File:** `chart v 1.4/chart/chart.js`

**Problem:**
Every time `_applyZoomOutBars` or `_commitLoadedBars` runs, it calls `resampleData()`
on the entire `rawData` array — potentially 8000 candles resampled to the current
timeframe. This is O(n) work done synchronously on the main thread every time bars
are fetched or merged.

TradingView avoids this by keeping the resampled `data[]` in sync **incrementally** —
it only resamples the new bars being prepended/appended, not the whole array.

**Fix — incremental resample for append/prepend, full resample only on TF switch:**

```javascript
// In _commitLoadedBars(), split into two paths:

function _commitLoadedBarsIncremental(newBars, direction) {
  if (direction === 'backward') {
    // Only resample the new bars being prepended
    const newResampled = this._resampleSlice(newBars, this.currentTimeframe);
    this.data = [...newResampled, ...this.data];
    this.rawData = [...newBars, ...this.rawData];
  } else if (direction === 'forward') {
    const newResampled = this._resampleSlice(newBars, this.currentTimeframe);
    this.data = [...this.data, ...newResampled];
    this.rawData = [...this.rawData, ...newBars];
  }
  // trim to cap
  if (this.rawData.length > this._RAW_DATA_CAP) {
    this.rawData = this.rawData.slice(-this._RAW_DATA_CAP);
    this.data = this.data.slice(-this._RAW_DATA_CAP);
  }
  this.scheduleRender(); // no full resample needed
}

// Full resampleData() stays for: TF switch, initial load, zoom-out window replace
```

**Files to change:**
- `chart v 1.4/chart/chart.js` → `_commitLoadedBars`, `_applyZoomOutBars`

---

### ZOOM-FIX-3 — `ChartDataPipeline.buildDisplaySeries` runs on every render when zoomed out

**File:** `chart v 1.4/chart/modules/chart-data-pipeline.js`

**Problem:**
When zoomed out far (many bars, spacing < 2px), `_shouldUseDisplayPipeline()` returns
true and `buildDisplaySeries()` runs on **every single render frame** — including
during pan and wheel burst. This function merges thousands of 1m bars into pixel-slot
buckets. At 8000 bars, this is several milliseconds of JS per frame = dropped frames.

**Fix — cache the display series; only rebuild when the data or zoom level changes:**

```javascript
// In chart-data-pipeline.js:

class ChartDataPipeline {
  constructor() {
    this._displaySeriesCache = null;
    this._displaySeriesCacheKey = null;
  }

  buildDisplaySeries(rawData, candleWidth, visibleStart, visibleEnd) {
    // Build a cache key from what actually changes the output
    const cacheKey = `${rawData.length}:${Math.round(candleWidth * 10)}:${visibleStart}:${visibleEnd}`;

    if (this._displaySeriesCacheKey === cacheKey && this._displaySeriesCache) {
      return this._displaySeriesCache; // ← return instantly during pan/zoom burst
    }

    // ... existing slot-building logic ...
    const result = this._buildSlots(rawData, candleWidth, visibleStart, visibleEnd);

    this._displaySeriesCache = result;
    this._displaySeriesCacheKey = cacheKey;
    return result;
  }

  // Call this when rawData changes (after merge/replace):
  invalidateDisplayCache() {
    this._displaySeriesCache = null;
    this._displaySeriesCacheKey = null;
  }
}
```

Call `invalidateDisplayCache()` in `_commitLoadedBars` and `_applyZoomOutBars` after
data changes. During pan (no data change), `buildDisplaySeries` returns the cache
instantly = zero cost.

**Files to change:**
- `chart v 1.4/chart/modules/chart-data-pipeline.js` → add cache
- `chart v 1.4/chart/chart.js` → call `invalidateDisplayCache()` after data merges

---

### ZOOM-FIX-4 — `_fillVisibleWindowAfterZoomOut` threshold (82%) fires too eagerly

**File:** `chart v 1.4/chart/chart.js`

**Problem:**
The zoom-out fill triggers a server fetch when visible bars > loaded bars × **82%**.
At 8000 loaded bars, this fires when you need ~6560 bars visible — meaning a fetch
is triggered at only moderate zoom-out levels. Each fetch returns 2000 bars, triggers
a merge, a resample, and (currently) an indicator recalc.

If the user is slowly zooming out with the wheel, this threshold fires **multiple
times in quick succession**, each one triggering the full merge+resample pipeline.

**Fix — raise threshold to 90% AND add an inflight guard:**

```javascript
// In _fillVisibleWindowAfterZoomOut():

// BEFORE:
if (visibleBarCount > loadedBarCount * 0.82) {

// AFTER:
if (visibleBarCount > loadedBarCount * 0.90) {
```

Also verify the `_zoomOutFillInflight` flag is set **before** the fetch starts and
cleared **after** the merge completes — not after just the API call:

```javascript
async function _fillVisibleWindowAfterZoomOut() {
  if (this._zoomOutFillInflight) return; // already fetching
  if (visibleBarCount <= loadedBarCount * 0.90) return; // not needed yet

  this._zoomOutFillInflight = true;
  try {
    const bars = await this._fetchBarsWindow(fromMs, toMs, 'auto', 2000);
    this._applyZoomOutBars(bars); // merge + resample (NO indicator recalc here)
  } finally {
    this._zoomOutFillInflight = false; // cleared only after merge done
  }
}
```

---

## 🟠 Major Fixes

---

### ZOOM-FIX-5 — Pan render loop calls full `render()` including drawings on every frame

**File:** `chart v 1.4/chart/chart.js`

**Problem:**
`_startChartPanRenderLoop` calls `render()` once per animation frame (60fps) during
pan. While `_isInteractionFastRender()` skips some overlays, `redrawDrawings()` and
order overlays still run every frame. If the user has 10+ drawings on the chart,
this adds several milliseconds per frame during pan = visible stutter.

**Fix — skip drawings completely during active pan; restore on mouseup:**

```javascript
// In render(), add a pan-drawing skip gate:
_isChartPanRenderLoopActive() {
  // Already have this flag — use it to skip drawings:
  if (this._chartPanRenderLoopActive) {
    // Skip drawings and order overlays during pan — restore on mouseup
    this._renderCandlesAndGridOnly();
    return;
  }
  // ... full render path
}

// On mouseup / pan end (_finishPanDrawingRedraw already exists):
// This function name suggests it was meant for exactly this — make sure it calls
// the FULL render including drawings, not another fast render.
```

**Files to change:**
- `chart v 1.4/chart/chart.js` → `render()` and `_startChartPanRenderLoop`

---

### ZOOM-FIX-6 — `checkViewportLoadMore` threshold is `500 × candleSpacing`

**File:** `chart v 1.4/chart/chart.js`

**Problem:**
The near-edge threshold for triggering a backward/forward load is `500 × candleSpacing`.
At normal zoom, `candleSpacing` might be 8–10px, making the threshold 4000–5000px —
far wider than the screen. This means a fetch is triggered **before the edge is even
close to visible**, often while the user is still panning. The fetch, merge, and
resample all happen mid-pan, causing a stutter.

**Fix — reduce threshold to a fixed pixel value, not a candle-count multiple:**

```javascript
// In checkViewportLoadMore() / constrainOffset():

// BEFORE:
const nearEdgeThreshold = 500 * this.candleSpacing;

// AFTER:
const nearEdgeThreshold = Math.max(200, Math.min(600, this.chartWidth * 0.3));
// Load when within 30% of chart width from the edge, min 200px, max 600px
// This is a fixed viewport-relative distance — not inflated by zoom level
```

**Files to change:**
- `chart v 1.4/chart/chart.js` → `checkViewportLoadMore` and/or `constrainOffset`

---

### ZOOM-FIX-7 — Wheel burst window is only 200ms — too short for fast scroll wheels

**File:** `chart v 1.4/chart/chart.js`

**Problem:**
The wheel burst protection (`_wheelBurstUntil = now + 200ms`) prevents fetches during
fast scrolling. But with a smooth trackpad or high-DPI mouse, the user can trigger
dozens of wheel events per second. At 200ms the burst window expires between events,
causing `_fillVisibleWindowAfterZoomOut` to fire repeatedly mid-scroll — each one
potentially triggering a fetch and a merge.

**Fix — extend burst to 350ms and reset it on every new wheel event:**

```javascript
// In handleWheel():

// BEFORE:
this._wheelBurstUntil = Date.now() + 200;

// AFTER:
this._wheelBurstUntil = Date.now() + 350; // reset every event = 350ms after LAST wheel tick
```

The 260ms post-burst timer should also increase to match:

```javascript
// Find _scheduleZoomOutDataFill / wheelPostBurstTimer:
// BEFORE: setTimeout(..., 260)
// AFTER:  setTimeout(..., 400)
```

**Files to change:**
- `chart v 1.4/chart/chart.js` → `handleWheel`, `_wheelBurstUntil`, `wheelPostBurstTimer`

---

### ZOOM-FIX-8 — Replay pan load debounce is 90ms — fires too fast during drag

**File:** `chart v 1.4/chart/chart.js`

**Problem:**
`_scheduleReplayPanLoadLeft` has a 90ms debounce. During a fast drag, 90ms is fast
enough that multiple fetches fire while the user is still dragging — each one merging
2000 bars into `rawData` + `replay.fullRawData`, triggering resample, and causing
a visible stutter or canvas jump.

**Fix — increase replay pan load debounce to 200ms:**

```javascript
// In _scheduleReplayPanLoadLeft():

// BEFORE:
this._replayPanLoadTimer = setTimeout(() => {
  this.checkViewportLoadMore('backward');
}, 90);

// AFTER:
this._replayPanLoadTimer = setTimeout(() => {
  this.checkViewportLoadMore('backward');
}, 200); // 200ms — user likely paused or slowed the drag
```

**Files to change:**
- `chart v 1.4/chart/chart.js` → `_scheduleReplayPanLoadLeft`

---

## 🟡 Secondary Fixes

---

### ZOOM-FIX-9 — `calculateScales()` runs on every render frame

**File:** `chart v 1.4/chart/chart.js`

**Problem:**
`calculateScales()` computes the visible min/max price range and axis tick values.
During pan, this runs 60 times/second even though the price scale doesn't change
while panning horizontally. It's O(visible bars) — potentially 500–2000 iterations
per frame just to find min/max.

**Fix — cache scale results during horizontal pan; only recalc when price range could change:**

```javascript
// Add a dirty flag:
this._scalesDirty = true;

// In calculateScales():
if (!this._scalesDirty && this._chartPanRenderLoopActive) {
  return; // horizontal pan doesn't change price range
}
this._scalesDirty = false;
// ... existing scale calculation

// Mark dirty when:
// - New bars loaded (data changes)
// - Zoom changes (different bars visible = different price range)
// - NOT during horizontal pan
```

**Files to change:**
- `chart v 1.4/chart/chart.js` → `calculateScales()` and `render()`

---

### ZOOM-FIX-10 — `_RAW_DATA_CAP` of ~8000 is too high for smooth rendering

**File:** `chart v 1.4/chart/chart.js`

**Problem:**
8000 bars in `rawData` means every full `resampleData()` call iterates 8000 entries.
With `recalculateIndicators` on top (EMA, RSI, MACD each iterate the full array),
a full recalc can be 8000 × 5 indicator passes = 40,000 iterations synchronously.

**Fix — reduce cap to 5000 for 1m data; allow higher only for daily/weekly:**

```javascript
// In chart.js, make cap timeframe-aware:
get _RAW_DATA_CAP() {
  const tf = this.currentTimeframe;
  if (tf === '1m' || tf === '5m') return 5000;
  if (tf === '15m' || tf === '30m') return 6000;
  return 8000; // 1h and above — fewer bars, safe to keep more
}
```

**Files to change:**
- `chart v 1.4/chart/chart.js` → `_RAW_DATA_CAP`

---

## Fix priority summary

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 1 | ZOOM-FIX-1: Remove indicator recalc from merge path | 20 min | 🔥 Eliminates the main freeze on zoom out |
| 2 | ZOOM-FIX-3: Cache `buildDisplaySeries` result | 30 min | 🔥 Eliminates repeated O(n) work per frame at max zoom-out |
| 3 | ZOOM-FIX-7: Extend wheel burst to 350ms | 5 min | ⚡ Prevents mid-scroll fetches on trackpads |
| 4 | ZOOM-FIX-4: Raise fill threshold to 90% + inflight guard | 15 min | ⚡ Fewer fetches during zoom-out sequence |
| 5 | ZOOM-FIX-8: Increase replay pan debounce to 200ms | 5 min | ⚡ Stops stutter during fast replay drag |
| 6 | ZOOM-FIX-6: Fix near-edge threshold formula | 15 min | ⚡ Stops premature fetches during pan |
| 7 | ZOOM-FIX-5: Skip drawings during pan loop | 25 min | ⚡ Smoother pan with many drawings |
| 8 | ZOOM-FIX-2: Incremental resample on append/prepend | 45 min | ⚡ Eliminates O(n) resample on every bar load |
| 9 | ZOOM-FIX-9: Cache `calculateScales` during pan | 20 min | 🧹 Reduces per-frame work during horizontal pan |
| 10 | ZOOM-FIX-10: Lower `_RAW_DATA_CAP` for 1m/5m | 10 min | 🧹 Reduces indicator recalc time |

---

## How TradingView handles this (reference)

| Operation | TradingView approach | Talaria current approach |
|-----------|---------------------|--------------------------|
| Zoom/pan render | Only moves pixels — zero data work | Runs resample + recalc on merge |
| Indicator recalc | Deferred 100% until interaction ends | Mixed — some during merge |
| Display pipeline cache | Permanent cache, invalidated by data change | Rebuilt every frame when zoomed out |
| Bar merging | Incremental append/prepend only | Full resampleData() on merge |
| Near-edge threshold | Fixed viewport % | 500 × candleSpacing (zoom-dependent) |
| Wheel burst window | ~500ms (tracks last event) | 200ms fixed |

---

## Verification — how to confirm each fix works

### ZOOM-FIX-1 (no freeze on zoom out)
```
Chrome DevTools → Performance → Record → zoom out slowly → Stop
Look for: Long Task blocks (orange) on the main thread
Before fix: 100–400ms Long Tasks during/after each zoom step
After fix: No Long Tasks during zoom; small recalc spike 100ms after stopping
```

### ZOOM-FIX-3 (display pipeline cache)
```javascript
// In browser console, add a temporary counter:
let buildCount = 0;
const orig = ChartDataPipeline.prototype.buildDisplaySeries;
ChartDataPipeline.prototype.buildDisplaySeries = function(...a) {
  buildCount++;
  return orig.apply(this, a);
};
// Pan the chart for 2 seconds, then:
console.log('buildDisplaySeries calls:', buildCount);
// Before fix: 120+ calls (60fps × 2s)
// After fix:  1–3 calls (only when data changed)
```

### ZOOM-FIX-7 (wheel burst window)
```
Chrome DevTools → Network tab → zoom out with trackpad quickly
Before fix: Multiple /bars requests firing during scroll
After fix: Only 1 /bars request fires after scrolling stops
```

### General smoothness test
```
Chrome DevTools → Performance → Record → zoom to max out → pan left/right 5s → Stop
Check: Frames per second in the top timeline row
Target: Green bars (60fps) throughout pan, brief yellow dip after zoom-out stops
Failure: Red bars (dropped frames) during active pan or zoom = still a problem
```

---

*Based on: `chart-zoom-pan-load-flow.md` — Last updated 2026-06-06*

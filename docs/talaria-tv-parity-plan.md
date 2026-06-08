# Talaria — TradingView Parity Plan (the last 10–20%)

> This plan covers the architectural changes needed to close the remaining
> performance gap after all zoom/pan/server fixes are applied.
> Three tracks, ordered by impact. Do them in sequence — each one builds on the previous.

---

## What this plan achieves

| Metric | After zoom/pan fixes | After this plan |
|--------|---------------------|-----------------|
| Indicator recalc blocking main thread | 100ms delay | **0ms — background thread** |
| Timeframe switch speed | 200–500ms (JS resample) | **~50ms (pre-built server tiles)** |
| Multichart pan CPU | 4× iframe overhead | **1× single runtime** |
| Pan with 20+ drawings | Minor frame drops | **Solid 60fps** |
| Overall feel vs TV | 80–90% | **95–98%** |

---

## Track A — Web Workers for indicators (biggest win, do first)

**What it solves:** Indicator recalculation (EMA, RSI, MACD, Bollinger, etc.) runs on
the main JS thread today. Even with the 100ms defer from zoom/pan fixes, a full recalc
on 5000–8000 bars still takes 50–200ms and causes a visible "snap" when indicators
update. Moving this to a Web Worker means the main thread **only paints** — zero
indicator blocking, ever.

**This is the single biggest remaining gap vs TradingView.**

---

### A-1: Create the indicator worker

**New file:** `chart v 1.4/chart/workers/indicator-worker.js`

```javascript
// indicator-worker.js — runs in a background thread, no DOM access

// Import indicator calculation functions (no canvas, no window)
// These must be pure functions: input = bars array, output = result array

self.onmessage = function(e) {
  const { type, id, payload } = e.data;

  if (type === 'CALCULATE') {
    const { indicator, bars, params } = payload;
    let result;

    try {
      switch (indicator) {
        case 'EMA':   result = calcEMA(bars, params.period); break;
        case 'SMA':   result = calcSMA(bars, params.period); break;
        case 'RSI':   result = calcRSI(bars, params.period); break;
        case 'MACD':  result = calcMACD(bars, params); break;
        case 'BB':    result = calcBollingerBands(bars, params); break;
        case 'ATR':   result = calcATR(bars, params.period); break;
        // add more indicators here
        default:
          throw new Error(`Unknown indicator: ${indicator}`);
      }
      self.postMessage({ type: 'RESULT', id, indicator, result });
    } catch (err) {
      self.postMessage({ type: 'ERROR', id, indicator, error: err.message });
    }
  }

  if (type === 'CALCULATE_ALL') {
    // Calculate all active indicators in one pass — send one response
    const { indicators, bars } = payload;
    const results = {};
    for (const [name, params] of Object.entries(indicators)) {
      results[name] = calcIndicator(name, bars, params);
    }
    self.postMessage({ type: 'ALL_RESULTS', id, results });
  }
};

// Pure calculation functions — copy from chart.js indicator module
// These have NO side effects, NO DOM, NO window references
function calcEMA(bars, period) {
  const closes = bars.map(b => b.close);
  const k = 2 / (period + 1);
  const result = new Array(closes.length).fill(null);
  let ema = closes[0];
  result[0] = ema;
  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result[i] = ema;
  }
  return result;
}

function calcRSI(bars, period) {
  const closes = bars.map(b => b.close);
  const result = new Array(closes.length).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-10));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    result[i] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-10));
  }
  return result;
}

// ... add calcSMA, calcMACD, calcBollingerBands, calcATR following same pattern
```

---

### A-2: Indicator worker manager in chart.js

**File:** `chart v 1.4/chart/chart.js`

```javascript
// Add to chart initialization:

class IndicatorWorkerManager {
  constructor() {
    this._worker = new Worker('/chart/workers/indicator-worker.js');
    this._pending = new Map(); // id → { resolve, reject }
    this._nextId = 0;

    this._worker.onmessage = (e) => {
      const { type, id, results, result, error } = e.data;
      const pending = this._pending.get(id);
      if (!pending) return;
      this._pending.delete(id);

      if (type === 'ERROR') {
        pending.reject(new Error(error));
      } else {
        pending.resolve(results || result);
      }
    };
  }

  // Calculate all active indicators in one background pass
  calculateAll(bars, activeIndicators) {
    return new Promise((resolve, reject) => {
      const id = this._nextId++;
      this._pending.set(id, { resolve, reject });
      this._worker.postMessage({
        type: 'CALCULATE_ALL',
        id,
        payload: { bars, indicators: activeIndicators }
      });
    });
  }

  terminate() {
    this._worker.terminate();
  }
}

// In chart init:
this._indicatorWorker = new IndicatorWorkerManager();
```

---

### A-3: Replace synchronous recalculateIndicators() calls

**File:** `chart v 1.4/chart/chart.js`

```javascript
// BEFORE — synchronous, blocks main thread:
recalculateIndicators() {
  this.indicators.forEach(ind => {
    ind.values = calculateIndicator(ind.type, this.data, ind.params);
  });
  this.scheduleRender();
}

// AFTER — async, runs in background:
async recalculateIndicatorsAsync() {
  if (this._indicatorCalcInFlight) return; // don't stack calls
  this._indicatorCalcInFlight = true;

  const activeIndicators = {};
  this.indicators.forEach(ind => {
    activeIndicators[ind.id] = { type: ind.type, params: ind.params };
  });

  try {
    const results = await this._indicatorWorker.calculateAll(
      this.data,        // pass current bars
      activeIndicators  // pass active indicator configs
    );

    // Apply results back to indicator objects
    Object.entries(results).forEach(([id, values]) => {
      const ind = this.indicators.find(i => i.id === id);
      if (ind) ind.values = values;
    });

    this.scheduleRender(); // paint with new indicator values
  } finally {
    this._indicatorCalcInFlight = false;
  }
}

// Replace ALL calls to recalculateIndicators() with recalculateIndicatorsAsync()
// Except during initial load where you can await it once
```

---

### A-4: Transfer bars using SharedArrayBuffer (optional, +30% speed)

If bars are transferred via `postMessage`, they are **copied** (structured clone).
For 8000 bars × ~6 fields = ~384KB copied per recalc. With SharedArrayBuffer,
the worker reads the same memory — zero copy.

```javascript
// In IndicatorWorkerManager:
// Store bars in a SharedArrayBuffer when available:

_barsToSharedBuffer(bars) {
  if (typeof SharedArrayBuffer === 'undefined') return null; // fallback to copy
  const FIELDS = 6; // open, high, low, close, volume, timestamp
  const buffer = new SharedArrayBuffer(bars.length * FIELDS * 8); // Float64
  const view = new Float64Array(buffer);
  bars.forEach((b, i) => {
    view[i * FIELDS + 0] = b.time;
    view[i * FIELDS + 1] = b.open;
    view[i * FIELDS + 2] = b.high;
    view[i * FIELDS + 3] = b.low;
    view[i * FIELDS + 4] = b.close;
    view[i * FIELDS + 5] = b.volume;
  });
  return { buffer, length: bars.length };
}
// Worker reads from buffer directly — no copy on postMessage
```

**Note:** SharedArrayBuffer requires `Cross-Origin-Isolation` headers on the page.
Add to nginx:
```nginx
add_header Cross-Origin-Opener-Policy "same-origin";
add_header Cross-Origin-Embedder-Policy "require-corp";
```

**Files to change for Track A:**
- New: `chart v 1.4/chart/workers/indicator-worker.js`
- `chart v 1.4/chart/chart.js` — add `IndicatorWorkerManager`, replace `recalculateIndicators`
- `homepage/nginx.local.conf` — add COOP/COEP headers if using SharedArrayBuffer

**Estimated effort:** 3–5 days
**Expected result:** Indicators never block the main thread. Zoom, pan, TF switch all
stay at 60fps regardless of how many indicators are active.

---

## Track B — Pre-built timeframe tiles on the server (TF switch speed)

**What it solves:** Currently, when a user switches from 1m to 1h, the client
resamples the full 1m `rawData` array in JavaScript. For 5000 bars this takes
50–200ms and causes a visible freeze + blank canvas moment. TradingView serves
pre-built 1h bars directly from CDN — the switch is a fetch, not a compute.

---

### B-1: Build tile files for all timeframes during CSV import

**File:** `chart v 1.4/chart/trading-chart-worker` (worker service)

Your worker already builds 1m binary tiles. Extend it to also build 5m, 15m, 1h,
4h, 1D tiles at import time:

```python
# In the worker's tile build pipeline (wherever _build_tiles_from_csv lives):

TIMEFRAMES_TO_BUILD = ['1m', '5m', '15m', '1h', '4h', '1D']

def build_all_timeframe_tiles(file_id, raw_1m_bars):
    """Build pre-aggregated tile files for all timeframes."""
    for tf in TIMEFRAMES_TO_BUILD:
        if tf == '1m':
            bars = raw_1m_bars  # already native
        else:
            bars = resample_bars(raw_1m_bars, tf)  # aggregate on server

        tile_path = get_tile_path(file_id, tf)
        write_binary_tiles(bars, tile_path)

def resample_bars(bars_1m, target_tf):
    """Server-side OHLCV aggregation — same logic as client resampleData()."""
    seconds = tf_to_seconds(target_tf)  # '5m' → 300
    buckets = {}
    for bar in bars_1m:
        bucket_ts = (bar['time'] // seconds) * seconds
        if bucket_ts not in buckets:
            buckets[bucket_ts] = {
                'time': bucket_ts,
                'open': bar['open'],
                'high': bar['high'],
                'low': bar['low'],
                'close': bar['close'],
                'volume': bar['volume']
            }
        else:
            b = buckets[bucket_ts]
            b['high'] = max(b['high'], bar['high'])
            b['low'] = min(b['low'], bar['low'])
            b['close'] = bar['close']
            b['volume'] += bar['volume']
    return sorted(buckets.values(), key=lambda x: x['time'])

def tf_to_seconds(tf):
    mapping = {'1m':60,'5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400,'1D':86400}
    return mapping[tf]
```

---

### B-2: Update API to serve pre-built TF tiles

**File:** `chart v 1.4/chart/api_server.py`

```python
# In GET /api/file/{id}/bars or /smart:
# Check for pre-built tile first — fall back to on-the-fly resample only if missing

@app.get("/api/file/{file_id}/bars")
async def get_bars(file_id: str, resolution: str = '1m', ...):
    # Try pre-built tile first
    tile_path = get_tile_path(file_id, resolution)

    if os.path.exists(tile_path):
        # Serve directly from pre-built binary — fastest path
        bars = read_binary_tiles(tile_path, from_ts, to_ts)
    else:
        # Fallback: load 1m and resample on server
        bars_1m = read_binary_tiles(get_tile_path(file_id, '1m'), from_ts, to_ts)
        bars = resample_bars(bars_1m, resolution)

    return JSONResponse(bars_to_json(bars))
```

---

### B-3: Update client TF switch to fetch instead of resample

**File:** `chart v 1.4/chart/chart.js`

```javascript
// In _independentPanelTimeframeSwitch() or _refetchBacktestTimeframeCore():

async function switchTimeframe(newTf) {
  // Show loading state immediately (blank canvas looks bad — show spinner or freeze last frame)
  this._timeframeSwitching = true;
  this._ensureReplayDataGeneration++; // invalidate in-flight requests

  try {
    // Fetch pre-built bars for the new TF directly — no client resample
    const bars = await this._fetchSmartWindowWithParams({
      timeframe: newTf,
      start_ts: this._sessionStartTs,
      end_ts: this._sessionEndTs,
      limit: 5000
    });

    this.currentTimeframe = newTf;
    this._panelFullRawData = bars.rawData; // pre-built 1m master still kept
    this.rawData = bars.rawData;
    this.data = bars.data; // already at newTf resolution — no resample needed

    this.recalculateIndicatorsAsync(); // background
    this.scheduleRender();
  } finally {
    this._timeframeSwitching = false;
  }
}
```

---

### B-4: Add pre-built tile check to Redis cache

**File:** `chart v 1.4/chart/bar_window_cache.py`

```python
# Cache key should include the timeframe — it already should, but verify:
def get_cache_key(file_id, timeframe, from_ts, to_ts):
    return f"bar_window:{file_id}:{timeframe}:{from_ts}:{to_ts}"

# Pre-built tiles are immutable — give them a longer TTL:
def cache_prebuilt_bars(file_id, timeframe, from_ts, to_ts, bars):
    key = get_cache_key(file_id, timeframe, from_ts, to_ts)
    ttl = 3600 if timeframe != '1m' else 300  # pre-built TFs cached longer
    redis.setex(key, ttl, compress(bars))
```

---

### B-5: Background rebuild when new CSV is uploaded

Add a job to the worker queue that builds all TF tiles in the background
after the 1m tile build completes. User can start the chart on 1m immediately;
other TFs become available as they build:

```python
# In trading-chart-worker, after 1m build completes:
def on_1m_build_complete(file_id):
    for tf in ['5m', '15m', '1h', '4h', '1D']:
        enqueue_job(redis, {
            'type': 'BUILD_TF_TILES',
            'file_id': file_id,
            'timeframe': tf,
            'priority': 'low'  # don't block other uploads
        })
```

**Files to change for Track B:**
- `chart v 1.4/chart/api_server.py` — serve pre-built TF bars
- `chart v 1.4/chart/bar_window_cache.py` — TF-aware cache TTL
- Worker service — add `build_all_timeframe_tiles`, `resample_bars`
- `chart v 1.4/chart/chart.js` — fetch instead of resample on TF switch

**Estimated effort:** 4–6 days
**Expected result:** TF switch feels instant (~50–100ms fetch vs 200–500ms JS resample).
Server does the aggregation once at upload time; clients never resample again.

---

## Track C — Single-runtime multichart (remove iframes)

**What it solves:** The current 1 host + 3 iframes design means 4 separate JS heaps,
4 canvas contexts, 4 copies of `chart.js` in memory, and `postMessage` serialization
for every sync event. TV's multichart runs as a single JS process with multiple chart
instances sharing one heap. This is the hardest change but closes the final gap.

**Do this last — after Tracks A and B are stable.**

---

### C-1: Create a ChartInstance class (extract from global chart.js)

Currently `chart.js` assumes it is the only chart on the page and uses globals
(`window.chart`, `window.replaySystem`). The first step is to encapsulate everything
into a class that can be instantiated multiple times:

```javascript
// chart v 1.4/chart/chart-instance.js (new file)

export class ChartInstance {
  constructor(canvasEl, options = {}) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.panelId = options.panelId || 'A';

    // All state that was previously on window.chart:
    this.candleWidth = options.candleWidth || 8;
    this.offsetX = 0;
    this.data = [];
    this.rawData = [];
    this.indicators = [];
    this._panelFullRawData = null;
    this.currentTimeframe = options.timeframe || '1m';
    // ... all other state vars

    // Worker (shared across instances via singleton):
    this._indicatorWorker = IndicatorWorkerManager.getInstance();

    this._setupEvents();
  }

  // All methods that were previously on window.chart:
  loadFileData(fileId) { ... }
  render() { ... }
  handleWheel(e) { ... }
  // etc.

  destroy() {
    this._indicatorWorker.unregister(this.panelId);
    this.canvas.removeEventListener(...);
  }
}

// Singleton worker shared across all chart instances:
class IndicatorWorkerManager {
  static _instance = null;
  static getInstance() {
    if (!IndicatorWorkerManager._instance) {
      IndicatorWorkerManager._instance = new IndicatorWorkerManager();
    }
    return IndicatorWorkerManager._instance;
  }
}
```

---

### C-2: Create MultichartRuntime to replace iframes

**New file:** `chart v 1.4/talaria-design/src/MultichartRuntime.js`

```javascript
// Replaces MultichartGrid.jsx's iframe-based approach

import { ChartInstance } from '../chart/chart-instance.js';

export class MultichartRuntime {
  constructor(containerEl, layout = '2x2') {
    this.container = containerEl;
    this.panels = new Map(); // panelId → ChartInstance
    this._setupLayout(layout);
  }

  _setupLayout(layout) {
    const count = layout === '2x2' ? 4 : layout === '3x3' ? 9 : 1;
    const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].slice(0, count);

    ids.forEach(id => {
      const wrapper = document.createElement('div');
      wrapper.className = 'chart-panel';
      const canvas = document.createElement('canvas');
      wrapper.appendChild(canvas);
      this.container.appendChild(wrapper);

      const instance = new ChartInstance(canvas, { panelId: id });
      this.panels.set(id, instance);
    });
  }

  // Sync crosshair across all panels (replaces postMessage sync-bridge):
  syncCrosshair(sourceId, timestamp) {
    this.panels.forEach((chart, id) => {
      if (id !== sourceId) {
        chart.setVirtualCrosshairTime(timestamp); // no postMessage — direct call
      }
    });
  }

  // Drive replay across all panels (replaces replayFrame postMessage):
  broadcastReplayFrame(frameData) {
    this.panels.forEach(chart => {
      chart.applyMultichartMirrorFrame(frameData); // direct method call
    });
  }

  // Load a file on a specific panel:
  loadPanel(panelId, fileId, options = {}) {
    const chart = this.panels.get(panelId);
    if (chart) chart.loadFileData(fileId, options);
  }

  destroy() {
    this.panels.forEach(chart => chart.destroy());
    this.panels.clear();
  }
}
```

---

### C-3: Shared bar cache across chart instances (same pair optimization)

With a single runtime, same-pair panels can share the raw data array directly
(no copy, no postMessage):

```javascript
// In MultichartRuntime:

class SharedBarStore {
  constructor() {
    this._store = new Map(); // fileId → { rawData, fullRawData }
  }

  set(fileId, data) {
    this._store.set(fileId, data);
  }

  get(fileId) {
    return this._store.get(fileId) || null;
  }

  // When panel B loads the same fileId as panel A:
  // panel B gets a reference to the same array — zero memory duplication
}

// In ChartInstance.loadFileData():
const shared = MultichartRuntime.sharedBarStore.get(fileId);
if (shared) {
  // Use shared reference — no fetch, no copy
  this.rawData = shared.rawData;
  this._panelFullRawData = shared.fullRawData;
  this.resampleData(); // only resample to own TF
  return;
}
// else: fetch from server as normal
```

---

### C-4: Migration strategy (don't break existing users)

Run both systems in parallel during transition:

```javascript
// In TalariaV8bLive.jsx — feature flag:

const USE_SINGLE_RUNTIME = localStorage.getItem('talaria_single_runtime') === 'true'
  || new URLSearchParams(location.search).get('runtime') === 'single';

return USE_SINGLE_RUNTIME
  ? <MultichartRuntimeContainer layout={layout} />  // new single-runtime
  : <MultichartGrid layout={layout} />;             // existing iframe system
```

Deploy with `?runtime=single` for internal testing first. When stable, flip the
default and keep iframe as fallback for 30 days.

**Files to change for Track C:**
- New: `chart v 1.4/chart/chart-instance.js` (extract ChartInstance class)
- New: `chart v 1.4/talaria-design/src/MultichartRuntime.js`
- `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx` — feature flag
- `chart v 1.4/talaria-design/src/MultichartGrid.jsx` — keep as fallback
- `chart v 1.4/chart/chart.js` — keep as legacy single-panel mode

**Estimated effort:** 2–3 weeks (largest refactor)
**Expected result:** Multichart uses ~50% less RAM, eliminates postMessage latency,
replay broadcast is a direct function call instead of serialized message.

---

## Full timeline

```
Week 1–2:   Track A — Web Workers for indicators
            → Indicators never block main thread
            → Zoom/pan/TF switch all stay at 60fps

Week 3–4:   Track B — Pre-built server TF tiles
            → TF switch becomes a fast fetch
            → Server does aggregation once at upload

Week 5–7:   Track C — Single-runtime multichart
            → Remove iframe overhead
            → Direct function calls replace postMessage
            → Shared bar store for same-pair panels
```

---

## Verification for each track

### Track A — Worker indicators
```
Chrome DevTools → Performance → Record → switch TF + zoom out → Stop
Before: Long Tasks on main thread during indicator recalc (orange blocks)
After:  Main thread stays green; small async gap then render
```

### Track B — Pre-built TF tiles
```
Chrome DevTools → Network → filter by /bars → switch TF
Before: 200–500ms JS compute (no network request)
After:  50–100ms network request, instant render on response
```

### Track C — Single runtime
```
Chrome DevTools → Memory → take heap snapshot with 4 panels open
Before: ~800MB–1.2GB (4 iframes × ~200–300MB each)
After:  ~250–400MB (one shared heap)

DevTools → Performance → pan all 4 panels simultaneously
Before: Frame drops during crosshair sync (postMessage serialization)
After:  Solid 60fps (direct function calls)
```

---

## What you will NOT be able to match (ever)

| TV advantage | Why it's unreachable | Acceptable? |
|---|---|---|
| C++ WASM render core | Would require rewriting chart engine in C++/Rust | Yes — JS at 60fps is fine |
| Global CDN for public symbols | TV caches EURUSD for all users; your tiles are per-user | Yes — user files are private |
| 50M user scale | Horizontal infra costing millions/year | Yes — different scale |

Everything else in TV's smoothness is **achievable** with these three tracks.
After Track A + B, you will be at ~95% parity for zoom/pan/TF.
After Track C, multichart will match TV's feel completely.

---

*Prerequisite: All fixes in `talaria-performance-fixes.md` and `talaria-zoom-pan-fixes.md` applied first.*
*Last updated: 2026-06-08*

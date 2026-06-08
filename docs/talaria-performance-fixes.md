# Talaria — Performance & CPU Fix Guide

> Generated from architecture audit of `chart-multichart-architecture.md`  
> Fix these in order — top items have the highest impact.

## Implementation status (2026-06-08)

| Fix | Status | Notes |
|-----|--------|-------|
| FIX-1 | ✅ Done | `WEB_CONCURRENCY=2` in `docker-compose.yml` and `chart v 1.4/chart/.env.example`. Second `trading-chart` replica behind LB **not** added (optional scale-out). |
| FIX-2 | ✅ Done | `REDIS_URL` + `BACKTEST_BARS_CACHE_*` in compose; `bar_window_cache.py` wired in `api_server.py`. Run `./scripts/verify-bar-cache-env.sh` on VPS. |
| FIX-3 | ✅ Done | Compose mounts `homepage/nginx.local.conf`; `homepage/Dockerfile` copies same file for image builds. |
| FIX-4 | ✅ Done | `chart.scheduleSessionStateSave()` (4s debounce) used from `replay-system.js`, `propfirm-tracker.js`, etc.; replay persist while playing **8s** interval. |
| FIX-5 | ✅ Done | `MultichartGrid.jsx` — rAF coalesce + **30 fps** cap on `replayFrame` fan-out. |
| FIX-6 | ✅ Done | `_ensureReplayDataGeneration` guard in `chart.js` (`ensureReplayDataCoversTimestamp`, TF switch, `_beginTimeframeSwitching`). |
| FIX-7 | ✅ Done | `_evictPanelMasterData()` on pair switch in `loadFileData()`. |
| FIX-8 | ✅ Done | Tile cache + static `/chart/` in `homepage/nginx.local.conf` (Dockerfile aligned). |
| TF-VIEWPORT | ✅ Done | **Same chart position across timeframes (TradingView parity)** — `_captureTfSwitchViewport` (snapshots the visible wall-clock window in `_beginTimeframeSwitching`, non-replay) + `_restoreTfSwitchViewport` / `_restoreOrJumpAfterTfSwitch` re-center the new TF and recompute `candleWidth` (`_candleWidthForSpacing`) so the visible time range is preserved. Wired into every live single-chart path (`_applyLiveTimeframeSwitchFromCache`, `_applyClientResampleTimeframeSwitch`, local-CSV resample in `setTimeframe`, both `_loadTimeframeFromServer` branches). **Multichart:** in-page panels (`panel-managerv2.js` → `chartInstance.setTimeframe`) inherit it; linked-pane resample in `timeframe-favorites.js` and the iframe path in `multichart/chart-host.html` (`loadDataInto(…, preserveViewport=true)` → `applyCandles` → `_restoreTfSwitchViewport`) capture/restore the same window. Restore is non-destructive — falls back to `jumpToLatest()` when the captured center isn't in the loaded window, so loading never breaks. Edited both `homepage` + `chart v 1.4` copies. `multichart-prod/` is dormant; its future `setTimeframe` bridge routes through the fixed engine. |
| TV-PARITY-A | ✅ Done | **Track A — Web Worker indicators**: `chart v 1.4/chart/workers/indicator-worker.js` (self-contained pure calc for all 30+ indicator types). `IndicatorWorkerManager` singleton + `recalculateIndicatorsAsync()` added to `chart-indicators-full.js`. `_deferRecalculateIndicators` + `_scheduleIndicatorsAfterTimeframe` in `chart.js` now call async path first; worker failure auto-falls-back to sync. Cache-bust `?v=20260602a480`. |
| TV-PARITY-B | ✅ Done | **Track B — Pre-built TF tiles**: tile build for all 9 TFs already ran at upload time (verified `DATASET_TIMEFRAMES`). `/smart` API already serves pre-built tiles. Added TF-aware Redis TTL to `bar_window_cache.py` (`_ttl_sec(timeframe)` → 5m+ gets 3600s vs 1m's 300s, env-overridable via `BACKTEST_BARS_CACHE_TTL_PREBUILT_SEC`). Wired `timeframe=` kwarg into all three `set_smart` callsites in `api_server.py`. Background tile rebuild on CSV upload already in place (lines 7362–7395). |
| TV-PARITY-C | ✅ Done | **Track C flag** — `USE_SINGLE_RUNTIME` feature gate added to `TalariaV8bLive.jsx` (reads `localStorage.talaria_single_runtime=true` or `?runtime=single`). Placeholder logs when flag active; falls through to iframe grid until `MultichartRuntimeContainer` is built. `sync-v9-to-homepage.mjs` now also copies `chart/workers/` to `homepage/public/chart/workers/`. Built + deployed `?v=20260602a480`. |

**Deploy:** `npm run build:chart-v9` from repo root → `docker compose build homepage` → `docker compose up -d homepage`. Hard-refresh browser (Ctrl+Shift+R).

**New env var (optional):** `BACKTEST_BARS_CACHE_TTL_PREBUILT_SEC` — TTL for 5m/15m/30m/1h/4h/1d/1w/1mo tiles (default 3600s).

---

## 🔴 Critical Fixes

### FIX-1 — Reduce `WEB_CONCURRENCY` and split workers

**Problem:** `WEB_CONCURRENCY=4` creates 4 full Python processes. With multichart (4 panels, different pairs), a single user fires 4 parallel `/bars`/`/smart` requests simultaneously — each hitting a different worker that loads its own mmap cache. 2 users can max a 16 GB VPS.

**Fix:**

In `docker-compose.yml` or `.env`:
```env
WEB_CONCURRENCY=2
```

Then add a second `trading-chart` replica behind a load balancer instead of scaling workers per process. This halves RAM duplication from mmap caches while keeping throughput.

**Files to change:**
- `docker-compose.yml` → `WEB_CONCURRENCY` env var
- `.env` / `.env.example` → update default comment

---

### FIX-2 — Verify Redis bar cache is actually active

**Problem:** The Redis bar window cache (`bar_window_cache.py`) is the main defense against repeated disk reads, but it only activates when both env vars are set correctly. If Redis is unreachable or the var is missing, every `/smart` and `/bars` request hits disk (mmap) on every worker.

**Verify right now:**
```bash
docker exec trading-chart env | grep BACKTEST_BARS_CACHE
docker exec trading-chart env | grep REDIS_URL
docker exec trading-chart python -c "import redis; r=redis.from_url('redis://redis:6379'); print(r.ping())"
```

**Expected output:**
```
BACKTEST_BARS_CACHE_ENABLED=true
BACKTEST_BARS_CACHE_TTL_SEC=300
REDIS_URL=redis://redis:6379
True
```

**Fix — ensure these are set in `docker-compose.yml` under `trading-chart` service:**
```yaml
environment:
  - REDIS_URL=redis://redis:6379
  - BACKTEST_BARS_CACHE_ENABLED=true
  - BACKTEST_BARS_CACHE_TTL_SEC=300
```

**Files to change:**
- `docker-compose.yml`
- `chart v 1.4/chart/bar_window_cache.py` — confirm the cache key includes `fileId + window params`

---

### FIX-3 — Switch nginx to static file serving for `/chart/`

**Problem:** If `nginx.conf` (not `nginx.local.conf`) is active in production, all JS/CSS/dist-v9 static files are proxied through gunicorn. This wastes CPU on every page load and chart boot — serving files that should come straight from disk.

**Verify which config is active:**
```bash
docker exec homepage nginx -T | grep "location /chart"
```

**Fix — ensure `nginx.local.conf` is mounted in production Docker:**

In `docker-compose.yml` under the `homepage` service:
```yaml
volumes:
  - ./homepage/nginx.local.conf:/etc/nginx/conf.d/default.conf:ro
```

The key nginx block must be `try_files` first, **not** a direct proxy:
```nginx
location ^~ /chart/ {
    try_files $uri $uri/ @chart_upstream;
}
location @chart_upstream {
    proxy_pass http://trading-chart:8000;
}
```

**Files to change:**
- `docker-compose.yml` → volume mount for nginx config
- `homepage/nginx.local.conf` → confirm `try_files` block exists for `/chart/`

---

## 🟠 Major Fixes

### FIX-4 — Debounce session PATCH calls

**Problem:** `PATCH /api/sessions/{id}/state` is called on every playhead movement during replay — potentially dozens of times per second. Each call hits gunicorn + Postgres with no batching.

**Fix — add debounce on the client before firing the PATCH:**

In the file that calls `PATCH /api/sessions/{id}/state` (likely `TalariaV8bLive.jsx` or `replay-system.js`):

```javascript
// Before (fires immediately):
await fetch(`/api/sessions/${sessionId}/state`, { method: 'PATCH', body: ... });

// After (debounced):
const _debouncedPatchSession = debounce(async (sessionId, state) => {
  await fetch(`/api/sessions/${sessionId}/state`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state)
  });
}, 800); // 800ms debounce

_debouncedPatchSession(sessionId, state);
```

Use lodash `debounce` or a simple custom one. Make sure to call `.flush()` when the user explicitly saves or exits replay to avoid losing the final state.

**Files to change:**
- Search codebase for `PATCH /api/sessions` or `sessions/${id}/state` — debounce every call site
- Likely in: `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx` or `replay-system.js`

---

### FIX-5 — Throttle `replayFrame` broadcast to iframes

**Problem:** During replay, Panel A fires a `postMessage` (`replayFrame`) to panels B, C, D on every animation frame (~60/sec). Each iframe deserializes the message, slices `_panelFullRawData`, and resamples to its current timeframe. With 4 panels this is ~240 operations/second on the client, causing browser CPU spikes and laggy playback.

**Fix — throttle the broadcast loop in `MultichartGrid.jsx`:**

```javascript
// In MultichartGrid.jsx where replayFrame is broadcast:

const REPLAY_BROADCAST_FPS = 30;
const REPLAY_BROADCAST_INTERVAL = 1000 / REPLAY_BROADCAST_FPS; // ~33ms
let _lastReplayBroadcast = 0;

function broadcastReplayFrame(frameData) {
  const now = performance.now();
  if (now - _lastReplayBroadcast < REPLAY_BROADCAST_INTERVAL) return; // skip frame
  _lastReplayBroadcast = now;

  // existing postMessage fan-out to iframes B/C/D
  panels.forEach(panel => panel.sendCommand('replayFrame', frameData));
}
```

**Files to change:**
- `chart v 1.4/talaria-design/src/MultichartGrid.jsx` — find the `replayFrame` broadcast loop and wrap with throttle

---

### FIX-6 — Guard against stale `ensureReplayDataCoversTimestamp` completions

**Problem:** When a user scrubs or pans past the loaded data edge during replay, `ensureReplayDataCoversTimestamp` fires an async `/smart` or `/bars` call. If a timeframe switch happens before this resolves, the stale response can reset `currentTimeframe` back to `1m`, causing a visible glitch + a wasted server fetch.

**Fix — add a generation counter guard (if not already applied to all code paths):**

```javascript
// In chart.js or replay-system.js:

let _ensureDataGeneration = 0;

async function ensureReplayDataCoversTimestamp(ts) {
  const myGen = ++_ensureDataGeneration;

  const result = await fetchSmartWindow(ts); // existing fetch

  if (myGen !== _ensureDataGeneration) {
    console.warn('[replay] stale ensureReplayData — discarding');
    return; // ← abort, a TF switch happened while we were fetching
  }

  // proceed with ingest
  _ingestSmartWindowResult(result);
}

// On timeframe switch, also increment the generation:
function _independentPanelTimeframeSwitch(newTf) {
  _ensureDataGeneration++; // invalidate any in-flight ensure calls
  // ... rest of existing logic
}
```

**Files to change:**
- `chart v 1.4/chart/chart.js` — `ensureReplayDataCoversTimestamp` and `_independentPanelTimeframeSwitch`
- `chart v 1.4/chart/modules/replay-system.js` — if `ensureReplayDataCoversTimestamp` is also called here

---

## 🟡 Secondary Fixes

### FIX-7 — Evict old `_panelFullRawData` on pair switch

**Problem:** When a user switches pairs on a panel, the old full 1m dataset (`_panelFullRawData`) is never evicted. After several pair switches, multiple full datasets accumulate in the JS heap, bloating memory and slowing resample operations.

**Fix — explicitly null out old data before loading a new pair:**

```javascript
// In chart.js, at the start of loadFileData() or pair switch logic:

function _evictPanelData() {
  if (window.chart._panelFullRawData) {
    window.chart._panelFullRawData = null;
    window.chart.rawData = null;
    window.chart.data = null;
    window.chart._smartCachedPayload = null;
  }
}

// Call this before loading new file:
_evictPanelData();
loadFileData(newFileId);
```

**Files to change:**
- `chart v 1.4/chart/chart.js` — beginning of `loadFileData()` or the pair-switch handler

---

### FIX-8 — Enable nginx tile cache for `/api/file/*/tile/*`

**Problem:** Raw tile requests (`/api/file/{id}/tile/{tf}/{idx}`) are immutable historical data — they never change once built. Without nginx caching they hit gunicorn on every request.

**Fix — confirm the tile cache block exists in `nginx.local.conf`:**

```nginx
# Add this at the top of nginx.local.conf (http block or include):
proxy_cache_path /var/cache/nginx/tiles levels=1:2 keys_zone=tiles:10m inactive=24h max_size=1g;

# In the server block:
location ~ ^/api/file/[^/]+/tile/ {
    proxy_cache tiles;
    proxy_cache_valid 200 24h;
    proxy_cache_use_stale error timeout updating;
    proxy_pass http://trading-chart:8000;
}
```

**Files to change:**
- `homepage/nginx.local.conf`

---

## ✅ Fix Priority Summary

| Priority | Fix | Effort | Impact |
|----------|-----|--------|--------|
| 1 | FIX-2: Verify Redis cache is active | 5 min (verify) | 🔥 Eliminates redundant disk reads |
| 2 | FIX-3: nginx static serving for `/chart/` | 10 min | 🔥 Removes gunicorn from static file path |
| 3 | FIX-4: Debounce session PATCH | 15 min | ⚡ Cuts Postgres + gunicorn hammering |
| 4 | FIX-1: Lower `WEB_CONCURRENCY=2` | 5 min | ⚡ Halves RAM duplication |
| 5 | FIX-5: Throttle replayFrame to 30fps | 20 min | ⚡ Cuts client CPU during replay |
| 6 | FIX-6: Stale ensureReplayData guard | 30 min | 🐛 Fixes TF glitch + wasted fetches |
| 7 | FIX-7: Evict _panelFullRawData on switch | 15 min | 🧹 Reduces browser memory bloat |
| 8 | FIX-8: nginx tile cache | 15 min | ⚡ Removes repeat tile hits on gunicorn |

---

## Verification Checklist

After applying fixes, verify with:

```bash
# 1. Confirm Redis cache is being used (cache hits should increase over time)
docker exec redis redis-cli info stats | grep keyspace_hits

# 2. Confirm static files are NOT hitting gunicorn (access log should show no /chart/*.js)
docker logs trading-chart --tail=50 | grep "chart/dist-v9"

# 3. Check gunicorn worker memory per process
docker stats trading-chart --no-stream

# 4. Monitor tile cache hit rate
docker exec homepage nginx -T | grep proxy_cache
```

---

*Audit based on: `chart-multichart-architecture.md` — Last updated 2026-06-06*

# Multichart panels — data loading & layout rendering

This document explains, in concrete code terms, **how the multichart panels work**: how each panel is created and laid out, how it loads candle data, and how it renders. It is the working reference for the scaling phases (shared bar store, base-resolution resample, off-thread resample, shared prefetch).

> Companion docs: [`chart-multichart-architecture.md`](./chart-multichart-architecture.md) (full stack), [`chart-zoom-pan-load-flow.md`](./chart-zoom-pan-load-flow.md) (pan/zoom loading).

---

## 1. Mental model

The multichart view is **not** one chart drawing several series. It is:

- **1 host chart** — the parent `/chart/` page's own `window.chart` (Panel A, in-page).
- **N iframe panels** — each a separate document running the full chart engine, spawned by the React `MultichartGrid`.

Every panel is an independent chart instance with its **own data, own canvas, own drawings/indicators**. Panels are kept consistent through a **postMessage bridge layer**, not shared memory (except the same-origin `window.parent` read trick described below).

```
Parent page (one browser tab)
├── window.chart               ← Panel A (host, in-page)
├── MultichartManager          ← parent-side orchestrator
└── #chart-container
    └── MultichartGrid (React)  ← CSS grid of cells
        ├── cell A → host chart canvas
        ├── cell B → <iframe src="/chart/multichart-prod/chart-embed.html?...">
        ├── cell C → <iframe ...>
        └── cell D → <iframe ...>
```

### Key source files

| Area | Path |
|------|------|
| React grid (layout + command routing) | `chart v 1.4/talaria-design/src/MultichartGrid.jsx` |
| Parent orchestrator | `chart v 1.4/chart/multichart-prod/multichart-manager.js` |
| Iframe boot glue | `chart v 1.4/chart/multichart-prod/embed-bridge.js` |
| Iframe command handler | `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js` |
| Time-axis sync | `chart v 1.4/chart/multichart-prod/sync-bridge.js` |
| Field allowlist guard | `chart v 1.4/chart/multichart-prod/engine-api-guards.js` |
| Chart engine + data layer | `chart v 1.4/chart/chart.js` |
| Replay engine | `chart v 1.4/chart/modules/replay-system.js` |
| Lightweight iframe shell | `chart v 1.4/chart/multichart-prod/chart-embed.html` |

> The engine `chart.js` and `modules/*.js` are **served directly** (not bundled inside the React chunk). The canonical source is `chart v 1.4/chart/chart.js`, mirrored to `homepage/public/chart/chart.js` which is what nginx serves.

---

## 2. Panel creation & layout rendering

### 2.1 Grid layout

`MultichartGrid` renders a CSS grid inside `#chart-container` sized from the chosen layout (2×1, 2×2, 3×3, …). Cell **A** hosts the existing host chart canvas; cells **B/C/D** each mount an `<iframe>`.

Iframe URL is built by `buildIframeSrc` (`MultichartGrid.jsx:670`):

```
/chart/multichart-prod/chart-embed.html?multichart=1&panelId=B&fileId=…&tf=…&sessionId=…&v=<build>&embedRev=…
```

Notable choices:
- Uses the **lightweight `chart-embed.html`** (chart engine + bridges only, **no React bundle per iframe**) — a major perf win over loading dist-v9 four times.
- **`mode=backtest` is deliberately NOT forwarded.** Forwarding it makes `chart.js` run `autoLoadBacktestingData` inside every iframe, which stalls boot under 3–4 parallel iframes. Instead the iframe takes a deterministic panel path (see §3).
- `sessionId` **is** forwarded so the iframe builds the same per-session drawings storage key as the parent.

### 2.2 Iframe registration & reveal

`MultichartManager.addChart(cfg, mountEl)` creates the iframe, stores a chart entry (`ready:false`), and installs `load` / `error` listeners with a 30s bridge-ready timeout.

Boot is **silent** (`silentPanelBoot`): the iframe starts at `opacity:0` and is only revealed once its bridge reports ready, via `showPanelFrame` and a short `_markBootRevealHold(900ms)` so panels appear together instead of flickering in one at a time.

The host chart is registered with `addHostChart(cfg, hostBridge)` — it lives in the same window, so the manager talks to it via a `directDeliver` function instead of `postMessage` (avoids the manager hearing its own broadcast and re-fanning it).

### 2.3 Rendering pipeline (per panel)

Each panel's engine renders to its own `<canvas>` exactly like the single chart:

1. `chart.data` (bars resampled to `currentTimeframe`) is the draw source.
2. `render()` / `scheduleRender()` paints candles, axes, drawings (SVG `drawingsGroup` clipped by `chart-clip-path`), indicators.
3. On boot, `embed-bridge` installs a `ResizeObserver` on the canvas that fires `drawingManager.redrawAll()` on the next frame — this fixes the "drawings flash then disappear" race where the canvas is briefly 0×0 and the clip-path collapses.
4. During a timeframe switch, `_beginTimeframeSwitching` freezes the last canvas frame as an overlay `<img>` so the canvas underneath can be cleared/resized with **no visible flash**; `_endTimeframeSwitching` removes it once new bars are installed.

---

## 3. Data loading — initial boot

### 3.1 Boot sequence inside an iframe (`embed-bridge.js`)

1. **Poll for `window.chart`** (up to 30s; React boots the engine asynchronously).
2. **Mirror the parent's `backtestingSession`** directly from `window.parent.chart` (same origin), and copy it into `userStorage`. Without this the iframe would fetch a *different* date window than Panel A.
3. Neutralize session-state restore fetches (`loadTradingSessionStateIfNeeded`, `loadDrawingsFromData`) so they can't wipe drawings the local `loadDrawings` just rendered.
4. Call `applyInitialContext()`, which picks a load path:

| Condition | Path |
|-----------|------|
| `mode=backtest` in URL (not used in prod grid) | Do nothing; let `chart.js` `checkBacktestingMode` auto-load |
| Backtest session present | `chart.loadMultichartPanelFile(fileId, { timeframe, replayTimestamp })` |
| Live / no session | Same-pair mirror from host memory, else `chart.loadFileData(fileId)` |

5. On completion, send `bridge-ready`; the manager then calls `_initialSyncToHost` to snap the panel to the host's current visible time range, then reveals it.

### 3.2 The data waterfall (`loadFileData`, `chart.js:6779`)

For any `fileId` the engine tries the cheapest source first and only hits the network last:

```
0. Same pair as host A (backtest)   → _takeParentNativeMasterSmartWindow   (0 network — reuse host 1m fullRawData)
1. Same pair as host A (resampled)  → _takeParentMemorySmartWindow          (0 network)
2. In-tab prefetch LRU cache        → _tryTakeSmartPrefetch                 (0 network)
3. Network range query              → _fetchSmartWindow → GET /api/file/{id}/bars
4. Network window loader (fallback) → GET /api/file/{id}/smart
   ↓
_ingestSmartWindowResult → rawData (native, usually 1m) + data (resampled to currentTimeframe)
   ↓
_panelFullRawData = native master kept for client-side TF switches
```

- **Same pair as Panel A → no network.** The iframe reads `window.parent.chart.replaySystem.fullRawData` by reference (`_takeParentNativeMasterSmartWindow`, `chart.js:2788`).
- **Different pair → own fetch.** The panel builds its own `_panelFullRawData`.

### 3.3 Backtest panel loader (`loadMultichartPanelFromHost`, `chart.js:2980`)

Used for backtest/replay panels. Key rules:
- The **replay playhead always advances on a 1m master** (`masterTf = '1m'`); the display TF is resampled client-side so every panel stays candle-for-candle aligned.
- On a pair switch it clears local buffers, then fetches a session-spanning window; same-pair panels can clone the host master with no network.

### 3.4 Server side (brief)

`/api/file/{id}/bars` and `/smart` (`api_server.py`) read **binary tile files** (48 bytes/candle, mmap, `_tiles_read_window`), fronted by a **Redis bar-window cache** (`bar_window_cache.py`) shared across gunicorn workers. nginx serves `/chart/*` statically and proxies only `/api/*`.

---

## 4. Data loading — timeframe switch

`setTimeframe(tf)` (`chart.js:18219`) is the dispatcher. For a **multichart backtest iframe** it runs `_tryMultichartEmbedBacktestTimeframeFastPath` (`chart.js:2098`), a waterfall of cheap paths, falling back to a server refetch:

```
1. _multichartMirrorHostTfSwitchIfReady   → clone host's committed bars + viewport (host already on this TF)   [0 network]
2. _warmBtTfCacheFromParent + _applyBacktestTimeframeFromCache → prefetched _btTfDataCache                       [0 network]
3. _applyBacktestTimeframeFromParentCache  → read host's _btTfDataCache                                          [0 network]
   ── coverage gate: _multichartMasterCoversTimeframe(tf) ──
4. _multichartSamePairTimeframeResampleFromParent → reseed host 1m master → resample                            [0 network]
5. _independentPanelTimeframeSwitch        → resample own _panelFullRawData                                      [0 network]
6. _applyClientResampleTimeframeSwitch     → generic client resample                                            [0 network]
   ── else ──
7. _refetchBacktestTimeframeCore           → GET /smart native bars (same as host A)                            [NETWORK]
```

### 4.1 The coverage gate (recent fix)

Tiers 4–6 resample from the in-memory native master. A **fine master** (~2000 1m bars ≈ 1.4 days) resampled to a **coarse TF** (e.g. 1D) yields only ~2 candles, which then backfill one-at-a-time via backward paging — the "candles load one by one" symptom.

`_multichartMasterCoversTimeframe(tf)` (`chart.js`, added alongside the fast-path) now gates tiers 4–6:
- equal/finer-than-native targets → always covered (unchanged),
- coarser targets → require the master's `firstT..lastT` span to yield at least the visible bar count (fallback 120) after resampling; otherwise return `false`,
- when not covered, the switch falls through to **tier 7 server refetch** — identical to how host Panel A loads a coarse TF, so the full history arrives in one shot.

During the switch the freeze-frame overlay keeps the last good frame visible; prefetch of neighbor TFs into `_btTfDataCache` happens in idle time (`_scheduleBacktestTimeframePrefetch`, `chart.js:6089`).

### 4.2 Independent-pair resample (`_independentPanelTimeframeSwitch`, `chart.js:3658`)

For a panel showing a different pair than the host, TF switch resamples its own `_panelFullRawData` and slices at the shared replay playhead (`_applyIndependentPanelReplaySlice`). A generation guard drops any stale `ensureReplayDataCoversTimestamp` fetch that could otherwise reset `currentTimeframe` back to 1m after the switch.

---

## 5. Bridge & command layer

Panels are kept consistent without leaking per-panel state across the iframe boundary.

### 5.1 Field allowlist (`engine-api-guards.js`)

Every inbound/outbound postMessage is filtered. **Forbidden fields** (dropped): `priceMin, priceMax, autoScale, priceZoom, priceOffset, manualCenterPrice, manualRange, mode, scaleType, timeframe, indicators, drawings, chartType`. Only **time-axis** data (`time`, `startTime`, `endTime`, `symbol`) may cross. This is the single guard against the original multichart price-axis bug.

### 5.2 Sync bridge (`sync-bridge.js`)

Emits `crosshair`, `visibleRange`, `chart-state`, `drawing-*`, `bridge-ready` outbound; applies filtered inbound sync with a `causationId` loop guard. It does **not** change timeframe, load files, or drive replay — those are commands.

### 5.3 Command bridge (`panel-cmd-bridge.js`)

Receives `{ type:'panel-cmd', target, cmd, args, requestId }` and applies via the local `window.chart`. Commands include `setTimeframe`, `loadFile`, `replayEnter/Tick/Frame/Play/Pause`, `addIndicator`, orders, etc. **Not** subject to the forbidden-field guard — these are intentional user/topbar actions.

- `setTimeframe` (`:1401`): idempotency guard, then host-mirror fast path, then `chart.setTimeframe(tf)`.
- `loadFile` (`:1452`): mirrors parent session, uses `loadMultichartPanelFile` when appropriate.

### 5.4 Parent orchestrator (`multichart-manager.js`)

- `addChart` / `addHostChart` / `removeChart` — lifecycle.
- `_onWindowMessage` — routes `bridge-ready`, `chart-state`, `visibleRange`, `crosshair`, `drawing-*`, `panel-cmd` replies, etc.
- `_fanOut` — PEER topology: rebroadcasts a panel's user event to all other panels, gated by `syncMode` (crosshair / visibleRange / symbol / drawings) and re-filtered through the allowlist.
- `__multichartManagerBroadcastReplay` — one rAF-coalesced replay fan-out to all iframes.

### 5.5 Replay broadcast (host → panels)

`MultichartGrid` patches the host `replaySystem` and streams:

| Message | When |
|---------|------|
| `replayEnter` | First sync / new panel bootstrap |
| `replayFrame` | Each animation frame while playing |
| `replayTick`  | Pause, scrub, drift correction |

Panels apply frames via `applyMultichartMirrorFrame` (`replay-system.js:6281`): same-pair panels reuse the host's already-sliced arrays by reference (biggest CPU saver); independent pairs slice + resample their own `_panelFullRawData`. The server is only touched on initial load and when panning past the loaded edge — **not per candle**.

---

## 6. Sync modes

| Setting | ON | OFF (independent) |
|---------|----|-------------------|
| Symbol | all panels same `fileId` | each panel own pair → N fetches |
| Interval (TF) | TF fan-out via `setTimeframe` to all | each panel own TF; client resample from master |
| Crosshair / time | shared virtual time on axis | via `sync-bridge` allowlist |
| Replay | host playhead → panel mirror | shared clock; per-panel OHLC |

---

## 7. Known bottlenecks (targets for the phases)

1. **N iframes = N JS heaps / canvases / engine parses.** ~4× RAM; boot polls up to 30s.
2. **No shared bar store.** Same-pair sharing only works host→iframe via `window.parent`; iframe↔iframe and different pairs don't share.
3. **Down-only resample.** Master is a short fine window; coarse switches under-cover and currently refetch (see §4.1). Fixed symptomatically; root cure is a full-span base master.
4. **Synchronous `resampleData` on the main thread** can jank large masters on TF switch.
5. **Per-panel prefetch** duplicates identical windows instead of feeding all panels once.
6. **Server assembles bars in gunicorn**; tile CDN redirect still off.
7. **Staggered opacity reveal / hold** adds perceived latency.

### Phases

1. ✅ **Shared client bar store** on the top same-origin window (`fileId → per-tf windows`), read/written by all panels. *(landed)*
2. ✅ **Base-resolution top-up** so a coarse TF switch resamples from the shared base instead of refetching whenever any panel/host already loaded enough data. *(landed)*
3. **Off-thread resampling** in a shared Web Worker.
4. **Shared prefetch + instant boot** (skeleton, drop the reveal hold).
5. **Server edge** (`TILE_CDN_REDIRECT` + nginx tile cache) for cold cross-pair loads.
6. *(optional, large)* **Single-process multichart** — collapse iframes into one runtime with N canvases.

---

## 8. Phase 1+2 implementation notes (shared bar store)

Added to `chart.js` (canonical + `homepage/public/chart/chart.js` mirror). Fully additive — disable via `window.__TALARIA_DISABLE_SHARED_BAR_STORE = true`; inspect via `window.__talariaBarStoreStats()`.

| Method | Role |
|--------|------|
| `_sharedBarStore()` | Lazily creates ONE store on the top same-origin window; every parent + iframe shares it. |
| `_createSharedBarStore()` | The store: `fileId → Map(tf → {bars, cursors})`, union-merge on write, LRU over 12 files, cap 200k bars/tf. |
| `_publishMasterToSharedStore(bars, result)` | Called from `_ingestSmartWindowResult` — every native window any panel loads is published. |
| `_takeSharedStoreSmartWindow(fileId, tf)` | New read tier in `loadFileData` (after parent-memory, before network): reuse a compatible window another panel already loaded. |
| `_topUpMasterFromSharedStore(tf)` | Called at the top of `_multichartMasterCoversTimeframe`: widen this panel's `_panelFullRawData` from the store (finer-or-equal resolution only) so coarse switches resample instead of refetch. |

**Store pick rule:** for a wanted TF, return the cached entry whose resolution is ≤ wanted (so it can upsample) with the largest coarse-bar coverage (`span / wantedTfMs`). Never returns a coarser-than-wanted entry.

**Safety guards:**
- Read tier gated behind the existing `canUseParentMemory` (skipped for playhead-anchored independent-pair fetches).
- Top-up refuses any base coarser than the current native master (prevents breaking a later finer-TF switch).
- Any store miss/error falls through to the exact pre-existing paths.

---

*Reference for the "TradingView-grade smooth load + TF switch" work. Update this doc as phases land.*

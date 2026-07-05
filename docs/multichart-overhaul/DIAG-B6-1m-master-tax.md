# DIAG-B6 - 1m Master Tax

## Pre-Task Git Status

```text
 M docs/multichart-overhaul/BASELINE-RESULTS.md
 M docs/multichart-overhaul/DIRECTOR-DECISIONS.md
 M docs/multichart-overhaul/MANAGER-ESCALATIONS.md
 M docs/multichart-overhaul/MANAGER-FINDINGS.md
```

## Scope And Baseline

Director decision D-016 selects Option B: remove the eager "1m-master tax" at the source. The frozen "before" references are `docs/multichart-overhaul/BASELINE-RESULTS.md:178-211` for S6-b and `docs/multichart-overhaul/BASELINE-RESULTS.md:213-230` for S6-c. The older S6-a penalty is also documented as HOST 91 fetches / 178000 bars versus single-chart 4 fetches / 4000 bars at `docs/multichart-overhaul/BASELINE-RESULTS.md:160-176`.

Unless otherwise noted, code evidence below is in `chart v 1.4/chart/chart.js`.

## 1m-Pinning Inventory

### `autoLoadBacktestingData`

`autoLoadBacktestingData(session, opts)` resolves `replayRawTf` from the current backtest timeframe, defaulting to `1m`, commits it as `currentTimeframe`, then fetches that same `replayRawTf`; the native marker is assigned from that variable at ingest (`chart v 1.4/chart/chart.js:1765-1829`, `chart v 1.4/chart/chart.js:1898-1907`, `chart v 1.4/chart/chart.js:1948-1953`). This is not multichart-specific; it is the base backtest/replay boot path. What selects `1m` is the fallback in `const replayRawTf = this._normalizeBacktestTimeframe(this.currentTimeframe) || '1m'` (`chart v 1.4/chart/chart.js:1822-1825`).

### Multichart Replay Master Predicate

`_usesMultichartReplayMaster()` returns true for either an iframe embed panel or the host panel (`chart v 1.4/chart/chart.js:2282-2285`). Any downstream branch using this predicate treats multichart replay as a shared replay-master mode, and `_getReplayPanFetchTimeframe()` returns `1m` for that mode except while host viewport-first hydration is in progress and the active replay raw timeframe is not `1m` (`chart v 1.4/chart/chart.js:6292-6302`). This is a host-or-panel replay pin, not a single-chart path.

### `loadMultichartPanelFromHost`

`loadMultichartPanelFromHost(opts)` hardcodes `masterTf = '1m'` after computing the display TF (`chart v 1.4/chart/chart.js:3553-3574`). That single line is the broadest source pin: later branches use `masterTf` for independent pair initial fetch, independent seek buffer, fallback fetch, and native marker assignment (`chart v 1.4/chart/chart.js:3726-3781`, `chart v 1.4/chart/chart.js:3795-3805`). The function is multichart-specific and covers host tile A plus iframe panels through `loadMultichartPanelFile()` (`chart v 1.4/chart/chart.js:4340-4365`).

There is already a disabled-by-default display-TF host branch inside the same function: when `_multichartViewportFirstSwitchEnabled(displayTf, switchingPair)` returns true, the host fetches `displayTf`, marks `loadedViewportFirstHost`, and sets `_nativeRawFetchTf` to `displayTf` instead of `masterTf` (`chart v 1.4/chart/chart.js:3667-3718`, `chart v 1.4/chart/chart.js:3795-3799`). That branch is gated behind `window.__TALARIA_MC_ENABLE_VIEWPORT_FIRST === true`, `switchingPair`, host-panel status, backtest context, and `tf !== '1m'` (`chart v 1.4/chart/chart.js:4036-4052`).

### Viewport-First Hydration

`_hydrateMultichartViewportFirstMaster()` is an explicit 1m hydration path. It computes a 1m replay/initial range, fetches `timeframe='1m'`, assigns `_nativeRawFetchTf = '1m'`, then seeds `replay.fullRawData`, `replay.rawTimeframe = '1m'`, and replay caches (`chart v 1.4/chart/chart.js:4125-4147`, `chart v 1.4/chart/chart.js:4157-4201`). This is host-only because `_multichartViewportFirstHydrationStillCurrent()` rejects non-host panels (`chart v 1.4/chart/chart.js:4070-4088`). It is a background hydration pin, not the first-paint browsing path.

The hydration pump then repeatedly calls `checkViewportLoadMore()` until left/right replay coverage is complete or 240 ticks elapse (`chart v 1.4/chart/chart.js:4214-4248`). This is the current "large 1m master eventually arrives through chunks" mechanism.

### Independent Panel TF Switch

`_independentPanelTimeframeSwitch(normalizedTf)` assumes `_panelFullRawData` is a 1m master, commits the requested display TF, then hard-sets `_nativeRawFetchTf = '1m'` (`chart v 1.4/chart/chart.js:4554-4589`). Its fallback replay seed also labels `replay.rawTimeframe = '1m'` (`chart v 1.4/chart/chart.js:4597-4603`). This is for an independent multichart panel during active replay, not the host.

### Same-Pair Parent Extension

`_tryExtendReplayMasterFromParent()` is same-pair iframe data sharing. It requires same pair, active replay, and a parent replay master, then merges parent bars into local `replay.fullRawData`, assigns `_panelFullRawData = merged`, and hard-sets `_nativeRawFetchTf = '1m'` (`chart v 1.4/chart/chart.js:4924-4979`). This is a same-pair panel consumer/pin. It assumes parent `replay.fullRawData` is the 1m shared master.

`_syncReplayMasterFromParentIfCovers(targetTs)` similarly copies parent replay/master data into a same-pair panel when the parent covers the target timestamp, then sets `_nativeRawFetchTf = parent._nativeRawFetchTf || '1m'` (`chart v 1.4/chart/chart.js:5084-5115`). This is not an unconditional 1m pin, but its fallback is 1m and it is part of the same same-pair replay-sharing contract.

### `loadFileData`

In `loadFileData(fileId)`, backtest pair switching sets `requestTimeframe = anchorToHostPlayhead ? '1m' : currentTimeframe`, then forces same-pair-as-host requests to `1m` (`chart v 1.4/chart/chart.js:7770-7788`, `chart v 1.4/chart/chart.js:7828-7847`). If no memory/cache path serves it, an independent iframe anchored to host playhead fetches an initial `1m` range, may fetch a 1m replay seek buffer, and falls back to `anchorToHostPlayhead ? '1m' : requestTimeframe` (`chart v 1.4/chart/chart.js:7908-7952`). After ingest, `loadFileData` first records `result.nativeRawFetchTf || requestTimeframe`, then overrides to `_nativeRawFetchTf = '1m'` when `anchorToHostPlayhead && isBacktestSession` (`chart v 1.4/chart/chart.js:8028-8044`). This pin is for multichart/backtest pair switching, with same-pair and replay-anchored cases.

### `loadPanelFileData`

`loadPanelFileData(fileId)` is the panel-specific pair-load path. In backtest it unconditionally sets `requestTimeframe = '1m'`, builds the initial backtest range at `1m`, fetches that timeframe, ingests it, hard-sets `_nativeRawFetchTf = '1m'`, and resamples to the panel display TF (`chart v 1.4/chart/chart.js:8230-8269`, `chart v 1.4/chart/chart.js:8318-8337`, `chart v 1.4/chart/chart.js:8399-8405`). This is a same-pair/independent panel path, not host browsing.

### Display-TF Counterparts

The principal display-TF assignments are `_hotSwapBacktestReplayTimeframe()` setting `_nativeRawFetchTf = normalizedTf` (`chart v 1.4/chart/chart.js:7267-7295`), `_loadTimeframeFromServer()` setting `_nativeRawFetchTf = timeframe` (`chart v 1.4/chart/chart.js:20480-20586`), and `_refetchBacktestTimeframeCore()` setting `_nativeRawFetchTf = timeframe` after a display-timeframe fetch (`chart v 1.4/chart/chart.js:20948-21027`). These are the single-chart parity shape: request at display TF and mark the native data as that TF.

## 1m-Master Consumers And Breakage If Host Master Becomes Display TF

### Replay Bar Stepping

Replay stores and steps over `fullRawData`, not `data`: `ReplaySystem` initializes `fullRawData`, `rawTimeframe`, and replay timestamp fields in its constructor (`chart v 1.4/chart/modules/replay-system.js:6-17`, `chart v 1.4/chart/modules/replay-system.js:27-33`). Entering replay copies `chart.rawData` to `fullRawData` and detects its raw timeframe (`chart v 1.4/chart/modules/replay-system.js:2485-2495`). Each replay update slices `fullRawData` to `currentIndex + 1` and resamples that prefix to the chart display TF (`chart v 1.4/chart/modules/replay-system.js:2981-3030`).

If a host "master" is display TF, replay still runs, but the step unit becomes the display bar unless a finer cache/master is hydrated. The step code advances by the replay interval, but if the target index cannot advance it falls back to the next raw bar (`chart v 1.4/chart/modules/replay-system.js:639-656`). The code explicitly detects "INTERVAL finer than native master" as sub-bar mode (`chart v 1.4/chart/modules/replay-system.js:600-609`), which means a coarser master is a degraded replay contract rather than a hard load failure.

The code that needs finer data for correctness is the walk-forward OHLC path: `_getWalkForwardOhlcToPlayhead()` searches backtest TF caches for a TF finer than the native period, then searches `replay.fullRawData`/`rawData` for a finer series; if none is finer it returns null (`chart v 1.4/chart/chart.js:6852-6907`). That is the contract breaker for a display-TF host when replay granularity is finer than the display TF: without lazy finer hydration, forming-candle/order/guard logic cannot build intrabar OHLC from the coarser master.

### `ensureReplayDataCoversTimestamp`

`ensureReplayDataCoversTimestamp(targetTs)` first accepts any raw series that covers the timestamp and has a wall-clock prefix (`chart v 1.4/chart/chart.js:5156-5179`). For multichart embeds and for a host while viewport-first master hydration is active, it forces `replayRawTf = '1m'`; otherwise it uses the display TF (`chart v 1.4/chart/chart.js:5211-5223`). It fetches the selected `replayRawTf`, then stores that as `_nativeRawFetchTf`, resamples to the display TF when needed, and installs the fetched rows as `replay.fullRawData`/`replay.rawTimeframe` for non-independent panels (`chart v 1.4/chart/chart.js:5253-5323`).

If the host master is display TF and replay needs finer stepping, this function is the natural lazy hydration trigger because it already has the "does this timestamp have a usable prefix?" gate and already swaps in a fetched replay master. If it is left unchanged, the host hydrates to `1m` only while `_mcViewportFirstMasterHydrating` is true; after hydration is not active, host fallback uses `displayTf` (`chart v 1.4/chart/chart.js:5211-5223`).

### `_getReplayPanFetchTimeframe`

`_getReplayPanFetchTimeframe()` returns `1m` whenever `_usesMultichartReplayMaster()` is true, except during host viewport-first hydration when `replay.rawTimeframe` is not `1m` (`chart v 1.4/chart/chart.js:6292-6302`). That makes multichart pan extension consume the host as a 1m replay master by default. If the host master becomes display TF, this must not keep forcing 1m during browsing, or pan loads will immediately reintroduce the tax.

### `applyReplayFrame` And Panel Mirror

The iframe command bridge receives replay frames in `applyReplayFrame(ch, args)` and treats the parent as the single playhead driver (`chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:436-448`, `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:2274-2288`). Same-symbol panels are special: same-symbol/same-TF frames mirror host data, while same-symbol/different-TF panels return early and must not mirror host bars (`chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:537-570`). If the host master is display TF, same-pair same-TF panels can still mirror committed host `rawData`/`data`; same-pair different-TF panels already avoid host-frame mirroring and rely on their own panel data path.

### Same-Pair Panel Resample From Host

`_multichartSeedPanelMasterFromParent()` copies `parent.replaySystem.fullRawData` into `_panelFullRawData` when the iframe shows the same pair as host (`chart v 1.4/chart/chart.js:2653-2672`). `_multichartSamePairTimeframeResampleFromParent()` then uses that seed and calls `_independentPanelTimeframeSwitch(normalizedTf)` (`chart v 1.4/chart/chart.js:2692-2711`). `_tryExtendReplayMasterFromParent()` also reads parent `replay.fullRawData` and merges earlier/later bars (`chart v 1.4/chart/chart.js:4924-4967`).

If host `replay.fullRawData` is display TF, same-pair panel downsampling remains possible, but upsampling breaks. The code already has an upsample guard in `_independentPanelTimeframeSwitch()`: it estimates the master step and returns false if the master is coarser than the destination TF (`chart v 1.4/chart/chart.js:4566-4579`). Therefore a same-pair panel on a finer TF than the host must self-fetch or get a finer hydrated master; otherwise it would show host-shaped coarse bars under a finer label.

### `resampleData` And Coverage Gate

The resample-from-master model assumes the raw series is fine enough for the target. `_canClientResampleToTimeframe()` allows only coarser/equal small-step resampling and rejects finer targets during backtest replay (`chart v 1.4/chart/chart.js:6271-6289`). `_multichartMasterCoversTimeframe()` uses `_nativeRawFetchTf || '1m'` as the native step, returns true for equal/finer-than-native targets, and span-checks only coarser targets (`chart v 1.4/chart/chart.js:2348-2364`). It can also top up from a shared store, but `_topUpMasterFromSharedStore()` refuses to replace a master with a coarser picked resolution (`chart v 1.4/chart/chart.js:2627-2647`).

If host `_nativeRawFetchTf` becomes display TF, `_multichartMasterCoversTimeframe()` will correctly reject using that master for finer TF work because `targetMs <= nativeStepMs` is no longer true for finer targets (`chart v 1.4/chart/chart.js:2357-2364`). The breakage is not in the coverage check; it is in call sites that still set or assume `_nativeRawFetchTf = '1m'` after copying a display-TF host master.

## Replay Contract

Replay does not universally require a 1m master. It requires a master at or finer than the replay step when the UI/order model needs per-step OHLC. Evidence:

- Replay step interval can be explicit and can be finer than the native master; `_isSubBarStepMode()` detects `stepMs < rawMs * 0.92` (`chart v 1.4/chart/modules/replay-system.js:600-609`).
- Replay playback advances through `fullRawData` indices and writes `replayTimestamp` from `fullRawData[currentIndex].t` (`chart v 1.4/chart/modules/replay-system.js:639-656`).
- Rendering slices `fullRawData` and resamples to `currentTimeframe` (`chart v 1.4/chart/modules/replay-system.js:3017-3030`).
- Intrabar correctness depends on a finer series: `_getWalkForwardOhlcToPlayhead()` returns the first finer cache/master aggregation and returns null when no finer series exists (`chart v 1.4/chart/chart.js:6852-6907`).

Conclusion: "lazy 1m only when replay needs it" is contract-safe if the trigger is "replay is active and requested replay step / forming-candle/order granularity is finer than the current host master." It is not safe to wait for arbitrary pan or same-pair panel needs, because `applyReplayFrame` can mirror host data every frame for same-symbol/same-TF panels (`chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:537-570`) and replay update slices whatever is in `fullRawData` (`chart v 1.4/chart/modules/replay-system.js:3017-3030`).

## Panel-Feed Contract Under A Display-TF Host

Same-pair same-TF panels can remain zero-fetch mirrors. `_multichartMirrorHostTfSwitchIfReady()` clones parent `rawData`/`data`, requires parent current TF to match requested TF, validates bar cadence, and copies parent native marker (`chart v 1.4/chart/chart.js:2714-2766`). `applyReplayFrame` also keeps same-symbol/same-TF panels on the host mirror path (`chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:537-570`). This preserves the S6-b same-TF zero-fetch expectation documented at `docs/multichart-overhaul/BASELINE-RESULTS.md:184-211`.

Same-pair different-TF panels are not covered by a display-TF host unless their requested TF is coarser/equal and safely downsampled. The current bridge explicitly returns early for same-symbol host/panel TF mismatch (`chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:560-570`), and `_independentPanelTimeframeSwitch()` rejects a master coarser than the destination TF (`chart v 1.4/chart/chart.js:4566-4579`). This matches the deferred pain #2 baseline: mixed-TF same-pair panels self-fetch today (`docs/multichart-overhaul/BASELINE-RESULTS.md:213-230`). No fix is proposed here.

## `/smart` Request Shape And Chunking

The server route accepts high `/smart` limits: `/api/file/{file_id}/smart` declares `limit: int = 5000` and clamps it with `limit = min(limit, 100000)` (`chart v 1.4/chart/api_server.py:21572-21593`). However, the client `/smart` parameter builder currently clamps backtest and non-backtest `limit` values to 2000 (`chart v 1.4/chart/chart.js:5370-5399`). The QuestDB `/bars` path is also capped at 2000 by the API signature (`chart v 1.4/chart/api_server.py:22374-22382`) and by the client `_fetchBarsWindow()` (`chart v 1.4/chart/chart.js:5677-5685`).

The current chunking behavior is therefore client-driven. Backtest fetch sizes return 2000 for TFs up to 4h and 800 above that (`chart v 1.4/chart/chart.js:20798-20800`). Replay seek buffers call `_fetchBarsWindow(..., 2000)` (`chart v 1.4/chart/chart.js:5929-5976`). Pan loads size chunks to 2000 while actively playing and up to 5000 for manual pan, then call `_fetchCandlesCursor()` with that `barLimit` (`chart v 1.4/chart/chart.js:21231-21306`). `_fetchCandlesCursor()` itself can send up to 10000 to `/candles`, but the caller normally supplies 2000-5000 (`chart v 1.4/chart/chart.js:5732-5746`, `chart v 1.4/chart/chart.js:21288-21306`).

This explains why a large 1m hydration can become many sequential requests. The viewport-first hydration pump can call `checkViewportLoadMore()` repeatedly, up to 240 ticks, while `_panLoading` gates one in-flight request at a time (`chart v 1.4/chart/chart.js:4214-4248`, `chart v 1.4/chart/chart.js:21084-21088`). A ~100k-bar 1m target at the 2000-bar path is ~50 chunks by construction (`chart v 1.4/chart/chart.js:20798-20800`, `chart v 1.4/chart/chart.js:21288-21306`).

## Proposed Hybrid Shape

Description only, no code:

1. Host browse/switch decision: change the multichart host path that currently starts from `masterTf = '1m'` to request `displayTf` for first paint when display TF is not `1m`, preserving an explicit kill switch alongside the existing viewport-first gates (`chart v 1.4/chart/chart.js:3570-3574`, `chart v 1.4/chart/chart.js:3667-3718`, `chart v 1.4/chart/chart.js:4036-4052`).
2. Replay hydration decision: trigger 1m (or finer-than-step) hydration only when replay becomes active and the replay step/formation contract is finer than the current host master, using the existing cover/hydrate shape in `ensureReplayDataCoversTimestamp()` and `_hydrateMultichartViewportFirstMaster()` (`chart v 1.4/chart/chart.js:5156-5323`, `chart v 1.4/chart/chart.js:4125-4201`).
3. Pan-load decision: while host is in display-TF browsing mode, stop `_getReplayPanFetchTimeframe()` from forcing `1m` unless the replay hydration contract has been triggered (`chart v 1.4/chart/chart.js:6292-6302`).
4. Same-pair panel decision: keep same-TF panels on `_multichartMirrorHostTfSwitchIfReady()` / `applyReplayFrame` mirror paths; let same-pair different-TF panels continue through existing self-fetch/deferred-pain behavior (`chart v 1.4/chart/chart.js:2714-2766`, `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:537-570`).
5. Large lazy 1m request decision: when hydration is genuinely needed, use `/smart` with a high per-call limit rather than the current 2000-bar client clamp, because the server accepts up to 100000 (`chart v 1.4/chart/api_server.py:21572-21593`, `chart v 1.4/chart/chart.js:5370-5399`).

Single riskiest site: `_getReplayPanFetchTimeframe()` is the highest-risk change point because it is a compact predicate used by replay pan-load and currently collapses all multichart host/panel replay loading back to `1m` (`chart v 1.4/chart/chart.js:6292-6302`). If changed too broadly, replay can pan on display TF when the step/forming-candle contract actually needs a finer master; if left unchanged, it reintroduces the 1m tax during browsing.

## Verification

- Source files were read only. No `.js`, `.jsx`, `.py`, or existing markdown file was edited by this task.
- Only this new report file was created: `docs/multichart-overhaul/DIAG-B6-1m-master-tax.md`.
- I could not verify from code alone whether production diagnostics will report the lazy 1m hydration as 1-3 requests after a client-limit change; the server can accept 100000, but the current client clamps `/smart` to 2000 (`chart v 1.4/chart/api_server.py:21572-21593`, `chart v 1.4/chart/chart.js:5370-5399`).
- I could not verify the live runtime value of `window.__TALARIA_MC_ENABLE_VIEWPORT_FIRST`; the code requires it to be exactly true for the existing viewport-first host path (`chart v 1.4/chart/chart.js:4036-4052`).

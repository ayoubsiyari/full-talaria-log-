# DIAG-B7 - Host/Panel Window-Extent Mismatch After 6a

## Pre-Task Git Status

```text
 M "Sources Handoff/TalariaV16.jsx"
 M docs/multichart-overhaul/MANAGER-FINDINGS.md
```

## Scope And References

This is a read-only diagnosis for the B-FIX-6a live defect recorded in `docs/multichart-overhaul/MANAGER-FINDINGS.md` §6u. Canonical numbers are not re-measured here:

- S6-a before: host 91 fetches / 178k bars; panels copied from parent with fetches 0 and extendsFromParent 89-ish (`docs/multichart-overhaul/BASELINE-RESULTS.md:160-176`).
- S6-b rollback reference: host 4 fetches / 8000 bars; same-pair same-TF panels B/C/D fetches 0 (`docs/multichart-overhaul/BASELINE-RESULTS.md:178-211`).
- B-FIX-6a live: host 23-25 fetches / 40-43k bars, panels fetchedBars 0, and a new host/panel extent mismatch until replay aligns them (`docs/multichart-overhaul/MANAGER-FINDINGS.md:599-621`).

Unless otherwise noted, code evidence is in `chart v 1.4/chart/chart.js`.

## Mechanism

B-FIX-6a changes the multichart host first-paint source for non-replay display TFs. In `loadMultichartPanelFromHost()`, `displayTfMasterHost` is true only when `displayTf !== '1m'`, replay is not active, the `__TALARIA_MC_DISABLE_DISPLAY_TF_MASTER` kill-switch is not set, and the chart is the multichart host; then `masterTf` becomes `displayTf` instead of `1m` (`chart v 1.4/chart/chart.js:3553-3577`). The display-TF host branch fetches `displayTf` using `_getBacktestInitialFetchRange()` or `_getBacktestReplayFetchRange()`, with `_backtestFetchLimitForTimeframe(displayTf)`, and records the loaded native TF as `displayTf` (`chart v 1.4/chart/chart.js:3704-3724`, `chart v 1.4/chart/chart.js:3802-3812`).

Returning to `1m` does not use that 6a display-TF branch because `displayTfMasterHost` requires `displayTf !== '1m'` (`chart v 1.4/chart/chart.js:3570-3577`). The host therefore returns through the normal timeframe path. `setTimeframe()` starts the switch, may restore from cache, and when replay is inactive it does not enter the replay refetch branch (`chart v 1.4/chart/chart.js:19589-19660`). The live/server path `_loadTimeframeFromServer()` fetches a window for the requested timeframe, with an optional viewport-derived range, then replaces `rawData`, `data`, cursors, and `_nativeRawFetchTf` with that fetched result (`chart v 1.4/chart/chart.js:20487-20564`, `chart v 1.4/chart/chart.js:20571-20593`). In backtest replay-active paths, `_refetchBacktestTimeframeCore()` similarly computes a bounded history range and sets `_nativeRawFetchTf = timeframe` after ingest (`chart v 1.4/chart/chart.js:20891-20976`, `chart v 1.4/chart/chart.js:21013-21034`).

The host's 1m extent is bounded by the smart-window sizing. `_getBacktestInitialFetchRange('1m')` uses a session-start anchor with 320 lookback bars and an end at session end, while `_getBacktestReplayFetchRange('1m')` caps its internal bar budget at 2000 (`chart v 1.4/chart/chart.js:20716-20751`, `chart v 1.4/chart/chart.js:20754-20803`). `_backtestFetchLimitForTimeframe('1m')` returns 2000 (`chart v 1.4/chart/chart.js:20805-20808`), and `_buildSmartWindowParams()` clamps `/smart` limits to 2000 even if callers pass a larger value (`chart v 1.4/chart/chart.js:5377-5405`). So after 6a prevents the earlier wide 1m accumulation during high-TF browsing, the host's return-to-1m window is only the current bounded 1m smart window or a bounded cache hit, not the old deep 1m master.

Panels can retain a different extent because their ownership state is not continuously overwritten by the host in non-replay browsing. Same-pair panels seed `_panelFullRawData` from the parent replay master only when `_multichartSeedPanelMasterFromParent()` is called, and that function copies `parent.replaySystem.fullRawData` into the panel-local `_panelFullRawData` (`chart v 1.4/chart/chart.js:2653-2672`). The panel loader also reseeds replay state from `_panelFullRawData` when entering replay (`chart v 1.4/chart/chart.js:3988-4018`). Backtest TF cache can preserve prior larger windows: `_storeBtTfDataCacheEntry()` caps entries to 12,000 bars and refuses to overwrite an existing valid cache entry when it is more than 1.2x larger than the incoming rawData (`chart v 1.4/chart/chart.js:7002-7040`), while panels can warm parent backtest TF cache entries by reference (`chart v 1.4/chart/chart.js:3312-3340`) and restore them via `_applyBacktestTimeframeFromParentCache()` (`chart v 1.4/chart/chart.js:3292-3309`).

The exact mismatch root is therefore asymmetric extent replacement: the host's active `rawData` is replaced by the bounded 1m return window, while panels can keep or restore a previously seeded/cache/shared 1m window with wider first/last timestamps. The code path that would make panels shrink to host extent exists, but it is only a one-shot fast path, not a continuous non-replay invariant.

## Same-TF Mirror Contract

Same-pair same-TF panels do not continuously mirror the host window during browsing. They opportunistically mirror on command/TF-switch paths and during replay frames.

On `setTimeframe` panel commands, the iframe bridge first has an idempotency guard: if the panel already has the requested TF, native TF, non-empty data, and matching cadence, it returns before trying the host mirror (`chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:1557-1582`). If it does not return, it warms parent cache and calls `_multichartMirrorHostTfSwitchIfReady(tf)` once before falling back to `ch.setTimeframe(tf)` (`chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:1583-1605`).

`_multichartMirrorHostTfSwitchIfReady()` clones the host's current committed extent when it succeeds: it requires embed panel, same-pair, parent not switching, parent current TF equal to the requested TF, compatible native TF, non-empty parent data, and cadence match; then it assigns `this.rawData = parent.rawData`, `this.data = parent.data`, copies server cursors, and adopts `parent._nativeRawFetchTf` (`chart v 1.4/chart/chart.js:2714-2766`). If this mirror runs after the host has committed the narrow 1m window, panels follow the host's narrower extent. If it misses or races while the parent is still switching, the panel falls through to cache/fetch/local switch paths and can retain a wider seed.

During replay frames, the same-symbol same-TF path is more authoritative. `applyReplayFrame()` treats same-symbol panels as host-driven, skips different-TF mirrors, dedups repeated paused timestamps, calls `_syncReplayMasterFromParentIfCovers(ts)`, then tries `forceSamePairParentDataMirror()` (`chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:537-596`). `forceSamePairParentDataMirror()` paints exactly what the host has through `rs.applyMultichartMirrorFrame(payload)` or directly assigns `ch.rawData = pc.rawData` and `ch.data = pc.data` on fallback (`chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:986-1033`). That replay-frame path is why same-TF panels converge once replay is running; it is not active during ordinary non-replay browsing.

## Why Replay Heals It

Replay creates a shared active replay source and frame protocol. Entering replay stores the chart's current raw data as `ReplaySystem.fullRawData`, detects `rawTimeframe`, initializes replay timestamps, and later `updateChartData()` slices `fullRawData` into `chart.rawData` and resamples for display (`chart v 1.4/chart/modules/replay-system.js:2408-2495`, `chart v 1.4/chart/modules/replay-system.js:2978-3030`).

The host-side lazy hydration paths install a 1m replay master. `_hydrateMultichartViewportFirstMaster()` fetches `1m`, sets `_nativeRawFetchTf = '1m'`, ingests the smart window, then sets `replay.fullRawData = [...this.rawData]` and `replay.rawTimeframe = '1m'` (`chart v 1.4/chart/chart.js:4132-4154`, `chart v 1.4/chart/chart.js:4164-4218`). `ensureReplayDataCoversTimestamp()` similarly forces `replayRawTf = '1m'` for multichart embeds and for host viewport-first hydration, fetches that raw TF if needed, ingests it, and writes `replay.fullRawData` / `replay.rawTimeframe` for non-independent panels (`chart v 1.4/chart/chart.js:5163-5230`, `chart v 1.4/chart/chart.js:5260-5330`).

The convergence point is the first successful same-pair replay frame or replay catch-up after the host has an active covering replay master. `_syncReplayMasterFromParentIfCovers()` checks the parent `replaySystem.fullRawData`, copies the parent master into `_panelFullRawData`, copies parent `rawData`/`data` when TFs match, copies cursors/total, and reseeds local replay before seeking to the shared timestamp (`chart v 1.4/chart/chart.js:5091-5149`). Then the replay bridge's same-symbol same-TF frame path forces host data mirroring (`chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:537-596`, `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:986-1033`). At that point host and panels stop being independently-windowed browse charts and become consumers of the same replay timestamp/master contract.

## Minimal Fix Options

### Option A - Host Loads A Panel-Matching/Wider 1m Window On Return

Change the host's return-to-1m decision so it requests enough 1m range to match the panel/previous extent instead of the current bounded smart-window default. The likely sites are the range/limit decisions feeding `_loadTimeframeFromServer()` and `_refetchBacktestTimeframeCore()` (`chart v 1.4/chart/chart.js:20487-20564`, `chart v 1.4/chart/chart.js:20716-20808`, `chart v 1.4/chart/chart.js:20891-20976`).

Risk: this preserves panel width and replay boot alignment, but it spends host fetches/bars to regain a wide 1m window, directly threatening the B-FIX-6a tax reduction recorded in §6u (`docs/multichart-overhaul/MANAGER-FINDINGS.md:599-621`). It does not threaten the panel `fetches=0` guarantee, because panels can still copy, but it moves cost back onto the host.

### Option B - Same-TF Panels Re-Mirror Host Current Extent

Make same-pair same-TF panels reliably re-mirror the host's committed `rawData`/`data` extent after the host TF switch completes. The exact existing primitive is `_multichartMirrorHostTfSwitchIfReady()`, which already clones host `rawData`, `data`, cursors, and native TF (`chart v 1.4/chart/chart.js:2714-2766`). The fragile site is the iframe `setTimeframe` command path: it can return early before the mirror, or it can call the mirror while the parent is still switching and then fall through (`chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:1557-1605`).

Risk: this is the smallest network-safe change. It should preserve S6-b/6a panel `fetches=0` because it adds no panel fetch and uses host memory only. It may make panels shrink to the host's narrower extent, so it fixes alignment by following the host rather than preserving the wider visual range. Replay boot alignment risk is low because replay already re-establishes master sharing through `_syncReplayMasterFromParentIfCovers()` and same-TF replay frames (`chart v 1.4/chart/chart.js:5091-5149`, `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:537-596`).

### Option C - Trim Or Extend One Side To The Other

Add an explicit reconcile step that compares host and panel first/last timestamps and trims/extends either side. The code has span-aware pieces, for example `_topUpMasterFromSharedStore()` only replaces a panel master when a picked shared-store span is wider (`chart v 1.4/chart/chart.js:2627-2647`), and `_tryExtendReplayMasterFromParent()` merges earlier/later parent bars into panel replay masters (`chart v 1.4/chart/chart.js:4924-4979`). A new reconcile layer could use similar first/last timestamp comparison.

Risk: this is broader than necessary and can blur ownership. Extending panels from host is safe only when host has the wider span; trimming panels to host is effectively Option B with extra code; extending host from panel/shared store risks making panels data owners, which is opposite the S6-b same-pair owner guarantee (`docs/multichart-overhaul/BASELINE-RESULTS.md:202-211`).

## Safest Fix

The safest minimal fix is Option B: make the existing same-pair same-TF mirror run after the host has committed its final TF data, and do it through `_multichartMirrorHostTfSwitchIfReady()` / the iframe `setTimeframe` command path (`chart v 1.4/chart/chart.js:2714-2766`, `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js:1557-1605`). This aligns all same-TF panels to one browse window without adding network load, so it best protects the S6-b/6a `fetches=0` panel guarantee. It accepts the 6a design choice that the host may browse on a narrower display/1m window until replay explicitly hydrates a replay master.

## Flagged Risk / Unverified Runtime Fact

I did not verify whether the mismatch reproduces with `window.__TALARIA_MC_DISABLE_DISPLAY_TF_MASTER` set. The code strongly supports 6a causality because the new branch is guarded by that flag and only runs for non-replay host display-TF loads (`chart v 1.4/chart/chart.js:3570-3577`), but runtime flag reproduction requires a browser scenario and is not asserted here.

## Verification

- Source files were read only. No `.js`, `.jsx`, or existing markdown file was edited by this task.
- Only this new report file was created: `docs/multichart-overhaul/DIAG-B7-host-panel-window-mismatch.md`.
- Claims I could not verify from code alone: the exact live event order that leaves a specific panel wider than host after the PO's TF sweep, and the kill-switch reproduction state with `__TALARIA_MC_DISABLE_DISPLAY_TF_MASTER`.

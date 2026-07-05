# DIAG-B10 - Armed-Idle Pan Drift

## Pre-Task Git Status

Captured before this read-only diagnosis:

```text
 M docs/multichart-overhaul/MANAGER-FINDINGS.md
```

No source file was edited for this diagnosis.

## Scope

Repro reported after B-FIX-A / b22:

- 2x2, same pair, backtest armed but not playing.
- All sync toggles reported OFF.
- Host A on `4h` or any TF; panels B/C/D on `1m`.
- Dragging host A into empty space to load older candles still makes panels drift horizontally.
- Panels also look vertically/visually wrong: compressed candles and wrong-looking scale.

B-FIX-A fixed three same-pair mirror commit sites. This repro does not primarily use those sites.

## Answer 1 - Exact Call Path

### Static Path That Reaches `_tryExtendReplayMasterFromParent()`

The code path that can extend a same-pair panel from the host during a host pan is the visible-range sync bridge path:

1. Host emits `chartScrolled` with `panSync` while dragging.
   Evidence: `chart.js` dispatches `chartScrolled` and includes `panSync` from the active pan state in the event detail (`chart v 1.4/chart/chart.js`, function that dispatches `chartScrolled`, near the event detail with `panSync`).

2. `sync-bridge.js` packages that into a `visibleRange` message with `panSync`, `offsetX`, `candleWidth`, `sourceTimeframe`, and visible time/window data.
   Evidence: `chart v 1.4/chart/multichart-prod/sync-bridge.js`, outbound `chartScrolled` listener builds `pending.visibleRange` and sends fields including `panSync`, `offsetX`, `candleWidth`, `zoomLevelIndex`, and `plotWidthPx`.

3. The manager normally gates `visibleRange` fan-out on Date/Time range sync.
   Evidence: `chart v 1.4/chart/multichart-prod/multichart-manager.js`, `_fanOut()`, returns for `visibleRange` when both `syncMode.visibleRange` and `syncMode.timeSync` are false.

4. If a `visibleRange` message reaches an iframe anyway, iframe inbound code applies it. Iframe bridges do not apply their own local sync-mode gate; the comment explicitly says iframe bridges must not gate inbound because the manager already filtered fan-out.
   Evidence: `chart v 1.4/chart/multichart-prod/sync-bridge.js`, `applyInbound()`, sync-mode gate exists only when `syncModeGate` is set; comment says iframe bridges must not gate inbound.

5. For `panSync`, `applyInbound()` schedules `applyVisibleRange()`.
   Evidence: `chart v 1.4/chart/multichart-prod/sync-bridge.js`, `applyInbound()` branch `if (m.type === 'visibleRange' && m.panSync) scheduleInboundPanRangeApply(m)`.

6. In `applyVisibleRange()`, if `panSync` is true, the path calls `applyPanDragFollow()` unless earlier range-sync branches consume it.
   Evidence: `chart v 1.4/chart/multichart-prod/sync-bridge.js`, `applyVisibleRange()` pan branch calls `applyPanDragFollow(chart, m, panFollowOpts)`.

7. `applyPanDragFollow()` may call `ensureHistoryForVisibleStart()` on non-panSync release messages; `applyMatchedViewport()` also calls it. `ensureHistoryForVisibleStart()` calls `_tryExtendReplayMasterFromParent({ lite: true })` first.
   Evidence: `chart v 1.4/chart/multichart-prod/sync-bridge.js`, functions `ensureHistoryForVisibleStart()`, `applyPanDragFollow()`, and `applyMatchedViewport()`.

8. `_tryExtendReplayMasterFromParent()` then prepends host master bars into the panel's `replaySystem.fullRawData`.
   Evidence: `chart v 1.4/chart/chart.js`, `_tryExtendReplayMasterFromParent()`.

### Important Gate Finding

If all sync toggles are truly OFF and no forced/initial visible-range message is in flight, the normal manager path should not deliver host pan `visibleRange` messages to panels. `_fanOut()` blocks them. Also, `panel-cmd-bridge.js` replay-frame handling does not explain this mixed-TF repro: in `applyReplayFrame()`, same-symbol different-TF panels return early unless `_multichartFinerSamePairPanelSelfOwns()` is true.

Therefore, the static trace says:

- The B-FIX-A sites are bypassed for same-symbol different-TF frames.
- `_tryExtendReplayMasterFromParent()` is reached only if a panel receives a visible-range/pan-sync/release path, or if panel-local pan/replay-left-load code runs.
- If the PO's "all sync OFF" state is accurate, the live trace should first verify whether a `visibleRange` message still reaches B/C/D. If it does, the sync-off gate is leaking or the UI state is not what the bridge sees.

### Read-Only Instrumentation To Confirm Live

For one live run, log counters (not source for this task; proposed future temporary instrumentation only):

- In `multichart-manager.js::_fanOut()`: `type`, `sourceId`, `syncMode.visibleRange`, `syncMode.timeSync`, `dropped/forwarded`.
- In `sync-bridge.js::applyInbound()`: iframe `chartId`, `msg.type`, `msg.panSync`, `msg.forceInitialSync`, `msg.source`, whether `applyVisibleRange()` runs.
- In `sync-bridge.js::ensureHistoryForVisibleStart()`: `startTime`, first local bar, whether `_tryExtendReplayMasterFromParent({ lite: true })` returned true.
- In `chart.js::_tryExtendReplayMasterFromParent()`: `lite`, `earlier.length`, `later.length`, `prevReplayIndex`, old/new `offsetX`, whether `_multichartPendingMasterResample` was set.
- In `chart.js::_schedulePanSyncFollowRender()` / `_flushMultichartPendingMasterResample()`: whether the deferred render or resample executes after compensation.

## Answer 2 - Why Existing Compensation Fails

The compensation inside `_tryExtendReplayMasterFromParent()` is real but not the final viewport decision in this path.

### Compensation That Does Run

In `chart v 1.4/chart/chart.js`, `_tryExtendReplayMasterFromParent()`:

- Requires same-pair, non-finer-owner, replay active.
- Reads parent `replaySystem.fullRawData`.
- Computes `earlier` from host bars with timestamps before the local first bar.
- Builds `merged = earlier.concat(localMaster)` when `earlier.length > 0`.
- Saves `prevReplayIndex` from the panel replay system.
- Assigns `replay.fullRawData = merged` and `_panelFullRawData = merged`.
- If `earlier.length > 0`, shifts `replay.currentIndex` by `earlier.length`.
- Computes display bars added via `_countReplayBackwardDisplayBarsAdded()` and applies `this.offsetX -= shiftBars * spacing`.

So `prevReplayIndex` is finite in the normal armed replay case: if `replay.currentIndex` is finite it is used; otherwise the fallback is `Math.max(0, localMaster.length - 1)`.

### Why It Still Drifts

There are two overwrite mechanisms after that compensation:

1. `sync-bridge.js` visible-range application overwrites viewport geometry after the data extension.

   In `applyPanDragFollow()`, after optional history extension, the function sets `chart.candleWidth` from the leader's `m.candleWidth`, then sets `chart.offsetX` either from the leader `offsetX`, from the leader `endTime`, or from scaled `offsetX`.

   Evidence:

   - `chart v 1.4/chart/multichart-prod/sync-bridge.js`, `applyPanDragFollow()`: assigns `chart.candleWidth = srcCw`; then can set `chart.offsetX = plotW - (idxAtRight + 1) * spacing`; fallback sets `chart.offsetX` from `m.offsetX`.
   - `applyLightweightPanFollow()` does the same lower-latency version: `chart.candleWidth = srcCw`; `chart.offsetX = scaled m.offsetX`.
   - `applyWallClockDateRange()` for different TF maps host wall-clock range onto the panel and assigns both `chart.candleWidth` and `chart.offsetX`.

   That makes the panel's compensated `offsetX` from `_tryExtendReplayMasterFromParent()` transient. The final rendered offset is the host-led visible-range offset.

2. `_tryExtendReplayMasterFromParent({ lite: true })` can defer resampling during pan-follow bursts.

   In `_tryExtendReplayMasterFromParent()`, after the compensation block, it computes `inFastPan = lite && (_isPanSyncFollowBurst() || _isMultichartLocalPanLeader())`.

   If `inFastPan` is true and `_multichartViewportMirroredWithHost` is true, it only reuses parent `rawData/data` when host TF equals panel TF. In the reported host `4h` / panel `1m` case, that same-TF guard fails, so it does not refresh `chart.data`.

   If `inFastPan` is true and the mirrored-host branch is not taken, it sets `_multichartPendingMasterResample = true` and schedules a pan-follow render instead of immediately calling `replay.updateChartData(false)`.

   Evidence:

   - `chart v 1.4/chart/chart.js`, `_tryExtendReplayMasterFromParent()`, branch after the compensation block around `inFastPan`.
   - `chart v 1.4/chart/chart.js`, `_schedulePanSyncFollowRender()` only calls `render()` while `_isPanSyncFollowBurst()` is true.
   - `chart v 1.4/chart/chart.js`, `_flushMultichartPendingMasterResample()` later calls `rs.updateChartData(false)` and renders, but only after the host-master sync poll decides the burst is over.

The result is that compensation can be both **not final** and **not immediately represented in `chart.data`**. The visible-range follow path then positions the panel by host range/offset, not by the panel's preserved visible window.

### What To Check In Live Counters

The decisive live facts are:

- `earlier.length`: if zero, panel is not extending and drift is entirely visible-range/viewport.
- `prevReplayIndex`: should be finite; if not, current code falls back to local end.
- `offsetX` after compensation vs after `applyPanDragFollow()` / `applyWallClockDateRange()`: if the latter differs, compensation is overwritten.
- `_multichartPendingMasterResample`: if true, the panel rendered with old `chart.data` while its `replay.fullRawData` already changed.

## Answer 3 - Scale / Compressed Candles

The "compressed candles" symptom is mostly not a separate price-scale ownership bug. It is downstream of the same horizontal visible-range path.

For different TFs, `sync-bridge.js::applyWallClockDateRange()` maps the host wall-clock window onto the panel's `1m` data:

- It finds `iL` and `iR` in the panel's `1m` data for the host start/end time.
- It computes `numBars = iR2 - iL2 + 1`.
- It sets `desiredSpacing = widthPx / numBars`.
- It assigns `chart.candleWidth` from that spacing.
- It assigns `chart.offsetX = widthPx - (iR2 + 1) * spacing`.

For a host `4h` window, the corresponding `1m` window contains many more bars. So `desiredSpacing` becomes small and the panel's candles look compressed. That is horizontal compression caused by forced wall-clock viewport matching across TFs, not by B-FIX-A prepend math.

The price Y-scale then follows the wrong horizontal window:

- `chart.js` render computes `visStart`/`visEnd` from `offsetX` and candle spacing.
- It builds `priceVisible` from that window.
- It computes min/max from `priceVisible`.
- It sets `this.yScale = d3.scaleLinear().domain([domainMin, domainMax])`.

Evidence: `chart v 1.4/chart/chart.js`, render scale calculation around `_getViewportBarRange()`, `priceVisible`, min/max scan, and `this.yScale = d3.scaleLinear()`.

So the vertical price scale can look wrong because the visible horizontal window is wrong/too broad/too compressed. `sync-bridge.js::refitPriceAutoScale()` only forces auto-scale flags; it does not copy host min/max. The root remains horizontal window selection.

## Answer 4 - Real Fix Site And Double-Compensation Risk

### Minimal Fix Site

The minimal real fix site is `sync-bridge.js::applyVisibleRange()` / its pan-follow helpers, not the B-FIX-A mirror commit sites.

Specifically, host-led `visibleRange`/`panSync` must not overwrite a same-pair mixed-TF panel's independent viewport when sync is reported OFF. If a same-pair panel is only supposed to data-share, then the bridge should allow `_tryExtendReplayMasterFromParent()` to extend data but must preserve the panel's own `offsetX`, `candleWidth`, and visible window.

The single most precise boundary is before the pan-follow viewport assignment in `applyVisibleRange()`:

- same pair as host,
- replay active / armed,
- same-symbol different-TF,
- visible range sync/time sync OFF,
- incoming host-led `visibleRange` or `panSync`.

In that state, do not call `applyPanDragFollow()`, `applyWallClockDateRange()`, `applyLightweightPanFollow()`, or `applyTradingViewVisibleRange()` as a viewport mutation. If data extension is needed, call/allow `_tryExtendReplayMasterFromParent()` as a data-only operation, then keep the existing panel viewport.

### Secondary Fix Site

If live logging proves `_tryExtendReplayMasterFromParent({ lite: true })` is being used during a pan-follow burst, then `_tryExtendReplayMasterFromParent()` also needs a narrower "preserve viewport after extend" mode for same-pair mixed-TF panels. That mode should not schedule a render path that lets sync-bridge overwrite offset/candle width.

### Interaction With B-FIX-A

There is no double-compensation risk if the fix is placed in `sync-bridge.js` to prevent host visible-range viewport overwrites in this scenario.

B-FIX-A applies at mirror commit boundaries:

- `_multichartMirrorHostTfSwitchIfReady()`,
- `_tryMirrorFrameFromParentData()`,
- `forceSamePairParentDataMirror()`.

This repro's mixed-TF path bypasses those: `panel-cmd-bridge.js::applyReplayFrame()` returns early for same-symbol different-TF panels unless B8 owner mode is active. The failing path is visible-range/pan-follow and/or `_tryExtendReplayMasterFromParent()`.

Double compensation would become a risk only if a future fix also adds another prepend delta inside `_tryExtendReplayMasterFromParent()` itself. That function already compensates when `earlier.length > 0`; the observed problem is that later viewport code overwrites it.

## Verification

- Source files were read only; no `.js`, `.jsx`, `.ts`, `.py`, or build files were edited by this task.
- Deliverable created: `docs/multichart-overhaul/DIAG-B10-armed-idle-pan-drift.md`.
- Pre-task git status:

```text
 M docs/multichart-overhaul/MANAGER-FINDINGS.md
```

- Post-task git status:

```text
 M docs/multichart-overhaul/MANAGER-FINDINGS.md
?? docs/multichart-overhaul/DIAG-B10-armed-idle-pan-drift.md
```

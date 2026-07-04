# DIAG-B1 - Outside-Viewport Replay Desync

## Trigger

Observed from the Phase-0/Manager baseline, not re-run locally in this task:

- Layout: 2x2 multichart backtest.
- Action: replay playback.
- Dominant symptom: follower panels repeatedly log `No candles drawn! All N candles are outside viewport. Skipped: N`, with `N` climbing as replay advances.
- Sync state that matters: Date Range / visible-range sync ON is the important trigger condition in the code path. With `chart._multichartVisibleRangeSyncOn === true`, the replay recovery helpers treat the panel viewport as host/sync-owned and refuse to recenter to the replay playhead. This matters most when replay frames keep advancing data while the current `offsetX` no longer overlaps the panel's own `chart.data`.

I could not run the live browser scenario in this environment, so the trigger above is based on the Manager baseline plus code tracing.

## Warning Site

Function: `drawCandlesticks` in `chart v 1.4/chart/chart.js`.

The warning fires when `drawSeries.length > 0` but `drawn === 0`. `drawSeries` is derived from `visible`, which is built from the current viewport index window. Each item is skipped when either:

- `dataIndexToPixel(idx)` maps the candle outside the horizontal draw bounds, or
- `_isOhlcVerticallyInPlot(d)` rejects it against the current Y scale.

The repeated flood means the panel still has candle data (`drawSeries.length > 0`) but every candidate candle is rejected before paint. In the traced replay path, the primary desync is horizontal/viewport first: replay frames keep replacing or extending `chart.data`, while `offsetX` remains controlled by an older visible-range/date-range sync position. `_scheduleViewportEmptyRecovery` tries to fix this after the failed draw, but the multichart replay recovery path can be blocked by the same sync-ownership guard.

## Root Cause

Single root cause: `_finishMultichartMirrorRender` in `chart v 1.4/chart/modules/replay-system.js`, specifically the recovery branch that handles `needsRecovery`.

Mechanism:

1. Host tile A broadcasts replay frames via `_multichartBroadcastReplayFrame`.
2. Iframe panels receive `replayFrame` in `applyReplayFrame` in `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js`.
3. `applyReplayFrame` calls `replaySystem.applyMultichartMirrorFrame(args)`.
4. `applyMultichartMirrorFrame` mutates DATA state for the panel: same-pair panels can share `parent.rawData` / `parent.data` by reference in `_tryMirrorFrameFromParentData`; other paths assign `chart.rawData` and `chart.data` from the mirror raw series.
5. The final render path runs `_finishMultichartMirrorRender`.
6. `_finishMultichartMirrorRender` computes `needsRecovery` via `chart._multichartViewportNeedsRecovery()`. When true, it calls:

   `chart._syncIndependentPanelViewportIfNeeded({ resetPriceScale: false, render: false })`

7. `_syncIndependentPanelViewportIfNeeded` in `chart.js` refuses to recenter whenever `replay.userHasPanned` is true OR `this._multichartVisibleRangeSyncOn` is true:

   `const userOwned = !!(replay && replay.userHasPanned) || !!this._multichartVisibleRangeSyncOn;`

   If `userOwned`, it returns `false` and does not set `offsetX`.

8. `_finishMultichartMirrorRender` does not check that return value and does not fall back to its already-computed `getReplayAutoScrollState(chart)` offset in the `needsRecovery` branch. It proceeds to `constrainOffset()` and `render()` with the stale `offsetX`.

Result: a single replay-frame path mutates DATA state every frame and also tries to correct VIEWPORT state, but the viewport correction is vetoed by the visible-range sync ownership guard. That leaves `chart.data` advancing while `offsetX` continues to describe an older/different visible range. As replay advances, the loaded/rendered prefix grows, so the warning's `N` climbs, matching the baseline.

This is gated behind multichart/embed behavior:

- `applyReplayFrame` is in the iframe panel bridge.
- `_tryMirrorFrameFromParentData` requires `_isMultichartEmbedPanel()`.
- `_syncIndependentPanelViewportIfNeeded` is specifically a multichart replay panel recovery helper.
- `_multichartVisibleRangeSyncOn` is set by the multichart sync bridge configuration.

Single-chart replay uses `updateChartData` and `syncReplayViewportToPlayhead` directly, so this exact veto/fallback gap is not on the plain single-chart path.

## I3 Viewport/Data Coupling

The offending path violates the spirit of I3 during replay mirroring:

- `applyMultichartMirrorFrame` / `_tryMirrorFrameFromParentData` updates bar arrays and replay timestamps.
- `_finishMultichartMirrorRender` also tries to repair `offsetX` in the same frame path.
- When visible-range sync is ON, the viewport repair is delegated to a helper that treats sync-owned viewport as untouchable and returns early.

So the actual runtime effect is data advancing while viewport remains stale. It is not a duplicate-fetch/contiguity issue; Phase-0 showed `seams = 0` and fetches near zero in the failing baseline.

## b580 Caveat Verdicts

- Pan-load `offsetX` compensation using resampled display-bar count: CLEARED. The failure occurs during replay playback with fetches near zero; this path is in `checkViewportLoadMore` after backward/forward pan-load merges and is not required for frames where host replay data is mirrored by reference.

- Timeframe-switch window range derived from captured viewport in `_loadTimeframeFromServer`: CLEARED for this symptom. That code is explicitly gated to backtest mode when replay is not active. The failing baseline is replay playback, and the replay-active timeframe path goes through replay hot-swap/mirror logic instead.

- Same-pair mirror idle dedup in `panel-cmd-bridge.js` `applyReplayFrame`: CLEARED as the direct cause. The dedup only skips paused/non-animated repeated timestamps. During playback `args.isPlaying` is true or animated frames are active, so frames continue into `applyMultichartMirrorFrame`. It may reduce idle repaint noise, but it does not explain data advancing with stale `offsetX`.

## Proposed Fix Sketch

Minimal kill-switchable change, words only:

- Add a runtime flag such as `window.__TALARIA_MC_DISABLE_REPLAY_VIEWPORT_FOLLOW_FIX = true`.
- In the replay mirror finish path, when `passivePlay` is true or `detail.isPlaying` is true and `needsRecovery` is true, do not let visible-range/date-range sync veto replay follow forever.
- Either:
  - call `replay.syncReplayViewportToPlayhead(chart, { forceRecenter: true, resetPriceScale: false, render: false })`, or
  - apply `getReplayAutoScrollState(chart).offsetX` directly,
  only for passive iframe replay playback when no local drag is active.
- Keep it gated to `_isMultichartEmbedPanel()` / passive replay frames so single-chart behavior remains unchanged.
- Keep data and viewport channels separated in design: replay DATA mirror should notify that playhead data advanced; viewport follow should be a replay-follow viewport correction, not a data merge side effect. If the final implementation stays in `_finishMultichartMirrorRender`, it should be treated as a narrow recovery guard, not a general data handler refactor.

Invariant constraints for the fix:

- I3: do not add a bridge message that mutates both arbitrary viewport and data state. If the existing mirror path must perform recovery, restrict it to replay-follow offset correction after data has already been applied.
- I7: gate to multichart embed replay panels.
- I8: include a runtime kill-switch.
- I5: do not touch fetch, merge, or timeframe-switch logic for this bug.

## Verification Done

- Located required functions by name:
  - `drawCandlesticks`
  - `_scheduleViewportEmptyRecovery`
  - `_syncIndependentPanelViewportIfNeeded`
  - `_multichartViewportNeedsRecovery`
  - `applyReplayFrame`
  - `applyMultichartMirrorFrame`
  - `_finishMultichartMirrorRender`
  - `syncReplayViewportToPlayhead`
  - `_loadTimeframeFromServer`
  - `checkViewportLoadMore`
- No source code was changed for this diagnosis.
- `node --check` was not run because this task made no JS edits.
- I could not run `window.__mcDiagReport()` live in this environment. In the prior closeout, Docker/browser access was not available from the shell; this diagnosis relies on the Manager baseline and code trace.

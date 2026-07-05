# DIAG-B4 Switch Latency

Read-only diagnosis for the single-chart-fast vs multichart-slow host pair+TF switch delta.

## Reproduction Status

I could not run the live browser scenario in this environment. Findings below are based on `MANAGER-FINDINGS.md` §6i/§6j, `DIRECTOR-DECISIONS.md` D-006, `docs/multichart-panel-data-and-rendering.md` §3.3, and static trace by function name. Live stack logging is UNVERIFIED.

## Primary Delta

The multichart-specific entry condition is the mounted `window.__multichartGrid` command bus routing a host tile A symbol switch through the multichart panel loader:

`TalariaV8bLive.jsx` symbol picker -> `window.__multichartGrid.loadFileOnPanel(...)` / `runCommand("loadFile", ...)` -> `MultichartGrid.jsx` `loadFileOnPanel()` -> `applyHostCommand("loadFile", ...)` -> `chart.js` `loadMultichartPanelFile()` -> `loadMultichartPanelFromHost()`.

For host A, this branch is taken when `pid === HOST_PANEL_ID` and the chart is a backtest/replay chart. `applyHostCommand("loadFile")` chooses `loadMultichartPanelFile()` whenever `ch.isBacktestMode || ch.backtestingSession` is true. `loadMultichartPanelFile()` then calls `loadMultichartPanelFromHost()`, whose backtest loader hard-sets `masterTf = '1m'`.

That differs from the normal `loadFileData()` pair-switch path, which sets `requestTimeframe = anchorToHostPlayhead ? '1m' : (this.currentTimeframe || '1d')`. For host A, `anchorToHostPlayhead` is false, so the non-multichart path can load at the current/display timeframe. The multichart host path instead uses the panel/replay-master loader and makes host A build a 1m master even when the requested display is `4h`.

Function + branch: `MultichartGrid.jsx` `applyHostCommand("loadFile")`, the `useMc` branch to `ch.loadMultichartPanelFile(...)`, plus `chart.js` `loadMultichartPanelFromHost()` setting `masterTf = '1m'`.

## Contract vs Waste

The contract in `docs/multichart-panel-data-and-rendering.md` §3.3 is real for iframe panels: backtest replay needs a 1m master so panels can stay candle-for-candle aligned and same-pair panels can clone host data instead of fetching. That contract does not prove host A must synchronously hydrate the entire 1m history before first useful paint.

The measured waste is the synchronous foreground hydration: a `4h` switch needs only a small visible window for first paint, but the multichart host enters a 1m-master path, then `_fillViewportHistoryAfterTfSwitch()` repeatedly backfills older history. A viewport-first host load followed by background master hydration should preserve the panel/replay contract as long as replay playhead coverage is available first and panels clone/hydrate only from contiguous host master edges. What would break is not the eventual 1m master, but any panel/replay operation that assumes the full left history is already present immediately after the host switch. That risk should be handled by gated background hydration and existing `ensureReplayDataCoversTimestamp()` / pan-load coverage checks, not by blocking first paint on the full session.

## Driver Loop

For one multichart host pair+TF switch, the ordered static sequence is:

1. V9 symbol selection calls `grid.loadFileOnPanel()` / `grid.runCommand("loadFile")` for focused panel A.
2. `MultichartGrid.jsx` `loadFileOnPanel()` calls `applyHostCommand("loadFile")`.
3. `applyHostCommand("loadFile")` uses `loadMultichartPanelFile(fid, { force })`.
4. `loadMultichartPanelFile()` calls `loadMultichartPanelFromHost()`.
5. `loadMultichartPanelFromHost()` loads an initial `masterTf = '1m'` smart window, ingests it, enters/reseeds replay, and renders.
6. The topbar TF change routes through `grid.runCommand("setTimeframe")` -> host `setTimeframe()`.
7. `setTimeframe()` in backtest replay calls `_applyBacktestTimeframeFromCache()` or `_refetchBacktestTimeframeCore()`.
8. `_hotSwapBacktestReplayTimeframe()` calls `_finishTfSwitchViewportRestore()`.
9. `_finishTfSwitchViewportRestore()` schedules `_fillViewportHistoryAfterTfSwitch(0)`.
10. `_fillViewportHistoryAfterTfSwitch()` repeatedly calls `checkViewportLoadMore('backward', true)` until the viewport is covered/no more left/retry cap.
11. `checkViewportLoadMore()` fetches chunks via `_fetchCandlesCursor()` and merges them into `replaySystem.fullRawData`.
12. Each backward chunk calls `replaySystem.updateChartData(false)`, updates display data, and schedules/causes rendering; the loop recurs after `pollMs`.

The ~50 fetches measured in §6i match this loop: initial multichart 1m master window plus repeated 1m backward chunking, with chunk size capped by client/server limits.

## Render Attribution

The main render hook for coalescing is the per-chunk merge path in `checkViewportLoadMore()`: after each backward replay chunk, `replaySystem.updateChartData(false)` rebuilds the visible slice/resample and downstream rendering follows through replay/chart render paths. `chart.js` `scheduleRender()` only sets `renderPending = true` for normal idle cases, but replay-playing and some bridge paths call `render()` directly, so coalescing needs to sit around hydration/chunk application, not only around generic `scheduleRender()`.

Host pair-load also calls `_scheduleCoalescedViewportCommit(...)`, but that only coalesces the final viewport reset for the initial load. It does not coalesce the subsequent `_fillViewportHistoryAfterTfSwitch()` chunk loop.

Idle-panel fan-out repaint sources:

- `chart.js` `_broadcastMultichartMasterExtendIfHost()` sends `extendReplayMasterFromHost` when Date-Range/visible-range sync is on; `panel-cmd-bridge.js` handles that command by calling `_tryExtendReplayMasterFromParent()` and then `scheduleRender()` / `render()`.
- `MultichartGrid.jsx` sends `syncFromHost`, `syncReplayFromHost`, and `replayFrame` to ready iframes during replay/session sync. `panel-cmd-bridge.js` `syncFromHost` and `forceSamePairParentDataMirror()` can mirror host data and call `render()` directly.
- `sync-bridge.js` `visibleRange` handling also schedules renders when range sync messages are applied.

Those paths explain B/C/D repaint counts with `fetches = 0`: idle panels are not fetching, but they are being told to mirror or repaint host state.

## Per-Fetch Latency Feasibility

The current client path is biased toward small requests:

- `_buildSmartWindowParams()` caps client `/smart` query `limit` to `2000`.
- `_fetchSmartWindow()` tries `_fetchSmartWindowViaBars()` first.
- `_fetchSmartWindowViaBars()` calls `_fetchBarsWindow()`.
- `_fetchBarsWindow()` sends `/api/file/{id}/bars?...limit=...`, and the server `/bars` route caps `limit` at `2000`.
- `bar_budget.MAX_BARS` is `2000`.

The server `/api/file/{id}/smart` route itself accepts `limit` up to `100000`, and the tile/binary path passes that `limit` into `_tiles_read_window()`. Therefore, yes: the server has a feasible higher-limit `/smart` shape that could return a 90-100k session window in roughly 1-3 requests, provided the client deliberately bypasses the `/bars` 2k bar-budget path and sends a higher `/smart` limit. This is a client-path/route-selection issue, not an obvious server-capacity proof; live server timing for a 100k `/smart` tile response is UNVERIFIED.

## Verdict

The multichart branch responsible is `MultichartGrid.jsx` host `loadFile` routing through `loadMultichartPanelFile()` into `chart.js` `loadMultichartPanelFromHost()`, which uses `masterTf = '1m'` for host A because the host is treated like a multichart panel/replay master source. The foreground full-history hydration that follows is waste for first paint, even though eventual 1m master hydration is contractual for replay/panel feeding.

D-006 mapping:

- Primary: viewport-first switch, multichart-gated for host A.
- Secondary: render coalescing during background hydration, with the hook around the hydration/chunk loop.
- Also applicable: round-trip reduction using high-limit `/smart` or bounded background hydration requests.
- Also applicable: idle-panel damping for `extendReplayMasterFromHost` / `syncFromHost` / `replayFrame` repaint storms during host-only loads.

No fix is proposed here beyond mapping to D-006. Any implementation should be a separate gated task with single-chart S1/S6/S11 checked unchanged.

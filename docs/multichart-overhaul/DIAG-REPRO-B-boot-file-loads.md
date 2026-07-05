# DIAG-REPRO-B Boot File Loads

Read-only diagnosis for build `b586`: clean same-symbol 2×2 reports all panels on `fileId = 25`, while console logs show `file 22 / 27 / 29 bar loads via: tiles` during boot.

## Reproduction Status

I could not run the live browser repro in this environment, so this diagnosis relies on the captured facts in `MANAGER-FINDINGS.md` §6f and code tracing by function name. No code was changed.

## Observed Facts From §6f

| panel | reported fileId | reported tf | fetches post-pan | seams |
|-------|-----------------|-------------|------------------|-------|
| HOST | 25 | 1d | 14 | 0 |
| B | 25 | 1d | 0 | 0 |
| C | 25 | 1d | 0 | 0 |
| D | 25 | 1d | 0 | 0 |

The reported runtime state does not show a panel ending on `22`, `27`, or `29`. The non-25 loads are therefore a separate load path from the panel state reported by `__mcDiagReport()`.

## Exact Call Path For `bar loads via: tiles`

The console string is emitted by `chart.js` `_fetchBarsWindow(fileId, fromMs, toMs, resolution, limit)`.

The non-host boot loads are issued by the backtest symbol prefetch path:

1. `chart.js` initial backtest load completes for the active file.
2. In that load path, a delayed callback checks the chart is still on the scheduled active file, then calls `_scheduleSmartPrefetchOthers(fileId, replayRawTf, session)`.
3. `_scheduleSmartPrefetchOthers(activeFileId, timeframe, session)` calls `getSymbolSwitcherEntries()`.
4. `getSymbolSwitcherEntries()` collects all available session symbols from `session.instruments`, `session.files`, `session.symbols`, `session.supporting_tickers`, and, if needed, the `fileSelect` DOM.
5. `_scheduleSmartPrefetchOthers()` skips only `activeFileId`; for every other entry not already in `_smartPrefetchCache`, it calls `_fetchSmartWindow(e.fileId, timeframe, session, 'end', ...)`.
6. `_fetchSmartWindow()` tries `_fetchSmartWindowViaBars(...)`.
7. `_fetchSmartWindowViaBars(...)` calls `_fetchBarsWindow(fileId, ...)`.
8. `_fetchBarsWindow()` logs `file ${fileId} bar loads via: ${src}`; when the server source is tile-backed, this appears as `file 22 / 27 / 29 bar loads via: tiles`.

## Trigger Condition

The trigger is a backtest session whose symbol-switcher entries contain file ids other than the active chart file, combined with the post-load prefetch path. For an active `fileId = 25`, any other session files such as `22`, `27`, and `29` are eligible for idle prefetch. This warms the pair-switch cache so later symbol switches avoid synchronous network waits.

This path does not require an iframe URL missing `fileId`, does not require a panel to set `currentFileId` to a non-25 value, and does not require compare overlay or favorites state.

## Ruled-Out Leads

- **Default-file iframe fallback:** `embed-bridge.js` `applyInitialContext()` reads the URL `fileId`, then parent `currentFileId`, then polls for parent `currentFileId` before calling panel load. The b586 capture reports B/C/D on `25`, not `22`, `27`, or `29`.
- **Same-pair panel boot:** `embed-bridge.js` calls `loadMultichartPanelFile(loadFid, ...)` for backtest panels. In `chart.js` `loadMultichartPanelFromHost()`, same-pair panels try the parent native master path. The `loadFileData()` branch that schedules `_scheduleSmartPrefetchOthers()` is skipped when same-pair result source is `parent-native-master`.
- **Compare overlay:** `CompareOverlay` initialization loads available symbol metadata, but the `_fetchOverlayBarsViaSmart()` path is reached by adding/refreshing overlays, not by clean empty overlay boot.
- **Favorites manager:** `favorites-manager.js` stores drawing-tool favorites only; it does not call `_fetchSmartWindow()` or `_fetchBarsWindow()`.

## Classification

The `file 22 / 27 / 29 bar loads via: tiles` boot logs are legitimate non-panel prefetch noise from the backtest symbol-switcher cache warmer. They are not evidence that panel B/C/D transiently booted on the wrong `fileId` in the b586 clean same-symbol 2×2 capture.

## D-004 Verdict

REPRO-B maps to D-004 pre-authorized outcome 2: the non-25 loads come from a legitimate non-panel feature, specifically backtest symbol-switcher prefetch. B-FIX-2 should be recorded as explained noise / not-a-bug for this repro, not Phase 1 Task 1.3.

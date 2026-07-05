# DIAG-B2 Pan Fetch Ownership

Read-only diagnosis for the §6b 2×2 pan case where panel B fetched independently while C/D copied from the host.

## Reproduction Status

I could not reproduce the live browser pan in this environment because no browser-control tool is available. The per-panel live state fields below are therefore not captured here. The verdict is based on the Manager's §6b diagnostic counters plus code trace through the named functions.

## Requested Per-Panel Capture

| panelId | currentFileId | currentTimeframe | `_multichartSamePairDataShareActive()` | `_isIndependentMultichartPair()` | `_multichartVisibleRangeSyncOn` | physically dragged | pan load log | bar load log |
|---------|---------------|------------------|----------------------------------------|----------------------------------|----------------------------------|--------------------|--------------|--------------|
| HOST | Not captured here | Not captured here | N/A, host is the owner | N/A | Not captured here | Not captured here | Not captured here | Not captured here |
| B | Not captured here | Not captured here | Not captured here | Not captured here | Not captured here | Not captured here | Not captured here | Not captured here |
| C | Not captured here | Not captured here | Not captured here | Not captured here | Not captured here | Not captured here | Not captured here | Not captured here |
| D | Not captured here | Not captured here | Not captured here | Not captured here | Not captured here | Not captured here | Not captured here | Not captured here |

## Available §6b Counter Facts

Source: `docs/multichart-overhaul/MANAGER-FINDINGS.md` §6b.

| panelId | fetches | fetchedBars | extendsFromParent | seams | ownership signal |
|---------|---------|-------------|-------------------|-------|------------------|
| HOST | 30 | 27026 | 0 | 0 | Host fetched as owner. |
| B | 33 | 58000 | 0 | 0 | B fetched independently; it did not extend from parent. |
| C | 2 | Not recorded | 3 | 0 | C copied from parent. |
| D | 2 | Not recorded | 2 | 0 | D copied from parent. |

## Code-Trace Facts

- `panel-cmd-bridge.js` `isSameSymbolAsHost(ch)` compares `window.parent.chart.currentFileId` to `ch.currentFileId`. It does not compare ticker text.
- `chart.js` `_multichartSamePairAsHost(targetFileId)` uses the same file-id equality rule for iframe panels.
- `chart.js` `_multichartSamePairDataShareActive()` returns `false` when `_multichartSamePairAsHost(this.currentFileId)` is false, or when `_isIndependentMultichartPair()` is true.
- `chart.js` `_isIndependentMultichartPair()` returns `_shouldAnchorPairSwitchToHostPlayhead(this.currentFileId)`, and `_shouldAnchorPairSwitchToHostPlayhead(targetFileId)` is true when the iframe target fileId differs from the host `currentFileId`.
- `chart.js` `checkViewportLoadMore(direction, force)` only enters the same-pair host-copy/delegate branch when `_multichartSamePairDataShareActive()` is true on a backward pan in an iframe panel. If that predicate is false, it falls through to the panel's own `_fetchCandlesCursor(this.currentFileId, tf, cursorNum, direction, barLimit)` path.
- `chart.js` `_tryExtendReplayMasterFromParent(opts)` also starts with `_multichartSamePairAsHost(this.currentFileId)`; when file ids differ, it returns false before copying host data, which matches `extendsFromParent = 0`.
- `chart.js` `_indepNativeBack` is only a second-order volume/timeframe branch: replay active, backward pan, iframe panel, independent pair, and `currentTimeframe !== '1m'` make the independent panel fetch at its display timeframe. It does not decide copy versus self-fetch; independence already did that.
- `chart.js` `_fetchCandlesCursor()` emits `pan loads via: <source>`. `chart.js` `_fetchBarsWindow()` emits `bar loads via: <source>`. In the `checkViewportLoadMore()` pan self-fetch path, the direct call is `_fetchCandlesCursor()`.
- `MultichartGrid.jsx` `readHostChartFileAndTf()` reads `window.chart.currentFileId`; the panel creation path sets `effFile = propFid || hostNt.fileId || null` and passes `fileId: effFile` into `addChart`.
- `MultichartGrid.jsx` `buildIframeSrc()` only adds the `fileId` URL parameter if `fileId` is truthy.
- `MultichartGrid.jsx` reconcile logic sets `forceHostFileOnEveryTile = symFollow`; when Symbol sync is off and a panel reports a different fileId than the host, it continues without forcing `loadFile`.
- `embed-bridge.js` `applyInitialContext()` reads `params.get('fileId')`; if no fileId is present, it tries to read the parent chart's `currentFileId`, otherwise polls. The previous handoff documents the failure mode where no host fileId at panel boot lets the iframe land on a default dataset such as file 27 while the host is file 25.

## Verdict

The exact condition that routes B to self-fetch is `B.currentFileId !== window.parent.chart.currentFileId`. Under that condition, `panel-cmd-bridge.js` `isSameSymbolAsHost(ch)` and `chart.js` `_multichartSamePairAsHost(this.currentFileId)` both return false; then `_multichartSamePairDataShareActive()` returns false, `_isIndependentMultichartPair()` is true, `_tryExtendReplayMasterFromParent()` refuses to copy, and `checkViewportLoadMore()` falls through to B's own `_fetchCandlesCursor()` path. The code trace therefore supports the Director's prime suspect: if the live capture shows B booted with a different fileId than HOST, the pan behavior is a consequence of a boot-time fileId mismatch, not a special B-only pan branch. No fix proposal is included in this read-only diagnosis.

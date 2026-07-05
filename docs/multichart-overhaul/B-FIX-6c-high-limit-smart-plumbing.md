# B-FIX-6c - High-Limit `/smart` Plumbing

## Pre-Task Git Status

```text
 M "Sources Handoff/TalariaV16.jsx"
 M docs/multichart-overhaul/DIRECTOR-DECISIONS.md
 M docs/multichart-overhaul/MANAGER-FINDINGS.md
 M journal-backend/routes/journal/live_accounts.py
```

## Design Note

6b already made `_buildSmartWindowParams()` accept `allowHighLimit`, raising the `/smart` client clamp from 2000 to 100000 only when the caller opts in (`chart v 1.4/chart/chart.js:5628-5649`). B-FIX-6c extends that opt-in only to host/self bulk-history loads, not to panel ownership or incremental pan.

Raised call site 1: initial backtest history in `autoLoadBacktestingData()`. This is bulk because it is the first session history window before replay/render setup, not a user pan request. The call now computes `highLimitBulkHistory`, skips the capped `/bars` seek-buffer path when bulk mode is on, builds a large playhead/session-start range, and passes `limit`, `allowHighLimit`, and `skipBars` into `_fetchSmartWindow()` (`chart v 1.4/chart/chart.js:1885-1918`, `chart v 1.4/chart/chart.js:1930-1937`).

Raised call site 2: backtest TF-switch history fill in the replay refetch core. This is bulk because it replaces the master/window for a user TF switch while the freeze overlay is active; it is not an incremental edge pan. The call now uses `_getBacktestBulkHistoryFetchRange()` and opts into the same high-limit `/smart` path, including the no-payload wider retry (`chart v 1.4/chart/chart.js:21219-21234`, `chart v 1.4/chart/chart.js:21239-21260`).

The new kill-switch is `window.__TALARIA_MC_DISABLE_HIGH_LIMIT_BULK`. When set, `_shouldUseHighLimitBulkHistory()` returns false, so the changed call sites fall back to their old `_backtestFetchLimitForTimeframe()` sizing and do not pass `allowHighLimit` or `skipBars` (`chart v 1.4/chart/chart.js:5252-5278`).

The `/bars` bypass is intentional for bulk only: `_fetchSmartWindow()` still tries `/bars` first unless `smartOpts.skipBars === true`, because `/bars` remains capped around 2000 and would otherwise defeat the high `/smart` limit (`chart v 1.4/chart/chart.js:5919-5934`). Incremental pan was not changed: `checkViewportLoadMore()` still uses `_fetchCandlesCursor()` with playback chunks capped at 2000 and non-playback pan chunks capped at 5000 (`chart v 1.4/chart/chart.js:21366-21587`).

The server already accepts the larger request shape: `/api/file/{file_id}/smart` clamps `limit` to 100000 (`chart v 1.4/chart/api_server.py:21572-21593`).

## Verification

- `node --check "chart v 1.4/chart/chart.js"` passed.
- `node --check "homepage/public/chart/chart.js"` passed.
- Both chart copies have SHA-256 `BFBE1F623028452CC7D2946927D077B5769C9AA5722B7A94690704F4E4C85116`.
- Cursor lints reported no linter errors for both chart copies.
- `$env:BUILD_ID='20260705b11'; npm run build:live` passed from `chart v 1.4/talaria-design`.
- `homepage/public/chart/sw.js` contains `SW_VERSION = "talaria-chart-20260705b11"`.
- Kill-switch causality verified by code reading: `window.__TALARIA_MC_DISABLE_HIGH_LIMIT_BULK` makes `_shouldUseHighLimitBulkHistory()` return false before any bulk call site can pass `allowHighLimit` or `skipBars` (`chart v 1.4/chart/chart.js:5252-5278`).

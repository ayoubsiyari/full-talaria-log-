# Talaria Multichart — production v1

Phase 7.1 of the multichart rebuild: ship the verified sandbox architecture into production.

This is the **production deployment** of the multi-chart layout. The sandbox at [`../multichart/`](../multichart/) is the verification harness — it stays in place as a regression rig. The production code in this folder is a thin port: the three core JS files (`engine-api-guards.js`, `sync-bridge.js`, `multichart-manager.js`) are **verbatim copies** from the sandbox; only the shell + iframe target differ.

## How it works

```
/chart/multi  →  shell.html
                 └─ <iframe src="/chart/dist-v9/index.html?multichart=1&panelId=A">
                 │      └─ dist-v9 React app + chart.js
                 │      └─ multichart shim (in dist-v9/index.html) injects:
                 │           1. /chart/multi/engine-api-guards.js
                 │           2. /chart/multi/sync-bridge.js
                 │           3. /chart/multi/embed-bridge.js
                 │      └─ embed-bridge.js waits for window.chart, then calls
                 │           MultichartBridge.installBridge(window.chart, ...)
                 │
                 ├─ <iframe src="/chart/dist-v9/index.html?multichart=1&panelId=B">
                 │      (same as above)
                 │
                 └─ multichart-manager.js (in shell.html) — PEER fan-out,
                    crosshair / visible range / symbol sync via postMessage,
                    governed by FORBIDDEN_SYNC_FIELDS allowlist.
```

The original v9 multichart bug — lower-timeframe chart inheriting higher-timeframe chart's price-axis range — cannot recur, because:

1. **Iframe boundary**: each panel is a process-isolated iframe. There is no shared JavaScript heap between charts. Price-axis fields live inside the iframe's `window.chart.priceScale` and physically cannot be accessed from another panel.
2. **Allowlist filter**: the bridge filters every postMessage envelope through `MultichartGuards.filterForbiddenFields` on both outbound and inbound. Any payload containing `priceMin`/`priceMax`/`autoScale`/`priceZoom`/`priceOffset`/`manualCenterPrice`/`manualRange`/`mode`/`scaleType`/`timeframe`/`indicators`/`drawings`/`chartType` is dropped with a console error.
3. **Snapshot/diff guards**: every inbound sync application snapshots the recipient's price state before, applies the sync, and snapshots after. Any drift on the disallowed fields fires an `assertion-report` upward to the shell.
4. **Loop guard**: every outbound message carries a `causationId`. Inbound messages whose causationId matches a recently-applied one are dropped before forwarding (echo prevention). Outbound dispatch is also guarded by a bounded `applying` rAF window so programmatic syncs cannot accumulate echo budget.

## Files

| File | Purpose | Source of truth |
|---|---|---|
| `shell.html` + `shell.css` | Production shell. Talaria-themed. Layout picker, sync toggles, log toggle, session restore. | THIS FOLDER |
| `embed-bridge.js` | Loaded inside dist-v9 when `?multichart=1`. Waits for `window.chart`, installs `MultichartBridge`. Heartbeat + boot diagnostics. | THIS FOLDER |
| `engine-api-guards.js` | `FORBIDDEN_SYNC_FIELDS`, snapshot/diff, filter. Phase 6 verified. | **`../multichart/engine-api-guards.js`** (verbatim copy) |
| `sync-bridge.js` | Iframe-side bridge. Phase 6 verified. | **`../multichart/sync-bridge.js`** (verbatim copy) |
| `multichart-manager.js` | Parent-side orchestrator. Phase 6 verified. | **`../multichart/multichart-manager.js`** (verbatim copy + production `iframeSrcBuilder` opt) |

**Sync rule**: when changing semantics in any of the three "verbatim copy" files, change the sandbox first, re-verify Phase 6 end to end, then copy back. The sandbox is the verification harness; this folder is the deployment.

## Modifications outside this folder

| File | Change |
|---|---|
| `chart/dist-v9/index.html` | ~30 lines: `?multichart=1` shim that adds `multichart-embed` body class and injects the three scripts. **Source of truth: `talaria-design/live/index.html`** — the build copies it here. |
| `talaria-design/live/index.html` | Same shim; this is the source. |
| `homepage/public/chart/dist-v9/index.html` | Same shim (mirror copy). The `sync-v9-to-homepage.mjs` script syncs the dist-v9 build into the homepage on `npm run build:live`, so the source-of-truth shim flows here automatically. |
| `chart/api_server.py` | Two routes: `GET /chart/multi` and `GET /chart/multi/` → serves `shell.html`. Plus a static mount at `/chart/multi/` for the JS/CSS files. Registered BEFORE the `/chart/{file_name}` catch-all. |

When `?multichart=1` is **absent**, the dist-v9 shim is a complete no-op. Behavior at `/chart/` (single chart) is byte-identical to before this change.

## Verification checklist

Verify in this order. Stop and report at the first failing step.

### 0. Smoke

1. Open `/chart/multi` — the shell loads with the default 2-panel layout (`2v` = side by side).
2. Both iframes show the dist-v9 React app loading. After ≤30s, both panels display a chart.
3. Topbar shows `Talaria Multichart v1` + version badge. The header `<h1>` tooltip shows the build description.
4. Open dev tools console. No errors. The shell's log panel (toggle "Show log") shows:
   - `Talaria Multichart v1 — guards 2026-05-09T20:30-v10.5.0-prod-v1 — each panel loads /chart/dist-v9/?multichart=1`
   - `addChart A (tf=...) src=/chart/dist-v9/index.html?multichart=1&panelId=A`
   - For each panel: `iframe loaded: A (waiting for bridge-ready…)` then `bridge ready: A`
5. Click `Self-test`. The log shows `guard self-test A: PASS` and `guard self-test B: PASS`.

If a panel hangs on "iframe: LOADED — bridge: TIMEOUT", open that iframe directly in a new tab (`/chart/dist-v9/index.html?multichart=1&panelId=A`) — the console will show the actual chart-init failure (most often: not logged in → redirect to `/signin`).

### 1. Existing single-chart UX is unchanged

This is the regression test for our integration:

1. Open `/chart/` (no query string). The single-chart React app loads exactly like today.
2. All existing controls work: tools, indicators, orders, drawings, replay, file picker, layout picker (the layout picker still no-ops because `window.panelManager` is gone — that's pre-existing, not new harm).
3. No console errors. The multichart shim doesn't fire because `?multichart=1` is absent.

If anything in the single-chart path changes, the integration is wrong — back out.

### 2. Per-panel chart works (each iframe = full Talaria chart)

In each panel of `/chart/multi`:

1. Pick a file using the dist-v9 file picker. The chart loads.
2. Switch the timeframe. Chart redraws. The other panel does NOT change timeframe.
3. Open the indicator menu, add an indicator. It shows in this panel only (correct for v1).
4. Open the drawing tool palette, draw a trendline. It exists in this panel only (correct for v1).
5. Place a paper order via the order panel. The order shows on the backend; both panels reflect it for the matching symbol (orders are user-scoped, not chart-scoped — correct).
6. Open replay. The replay state is per-panel (correct for v1).

All native Talaria features should work inside each iframe exactly like they work in the single-chart view at `/chart/`.

### 3. Crosshair sync (the original-bug regression test)

1. Both panels: load the SAME ticker but DIFFERENT timeframes (e.g. ES futures, panel A on 1m, panel B on 1h). This is the failure mode of the original bug.
2. Sync mode: both `Crosshair` and `Visible range` checked.
3. Move the mouse over panel A. Panel B's crosshair appears at the matching hour bucket. Time labels match.
4. **Critical**: panel B's price-axis range does NOT change while you move the crosshair. Panel A's candles do not compress vertically. Panel B's candles do not compress vertically.
5. Open the log. Counters should show `out > 0`, `loop = 0`, `fbid = 0` (no forbidden fields dropped means the allowlist is intact).
6. Click `Self-test` after some sync activity. Both panels still PASS.

If you see `PRICE-AXIS ASSERTION FAIL` in the log, **that is the original bug**. Stop and report — something we copied from the sandbox is not behaving the same way in production.

### 4. Visible-range sync

1. Same setup as test 3.
2. Pan panel A horizontally across a multi-week window. Panel B follows, snapped to its hour buckets.
3. Zoom in on panel A. Panel B zooms to the equivalent time window (with min 30 hours of bars per the `MIN_BARS_TO_SHOW` floor in `sync-bridge.js`).
4. Drive sync from panel B → panel A and verify A follows. **Symmetric** — both directions work.
5. Drag the divider between panels. Both charts re-fit their price axes. Sync still works after.

### 5. 3+ panels

1. Switch layout to `3l` or `2x2`. Three or four iframes spawn.
2. Move crosshair on each in turn — all peers follow.
3. Pan/zoom on each — all peers follow.
4. No oscillation under rapid input on multiple panels at once.
5. Switch back to layout `2v`. The unused panels are torn down. No memory leak (heap snapshot before/after).

### 6. Cross-pair sync (different tickers per panel)

1. Layout = `2v`. Panel A: USDJPY 1m. Panel B: ES 1h.
2. Move crosshair on USDJPY. ES's crosshair appears at the matching hour bucket WHEN that hour exists in ES data; otherwise hides gracefully (Saturday morning forex vs ES weekend gap).
3. No price-axis compression on either panel.

### 7. Browser refresh / session restore

1. Set layout to `2x2` and toggle off `Visible range` sync.
2. Refresh the browser (`F5`).
3. The shell reopens with layout `2x2` and `Visible range` still off (per-shell state restored).
4. **Note**: per-panel file/timeframe is NOT restored in v1 (each iframe's React state lives inside dist-v9; we'd need a Phase 7.2 React-state hook). The user picks file/tf again per panel.
5. **Critical guarantee**: open dev tools → Application → localStorage → `talaria-multichart-session-v1`. Confirm the saved JSON contains ONLY `version`, `layout`, `syncMode`, `logVisible`. NO `priceMin`, `priceMax`, `autoScale`, `priceZoom`, etc. The forbidden-fields filter runs as defense in depth before save.

### 8. Throttled CPU

1. Dev tools → Performance → CPU 4× slowdown.
2. Layout = `3l` or `2x2`.
3. Pan rapidly on one panel for 30s — peers follow without stack overflow / errors.
4. Pan rapidly on all panels at once for 30s — no oscillation, counters clean.
5. Don't forget to turn throttling back off.

## What's NOT in v1 (planned follow-ups)

| Item | Phase | Notes |
|---|---|---|
| Per-panel file/tf in saved session | 7.1.1 | Needs URL-param hook in dist-v9 React state to set initial fileId/tf from `?fileId=N&tf=1m` |
| Symbol sync | 7.2 | When user changes file in panel A, panel B follows. Needs the same React-state hook (so `applySymbol` in sync-bridge.js can update dist-v9's selected file). |
| Cross-panel drawing sync | 7.3 | Allowlist new fields (`drawingId`, `points`, `style`) and add to bridge. |
| Cross-panel indicator sync | 7.4 | Same shape as drawing sync. |
| Repoint V9 layout picker dialog | 7.5 | The existing dialog calls `window.panelManager.applyLayout(...)` which no-ops; redirect to `/chart/multi?layout=...` once v1 is verified at scale. |
| Aggressive chrome-hiding inside iframes | tbd | Add CSS rules under `body.multichart-embed` once you've used it and tell us what's busy when 4 panels stack their topbars. |

## Cache busting

Bump `v=YYYYMMDDTHHMM` in three places when shipping a change to a multichart-prod JS file:

1. `shell.html` — script tags for `engine-api-guards.js` and `multichart-manager.js`
2. `chart/dist-v9/index.html` — the `V` constant in the multichart shim
3. `talaria-design/live/index.html` — the `V` constant in the multichart shim (source of truth)
4. `homepage/public/chart/dist-v9/index.html` — the `V` constant (mirror)

If you're shipping a change to one of the three "verbatim copies" (`engine-api-guards.js`, `sync-bridge.js`, `multichart-manager.js`), do it in the sandbox first, verify Phase 6, then copy here and bump.

## Browser support

Same as the rest of Talaria. The shim uses Pointer Events (Chromium 55+, Safari 13+, Firefox 59+) for divider dragging. `100dvh` for full viewport (Chromium 108+, Safari 15.4+, Firefox 101+) — falls back to `100vh` on older browsers via the cascade.

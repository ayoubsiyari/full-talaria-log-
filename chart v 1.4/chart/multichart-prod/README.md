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
| `shell.html` + `shell.css` | Production shell at `/chart/multi`. Compact TradingView-style topbar (Talaria back link, layout dropdown, sync toggles, icon-only dev buttons). | THIS FOLDER |
| `topbar-button.js` | Loaded by every `/chart/` page (unconditionally). Adds the `Layouts ▾` dropdown at top-center. Hides itself in iframes / on `/chart/multi`. Picking a multi-panel layout navigates to `/chart/multi?layout=<id>&fileId=<current>&tf=<current>&mode=<current>` so each panel boots with the same data the user was viewing. | THIS FOLDER |
| `embed-bridge.js` | Loaded inside dist-v9 when `?multichart=1`. Waits for `window.chart`, installs `MultichartBridge`, and applies initial viewing context: if `?fileId=N&tf=1m` is in the iframe URL, calls `window.chart.loadFileData(N)` then `setTimeframe(tf)` so the panel shows real candles instead of "No data to display". | THIS FOLDER |
| `engine-api-guards.js` | `FORBIDDEN_SYNC_FIELDS`, snapshot/diff, filter. Phase 6 verified. | **`../multichart/engine-api-guards.js`** (verbatim copy) |
| `sync-bridge.js` | Iframe-side bridge. Phase 6 verified. | **`../multichart/sync-bridge.js`** (verbatim copy) |
| `multichart-manager.js` | Parent-side orchestrator. Phase 6 verified. | **`../multichart/multichart-manager.js`** (verbatim copy + production `iframeSrcBuilder` opt) |

### TradingView-style chrome hiding (v1.1)

The dist-v9 shim, when running in iframe mode (`?multichart=1`), injects a tiny `<style>` that hides every element tagged with `data-v9-chrome="1"` in `TalariaV8bLive.jsx`:

| `data-v9-chrome="1"` element | Source line | What it is |
|---|---|---|
| top toolbar | L16200 | symbol picker, timeframe buttons, indicators, Place Order, etc. |
| left tools | L16452 | drawing tool palette + theme toggle |
| bottom bar | L16594 | replay controls, balance, equity, P&L, speed |
| trade list | L17189 | Trades / Pending / Open Positions / History / Analytics tabs |
| right panel | L17675 | News / Layout / Layers / Indicators side drawer |

Result: each panel collapses to **chart canvas + price axis + time axis + crosshair + drawings + OHLC info legend** — the TradingView per-pane feel. The user controls all of it from `/chart/` (file selection, timeframe, mode) and that context flows into every panel via the URL chain `topbar-button.js → /chart/multi?... → buildIframeSrc → iframe ?multichart=1&fileId=...&tf=... → embed-bridge.js applyInitialContext`.

**Limitations of v1.1**: per-panel file selection is not yet possible — the user must go back to `/chart/` (via the `← Talaria` link in the shell topbar), pick a different file, then click `Layouts ▾` again to relaunch with the new file. Per-panel symbol/file picker in the shell topbar is the v1.2 follow-up.

**Sync rule**: when changing semantics in any of the three "verbatim copy" files, change the sandbox first, re-verify Phase 6 end to end, then copy back. The sandbox is the verification harness; this folder is the deployment.

## Modifications outside this folder

| File | Change |
|---|---|
| `chart/dist-v9/index.html` | ~30 lines: (A) always loads `topbar-button.js` (the "Layouts ▾" dropdown that lets the user open multichart from /chart/), and (B) on `?multichart=1`, adds `multichart-embed` body class and injects the three bridge scripts. **Source of truth: `talaria-design/live/index.html`** — the build copies it here. |
| `talaria-design/live/index.html` | Same shim; this is the source. |
| `talaria-design/src/TalariaV8bLive.jsx` | The right-panel layout picker `useEffect` was wired to call the deleted `panelManager.applyLayout(...)` and silently no-op'd. Repointed: picking layout `1` stays on /chart/, picking `2v`/`2h`/`3l`/`3r`/`2x2` (or any V9 variant that maps to one of those) navigates to `/chart/multi?layout=<id>`. Requires `npm run build:live` to deploy. |
| `homepage/public/chart/dist-v9/index.html` | Same shim as `chart/dist-v9/index.html` (mirror copy). The `sync-v9-to-homepage.mjs` script syncs the dist-v9 build into the homepage on `npm run build:live`, so the source-of-truth shim flows here automatically. |
| `chart/api_server.py` | Two routes: `GET /chart/multi` and `GET /chart/multi/` → serves `shell.html`. Plus a static mount at `/chart/multi/` for the JS/CSS files. Registered BEFORE the `/chart/{file_name}` catch-all. |

When `?multichart=1` is **absent** at `/chart/`, the only change vs. before this work is the small `Layouts ▾` button at the top-center of the page (added by `topbar-button.js`). Single-chart rendering is byte-identical.

## Verification checklist

Verify in this order. Stop and report at the first failing step.

### 0. Smoke (the canonical flow — go through /chart/, not direct)

1. Open `/chart/?mode=backtest` (or your normal entry). Pick any file the way you would today — chart shows real candles.
2. Click `Layouts ▾` (the small button at top-center of /chart/). A dropdown opens. Pick `2 panels — split horizontal`.
3. The page navigates to `/chart/multi?layout=2v&fileId=<your file>&tf=<your tf>&mode=backtest`. The shell loads with a compact topbar (`← Talaria` back link, layout dropdown showing `⬌ 2 panels`, sync toggles, dev icon buttons).
4. Both iframes load. After ≤30s each panel shows the **same file you were viewing** at the same timeframe — NOT "No data to display".
5. Each panel is just chart canvas + axes + crosshair + OHLC legend at top-left. No top toolbar, no left drawing tools, no bottom replay/balance bar, no trade list inside the panels.
6. Click `← Talaria` in the shell topbar. You're back on `/chart/?mode=backtest` with the same single chart.

If a panel still says "No data to display": check the network tab inside the iframe — `embed-bridge.js applyInitialContext` should log `initial context applied: fileId=...` to the host shell log (toggle ≡ button). If it says `cannot apply fileId=...: window.chart.loadFileData missing`, the chart engine isn't booted yet inside the iframe — usually means the user is not logged in for that iframe, or the dist-v9 React bundle failed to mount.

### 0b. Direct-open smoke (no /chart/ context)

1. Open `/chart/multi` directly (no query params).
2. Shell loads with default 2v layout. Each iframe boots empty ("No data to display") — **expected for v1.1**, since there's no boot-time context. User must hit `← Talaria`, pick a file there, then return via `Layouts ▾`.
3. Click the icon buttons in the dev group (⌕ ✓ ≡ ⟲) — they should still work: `⌕` = diagnose, `✓` = self-test, `≡` = toggle log, `⟲` = reset session.

### 1. Existing single-chart UX is unchanged + topbar button works

This is the regression test for our integration:

1. Open `/chart/` (no query string). The single-chart React app loads exactly like today, **plus** a small `Layouts ▾` button appears at the top-center of the page (z-index 9999, fixed position).
2. All existing controls work: tools, indicators, orders, drawings, replay, file picker, right-panel layout picker.
3. No console errors. The embed shim doesn't fire because `?multichart=1` is absent. Only the topbar-button script runs.
4. Click `Layouts ▾`. A dropdown opens with: Single chart, 2 panels split horizontal, 2 panels split vertical, 3 panels left-dominant, 3 panels right-dominant, 4 panels grid.
5. Open dev tools network tab, pick `2 panels — split horizontal`. The navigation URL is `/chart/multi?layout=2v&fileId=<your fileId>&tf=<your tf>` (and `&mode=...` if you came from a moded URL). If `fileId` is missing from the URL it means `window.chart.currentFileId` was null at click time — confirm by checking `window.chart` in console BEFORE clicking.
6. Hit browser back. You return to `/chart/` with the same single chart you had before. State is intact.

If the button doesn't appear, hard-refresh (Ctrl+Shift+R) — the topbar-button.js URL is cache-busted via the `V` constant in the shim.

If anything else in the single-chart path changes, the integration is wrong — back out.

### 2. Per-panel chart loads the right data (the bug-1 regression test)

This is the regression test for the v1.0 → v1.1 fix where iframes spawned with no data:

1. Start at `/chart/?mode=backtest` with file X picked at timeframe Y. Confirm chart shows real candles.
2. Click `Layouts ▾` → `2 panels — split horizontal`.
3. Both panels at `/chart/multi` should show **the same file X at timeframe Y** within ≤30s of bridge-ready.
4. Open the shell log (≡ button). For each panel you should see:
   - `[embed:A] bridge installed on dist-v9 chart instance (guards v=...)`
   - `[embed:A] initial context applied: fileId=X tf=Y`
5. Each panel's chart canvas, axes, OHLC legend at top-left should match the single-chart view. The panel chrome (top toolbar / left tools / bottom bar / trade list / right panel) should NOT appear inside any panel — TradingView per-pane look.

If a panel shows "No data to display":
- Open the shell log — look for `cannot apply fileId=X: window.chart.loadFileData missing` (chart engine never booted; usually auth) or `loadFileData failed: ...` (network/permission error on the file).
- Open the iframe URL directly in a new tab (`/chart/dist-v9/index.html?multichart=1&panelId=A&fileId=X&tf=Y`) and check the iframe console for the actual error.

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
| Repoint V9 layout picker dialog | 7.5 | DONE in v1.1 — `TalariaV8bLive.jsx`'s `useEffect([layoutPanels])` now navigates to `/chart/multi?layout=<shellId>` instead of calling the dead `panelManager.applyLayout`. Requires `npm run build:live` to deploy. |
| Aggressive chrome-hiding inside iframes | tbd | Add CSS rules under `body.multichart-embed` once you've used it and tell us what's busy when 4 panels stack their topbars. |

## Cache busting

Bump `v=YYYYMMDDTHHMM` in four places when shipping a change to a multichart-prod JS/CSS file:

1. `shell.html` — `link` tag for `shell.css` + `script` tags for `engine-api-guards.js` and `multichart-manager.js`
2. `chart/dist-v9/index.html` — the `V` constant in the multichart shim (drives `topbar-button.js`, `engine-api-guards.js`, `sync-bridge.js`, `embed-bridge.js`)
3. `talaria-design/live/index.html` — the `V` constant (source of truth for the dist-v9 shim)
4. `homepage/public/chart/dist-v9/index.html` — the `V` constant (mirror)

If you're shipping a change to one of the three "verbatim copies" (`engine-api-guards.js`, `sync-bridge.js`, `multichart-manager.js`), do it in the sandbox first, verify Phase 6, then copy here and bump.

## Browser support

Same as the rest of Talaria. The shim uses Pointer Events (Chromium 55+, Safari 13+, Firefox 59+) for divider dragging. `100dvh` for full viewport (Chromium 108+, Safari 15.4+, Firefox 101+) — falls back to `100vh` on older browsers via the cascade.

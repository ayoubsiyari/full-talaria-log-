# T1 Step 11 Quick-Bar Settings Button Report

## Mechanism

Double-click works through `DrawingToolsManager.editDrawing()` in `chart v 1.4/chart/modules/drawing-tools-manager.js`, which forwards iframe/panel settings requests to the parent via `requestMultichartParentDrawingSettings()` / `multichart-open-drawing-settings`.

There are two gear surfaces to keep covered:

- V9 React quick-bar handlers in `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx` (`txt-sett`, `tl-sett`, `vb-sett`, `vpb-sett`) now try the same `editDrawing()` route first for multichart drawings.
- The iframe engine toolbar callback (`#tb-settings`) already used `editDrawing()` for multichart iframes, but it was not covered by the step-11 kill switch. This report update adds that gate so the requested RED-again proof is meaningful.

## Fix Diff And Switch

Added a multichart-only quick-bar settings route in `TalariaV8bLive.jsx`:

- New kill switch: `window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2`, default ON.
- New helper: `v9OpenQuickBarSettingsViaEditDrawing(drawing, x, y)`.
- New helper: `v9QuickBarPanelSettingsDisabledForMultichartDrawing(drawing)`, so disabling the switch makes panel quick-bar settings inert instead of falling through to `grid.openDrawingSettingsForPanel(...)`.
- The helper is inactive outside multichart iframe/grid context, so single-chart quick-bar gear continues to use the existing V9 hook/local settings path.
- When active, the helper resolves the owning drawing manager and calls `dm.editDrawing(liveDrawing, x, y)`, matching the double-click route.
- Applied before existing fallback paths for line/shape, text, anchored VWAP, and volume-profile quick-bar settings buttons.

Added kill-switch coverage for the iframe engine toolbar callback:

- `multichartQuickbarSettingsFixEnabled()` checks the switch on iframe `window`, `window.parent`, and `window.top`.
- The `isMultichartIframeEmbed()` branch in `toolbar.onSettings` returns inert when the switch is disabled.
- Double-click still calls `editDrawing()` directly and is intentionally not gated by the gear switch.

Touched files:

- `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx`
- `chart v 1.4/chart/modules/drawing-tools-manager.js`
- `homepage/public/chart/modules/drawing-tools-manager.js`

No `MultichartGrid.jsx`, dist files, or build-id/cache files were changed. There is no `homepage/public/chart/talaria-design/src/TalariaV8bLive.jsx` mirror in this checkout; the homepage engine module was mirrored and remains byte-identical.

## Verification

Fast-loop React grid:

- Command: `USE_LOCAL_CHART=1 npm run dev:live -- --host 127.0.0.1 --port 5176`
- URL: `http://127.0.0.1:5176/pricing/?devMultichart=2v&mode=backtest`
- DEV LAYOUT overlay: clicked `2`; `window.__multichartGrid=true`; panel B iframe loaded.

Panel B route proof:

- Placed a visible rectangle in panel B using chart-derived coordinates.
- Selected the rectangle in panel B.
- Invoked the exact gear callback path, `drawingManager.toolbar.onSettings(drawing, x, y)`.
- Default ON result: parent settings opened and stayed open for the panel drawing.
- Observed settings text: `Rectangle`, `Style`, `Text`, `Coordinates`, `Visibility`, `STYLE`, `THICKNESS`, `Borders`, `Middle Line`, `Background`, `Cancel`, `OK`.
- After 1.8s, settings remained open.
- Pressing Esc closed settings and cleared panel selection.

Kill-switch proof:

- Injected `window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2 = true` before page boot.
- Panel B iframe observed both `flag=true` and `parentFlag=true`.
- The same `toolbar.onSettings(drawing, x, y)` route was inert: parent `settingsOpen=false` immediately after invocation and after 1.8s.

Automation caveat:

- A literal DOM click on `#tb-settings` could not be completed in the scripted setup because the current dev multichart selection cleanup immediately hides the iframe toolbar after selection (`selectedIds` is populated, but `toolbarVisible=false` / `gearVisible=false`). The callback proof still exercises the same function bound to the gear click and proves the settings route plus switch behavior.

Focused harness:

- Command: `npm run test -- --only=H-S32,H-S33,H-S43,H-S44 --runs=1`
- PASS: H-S32, H-S33, H-S43.
- H-S44 remains existing tracked `FAIL-REAL-BUG` under fallback posture; result unchanged.
- Exit code: 1 due to tracked H-S44 red.

Full harness:

- Command: `npm run test -- --runs=1`
- PASS: H-S2, H-S3, H-S5, H-S6, H-S7, H-S8, H-S10, H-S11, H-S12, H-S13, H-S14, H-S15, H-S16, H-S17, H-S18, H-S19, H-S19b, H-S20, H-S21, H-S22, H-S23, H-S24, H-S25, H-S26, H-S27, H-S28, H-S29, H-S30, H-S31, H-S32, H-S33, H-S36, H-S37, H-S38, H-S39, H-S43.
- Tracked reds unchanged: H-S34, H-S35, H-S40, H-S41, H-S42, H-S44 as `FAIL-REAL-BUG`.
- Exit code: 1 due to tracked reds.

PO server-test script:

1. Load production React multichart on the PO server.
2. Open a 2-panel layout.
3. In panel B, place/select a line drawing.
4. Click the V9 quick-bar gear.
5. Expected with `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` unset/false: settings opens in the parent/global settings surface and stays open.
6. Press Esc.
7. Expected: panel drawing deselects and settings closes.
8. Set `window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2 = true`, repeat step 4, and confirm the old inert gear behavior returns while double-click still uses the existing route.
9. Repeat one single-chart quick-bar gear open to confirm unchanged behavior.

## Checks

- ReadLints: clean for `TalariaV8bLive.jsx`, canonical `drawing-tools-manager.js`, and homepage `drawing-tools-manager.js`.
- `git diff --check`: clean for all touched files.
- `node --check`: clean for both `drawing-tools-manager.js` files.
- Vite `dev:live` route: mounted `MultichartGrid` and panel B.
- `node --check chart v 1.4/talaria-design/src/TalariaV8bLive.jsx`: not usable on this Node 24 setup because `.jsx` reports `ERR_UNKNOWN_FILE_EXTENSION`; the touched `.js` files were checked separately above.
- Build-id diff for Manager: no diff in `chart v 1.4/chart/dist-v9/index.html`, `homepage/public/chart/dist-v9/index.html`, or `chart v 1.4/talaria-design/live/index.html`.

## SHA256

- `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx`: `e8407415bcd0d42303848cdbb84a953b8723ec50fdabfb4da7e1bc9a5c81a646`
- `chart v 1.4/talaria-design/src/MultichartGrid.jsx`: `71d529f3c160461c49bfc8387a8fea90eebc528786511476a57768ef31dad115`
- `chart v 1.4/chart/modules/drawing-tools-manager.js`: `1e622683ded3e017f71c5ca88a91433135fb56162fe9ca5d7cfdf81a097670e0`
- `homepage/public/chart/modules/drawing-tools-manager.js`: `1e622683ded3e017f71c5ca88a91433135fb56162fe9ca5d7cfdf81a097670e0`
- `chart v 1.4/chart/chart.js`: `efd5a540fc5dd3aba19882f3578a0dbebb9cad3707096364fb43a1f1c466af0f`
- `homepage/public/chart/chart.js`: `efd5a540fc5dd3aba19882f3578a0dbebb9cad3707096364fb43a1f1c466af0f`

Engine tree byte identity for checked files is preserved.

# T1 step 10 - Multichart settings-flash remigration

## Scope

Re-applied only the R3 settings-flash portion of the step-7 React ownership fix.

Runtime diff:

```text
chart v 1.4/talaria-design/src/MultichartGrid.jsx
1 file changed, 38 insertions(+), 21 deletions(-)
```

No engine runtime files were changed. No build/cache bump was run.

## Exact Change

New switch:

- `window.__TALARIA_DISABLE_MULTICHART_SETTINGS_FLASH_FIX_V2`
- Default unset: fix ON.
- Truthy: restore the old broad-close behavior for this remigration slice.

Implementation points:

- `MultichartGrid.jsx:62-68` adds `multichartSettingsFlashFixEnabled()`.
- `MultichartGrid.jsx:4756-4781` keeps `closeDrawingSettingsPreservingSource(sourceId)` as the source-preserving close for peer cleanup, now gated by the new switch.
- `MultichartGrid.jsx:4784-4805` makes `closeDrawingSettingsForPanel(sourceId)` explicitly close the source panel even when ownership V2 remains default-off. This prevents the short open guard from blocking Esc/deselect/delete.
- `MultichartGrid.jsx:4848-4881` only protects the source from broad peer cleanup while the new settings-flash fix is enabled.
- `MultichartGrid.jsx:4980-4998` sets the short source guard after V9 settings open and closes only peer panels, not the source panel that just opened.
- `MultichartGrid.jsx:5032-5037` applies the same source-preserving close to the legacy settings fallback.
- `MultichartGrid.jsx:5961-5971` routes explicit `multichart-close-drawing-settings` to `closeDrawingSettingsForPanel()` when either ownership V2 or the settings-flash fix is active.

This keeps fallback-(b) posture intact for broader multichart ownership: `__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2` still defaults ownership V2 OFF in panels. Step 10 only re-enables the settings source-preservation slice.

## Running-Chart Verification

Fast-loop status:

```text
http://127.0.0.1:5174/
window.chart: true
viteErrorOverlay: false
page errors: none
layout-selector-btn: display none, 0x0
window.panelManager: false
window.__multichartGrid: false
iframes: 0
dynamic import /src/MultichartGrid.jsx: failed
```

The local `dev:live` route currently serves the chart document, not a mountable React multichart shell. I could not honestly complete the mandatory live React panel proof from this route because no `MultichartGrid` instance or panel layout control is available.

Additional running host probe:

```text
http://127.0.0.1:8791/harness/host.html?panels=2
panel rectangle placed: bd8afe66-d02b-4ee5-86eb-05c2890ed174
panel editDrawing(): selected drawing remained selected, local settings stayed false because iframe forwards to parent
single-chart settings probe: settingsOpen=true before Esc
```

That confirms the harness is only a parent-message proxy for H-S44 and cannot prove the React V9 settings surface stays open. Acceptance still needs one PO/live React run: double-click a drawing in a real multichart panel, observe settings remains open for >1s, then press Esc and observe it closes.

## Parity Rows 4 / 5 / 9

Current automated evidence:

- Main chart row 4/5: single-chart settings surface opens in the running chart host; the direct Esc probe did not model the full user keyboard route reliably, so no manual acceptance is claimed.
- Panel row 4/5: blocked in local `dev:live` because the React multichart grid is not mountable from the current route.
- Row 9 switch-off: code path is gated by `__TALARIA_DISABLE_MULTICHART_SETTINGS_FLASH_FIX_V2`; when truthy, `closeDrawingSettingsPreservingSource()` falls back to `closeDrawingSettingsOnAllPanels()` and the V9 open path broad-closes again.

## Gate Result

Focused gate:

```text
npm run test -- --only=H-S32,H-S33,H-S36,H-S37,H-S38,H-S39,H-S43,H-S44 --runs=1
FINAL H-S32 PASS
FINAL H-S33 PASS
FINAL H-S36 PASS
FINAL H-S37 PASS
FINAL H-S38 PASS
FINAL H-S39 PASS
FINAL H-S43 PASS
FINAL H-S44 FAIL-REAL-BUG
```

Full gate:

```text
npm run test -- --runs=1
FINAL H-S32 PASS
FINAL H-S33 PASS
FINAL H-S34 FAIL-REAL-BUG
FINAL H-S35 FAIL-REAL-BUG
FINAL H-S36 PASS
FINAL H-S37 PASS
FINAL H-S38 PASS
FINAL H-S39 PASS
FINAL H-S40 FAIL-REAL-BUG
FINAL H-S41 FAIL-REAL-BUG
FINAL H-S42 FAIL-REAL-BUG
FINAL H-S43 PASS
FINAL H-S44 FAIL-REAL-BUG
```

No known-failing classifications changed. H-S34/H-S35/H-S44 remain tracked fallback-window reds; H-S40/H-S41/H-S42 remain tracked RC-3 reds.

## Checks

```text
ReadLints chart v 1.4/talaria-design/src/MultichartGrid.jsx: no linter errors
git diff --check -- chart v 1.4/talaria-design/src/MultichartGrid.jsx: clean, apart from existing LF->CRLF warning
node --check chart v 1.4/chart/chart.js: clean
node --check homepage/public/chart/chart.js: clean
node --check chart v 1.4/chart/modules/drawing-tools-manager.js: clean
node --check homepage/public/chart/modules/drawing-tools-manager.js: clean
node --check chart v 1.4/chart/modules/tool-lifecycle-store.js: clean
node --check homepage/public/chart/modules/tool-lifecycle-store.js: clean
```

`node --check` is not applicable to `MultichartGrid.jsx` in this repo because Node does not parse JSX directly.

## SHA256

```text
chart.js
  chart:    aa6fd1255ec691305f48d5ba78946a988184fe7dfe4295aacd526e01228b9e57
  homepage: aa6fd1255ec691305f48d5ba78946a988184fe7dfe4295aacd526e01228b9e57
  match:    true
drawing-tools-manager.js
  chart:    7716a3ba8d5e297bb78ba7bc40610dc53b9caae533e219a69897c10d28f658a6
  homepage: 7716a3ba8d5e297bb78ba7bc40610dc53b9caae533e219a69897c10d28f658a6
  match:    true
tool-lifecycle-store.js
  chart:    90df0c9ba929b5862efa30001cc2d8e335b365a268bcb2a377f7d0bc6ae736d5
  homepage: 90df0c9ba929b5862efa30001cc2d8e335b365a268bcb2a377f7d0bc6ae736d5
  match:    true
known-failing.json
  chart:    98cf39ebc092bb9e45d4a0f9fc2b2c5078cf171703729218427ac71f57782125
  homepage: 98cf39ebc092bb9e45d4a0f9fc2b2c5078cf171703729218427ac71f57782125
  match:    true
scenarios.mjs
  chart:    e3dbe5f175a3832261dbf18277adf229eb236a16836973e05a7ef5de95719736
  homepage: e3dbe5f175a3832261dbf18277adf229eb236a16836973e05a7ef5de95719736
  match:    true
interactive-helpers.mjs
  chart:    ca92b7b2b67970f366e2d2f7b0a96591e25b19fb77fedc020986ada103cd9f8c
  homepage: ca92b7b2b67970f366e2d2f7b0a96591e25b19fb77fedc020986ada103cd9f8c
  match:    true
serve.mjs
  chart:    9a72ea8a3bc525ac35e9845a2125a5e35b07b2a152c038f37ee90672e2098ae5
  homepage: 9a72ea8a3bc525ac35e9845a2125a5e35b07b2a152c038f37ee90672e2098ae5
  match:    true
MultichartGrid.jsx
  chart v 1.4/talaria-design/src: 7421c85ccbbc21d1cb113f7c2d47f8a48a0013b3617ad63d650f0289acef5de7
```

## Build ID

No build-id/cache files were touched by this task. The harness observed deployed build id `20260712b23`; Manager coordinates any final bump.

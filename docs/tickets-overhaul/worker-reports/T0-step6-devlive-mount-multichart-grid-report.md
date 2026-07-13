# T0 Step 6 Report - dev:live MultichartGrid Mount

## Scope

Worker prompt: `docs/tickets-overhaul/worker-prompts/T0-step6-devlive-mount-multichart-grid.md`.

Goal: make `npm run dev:live` expose and mount the real React `MultichartGrid` locally so panel layout, panel iframe boot, drawing placement, and drawing settings can be exercised without a Docker/server rebuild.

## Root Cause

The `dev:live` route already rendered the live React shell and statically imported `MultichartGrid`, but the grid was reachable only when `layoutPanels.n > 1`. In local Vite dev, the only DOM layout probe inside `#chart-container` was a hidden legacy compatibility button:

- `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx:34496`

That hidden `#layout-selector-btn` is `display:none`, `tabIndex={-1}`, and `aria-hidden`, so local workers had no usable panel/layout control. With `layoutPanels` left at `{ n: 1, li: 0 }`, the existing mount guard never rendered `MultichartGrid`:

- `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx:34578`

The earlier evidence (`window.__multichartGrid: false`, `iframes: 0`) was therefore a missing dev entry/control path, not a missing `MultichartGrid` implementation.

One extra dev-only issue appeared during the panel settings probe: the parent React settings hook opened the panel, then the existing multichart cleanup closed the host settings surface for iframe sources. For production, this cleanup remains unchanged. In Vite dev only, the cleanup is skipped so the local settings-open probe can observe the parent settings panel.

## Dev-Only Fix

Files changed for this step:

- `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx`
- `chart v 1.4/talaria-design/src/MultichartGrid.jsx`

Relevant step 6 changes:

- Added `devLiveMultichartEnabled = import.meta.env.DEV && !v9IsMultichartIframeEmbed()` in `TalariaV8bLive.jsx:14026`.
- Added a dev layout bootstrap that accepts `?devMultichart=...`, `?devLayout=...`, or `localStorage.talaria_devlive_multichart_layout` in `TalariaV8bLive.jsx:14092`.
- Added a Vite-dev-only chart overlay control with `1`, `2`, and `2x2` buttons at `TalariaV8bLive.jsx:34499`.
- Added a dev-only settings cleanup guard in `MultichartGrid.jsx:4995` and `MultichartGrid.jsx:5035` so panel drawing settings remain visible in local `dev:live` verification.

No `vite.config.live.js` production build options, `base`, `outDir`, Rollup config, chart engine files, build IDs, harness scenarios, or known-failing bookkeeping were changed for this step.

## Probe Evidence

Environment reused:

```powershell
# existing harness backend
$env:PORT='8791'; node serve.mjs

# existing Vite dev server
$env:USE_LOCAL_CHART='1'
$env:CHART_BACKEND='http://127.0.0.1:8791'
npm run dev:live -- --host 127.0.0.1 --port 5174
# Vite selected http://127.0.0.1:5175/
```

Browser probe URL:

```text
http://127.0.0.1:5175/pricing/?devMultichart=2v&mode=backtest
```

Observed results:

```json
{
  "first": {
    "href": "http://127.0.0.1:5175/pricing/",
    "grid": true,
    "gridEl": true,
    "storedLayout": "2v",
    "iframeCount": 1,
    "focused": "A"
  },
  "four": {
    "iframeCount": 3,
    "grid": true,
    "storedLayout": "4",
    "focused": "A"
  }
}
```

Panel drawing/settings probe:

```json
{
  "result": {
    "grid": true,
    "iframeCount": 3,
    "panelId": "B",
    "drawingCount": 1,
    "opened": true,
    "bodyHasStyle": true,
    "bodyHasMiddleLine": true
  }
}
```

The settings body included:

```text
Rectangle
Style
Text
Coordinates
Visibility
STYLE
THICKNESS
Borders
Middle Line
Background
Extend
Left
Right
Labels
Price
Time
Cancel
OK
```

## Fast-Test Recipe

From `chart v 1.4/chart/multichart-prod/harness`:

```powershell
$env:PORT='8791'
node serve.mjs
```

From `chart v 1.4/talaria-design`:

```powershell
$env:USE_LOCAL_CHART='1'
$env:CHART_BACKEND='http://127.0.0.1:8791'
npm run dev:live -- --host 127.0.0.1 --port 5174
```

Open:

```text
http://127.0.0.1:5175/pricing/?devMultichart=2v&mode=backtest
```

Use the top-right `DEV LAYOUT` overlay:

- `1`: return to single chart.
- `2`: mount `MultichartGrid` in `2v` mode with host tile A plus iframe panel B.
- `2x2`: mount host tile A plus iframe panels B/C/D.

The chosen non-single layout is persisted in:

```js
localStorage.getItem("talaria_devlive_multichart_layout")
```

Clear it by clicking `1` or running:

```js
localStorage.removeItem("talaria_devlive_multichart_layout")
```

To flip existing `__TALARIA_*` flags for a local probe, set them before the chart boots, for example from a Puppeteer `evaluateOnNewDocument` hook:

```js
window.__TALARIA_DISABLE_MULTICHART_SETTINGS_FLASH_FIX_V2 = true;
window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2 = true;
```

Or set persistent flags in DevTools before reloading:

```js
localStorage.setItem("talaria_single_runtime", "true");
```

## Verification

Completed:

- `ReadLints` on `TalariaV8bLive.jsx` and `MultichartGrid.jsx`: no linter errors found.
- `npm run build` from `chart v 1.4/talaria-design`: passed.
- Puppeteer `dev:live` multichart probe: passed.
- Puppeteer panel drawing/settings probe: passed.

Gate:

- `npm run gate` from `chart v 1.4/chart/multichart-prod/harness`: passed.
- Exit code: `0`.
- Summary: `[gate] PASS: no new regressions; 6 known-failing tracked.`
- Known-failing still red: `H-S34`, `H-S35`, `H-S40`, `H-S41`, `H-S42`, `H-S44`.
- Newly fixed: none.
- Regressions outside known-failing baseline: none.

## Invariant Check

- No chart engine files changed.
- No build ID bump.
- No harness scenarios or known-failing bookkeeping changed.
- Production build passed; the new layout overlay and settings cleanup relaxation are guarded by `import.meta.env.DEV`.

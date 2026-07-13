# T0 Step 5 - Vite Dev Proxy Fast Test Report

## Summary

Implemented the fast local React/chart test path for `npm run dev:live`.

The root cause was dev-server static routing: `live/index.html` loads `/chart/vendor/d3.min.js` before `chart.js`, plus `/chart/vendor/lz-string.min.js`, `/chart/fonts/*`, `/chart/pwa/*`, `/chart/manifest.webmanifest`, and `/chart/pwa-install.js`. `vite.config.live.js` proxied selected `/chart/*` paths but omitted those static asset paths. With `USE_LOCAL_CHART=1`, the local chart plugin only served `/chart/chart.js` and `/chart/modules/*`, so local chart boot could still miss vendor/static assets.

## Config Change

File changed:

- `chart v 1.4/talaria-design/vite.config.live.js`

Dev-only changes:

- `localChartModulesPlugin` now safely serves any existing static file under local `../chart/*` when `USE_LOCAL_CHART=1`.
- Added content-type handling for local static chart files.
- Added proxy entries for:
  - `/chart/vendor`
  - `/chart/fonts`
  - `/chart/pwa`
  - `/chart/manifest.webmanifest`
  - `/chart/pwa-install.js`

Production build behavior was not changed: `base`, `outDir`, and Rollup output settings are untouched.

## Local Boot Verification

Command shape used:

```powershell
# terminal 1, local stub backend
cd "chart v 1.4/chart/multichart-prod/harness"
$env:PORT='8791'; node serve.mjs

# terminal 2, Vite live shell using local chart tree
cd "chart v 1.4/talaria-design"
$env:USE_LOCAL_CHART='1'
$env:CHART_BACKEND='http://127.0.0.1:8791'
npm run dev:live -- --host 127.0.0.1 --port 5174
```

Vite auto-selected `http://127.0.0.1:5175/` because `5174` was already occupied. Browser verification result:

```json
{
  "boot": {
    "chartTruthy": true,
    "d3Truthy": true,
    "renders": 28,
    "timeframe": "1m"
  },
  "badChartResponses": [],
  "chartFailures": [],
  "consoleErrors": [],
  "interesting": [
    { "url": "/chart/fonts/talaria-fonts.css?v=20260712b5", "status": 200 },
    { "url": "/chart/pwa-install.js?v=20260712b5", "status": 200 },
    { "url": "/chart/manifest.webmanifest?v=20260712b5", "status": 200 },
    { "url": "/chart/vendor/d3.min.js?v=20260712b5", "status": 200 },
    { "url": "/chart/vendor/lz-string.min.js?v=20260712b5", "status": 200 },
    { "url": "/chart/modules/drawing-tools-manager.js?v=20260712b5", "status": 200 },
    { "url": "/chart/chart.js?v=20260712b5", "status": 200 }
  ]
}
```

## Fast-Test Recipe

Use this for seconds-fast local React/chart testing:

```powershell
cd "chart v 1.4/talaria-design"
$env:USE_LOCAL_CHART='1'
npm run dev:live
```

Open the Vite URL, usually `http://127.0.0.1:5173/`. With a local backend:

```powershell
$env:CHART_BACKEND='http://127.0.0.1:8791'
```

To test flags live, set the flag in DevTools before the interaction you want to test, for example:

```js
window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2 = false
window.__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2 = false
```

For boot-time flags, set them then reload the Vite page. No Docker rebuild is needed.

## Gate Bookkeeping

Files changed:

- `chart v 1.4/chart/multichart-prod/harness/known-failing.json`
- `homepage/public/chart/multichart-prod/harness/known-failing.json`

Added fallback-window known-failing entries:

- `H-S34`: `T1 fallback-(b) rollback window - migrated multichart behavior intentionally disabled; restore when T1 re-migration lands`
- `H-S35`: same fallback-window note
- `H-S44`: same fallback-window note

The gate ratchet also found `H-S38` and `H-S39` green on the current build, so they were removed from `knownFailing` as stale baseline entries.

Focused raw harness subset:

```text
npm run test -- --only=H-S32,H-S33,H-S34,H-S35,H-S36,H-S37,H-S43,H-S44 --runs=1
FINAL H-S32 PASS
FINAL H-S33 PASS
FINAL H-S34 FAIL-REAL-BUG
FINAL H-S35 FAIL-REAL-BUG
FINAL H-S36 PASS
FINAL H-S37 PASS
FINAL H-S43 PASS
FINAL H-S44 FAIL-REAL-BUG
```

Full gate result:

```text
Known failing baseline: H-S34, H-S35, H-S40, H-S41, H-S42, H-S44
Known-failing still red: H-S34, H-S35, H-S40, H-S41, H-S42, H-S44
Regressions (not in baseline but failed): (none)
Newly fixed (remove from known-failing): (none)
GATE H-S32 PASS
GATE H-S33 PASS
GATE H-S34 FAIL (known-failing)
GATE H-S35 FAIL (known-failing)
GATE H-S36 PASS
GATE H-S37 PASS
GATE H-S38 PASS
GATE H-S39 PASS
GATE H-S43 PASS
GATE H-S44 FAIL (known-failing)
[gate] PASS: no new regressions; 6 known-failing tracked.
```

Evidence files:

- `chart v 1.4/chart/multichart-prod/harness/t0-step5-focused-harness.txt`
- `chart v 1.4/chart/multichart-prod/harness/t0-step5-gate.txt`

## Verification

Commands run:

```powershell
node --check vite.config.live.js
node --check gate.mjs
node --check scenarios.mjs
npm run test -- --only=H-S32,H-S33,H-S34,H-S35,H-S36,H-S37,H-S43,H-S44 --runs=1
npm run gate
```

ReadLints: no linter errors for touched files.

## SHA256

```text
98CF39EBC092BB9E45D4A0F9FC2B2C5078CF171703729218427AC71F57782125  chart v 1.4/chart/multichart-prod/harness/known-failing.json
98CF39EBC092BB9E45D4A0F9FC2B2C5078CF171703729218427AC71F57782125  homepage/public/chart/multichart-prod/harness/known-failing.json
9824AFA38D158E3C3B5F18FE99C612D1FE511DDCFB56A99885EDE608D532E637  chart v 1.4/talaria-design/vite.config.live.js
```

No engine logic files were changed. No build id bump was performed.

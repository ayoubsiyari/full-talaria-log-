# Talaria Multichart — Phase 7.2 production foundation

This folder is **dormant infrastructure** for the in-page multi-panel feature (Phase 7.2). Nothing here runs unless an iframe is loaded with `?multichart=1`, and no part of the codebase spawns such iframes yet — that comes in Phase 7.2.2 (the React `<MultichartGrid>` component).

## How the final feature works (Phase 7.2 end-state)

```
/chart/  (existing dist-v9 React app — single page, no URL change)
├── Topbar (unchanged)
│   └── + small layout-icon button in top-right (Phase 7.2.3)
│        click → dropdown with grid of layouts + sync settings
│
├── Left toolbar (unchanged)
│
├── #chart-container (THIS is what splits)
│   ├── layout = 1 (default):  <canvas id="chartCanvas"> + axes  (TODAY's path)
│   └── layout > 1:             <MultichartGrid> renders a CSS grid of iframes:
│         ┌──────────────┬──────────────┐
│         │ <iframe       │ <iframe       │
│         │  src="/chart/ │  src="/chart/ │
│         │   dist-v9/?   │   dist-v9/?   │
│         │   multichart= │   multichart= │
│         │   1&panelId=A │   1&panelId=B │
│         │   &fileId=...│   &fileId=... │
│         │   &tf=..."> │   &tf=...">  │
│         │  → loads the │  → loads the │
│         │  full Talaria│  full Talaria│
│         │  app, hides  │  app, hides  │
│         │  all chrome, │  all chrome, │
│         │  shows just  │  shows just  │
│         │  chart canvas│  chart canvas│
│         └──────────────┴──────────────┘
│         Each iframe = isolated React + chart.js (per-panel drawings,
│         indicators, orders work independently).
│
├── Bottom replay/balance bar (unchanged)
├── Trade list (unchanged)
└── Right panel (unchanged)
```

## Files in this folder

| File | Purpose | Source of truth |
|---|---|---|
| `engine-api-guards.js` | `FORBIDDEN_SYNC_FIELDS` enforcement: snapshot/diff price-axis state, filter postMessage payloads. The single most important guard against the original v9 multichart bug. | **`../multichart/engine-api-guards.js`** (verbatim copy from sandbox) |
| `sync-bridge.js` | Iframe-side bridge. Wires `window.chart` events (crosshair-move, visible-range, symbol-change) to outbound postMessage; applies inbound sync messages with loop-guard + snap-to-bucket. | **`../multichart/sync-bridge.js`** (verbatim copy) |
| `multichart-manager.js` | Parent-side orchestrator. PEER fan-out, allowlist filtering on every relay, loop-guard via `causationId`. Used by `<MultichartGrid>` (Phase 7.2.2) to register iframes for sync. | **`../multichart/multichart-manager.js`** (verbatim copy) |
| `embed-bridge.js` | Iframe-side glue: waits for `window.chart` to exist (the React app boots chart.js asynchronously), installs the bridge, applies `?fileId/tf` initial context. Heartbeat diagnostics for the first 30s. | THIS FOLDER (Phase 7.2 production-only) |
| `panel-cmd-bridge.js` | **PHASE 7.2.4** — not yet built. Will receive parent topbar commands (`loadFile`, `setTimeframe`, `addIndicator`, `startTool`, `placeOrder`, etc.) and apply them to this iframe's React state / chart instance. | THIS FOLDER (when built) |

## Modifications outside this folder (Phase 7.2.1 — current)

| File | Change | Risk to /chart/ |
|---|---|---|
| `chart/dist-v9/index.html` | Add `?multichart=1` shim (~30 lines). When `?multichart=1` is **absent** the shim is a no-op — single-chart `/chart/` is byte-identical to today. When **present** (only inside future iframes), the shim adds `html.multichart-embed` class, injects style hiding `[data-v9-chrome="1"]`, and loads the four scripts in this folder. | **None** — fully gated. |
| `talaria-design/live/index.html` | Same shim (this is the source-of-truth that `npm run build:live` ships to `chart/dist-v9/index.html`). | None |
| `homepage/public/chart/dist-v9/index.html` | Same shim (mirror copy). | None |
| `chart/api_server.py` | Add static mount: `/chart/multichart-prod/` → this folder. **No entry route at `/chart/multi`** — the only way to reach this code is via iframes spawned by the future `<MultichartGrid>` React component. | None — purely additive static asset mount. |

After Phase 7.2.1 ships, `/chart/` behaves identically to today. The bridge sits dormant on disk waiting for Phase 7.2.2 to spawn iframes.

## Coming in Phase 7.2.2 — the React in-page iframe grid

`talaria-design/src/TalariaV8bLive.jsx` will get a new `<MultichartGrid>` sub-component rendered inside `#chart-container` when `layoutPanels.n > 1`. It will:
- read the existing `layoutPanels` state to size the CSS grid
- spawn one iframe per panel pointing at `/chart/dist-v9/?multichart=1&panelId=X&fileId=...&tf=...&mode=...`
- mount one `MultichartManager` and register all iframes for sync
- track focused panel (last-clicked → blue border)

Topbar/leftbar action redirect (Phase 7.2.4) and the dropdown layout picker (Phase 7.2.3) come after the grid renders correctly.

## Forbidden fields (still enforced — this is the only thing protecting against the original bug)

`engine-api-guards.js` filters every inbound and outbound postMessage envelope. If a payload contains any of these keys, it's dropped with a console error and reported up via `assertion-report`:

```
priceMin, priceMax, autoScale, priceZoom, priceOffset,
manualCenterPrice, manualRange, mode, scaleType,
timeframe, indicators, drawings, chartType
```

This is the same filter verified through Phase 6 of `multi_chart_rebuild_roadmap.md` (data gaps, TF switching, add/remove, refresh, throttled CPU). Per-panel state never crosses the iframe boundary; only **time-axis** sync (crosshair time bucket, visible time range) crosses, and even that is filtered defensively on both sides.

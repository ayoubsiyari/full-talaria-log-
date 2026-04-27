# V9 Live Integration Plan

Goal: take the V9 React mockup at `talaria-design/src/TalariaV8b.jsx` and turn it into the **real working chart** by wiring the existing chart scripts (`chart/chart.js` + `chart/modules/*.js`) into it. Original mockup file stays buildable; the legacy `chart/index.html` stays untouched as a fallback.

---

## 1. Target architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser                                                          │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  React app (talaria-design) — renders V9 chrome & state    │   │
│  │  ┌──────────────────────────────────────────────────────┐  │   │
│  │  │ <TalariaV8bLive />                                   │  │   │
│  │  │   - Top bar (logo, instrument, indicators, TFs, …)   │  │   │
│  │  │   - Left rail (drawing tools)                         │  │   │
│  │  │   - Replay bar                                        │  │   │
│  │  │   - Positions panel                                   │  │   │
│  │  │   - Order panel                                       │  │   │
│  │  │   - Right sliding panels                              │  │   │
│  │  │                                                        │  │   │
│  │  │   Chart-area DIV contains:                            │  │   │
│  │  │     <canvas id="chartCanvas">  ← chart.js renders     │  │   │
│  │  │     <svg id="drawingSvg">      ← drawing tools render │  │   │
│  │  │     <div id="priceAxisZone">                          │  │   │
│  │  │     <div id="timeAxisZone">                           │  │   │
│  │  └──────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────┬──────────────────────────────┘   │
│                                │                                   │
│                                │ DOM bridge                        │
│                                ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  Existing legacy scripts (loaded as <script>)              │   │
│  │  ┌──────────────────────────────────────────────────────┐  │   │
│  │  │ chart.js — `window.Chart`, `window.chart`            │  │   │
│  │  │ modules/drawing-tools-manager.js                     │  │   │
│  │  │ modules/order-manager.js                             │  │   │
│  │  │ modules/replay-system.js                             │  │   │
│  │  │ modules/chart-indicators-full.js                     │  │   │
│  │  │ modules/alert-system.js                              │  │   │
│  │  │ modules/timeframe-favorites.js                       │  │   │
│  │  │ … + ~30 others                                       │  │   │
│  │  └──────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────┬──────────────────────────────┘   │
│                                │                                   │
│                                │ HTTP / WS                         │
│                                ▼                                   │
└──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                    FastAPI backend (api_server.py)
```

**Key insight**: `chart.js` already supports being mounted on any `<canvas>` element. Constructor at `chart/chart.js:115-144`:

```js
class Chart {
  constructor(canvasElement = null, svgElement = null, options = {}) {
    if (canvasElement) { this.canvas = canvasElement; this.isPanel = true; }
    else { this.canvas = document.getElementById('chartCanvas'); this.isPanel = false; }
    …
  }
}
```

And it auto-initializes itself on `DOMContentLoaded` (line 19638), creating `window.chart = new Chart()` automatically — **provided** the DOM has `#chartCanvas` and `#drawingSvg`. So if React renders those two elements with the right IDs, `chart.js` just works with **zero code changes**.

The challenge is wiring the **other modules** (drawing tools, orders, replay, etc.) — they bind to ~542 specific DOM IDs.

---

## 2. Three-tier integration strategy

Each existing module gets categorized by how we bridge it:

### Tier A — "Just works" (0 effort)
Modules that only read the chart canvas + global API (`window.chart`):

| Module | Why it just works |
|---|---|
| `chart.js` | Auto-mounts to `#chartCanvas` |
| `modules/chart-indicators-full.js` | Extends `Chart.prototype` |
| `modules/chart-env.defaults.js` | Reads `window.chart` |
| `modules/chart-env.generated.js` | Reads `window.chart` |
| `modules/market-calculations.js` | Pure helpers, no DOM |
| `modules/preferences-init.js` | Reads localStorage |
| `modules/preferences-sync.js` | localStorage + window |

### Tier B — "Needs ID match" (low effort per module)
Modules that bind to specific element IDs. JSX renders elements with those IDs and the module attaches handlers automatically:

| Module | IDs JSX must render |
|---|---|
| `modules/drawing-tools-manager.js` | `cursorTool`, `trendlineTool`, `horizontalLineTool`, `fibonacciTool`, `rectangleTool`, `brushTool`, `textTool`, `measureTool`, `eraserTool`, `magnetMode`, `keepDrawingMode`, `clearDrawings`, `undoBtn`, `redoBtn`, `visibilityMenu` (+ ~50 sub-tool IDs in dropdowns) |
| `modules/timeframe-favorites.js` | `timeframeFavorites`, `timeframeDropdown`, `timeframeDropdownMenu`, `currentTimeframeLabel`, `sidebarTimeframes`, `sidebarTfFlyoutBtn`, `sidebarTimeframeDropdownBtn` |
| `modules/keyboard-shortcuts.js` | `editShortcutsBtn`, `editShortcutsModal`, `closeShortcutsModal` |
| `modules/favorites-manager.js` | `favoritesToolbar`, `favoritesTools` |
| `modules/undo-redo-manager.js` | `undoBtn`, `redoBtn` |
| `modules/screenshot-manager.js` | `screenshotBtn`, `chartScreenshotPreviewModal`, `closeScreenshotModal`, `downloadScreenshot`, `imageQuality`, `includeDrawings`, `includeWatermark`, `includeToolbar`, `includeSidebar`, `copyToClipboard` |
| `modules/compare-overlay.js` | `compareBtn`, `compareModalOverlay`, `compareModalClose`, `compareSearchInput`, `compareSymbolsList`, `compareOverlaysList`, `compareAddedPills`, `compareActiveOverlays` |

**Effort per Tier-B module**: 30 minutes to a few hours depending on complexity. Mostly: render JSX buttons with `id="…"` attributes that match what the module expects.

### Tier C — "Needs API extraction" (medium effort per module)
Modules that inject their own complex HTML into the DOM. We extract a clean public API the JSX can call:

| Module | Current behavior | What we extract |
|---|---|---|
| `modules/order-manager.js` | Injects full Order Panel HTML into `#orderPanel`. ~200 KB. | `OrderManager.placeOrder({side, qty, entry, sl, tp, …})`, `.cancel(id)`, `.modify(id, opts)`, `.subscribe(callback)` |
| `modules/replay-system.js` | Renders replay bar + controls inline | `Replay.start()`, `.pause()`, `.setSpeed(x)`, `.skipForward()`, `.gotoDate(d)`, `.subscribe(callback)` |
| `modules/economic-news-sidebar.js` | Injects sidebar HTML | `News.openPanel()`, `.closePanel()`, `.refresh()` |
| `modules/alert-system.js` | Manages alert lines + popup | `Alerts.add({price, msg})`, `.list()`, `.remove(id)` |
| `modules/propfirm-tracker.js` | Renders propfirm dashboard | `PropFirm.getStats()`, `.subscribe(callback)` |
| `modules/panel-manager.js` | Multi-panel layout | `Panels.setLayout('1'/'2v'/'3h'/...)`, `.activePanel()`, `.split(direction)` |
| `modules/order-event-bus.js` | Already an event bus | Use directly: `window.orderEventBus.on('order:placed', handler)` |
| `modules/order-service.js` | HTTP client for orders | Use directly via `window.orderService.placeOrder(...)` |

**Effort per Tier-C module**: 4 hours to 1 day depending on complexity.

### Tier D — "Keep legacy markup hidden" (no effort but ugly)
For modals/dialogs the user rarely sees, we can keep the existing HTML markup as-is in a hidden `<div id="legacy-modals">` container. JSX buttons call existing `window._openMode('settings')` / `window._spOpen('news')` to trigger them. Modals will visually be the legacy style for now, redesigned later.

| Component | Trigger from JSX | Effort |
|---|---|---|
| Settings dialog | `window._spOpen('settings')` (already exists) | 0 |
| Indicator settings | `window._openMode('indicator-settings')` | 0 |
| Challenge passed/failed modals | Auto-triggered by `propfirm-tracker.js` | 0 |
| Compare overlay modal | `compareBtn.click()` | 0 |
| Custom timeframe modal | `customTimeframeBtn.click()` | 0 |
| Instrument settings modal | `instrumentSettingsBtn.click()` | 0 |
| MFE/MAE settings modal | Same pattern | 0 |
| Trade details modal | `closeTradeDetails` etc. | 0 |
| All trades table modal | `viewAllTradesBottomBtn.click()` | 0 |

This means JSX redesigns the **chrome** but legacy modals stay legacy until a future polish phase.

---

## 3. Build & deploy

### Dev build
```
cd talaria-design
npm install      # already has react, react-dom, vite
npm run dev      # serves the JSX at http://localhost:5173
```

The Vite dev server will load:
- The JSX components (V9 chrome)
- The legacy chart scripts via `<script>` injection in `index.html` (Vite's entry HTML)
- Backend at `http://31.97.192.82:3000` (the FastAPI server)

CORS already allows this since `api_server.py` has CORS middleware enabled.

### Prod build
```
cd talaria-design
npm run build    # outputs to dist/
```

The output `dist/` directory contains:
- `index.html` — entry
- `assets/index-[hash].js` — bundled React
- `assets/index-[hash].css` — bundled styles

We then either:
- **Option A**: serve from Vite's preview (port 4173)
- **Option B (recommended)**: copy `talaria-design/dist/*` to `chart v 1.4/chart/dist/` and let `api_server.py` serve it. The line `if file_name == "index.html" and Path("dist/index.html").is_file(): return FileResponse("dist/index.html")` (already in `api_server.py:12046`) will pick it up automatically. So `/chart/index.html` will serve the V9 build.

This means the V9 build replaces the legacy `index.html` *only when `dist/index.html` exists*. Delete `dist/` to fall back to legacy.

### Loading legacy scripts inside the React app

In `talaria-design/index.html` we add `<script>` tags for the legacy modules:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
<script src="/chart/chart.js"></script>
<script src="/chart/modules/drawing-tools-manager.js"></script>
<!-- … all the other modules … -->
```

These scripts mutate `window` globals which React components then call.

---

## 4. Phase-by-phase delivery

### Phase 0 — Workspace setup (~ 2 hours)
- Copy `talaria-design/src/TalariaV8b.jsx` → `talaria-design/src/TalariaV8bLive.jsx`. Original mockup stays untouched.
- Switch `talaria-design/src/main.jsx` (or App.jsx) to import the new `TalariaV8bLive` component.
- Add `<script>` tags to `talaria-design/index.html` for D3 + chart.js + critical modules.
- In `TalariaV8bLive.jsx`, replace the SVG mock chart area with a real `<canvas id="chartCanvas">` + `<svg id="drawingSvg">` + axis zone divs.
- Add a `useEffect` that waits for `window.chart` to exist, then triggers a chart resize.
- Get a basic candle render from a hard-coded test file.

**Deliverable**: V9 chrome shows real candles loaded from the backend.

### Phase 1 — Symbol & timeframe wiring (~ 4 hours)
- JSX symbol picker → calls `window.chart.loadFile(fileId)` (or whatever the chart's loader is).
- JSX timeframe pills → call `window.chart.setTimeframe(tf)`.
- Subscribe to chart events to keep React state in sync (chart-rendered, timeframe-changed).

**Deliverable**: Click a timeframe in V9, the chart actually changes timeframe.

### Phase 2 — Drawing tools (~ 1.5 days)
- JSX left-rail tool buttons render with `id="cursorTool"` etc. (Tier B IDs).
- `drawing-tools-manager.js` finds and binds to them automatically.
- Tool flyout dropdowns: JSX renders them, but inner items get the legacy IDs the manager expects.
- Wire JSX `tool` state ↔ manager (manager already exposes `setTool(tool)`).

**Deliverable**: All drawing tools (trendline, fib, rect, brush, etc.) work from the V9 left rail.

### Phase 3 — Order panel (~ 1 day)
- Extract `OrderManager` public API: `placeOrder({…})`, `subscribe(cb)`, `cancel(id)`.
- JSX Order Panel calls `OrderManager.placeOrder(...)` on submit.
- `OrderManager` draws SL/TP lines on chart (already does — no change needed).
- JSX subscribes to order events to update its own visible state.

**Deliverable**: V9 Order Panel places real orders, SL/TP lines render.

### Phase 4 — Replay system (~ 1 day)
- Extract `Replay` API: `start`, `pause`, `setSpeed`, `skip`, `gotoDate`, `subscribe`.
- JSX replay bar wires play/pause/speed/skip/goto buttons.

**Deliverable**: Replay works from V9 replay bar.

### Phase 5 — Positions panel (~ 1 day)
- Extract `Positions` API or reuse `orderEventBus` events.
- JSX positions panel tabs (All / Pending / Open / History / Analytics) populate from real data.

**Deliverable**: V9 positions panel shows real trade data.

### Phase 6 — Indicators (~ 1 day)
- JSX Indicators dialog reuses the legacy `#indicator-settings-modal` (Tier D).
- JSX "Indicators" button triggers `indicatorsBtn.click()` programmatically.
- The legacy modal handles the rest.

**Deliverable**: Indicators work, dialog is legacy-styled (redesign later).

### Phase 7 — Alerts, screenshots, compare, propfirm (~ 1 day)
- All Tier B/D — JSX buttons get the right IDs or trigger legacy clicks.

### Phase 8 — Polish (~ 2-3 days)
- Settings dialog redesign (Tier C, full extraction).
- Profile / FAQ dialogs (currently simplified in mockup).
- Edge cases (multi-panel mode, custom timeframes, full-screen).

**Total: ~10 working days for full feature parity.**

---

## 5. Decisions / risks

### Decisions locked in (2026-04-27)
1. **Serve location**: `chart/dist/`. `npm run build` in `talaria-design/`, copy `dist/*` to `chart v 1.4/chart/dist/`. `api_server.py:12046` already prefers `dist/index.html` when it exists, so `/chart/index.html` will serve the V9 build automatically. Delete `chart/dist/` to fall back to legacy.
2. **Modal redesign**: ALL modals get redesigned in JSX from the start. No "legacy-styled" modals. Phase 8 polish is now ~3 days instead of ~0. Total estimate becomes ~13 working days.
3. **Multi-panel**: Single-panel only for Phases 0-7. Multi-panel becomes Phase 9 after feature parity. `panel-manager.js` is loaded but not wired to JSX initially.

### Risks
- **Module coupling**: Some modules (especially `drawing-tools-manager` and `order-manager`) are large and rely on specific CSS classes, not just IDs. Tier B works for IDs, but CSS classes may need addition too. We will discover these per-module.
- **Race conditions**: React mount vs. legacy script `DOMContentLoaded`. Need a `chart-ready` event the React component can wait on.
- **Hot reload**: Vite HMR may try to remount the JSX while the legacy chart instance still owns the canvas. Workaround: detect remount and tear down chart instance first.
- **Build size**: TalariaV8b.jsx is 12,800 lines / 96 KB. With React + bundled it's ~250 KB JS. Plus legacy modules ~2 MB. Total payload ≈ 2.3 MB (unminified). Acceptable.

---

## 6. What I need from you to start

- **Pick decision (1)**: serve location for V9 build.
- **Pick decision (2)**: which legacy modals are acceptable to keep "legacy-styled" for now.
- **Pick decision (3)**: single-panel only first, or full multi-panel from day one?
- **Approve phase order**: above is my recommendation; happy to reorder.

Once approved, **Phase 0 starts with copying `TalariaV8b.jsx` → `TalariaV8bLive.jsx`** and the original mockup stays pristine in `TalariaV8b.jsx` forever as the design reference.

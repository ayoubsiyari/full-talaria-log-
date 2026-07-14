# T1 Step 19 — Esc / Delete / marquee / Objects-Tree transport diagnostic (D-012)

## 1. Task + RC

- **Task:** T1 step 19 — diagnostic-first (D-012): while Lane 4 rebuilds the honest harness, trace real transport roots on the **built product** for Esc, Delete, Ctrl+drag marquee, and Objects-Tree duplication; prototype switch-gated fixes ready to land when honest measurement exists. Step-18 settings transport is the template (sync parent path + guard + real actuation).
- **RC:** RC-1 (selection / quick-settings routing) for Esc/Delete/marquee; **RC-4** (peer sync) for Objects-Tree duplication (`PLAN2-FOUND#3`).

### Shared transport family (Esc + Delete + marquee)

All three cross the same parent↔iframe boundary and are already bundled under **`window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2`** (parent-authoritative for iframe embeds; step 16/17/18). The step-18 lesson applies: **harness greens used synthetic in-iframe `handleKeyDown` / `ctrlDragMarqueeInIframe` — not real parent-shell keyboard or real Ctrl+mouse at iframe coordinates** (I15 / D-012). PO live gaps are expected until Lane 4 honest harness + these transport fixes are PO-confirmed.

---

## 2. What I changed — file by file

Diagnostic report with **prototype fixes staged** (not harness-proven). Lane 4 harness files untouched.

| File | What / why |
|------|------------|
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx` | **`isDrawingToolDismissKeyTarget`**: include `selectedDrawing` + visually-selected drawings (was `selectedDrawings[]` only). Parent Esc forwarder (`onParentDismissDrawingKey` ~5776) was no-op when iframe selection lived only in `dm.selectedDrawing` — the common single-click path. |
| `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js` | Iframe capture path: gate Esc/Delete on parent switch (`multichartKeyboardTransportFixEnabled` reads **parent** `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2`); widen dismiss-target check; **new `onDeleteDrawingKey`** capture handler (iframe had Esc only — Delete never crossed boundary when focus stayed in iframe); fix `dismissActiveDrawingTool` `had` probe. |
| `homepage/public/chart/multichart-prod/panel-cmd-bridge.js` | Byte-identical mirror (I8). SHA256 `B3C16C7A…`. |
| `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx` | Objects Tree rebuild (~19050): **dedupe on stable synced `id` / `__syncId` first** when `enumerateDrawingManagers()` returns >1 panel (`__TALARIA_DISABLE_OBJECTS_TREE_MULTICHART_DEDUPE_V1` kill-switch). Prior geometry dedupe used panel-local `points.x` which differs per tile even when `id` is identical (`chart.js` `receiveDrawingChange` ~37545). |

**No other files touched.** `react-parity-lib.mjs` / scenario files not edited (Lane 4 exclusive).

### Transport roots traced (mechanism)

#### 1) Esc — clear selection + parent chrome

| Leg | File:line | Mechanism |
|-----|-----------|-----------|
| Parent shell keydown (focus often here after iframe click) | `MultichartGrid.jsx` ~5776–5827 | `onParentDismissDrawingKey` capture on `document`; gated `multichartSettingsFlashFixEnabled()`; reads `focusedPanelIdRef` → `getChartForPanelId` (iframe `contentWindow.chart` ~5428) → `isDrawingToolDismissKeyTarget` → `runCommand("clearActiveDrawingTool", { panelId })` → `closeDrawingSettingsForPanel` → `v9DrawingToolCleared`. |
| Iframe capture (focus inside iframe) | `panel-cmd-bridge.js` ~3919+ | `onDismissDrawingKey` capture → `dismissActiveDrawingTool` → `notifyParentDrawingToolCleared` (`v9-drawing-tool-cleared` postMessage). |
| Iframe drawingManager | `drawing-tools-manager.js` ~5560–5627 | `d3.select(window).on('keydown')` → `handleKeyDown`; Esc under blocked-settings UI + normal path: `deselectAll({ fromCanvasBackground: true })` + `requestMultichartParentCloseDrawingSettings()` when quickbar fix on. |
| Parent V9 chrome | `TalariaV8bLive.jsx` ~19537 | `v9DrawingToolCleared` → `runCommandIframes("clearActiveDrawingTool")` + rail reset. Settings close via `multichart-close-drawing-settings` postMessage (~6294). |

**Root cause (real product):** Parent forwarder and iframe bridge **`isDrawingToolDismissKeyTarget` ignored `dm.selectedDrawing`** (single-click select path). Parent Delete forwarder already checked singular selection — Esc/Delete were asymmetric. Harness injected `handleKeyDown` directly, masking the parent-shell path.

#### 2) Delete / Backspace — remove from store

| Leg | File:line | Mechanism |
|-----|-----------|-----------|
| Parent shell | `MultichartGrid.jsx` ~5805–5824 | `onParentDeleteDrawingKey` → `hasSelection` on focused panel dm → `runCommand("deleteSelectedDrawings")`. |
| Iframe cmd bridge | `panel-cmd-bridge.js` ~2555 | `deleteSelectedDrawings` case: slice `selectedDrawings` + `selectedDrawing` fallback → `dm.deleteDrawing`. |
| Iframe keydown (gap fixed) | `panel-cmd-bridge.js` **new** `onDeleteDrawingKey` | Capture Delete/Backspace in iframe when parent switch on — previously only `drawing-tools-manager.handleKeyDown` (window keydown via d3) and parent forwarder; no bridge capture for Delete. |
| drawingManager | `drawing-tools-manager.js` ~5587–5607 | Local delete when `multichartQuickbarSettingsFixEnabled()`; early return when iframe + switch OFF. |
| Sync fan-out | `sync-bridge.js` ~1734+ / `chart.js` ~37480 | `deleteDrawing` → outbound `drawing-remove` → peer panels via manager fan-out. |

**Root cause (real product):** Same focus boundary as Esc; iframe Delete relied on d3 `window` keydown routing through `getActiveChart()` — fragile when parent holds focus. Parent `runCommand` path is correct but only fires when parent capture runs and selection probe passes.

#### 3) Ctrl+drag marquee — blue border + multi-select

| Leg | File:line | Mechanism |
|-----|-----------|-----------|
| Gesture start | `chart.js` ~31351–31436 | `tryStartCtrlMarqueeSelect` on `document`/`pointerdown` capture inside **iframe document**; requires cursor tool, empty chart hit, `_isCursorSelectMode()`; gated: iframe reads **parent** `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` (~31358). |
| Drag continuation | `chart.js` ~31280–31348 | `startCtrlMarqueeDocumentTracking` — document-level `pointermove`/`pointerup` (step-8 `__TALARIA_DISABLE_CTRL_MARQUEE_FIX` overlay). |
| Blue border | `chart.js` ~18802–18829 | `_isCtrlMarqueeFixEnabled()` + `_syncCtrlMarqueeSelectOverlay`. |
| Commit selection | `chart.js` ~31297–31307 | `completeCtrlMarqueeSelectFromEvent` → `dm.completeCtrlMarqueeFromChart`; bbox fallback in `drawing-tools-manager.js` `isDrawingInRectangle` (step 16). |

**Root cause (real product):** Entirely **iframe-local pointer transport** — parent shell never participates. Real Ctrl+drag must deliver `ctrlKey` on `pointerdown` **inside the iframe canvas document**. Harness greens used **synthetic in-iframe Ctrl events** (`ctrlDragMarqueeInIframe`). PO failures = real mouse+Ctrl at iframe coordinates not starting `ctrlMarqueeSelect` (armed tool, hit on drawing DOM, parent switch OFF, or pointer not reaching iframe). **No additional product patch proposed beyond existing step-8/16 gates** until honest harness measures real pointer path.

#### 4) Objects Tree duplication (PLAN2-FOUND#3, 4-panel)

| Leg | File:line | Mechanism |
|-----|-----------|-----------|
| Sync mirror | `sync-bridge.js` ~1734+ → `chart.js` ~37480 | `drawing-add` applies same `drawingData.id` on every peer (`drawingObj.id = drawingData.id` ~37545). |
| Tree enumeration | `TalariaV8bLive.jsx` ~3685 `enumerateV9DrawingManagersFromWindow` | Uses `grid.enumerateDrawingManagers()` → host dm + every iframe dm (~`MultichartGrid.jsx` 5449). |
| Tree build | `TalariaV8bLive.jsx` ~19050 `rebuildNow` | Iterates **all** managers' `dm.drawings`; prior dedupe keyed on `points.x:y` geometry — **differs per panel** even when `id` matches → 4× rows in 4-panel layout. |

**Root cause:** Enumeration is correct for “show everything” but dedupe signature was wrong for synced copies. Stable key is **`id` / `__syncId`**, not panel-local index geometry.

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Gated files / paths |
|--------|---------|---------------------|
| `window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` | OFF (fix on) | Esc/Delete/marquee bundle: `MultichartGrid.jsx` parent forwarders; `panel-cmd-bridge.js` iframe Esc/Delete capture; `drawing-tools-manager.js` iframe Delete/Esc bridge; `chart.js` iframe marquee start + `_isCtrlMarqueeFixEnabled`. **Parent switch is authoritative for iframes** (I14). |
| `window.__TALARIA_DISABLE_CTRL_MARQUEE_FIX` | OFF | `chart.js` document-tracking + SVG overlay only (step 8). Independent of quickbar bundle except iframe marquee also checks quickbar switch. |
| `window.__TALARIA_DISABLE_OBJECTS_TREE_MULTICHART_DEDUPE_V1` | OFF (dedupe on) | `TalariaV8bLive.jsx` `rebuildNow` id-first dedupe when `managers.length > 1`. Switch ON restores pre-step-19 geometry-only dedupe (duplicates return). |

Switch OFF on parent before load must revert: parent Esc/Delete forwarders, iframe bridge Esc/Delete capture, iframe marquee start, Objects-Tree id dedupe.

---

## 4. Proof — RED → GREEN

**No harness proof run** — Lane 4 owns `react-parity-lib.mjs`; D-012 forbids proxy greens on the old synthetic harness for acceptance.

### Build staged for PO

```powershell
cd "chart v 1.4/talaria-design"
npm run build:live
```

- **Build id:** `20260712b105`
- **Actuation:** not run on harness (diagnostic + prototype only).
- **Measurement:** PO live-confirm on real built product only (I15).

### SHA256 (canonical)

| File | SHA256 |
|------|--------|
| `MultichartGrid.jsx` | `4EC2BEB23F86BFEA1C598EE4FA2B30686F30533029D8CB0B769B608FCCAB5404` |
| `TalariaV8bLive.jsx` | `547506D7D165CC64A5898E2E0181A1086D95475CD26BCF359779AE29FDFC86D0` |
| `panel-cmd-bridge.js` (both trees) | `B3C16C7AB285F20DED745BF0DD5D7546248147D20D80692C942FE018C1796B95` |

### Expected RED before PO (honest)

- Esc on panel B with single-click selection: parent forwarder no-op (`isDrawingToolDismissKeyTarget` false) — **addressed in prototype**.
- Delete with parent focus: iframe bridge had no Delete capture — **addressed in prototype**.
- Marquee: real Ctrl+mouse in iframe — **unchanged engine path**; awaits Lane 4 honest pointer actuation.
- Objects Tree 4-panel: N drawings × P panels — **addressed in prototype** (id-first dedupe).

---

## 5. Invariants checked

| Invariant | How |
|-----------|-----|
| I8 P-invariant | `panel-cmd-bridge.js` mirrored; `build:live` runs `sync-v9-to-homepage`. |
| I13 kill-switch | Esc/Delete/marquee under existing quickbar switch; Objects Tree new `__TALARIA_DISABLE_OBJECTS_TREE_MULTICHART_DEDUPE_V1`. |
| I14 iframe boundary | Parent forwarders use `runCommand` / postMessage only; iframe bridge capture; parent switch authoritative. |
| I15 no proxy greens | No harness run; status DIAGNOSTIC-ONLY pending PO. |
| L1 build id | Prototype built to `20260712b105`; PO confirms inside panel B iframe. |
| D-012 | Did not edit `react-parity-lib.mjs` or scenarios. |

---

## 6. What I did NOT do / limits

- **Did not edit** `react-parity-lib.mjs`, `react-parity-scenarios.mjs`, or `known-failing.json` (Lane 4).
- **Did not run** `react-run.mjs` / `gate:react` — old harness actuation is synthetic; would not satisfy D-012 acceptance.
- **Marquee:** no new engine patch — diagnostic concludes existing step-8/16 path is correct; failure mode is **measurement + real pointer delivery**, not missing code on the transport diagram. If PO still sees no blue border after Esc/Delete fixes, next probe is live `ctrlMarqueeSelect.active` during real drag inside iframe (Lane 4 honest harness).
- **Esc parent chrome:** `onV9DrawingToolCleared` does not call `v9DismissQuickBar` when `editingDrawingRef` is set — possible residual quick-bar if PO opens settings then Esc; track separately if reported.
- **Objects Tree:** id-dedupe assumes sync preserves `id` (true for normal adds per `receiveDrawingChange`); live-preview `live_*` ids still use geometry fallback.

---

## 7. Live-verification handoff

**Build:** `20260712b105` (confirm `?v=20260712b105` inside panel B iframe devtools).

### Esc (panel B iframe)

1. 2-panel multichart backtest; place rectangle on panel B.
2. **Single-click** select (not double-click) — verify handles visible.
3. Press **Esc** (do not click inside iframe first — parent focus case).
4. **Pass:** selection handles gone on B; V9 quick-bar / settings chrome dismissed on parent.

**Switch check:** `window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2 = true` on parent before load → Esc should revert to pre-fix behavior.

### Delete (panel B iframe)

1. Select rectangle on panel B (single-click).
2. Press **Delete** with focus on chart area (parent shell focus).
3. **Pass:** drawing removed on all synced panels; no ghost toolbar.

Repeat with focus inside iframe (click canvas then Delete).

### Ctrl+drag marquee (panel B iframe)

1. Disarm draw tool (crosshair cursor).
2. Hold **Ctrl**, drag on **empty** chart area **inside panel B canvas** (real mouse — not keyboard shortcut).
3. **Pass:** blue rectangle border visible during drag; on release, multiple drawings selected if enclosed.

**Switch check:** parent `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2 = true` → marquee should not start in iframe.

### Objects Tree (4-panel)

1. 4-panel layout; drawing sync on; place 3 brushes + 1 rectangle on any panel.
2. Open right rail **Objects Tree**.
3. **Pass:** exactly 4 rows (Brush 1, Brush 2, Brush 3, Rectangle) — not 16.

**Switch check:** `window.__TALARIA_DISABLE_OBJECTS_TREE_MULTICHART_DEDUPE_V1 = true` → duplicates return (4× each).

---

## 8. Status

**DIAGNOSTIC-ONLY (prototype staged on `20260712b105`)** — transport roots traced; switch-gated fixes landed for Esc dismiss-target, iframe Delete capture, and Objects-Tree id dedupe. Marquee transport documented; awaits Lane 4 honest harness + PO live-confirm on real mouse+Ctrl. Not **DONE (proven)** per I15/D-012 until PO confirms on built product.

# T1 Step 1 — Shared Tool-Lifecycle Ownership Diagnostic

**Task:** T1 step 1 (Lane 1) — RC-1 diagnostic  
**Worker:** Lane 1 (senior)  
**Date:** 2026-07-12  
**Scope:** Read-only. No code changes. Design input only; store implementation gated behind Director approval.

**RC:** RC-1  
**Symptom families:** first-click-fails (30), ghost-after-delete (19), selection-desync (43), stale-quick-menu (24)  
**Registry refs:** TAL-00322, TAL-00157, TAL-00106, TAL-00117, TAL-00118, TAL-00123, TAL-00148, TAL-00150, TAL-00257, TAL-00276 (`TICKET-ANALYSIS.md` §3)

**Verdict:** RC-1 confirmed. There is no single lifecycle owner. Selection, hover, edit, menu, settings, labels, object tree, and legacy chart paths each hold independent state or object references.

**Explicit confirmation: no files were edited during this diagnostic.** This report is the sole deliverable artifact.

---

## 1. Ownership table (primary deliverable)

| State | Owner(s) | Set site (file:line) | Read site(s) (file:line) | Can desync with |
|---|---|---|---|---|
| **Armed / current tool** | `DrawingToolsManager.currentTool`; `DrawingState.currentTool`; legacy `Chart.tool`; favorites toolbar active class | `chart v 1.4/chart/modules/drawing-tools-manager.js:2822` (`setTool`); `chart v 1.4/chart/modules/drawing-tools-base.js:2976-2980` (`DrawingState.startDrawing`); `chart v 1.4/chart/chart.js:602` (init `this.tool`); `chart v 1.4/chart/modules/favorites-manager.js:646-656` (`updateActiveState`) | `chart v 1.4/chart/modules/compare-overlay.js:1993-2006`; `chart v 1.4/chart/chart.js:16768-16771`, `31159-31162`, `32566-32567`; `chart v 1.4/chart/modules/drawing-tools-manager.js:4190-4196`, `2870-2872` | Panel tool inheritance (`drawing-tools-manager.js:3514-3527`); legacy `Chart.tool` SVG path; favorites active class |
| **In-progress placement** | `DrawingState.isDrawing`, `tempPoints`, `currentDrawing`; manager `isDraggingFirstTwo`, `isDrawingPath`, `tempGroup` | `drawing-tools-manager.js:4193-4196` (`startDrawing`); `drawing-tools-base.js:2976-2984` (`addPoint`); `drawing-tools-manager.js:4275-4316` (`addPoint` → `finalizeDrawing`) | `drawing-tools-manager.js:2870-2872` (`_isPlacementModeActive`); `drawing-tools-manager.js:4830-4834`, `4966-4967`; `drawing-tools-manager.js:11320-11321` | `currentTool`; placement pointer-events (`drawing-tools-manager.js:2889-2902`); first-click render/selection emit |
| **Selected drawing (manager)** | `DrawingToolsManager.selectedDrawing`; `selectedDrawings[]`; per-tool `drawing.selected` | `drawing-tools-manager.js:9501-9580` (`selectDrawing`); `drawing-tools-base.js:2280-2297` (`select`); `drawing-tools-manager.js:4057-4061`, `6705-6708` | `drawing-tools-manager.js:9607-9634` (`_updateAxisZonePointerEvents`); `keyboard-shortcuts.js:948-951`; `order-manager.js:21731-21746`; `drawing-toolbar.js:1717-1719` | Toolbar, settings, object tree, axis labels, V9 quick bar, legacy chart index |
| **Selected drawing (legacy chart)** | `Chart.selectedDrawing` (index into `Chart.drawings[]`) | `chart.js:614` (init); `chart.js:32577-32594` (mousedown select); `chart.js:32890-32910` (legacy create+select); `chart.js:34688-34690` (`showContextMenu`) | `chart.js:33230-33240` (`redrawDrawings`); `chart.js:18949-18960` (Escape/Delete); `chart.js:34848-34858` (chart context menu deselect) | `DrawingToolsManager.selectedDrawing` (object ref vs index); manager delete path |
| **Hovered drawing** | Manager `_hoveredDrawing`, `_hoverHandleBoundDrawingId`; per-element D3 `mouseenter`/`mouseleave`; tool-local marker opacity | `drawing-tools-manager.js:265-266` (init); `drawing-tools-manager.js:7353-7420` (`handleMouseEnter`); `drawing-tools-manager.js:8834-8838`; `drawing-tools-advanced-volume.js:876-896` (marker opacity from `this.selected`) | `drawing-tools-manager.js:9607-9612`; `drawing-tools-manager.js:7450-7453`; `drawing-tools-manager.js:2262` (`checkDrawingProximity`) | `drawing.selected`; anchored-VWAP marker state; SVG z-index/pointer-events |
| **Editing / resizing** | Manager `isResizing`, `resizingDrawing`, `resizingPointIndex`; `isCustomHandleDrag`, `customHandleDrawing`; `DrawingSettingsPanel.currentDrawing`; inline text editor | `drawing-tools-manager.js:9030-9038` (`startHandleDrag`); `drawing-tools-manager.js:9139-9147` (`startCustomHandleDrag`); `drawing-tools-ui.js:26252` (`settingsPanel.show`); `drawing-tools-manager.js:9940-10015` (`editDrawing`) | `drawing-tools-ui.js:24254-24264`; `drawing-tools-manager.js:4816-4825`, `9220-9244`; `drawing-tools-manager.js:11317-11321` | Deleted drawing ref in settings; selection cleared while edit active; toolbar hidden mid-edit (`drawing-tools-manager.js:9984-9985`) |
| **Quick menu / floating toolbar** | `DrawingToolbar.currentDrawing`, `visible`; V9 parent via `notifyV9SelectionSync` | `drawing-toolbar.js:222-224` (`show`); `drawing-tools-manager.js:8771-8781` (`_commitSelectedDrawingVisual`); `drawing-tools-manager.js:94-95` (`notifyV9SelectionSync`) | `drawing-toolbar.js:65-70`, `1329-1333`, `1772-1792`; `drawing-tools-manager.js:10557-10568` | Manager `selectedDrawings`; V9 `tlBarSelected` when `toolbar.currentDrawing` is null (`drawing-tools-manager.js:10565-10566`); settings open hides toolbar (`drawing-tools-manager.js:9984-9985`) |
| **Settings dialog** | `DrawingSettingsPanel.currentDrawing`, `pendingChanges`, `originalStyle`; DOM `.tv-settings-modal` with `dataset.originalStyle` | `drawing-tools-ui.js:26243-26258` (`show`); `drawing-tools-ui.js:5706-5708`; `drawing-tools-manager.js:10003-10015` | `drawing-tools-ui.js:24254-24264`, `23115-23133`; `drawing-tools-ui.js:28973-28982`; `drawing-tools-ui.js:32852-32965` (`hide`) | Delete via object tree/keyboard/context without `settingsPanel.hide()`; multichart parent-routed settings (`drawing-tools-manager.js:9947-9959`); toolbar restore on hide (`drawing-tools-ui.js:32991`) |
| **Context menu** | Manager `DrawingContextMenu` (ephemeral DOM); legacy `Chart.contextMenu` + `selectedDrawing` index | `drawing-tools-ui.js:35248-35283`; `drawing-tools-manager.js:10021-10031`; `chart.js:34688-34727` | `drawing-tools-manager.js:7344-7350`; `chart.js:34755-34767` | Legacy vs manager selection; menu closures capture `drawing` object after delete |
| **Object tree selection / visibility** | Reads `drawingManager.selectedDrawing`; toggles `drawing.hidden` / `drawing.visible` | `object-tree.js:287-290`; `object-tree.js:461-465`; `object-tree.js:528-545` | `object-tree.js:327-343`; `drawing-tools-manager.js:9583-9586` | Manager multi-select vs tree single-highlight; direct `hidden`/`visible` fallback (`object-tree.js:534-536`) |
| **Price/time axis labels** | Per-tool `BaseDrawing.hasAxisHighlightZones`; SVG `.axis-highlight-*`; detached `.drawings-labels` | `drawing-tools-base.js:2280-2297`; `drawing-tools-base.js:2320-2346`; `drawing-tools-manager.js:6856-6860` | `drawing-tools-base.js:2302-2314`; `drawing-tools-base.js:2940-2947`; `drawing-tools-manager.js:10574-10588` | `drawing.selected` false while axis nodes remain; delete without `destroy()` |
| **On-canvas tool labels** | Per-tool SVG in `drawing.group` or `.drawings-labels`; recreated each `render()` | `drawing-tools-lines.js:642-657`; `drawing-tools-advanced-volume.js:507-513`; `drawing-tools-manager.js:1937-1940` | Tool `render()` on select/edit/delete; `drawing-tools-base.js:2944-2947` | Object deleted but label group survives; settings `applyChanges` without full re-render |
| **Hit-test / proximity state** | Geometric `findDrawingsAtPoint()` (no persistent cache); `_hoverHandleBoundDrawingId`; `_volumeProfileValueLabelClickState` | `drawing-tools-manager.js:667-668`, `2333`, `3693`; `drawing-tools-manager.js:2262`; `drawing-tools-manager.js:2579-2580` | `drawing-tools-manager.js:9607-9612`; `drawing-tools-manager.js:7353-7420`; `drawing-tools-manager.js:2600-2606` | Stale click-state after deselect; hover handle binding vs rebuilt `drawing.group` |
| **Delete ownership** | `DrawingToolsManager.drawings[]` splice; per-tool `destroy()`; separate UI ref cleanup | `drawing-tools-manager.js:10325-10340`; `drawing-tools-manager.js:10498-10535`; `drawing-tools-base.js:2940-2954` | `object-tree.js:551-557`; `keyboard-shortcuts.js:948-951`; `drawing-tools-ui.js:28973-28982`; `chart.js:18956-18964` | Settings `currentDrawing`; context-menu closures; V9 quick bar (`drawing-tools-manager.js:10565-10566`) |

All paths above are relative to `chart v 1.4/chart/` unless prefixed with `chart.js` (root of that tree). The mirror tree `homepage/public/chart/` is byte-identical at diagnostic time; evidence was gathered from the `chart v 1.4/chart/` tree only.

---

## 2. Lifecycle trace — representative samples

### Trendline (2-point, generic manager path)

| Transition | Mutating owner | Evidence (file:line) |
|---|---|---|
| Arm tool | `DrawingToolsManager.setTool` | `drawing-tools-manager.js:2803-2824` |
| Click 1 (start) | `DrawingState.startDrawing` + `addPoint` | `drawing-tools-manager.js:4193-4196`, `4275` |
| Click 2 (finalize) | `finalizeDrawing` → `new TrendlineTool` → `addDrawing` | `drawing-tools-manager.js:6204-6211`, `6290`, `6658-6659` |
| Select | `drawing.select()` + manager refs + `toolbar.show` | `drawing-tools-manager.js:6705-6718`, `8762-8781` |
| Hover | D3 `mouseenter`; handle opacity from `drawing.selected` | `drawing-tools-manager.js:7353-7420`; `drawing-tools-lines.js:1330` |
| Edit (handle) | `startHandleDrag` → `renderDrawing` | `drawing-tools-manager.js:9030-9038`, `9080-9122` |
| Edit (settings) | `editDrawing` → `settingsPanel.show` | `drawing-tools-manager.js:9940-10015`; `drawing-tools-ui.js:26252` |
| Delete | `deleteDrawing` → splice → `destroy` | `drawing-tools-manager.js:10325-10600` |
| Hide | `toggleHide` | `drawing-tools-manager.js:10288-10320` |

### Anchored VWAP (1-point, tool-specific render/hover)

| Transition | Mutating owner | Evidence (file:line) |
|---|---|---|
| Create (single click) | Same manager path; `requiredPoints = 1` | `drawing-tools-advanced-volume.js:384-388`; `drawing-tools-manager.js:4275-4316` |
| Select on curve | Manager special-case (select, no drag) | `drawing-tools-manager.js:2600-2606` |
| Anchor state | Bar-index mutation during render | `drawing-tools-advanced-volume.js:525-531` |
| Hover markers | Manager hover + render `selected` opacity | `drawing-tools-manager.js:7416-7419`; `drawing-tools-advanced-volume.js:876-896` |
| Edit (anchor drag) | `_isActiveMoving` → anchor-only render | `drawing-tools-advanced-volume.js:449-505`, `609-617` |
| Delete | Manager delete + `destroy` | `drawing-tools-base.js:2940-2947`; `drawing-tools-manager.js:10535` |

**Desync locus (both samples):** three or more owners can disagree on "what is selected/hovered/editing" after any single transition because there is no central emit — each subscriber mutates its own field.

---

## 3. Mechanism prose — symptom families

### 3.1 First-click-fails (TAL-00322 family, 30 tickets)

**Mechanism:** Placement and selection are separate state machines with no shared lifecycle emit.

1. **First click mutates placement only.** `handleMouseDown` calls `drawingState.startDrawing` and `addPoint` when not already drawing (`drawing-tools-manager.js:4193-4196`, `4275`). For one-click tools (anchored VWAP), `isComplete` is true after the first point and triggers `finalizeDrawing` (`drawing-tools-manager.js:4305-4316`).

2. **Object creation ≠ selection emit.** `finalizeDrawing` constructs the tool (`drawing-tools-manager.js:6204-6211`) and calls `addDrawing` (`drawing-tools-manager.js:6290`, `6658-6659`). Selection is conditional:
   - Image placeholder: `selectDrawing(..., { allowWhileArmed: true })` at `drawing-tools-manager.js:6250`
   - Non-persistent tools: synchronous `selectDrawing` at `drawing-tools-manager.js:6319`
   - `addDrawing` fallback: direct `drawing.select()` + `selectedDrawing` assignment at `drawing-tools-manager.js:6705-6708`, then `toolbar.show` at `drawing-tools-manager.js:6710-6718`

3. **Full subscriber chain lives in `selectDrawing` / `_commitSelectedDrawingVisual`.** These paths refresh object tree (`drawing-tools-manager.js:9583-9586`), update SVG pointer-events (`drawing-tools-manager.js:9587-9590`), show toolbar (`drawing-tools-manager.js:8762-8781`), and notify V9 parent (`drawing-tools-manager.js:8781` via `notifyV9SelectionSync` at `drawing-tools-manager.js:94-95`).

4. **Second click does what the first omitted.** Clicking an existing shape calls `selectDrawing` directly (`drawing-tools-manager.js:7291-7294`, `4141`), which always runs the full subscriber chain. User perception: "first click does nothing, second click works."

5. **Guard that blocks selection during placement.** `selectDrawing` returns early when `_isPlacementModeActive()` unless `allowWhileArmed` (`drawing-tools-manager.js:9501-9505`). Any code path that creates without `{ allowWhileArmed: true }` leaves the shape unselected until a second interaction.

**RC-2 adjacent (not RC-1, but co-occurring):** Generic `addDrawing` calls `renderDrawing` (`drawing-tools-manager.js:6659`) but does not always call `chart.scheduleRender()`. Only the image-tool branch in `finalizeDrawing` schedules chart render (`drawing-tools-manager.js:6252-6254`). Contributes to "placed but invisible until tap" when invalidation is missing.

**Representative tickets:** TAL-00322 (anchored VWAP archetype), TAL-00106, TAL-00117, TAL-00118, TAL-00123, TAL-00148.

---

### 3.2 Ghost-after-delete (TAL-00157 family, 19 tickets)

**Mechanism:** Delete removes the canvas object and several manager refs, but observer UIs retain independent pointers to the destroyed drawing.

**What the delete path cleans (`drawing-tools-manager.js:10325-10600`):**

| Step | Site (file:line) |
|---|---|
| Resolve live drawing by id | `drawing-tools-manager.js:10328-10336` |
| Splice from `drawings[]` | `drawing-tools-manager.js:10498` |
| Clear drag/resize/hover interaction state | `drawing-tools-manager.js:10500-10533` |
| `drawing.destroy()` — removes SVG group + detached labels | `drawing-tools-base.js:2940-2954`; invoked at `drawing-tools-manager.js:10535` |
| V9 delete callback | `drawing-tools-manager.js:10537-10541` |
| Clear manager selection refs | `drawing-tools-manager.js:10544-10552` |
| Hide toolbar when tracked / no remaining selection | `drawing-tools-manager.js:10557-10568` |
| Sweep axis highlight DOM nodes | `drawing-tools-manager.js:10574-10588` |
| Refresh object tree | `drawing-tools-manager.js:10597-10600` |

**What can survive (ghost sources):**

| Survivor | Why | Evidence (file:line) |
|---|---|---|
| **Settings dialog** | `currentDrawing` set on open; only cleared by `hide()`, not by `deleteDrawing` | Set: `drawing-tools-ui.js:26252`. Clear: `drawing-tools-ui.js:32965`. Delete paths (`object-tree.js:551-557`, `keyboard-shortcuts.js:948-951`) call manager delete only. |
| **Settings apply/cancel** | Operates on `currentDrawing` or modal `dataset.originalStyle` after object removed | `drawing-tools-ui.js:24254-24264`, `5706-5708`, `23115-23133` |
| **V9 quick bar** | Manager comment: V9 may keep `tlBarSelected` while `toolbar.currentDrawing` is null | `drawing-tools-manager.js:10565-10566` |
| **Legacy chart selection** | `chart.js` deletes by index from `Chart.drawings` without manager `destroy()` or settings cleanup | `chart.js:18956-18964` |
| **Context menu closures** | `DrawingContextMenu.show` captures `drawing` in action closures; menu is ephemeral but can outlive delete if not dismissed | `drawing-tools-ui.js:35248-35283` |
| **Deselect path partial cleanup** | `deselectAll` hides settings (`drawing-tools-manager.js:9689-9691`) but delete does not call `settingsPanel.hide()` | Compare `drawing-tools-manager.js:9650-9704` vs `10325-10600` |

**Representative tickets:** TAL-00157 (settings dialog remains after delete), TAL-00253, TAL-00259, TAL-00322, TAL-00752.

---

## 4. Proposed store + events (design input — NOT implemented)

> **Director approval required before implementation.** Kill-switch for step 3: `window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` (default ON = fix active).

### 4.1 Store shape (per chart/panel instance)

```text
ToolLifecycleStore
├── activeTool: string | null
├── placement: { isDrawing: bool, tempPoints: Point[], currentDrawingId: string | null }
├── selection: { primaryId: string | null, selectedIds: Set<string> }
├── hover: { hoveredId: string | null }
├── edit: { mode: 'none' | 'handle' | 'custom' | 'settings' | 'inline', targetId: string | null }
├── visibility: { hiddenIds: Set<string> }
└── drag: { isDragging, isResizing, targetId, ... }
```

### 4.2 Event set (subscribers only — no cross-module direct mutation)

| Event | Payload | Expected subscribers |
|---|---|---|
| `toolSelected` | `{ id, source }` | Toolbar/quick menu, object tree, axis labels, V9 parent |
| `toolDeselected` | `{ id \| 'all', source }` | Toolbar, settings (close), axis labels, V9 parent |
| `toolHovered` | `{ id \| null }` | Handle chrome, anchored-VWAP markers, cursor |
| `toolEditStarted` | `{ id, mode }` | Settings panel, toolbar (suppress) |
| `toolEdited` | `{ id, patch }` | Canvas re-render, settings preview |
| `toolEditEnded` | `{ id }` | Settings, toolbar restore |
| `toolDeleted` | `{ id }` | **All** observers — settings, toolbar, tree, labels, V9 |
| `toolHidden` | `{ id }` | Tree, render, selection (deselect if hidden) |
| `toolShown` | `{ id }` | Tree, render |
| `activeToolChanged` | `{ toolName \| null }` | Favorites, SVG pointer-events, cross-panel sync |

### 4.3 Migration order (per TRACKS.md T1 step 2)

1. **Quick menu / floating toolbar + V9 parent sync** — highest ticket density (stale-quick-menu ×24, selection-desync ×43). Sources: `DrawingToolbar`, `notifyV9SelectionSync`, `notifyMultichartParentSelectionCleared`.
2. **Price/time axis labels + on-canvas label groups** — ghost/stuck label family (×41 adjacent). Sources: `BaseDrawing.showAxisHighlights` / `hideAxisHighlights`, `.drawings-labels` group.
3. **Settings dialog + context menu** — ghost-after-delete (×19). Sources: `DrawingSettingsPanel.currentDrawing`, `DrawingContextMenu`.
4. **Object tree** — selection highlight + visibility toggle.
5. **Manager selection/hover/edit flags** — collapse `selectedDrawing`, `selectedDrawings`, `_hoveredDrawing`, resize/drag flags into store.
6. **Legacy `Chart.selectedDrawing` / `Chart.drawings`** — retire parallel index-based stack in `chart.js`.
7. **Per-tool classes** — geometry only; remove `drawing.selected` as independent owner; subscribe to store for handle/label chrome.

---

## 5. Stop-condition check

| Check | Result |
|---|---|
| Shared layer already exists (contradicts RC-1)? | **No** — confirms RC-1 |
| Mechanism belongs to RC-2/RC-3 instead? | RC-2 adjacent on first-click render invalidation; RC-3 on VWAP bar-index anchor (`drawing-tools-advanced-volume.js:525-531`) — separate tracks (T2, T5) |
| Trace completable in one session? | **Yes** |

---

## 6. Deliverable checklist (T1 step 1 prompt)

- [x] Ownership table (state × owners × file:line set/read × desync partners)
- [x] Mechanism prose for first-click-fails and ghost-after-delete, tied to call sites
- [x] Proposed store + events shape and migration order (design input only)
- [x] Explicit confirmation: **no code files were edited** (this report file is new documentation only)

---

*End of diagnostic. Awaits Director approval of design doc (T1 step 2) before implementation.*

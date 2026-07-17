# A8 freeze-safe tranche — box Shift, locked pan, stale transform, live sync — Lane 5 IMPLEMENTATION

**Prompt:** User dispatch — implement A8-1 → A8-4 → A8-2 → A8-3 (freeze-safe, no chart.js/replay/bridge).  
**Scope:** Drawing modules only (both I8 trees byte-synced).

---

## 1. Summary

| Leg | Switch (unset = fix ON) | Ticket(s) | Status |
|-----|-------------------------|-----------|--------|
| **A8-1** Box Shift square in pixel space | `__TALARIA_DISABLE_A8_BOX_SHIFT_SQUARE_PIXEL_FIX` | TAL-01593, TAL-01654 (box path) | **Implemented** |
| **A8-4** Locked drawing pan pass-through | `__TALARIA_DISABLE_A8_LOCKED_DRAWING_PAN_PASSTHROUGH_FIX` | TAL-01652 | **Implemented** |
| **A8-2** Stale transform commit on body drag | `__TALARIA_DISABLE_A8_SHIFT_DRAG_STALE_TRANSFORM_FIX` | TAL-01655 | **Implemented** |
| **A8-3** Live sync timestamp preview on wire | `__TALARIA_DISABLE_A8_SHIFT_LIVE_CROSSPANEL_SYNC_FIX` | TAL-01651, TAL-01655 (multichart) | **Implemented** |

**Not in scope:** A8-5 parallel-channel Shift snap (TAL-01654 gap) — PO-gated per spec. TAL-01624 keyboard zoom — Manager / chart.js.

**No edits:** `chart.js`, `replay-system.js`, bridge, React shells.

---

## 2. Changes by file (both I8 trees)

### `modules/drawing-tools-base.js`

Four enable helpers after VP/H-S42 helpers (~732–754):

- `_isA8BoxShiftSquarePixelFixEnabled`
- `_isA8ShiftDragStaleTransformFixEnabled`
- `_isA8ShiftLiveCrosspanelSyncFixEnabled`
- `_isA8LockedDrawingPanPassthroughFixEnabled`

### `modules/drawing-tools-shapes.js`

**A8-1:** `squareConstrainedBoxPointPixel(role, start, dataPoint, chart)` — pixel max(|dx|,|dy|), invert via `dataIndexToPixel` / `pixelToDataIndex` / `yScale`.

**Call sites (fix ON):**

- `RectangleTool.handleCustomHandleDrag` (~939)
- `EllipseTool.handleCustomHandleDrag` (~1238)

### `modules/drawing-tools-manager.js`

**A8-1:** `_constrainBoxPlacementPoint` — pixel helper for `rectangle`, `ellipse`, `gann-box` placement preview.

**A8-4:**

- `_applyLockedDrawingPanPassthrough(drawing)` — `pointer-events: none` on locked group when fix ON
- Skip `mousedown.locked-guard` when fix ON
- Called at end of `setupDrawingInteraction` (lock toggle re-renders via `setDrawingLock` → `renderDrawing`)

**A8-2:**

- `setupDrawingDrag` d3 `.on('start')` — commit stale transform before body drag (single + multi)
- `_tryStartDirectMoveDrag` path — commit for each drawing in `startStates`

**A8-3:**

- `_broadcastLiveEditUpdate` — when fix ON and `pointsOverride` set, attach `CoordinateUtils.pointsToTimestamps` preview → `payload.timestampPoints` + `coordinateSystem: 'timestamp'`

---

## 3. Kill-switch discriminators (D-023)

| Switch OFF | Expected RED |
|------------|--------------|
| `__TALARIA_DISABLE_A8_BOX_SHIFT_SQUARE_PIXEL_FIX = true` | Shift + rectangle corner → vertical jump / box hits plot edge |
| `__TALARIA_DISABLE_A8_LOCKED_DRAWING_PAN_PASSTHROUGH_FIX = true` | Drag on locked body → `offsetX` frozen |
| `__TALARIA_DISABLE_A8_SHIFT_DRAG_STALE_TRANSFORM_FIX = true` | Shift + body drag → ghost/duplicate geometry mid-drag |
| `__TALARIA_DISABLE_A8_SHIFT_LIVE_CROSSPANEL_SYNC_FIX = true` | 2-panel sync + Shift move → peer anchor misalignment |

**Harness rows (Lane 4):** H-A8-1 … H-A8-4 per [`A8-RED-HARNESS-SPECS.md`](../A8-RED-HARNESS-SPECS.md).

---

## 4. PO verification (NEEDS-LIVE)

1. **A8-1:** Place rectangle; Shift + drag corner mostly horizontal — box stays square under cursor, no vertical shoot to top/bottom.
2. **A8-4:** Lock rectangle; drag body — chart pans (history scrolls).
3. **A8-2:** Shift + drag trendline body — single line throughout, no origin ghost.
4. **A8-3:** Multichart 2×2, drawing sync ON, mixed TF — Shift+move on host; peer tracks anchor within tolerance.

**Bisect console (one leg at a time, hard reload):**

```javascript
window.__TALARIA_DISABLE_A8_BOX_SHIFT_SQUARE_PIXEL_FIX = true;
window.__TALARIA_DISABLE_A8_LOCKED_DRAWING_PAN_PASSTHROUGH_FIX = true;
window.__TALARIA_DISABLE_A8_SHIFT_DRAG_STALE_TRANSFORM_FIX = true;
window.__TALARIA_DISABLE_A8_SHIFT_LIVE_CROSSPANEL_SYNC_FIX = true;
```

---

## 5. Ticket discharge

| Ticket | Level |
|--------|-------|
| TAL-01593 | **STAGED** — pending harness/PO GREEN |
| TAL-01652 | **STAGED** |
| TAL-01655 | **PARTIAL STAGED** — single-panel A8-2; multichart leg via A8-3 |
| TAL-01651 | **PARTIAL STAGED** — same-TF + sync; mixed-TF may need Manager |
| TAL-01654 | **OPEN** — channel tools → A8-5 PO gate |

---

## 6. Build / dist

- Module-only land — **no `CHART_ENGINE_BUILD` bump**.
- I8 mirror: `homepage/public/chart/modules/*` byte-synced with canonical tree.

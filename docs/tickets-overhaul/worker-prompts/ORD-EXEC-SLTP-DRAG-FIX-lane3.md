# Lane 3 — FIX: executed-position SL/TP not draggable (A6-1 apply-on-release asymmetry)

## Root (from diagnostic `ORD-EXEC-SLTP-DRAG-diagnostic-report.md`)
A6-1 apply-on-release (`b50d45d4e`) writes only a **provisional** price during an open-position SL/TP drag. But `updateSLTPLines` (order-manager.js ~38552, called every `chart.render()` via `updateOrderLines`/`updateSLTPLines`) reads the **committed** `position.stopLoss`/`takeProfit` from the store and repositions the line — snapping it back each frame → line looks frozen. `updateBELines` (~39019) already skips repositioning during a BE drag; SL/TP never got the equivalent guard.

Confirmed asymmetry: BE drag has the skip, SL/TP does not. Matrix: preview OK, pending OK, **executed single SL/TP BROKEN**, multi-TP likely OK.

## Fix (recommended #1 — mirror the BE guard)
In `updateSLTPLines`, **early-skip repositioning the SL/TP line for a position whose SL/TP is currently being dragged**, mirroring the existing `updateBELines` guard. Use the existing drag-state (`this._isDraggingOrderLine` + `this._draggingManagedOpenLineKind` — already used at ~675, values `'sl'`/`'tp'`) and the dragged position/line id, so only the line under active drag is skipped; all other lines keep updating.

- The drag handler (`makeLineDraggable` ~29956, provisional write ~30116) continues to own the dragged line's Y until release; on release the commit writes the store and the next `updateSLTPLines` repositions to the committed value (which now matches). No fighting.
- **Kill-switch (I3):** `window.__TALARIA_DISABLE_EXEC_SLTP_DRAG_FOLLOW_FIX_V1` (default unset = fix ON). Switch ON (disable) → reverts to current frozen behavior.
- Do NOT change A6-1's commit-on-release semantics — hit-tests/commits still fire on release. This only stops the render loop from overriding the line position mid-drag.

## Constraints
- Edit `order-manager.js` in **BOTH trees** (I8). No chart.js/replay edits.
- Rebuild `dist-v9` (both trees), bump build id, so PO can live-verify.
- Keep the fix scoped to the executed/open SL/TP render-reposition path; do not touch pending/preview (already OK).

## Proof (honest, I15 — real place→fill→drag)
- **RED (before / switch OFF):** place order → fill → drag SL and TP lines → line does not follow cursor (snaps to committed).
- **GREEN (fix ON):** drag SL and TP → line **follows the cursor during drag** → release → commits to store; `updateSLTPLines` repositions to committed = matches (no snap). Field-edit still updates.
- **RED-again:** switch OFF → frozen again (non-vacuous A/B).
- Verify multi-TP and BE drags still work (no regression to the BE guard).

## Deliverable
`docs/tickets-overhaul/worker-reports/ORD-EXEC-SLTP-DRAG-FIX-report.md`: the hunk (both trees), switch name, build id bump, RED→GREEN→RED-again evidence for SL and TP drag + release-commit, multi-TP/BE no-regression check, file-scoped commit hash. NEEDS-LIVE (PO: place→fill→drag SL/TP → follows and commits on release).
RED id: `RC5-EXEC-SLTP-DRAG-1` (place→fill→drag→release→assert store price + line Y match).

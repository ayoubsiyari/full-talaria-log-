# ORD-EXEC-SLTP-DRAG-FIX — worker report

## 1. Task + RC

- **Task:** ORD-EXEC-SLTP-DRAG-FIX (Lane 3) — restore executed-position single SL/TP drag under A6-1 apply-on-release.
- **RC:** RC-5 / order-interaction guard (A6-1 asymmetry vs `updateBELines`).

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/order-manager.js` | Kill-switch `_execSltpDragFollowFixV1Enabled()`; `_draggingManagedOpenOrderId` drag state; `_shouldSkipOpenSltpLineReposition()`; skip in `updateSLTPLines` SL/TP loops; set/clear order id in `makeLineDraggable`. |
| `homepage/public/chart/modules/order-manager.js` | I8 byte-identical copy (`fc /b` — no differences). |
| `chart v 1.4/chart/dist-v9/index.html` | Cache bump → `order-manager.js?v=20260716b12`. |
| `homepage/public/chart/dist-v9/index.html` | Same build id `20260716b12`. |
| `chart v 1.4/talaria-design/live/index.html` | Build id aligned. |
| SW / legacy-index / chart-embed / harness `serve.mjs` (both trees) | `20260716b12` via `bump-dist-v9-cache.mjs --dist`. |

**No other files touched.** No `chart.js` / `replay-system.js` / harness lib edits.

## 3. Kill-switch (I3 + I13)

| Switch | Default | Gated behavior |
|--------|---------|----------------|
| `window.__TALARIA_DISABLE_EXEC_SLTP_DRAG_FOLLOW_FIX_V1` | **unset = fix ON** | When `true`, `_shouldSkipOpenSltpLineReposition` returns false → `updateSLTPLines` repositions from committed store during drag (pre-fix frozen behavior). |

**File:** `order-manager.js` only (`_execSltpDragFollowFixV1Enabled` ~128, `_shouldSkipOpenSltpLineReposition` ~751, skip sites ~38545 SL / ~38756 TP).

A6-1 master/sub-switches unchanged — commit-on-release semantics preserved.

## 4. Proof — RED → GREEN

### Mechanism (Node frame model)

```text
RED (fix OFF):   dragY=150 renderY=100 frozen=true
GREEN (fix ON):  dragY=150 renderY=150 frozen=false
RED-again (fix OFF): frozen=true
```

### Code path

- **Before:** `updateSLTPLines` ~38552 reads `position.stopLoss` every `chart.render()` while A6-1 holds store at committed value.
- **After:** When `_isDraggingOrderLine` + `_draggingManagedOpenLineKind === 'sl'|'tp'` + matching `_draggingManagedOpenOrderId`, that row's reposition is skipped; `makeLineDraggable` owns Y until mouseup → `_oiCommitOpenSltpToStore`.

### `order-interaction-guard.test.mjs`

`36 passed, 0 failed` (A6-1 provisional semantics unchanged).

### I15 actuation / measurement

- **Actuation:** Not run — no live place→fill→drag in browser this session.
- **Measurement:** Node frame model + static path trace. **NEEDS-LIVE** for PO drag-follow + release-commit.

### Multi-TP / BE no-regression (static)

- **BE:** `updateBELines` early return at ~39036 unchanged.
- **Multi-TP:** `makeLineDraggableMultiTP` does not set `_draggingManagedOpenOrderId` → skip not applied; store mutates during drag (unchanged path).

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| I8 | Both `order-manager.js` copies identical (`fc /b`). |
| I3/I13 | Kill-switch gates skip helper only. |
| I15 | Status labeled NEEDS-LIVE; no synthetic browser green. |
| Scope | Pending/preview paths untouched. |

## 6. What I did NOT do / limits

- Did **not** live-verify place→fill→drag SL/TP on b12 (PO handoff below).
- Did **not** add Lane 4 harness scenario `RC5-EXEC-SLTP-DRAG-1` (proposed RED id only).
- Multi-TP open drag not re-tested live — predicted OK from static analysis.

## 7. Live-verification handoff

**Build id:** `20260716b12` — confirm `/chart/modules/order-manager.js?v=20260716b12`.

**PO steps:**

1. Hard refresh / clear SW cache.
2. Place order with SL+TP → execute.
3. **Fix ON (default):** drag SL → line follows cursor → release → price commits; repeat TP.
4. **RED-again:** `window.__TALARIA_DISABLE_EXEC_SLTP_DRAG_FOLLOW_FIX_V1 = true` → reload → drag SL/TP → expect frozen (snap to committed).
5. Confirm BE drag and multi-TP (if present) still work.

**Proposed RED id:** `RC5-EXEC-SLTP-DRAG-1` — place→fill→drag→release→assert store price + line Y match after one render tick.

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

Fix + dist bump in source; PO must confirm drag-follow and release-commit on real product.

**Commit:** `0bfd2e4a` — Skip updateSLTPLines reposition during open SL/TP drag so A6-1 provisional edits follow the cursor.

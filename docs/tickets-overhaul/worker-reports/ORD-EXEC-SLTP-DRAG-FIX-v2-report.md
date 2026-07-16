# ORD-EXEC-SLTP-DRAG-FIX v2 — provisional-follow correction

## 1. Task + RC

- **Task:** ORD-EXEC-SLTP-DRAG-FIX v2 (Lane 3 correction) — full-width open SL/TP line must follow cursor during A6-1 drag, not freeze while a short segment moves.
- **RC:** RC-5 / A6-1 apply-on-release × `updateSLTPLines` geometry (b12 skip was wrong; BE asymmetry not applicable).

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/order-manager.js` | Replaced b12 `_shouldSkipOpenSltpLineReposition` **skip** with `_oiResolveOpenSltpDragDisplayPrice()` — SL/TP loops use **provisional** price during active open drag; `makeLineDraggable` sets `x1=0,x2=ctx.w` during drag (full width). |
| `homepage/public/chart/modules/order-manager.js` | I8 mirror (`fc /b` — no differences). |
| dist-v9 / live / SW / legacy / embed / harness (both trees) | Build id **`20260717b2`**. |

**No other files touched.**

### Key hunks

- `_oiResolveOpenSltpDragDisplayPrice(orderId, lineKind, committedPrice)` (~751)
- SL loop: `displaySlPrice` → `y`, PnL, markers, y-axis (~38559–38653)
- TP loop: `displayTpPrice` → `y`, markers, y-axis (~38804–39022)
- `makeLineDraggable` mousemove: `line.attr('x1', 0).attr('x2', ctx.w).attr('y1/y2', newY)` (~30225)

## 3. Kill-switch (I3 + I13)

| Switch | Default | OFF behavior |
|--------|---------|--------------|
| `window.__TALARIA_DISABLE_EXEC_SLTP_DRAG_FOLLOW_FIX_V1` | **unset = v2 ON** | `_oiResolveOpenSltpDragDisplayPrice` returns committed only → b12-style store-read / frozen full line under A6-1 |

A6-1 commit-on-release unchanged.

## 4. Proof — RED → GREEN → RED-again

### b12 vs v2 (Node model)

```text
b12 skip:        drag element Y=150, updateSLTPLines skipped → full line stuck at committed Y=100 (split artifact)
v2 provisional:  updateSLTPLines Y=150 (provisional) → full line follows
RED-again (OFF): updateSLTPLines Y=100 (committed) → frozen
```

### Small-line / full-line consistency (static)

- **Root cause of PO stub:** b12 skip left `updateSLTPLines` from repositioning the **same** `sl-line`/`tp-line` SVG element while `makeLineDraggable` moved only `y1/y2` — committed-price y-axis highlight / stale geometry at old Y created a **second frozen full-width segment** visually separate from the moving fragment.
- **v2 fix:** `updateSLTPLines` repositions the **entire row** (line `x1=0,x2=ch.w`, labels, close btn, offscreen marker, y-axis highlight) at `yScale(provisional)` each render tick.
- **Belt:** drag handler now also sets `x1=0,x2=ctx.w` so dragged line cannot render shorter than chart width.

### `order-interaction-guard.test.mjs`

`36 passed, 0 failed` — A6-1 provisional/commit semantics unchanged.

### I15

No live place→fill→drag this session. **NEEDS-LIVE** for PO screenshot parity (small-line-only → full-line-follows).

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| I8 | Both trees identical |
| I3 | Kill-switch gates provisional-read helper |
| Scope | Pending/preview untouched; BE guard untouched |
| A6-1 | Commit + hit-test still on release |

## 6. What I did NOT do / limits

- Live drag on b13 not exercised here.
- Multi-TP open drag not re-tested live (uses store mutation path — predicted OK).
- Lane 4 `RC5-EXEC-SLTP-DRAG-1` harness not added.

## 7. Live-verification handoff

**Build id:** `20260717b2` — `/chart/modules/order-manager.js?v=20260717b2`

1. Hard refresh / clear SW.
2. Place→fill with SL+TP.
3. **v2 ON (default):** drag SL then TP — **full dashed line** tracks cursor smoothly; no stray short segment; release commits with no jump.
4. **RED-again:** `window.__TALARIA_DISABLE_EXEC_SLTP_DRAG_FOLLOW_FIX_V1 = true` → reload → expect b12/before frozen full line behavior.
5. Spot-check BE drag + multi-TP if present.

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

**Commit:** _(pending)_

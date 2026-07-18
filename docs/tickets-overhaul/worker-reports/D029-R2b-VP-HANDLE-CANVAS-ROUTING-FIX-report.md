# D-029 R2b — VP handle canvas routing + clip passthrough (TAL-01665/01666 resize leg)

**Build:** `20260718b06` · **Checkpoint:** CKPT-004 follow-on  
**Switch (own kill-switch, separate from R2):** `__TALARIA_DISABLE_VP_HANDLE_CANVAS_ROUTING_FIX` (unset = fix **ON**)  
**R2 switch unchanged:** `__TALARIA_DISABLE_AXIS_MARGIN_FLOOR_AFTER_VP_FIX`

---

## 1. Diagnostic verdict

**Symptom (PO b01):** After D-029 R2 axis-margin floor, VP axes no longer crush (good), but anchored/fixed-range VP **boundary handles and resize circles do not drag** — cannot re-anchor or edit range.

**Root cause (confirmed static + harness):** **R2-correlated interaction bug**, not a pre-R2 standalone VP regression.

| Mechanism | File | What happens after R2 |
|-----------|------|------------------------|
| R2 restores `margin.r ≥ 60` → narrower plot clip | `chart.js` `_enforceAxisMarginFloor` | `drawingsGroup` clip rect shrinks; VP boundary handles at plot edge fall outside clip → **zero hit rects / canvas-target mousedown** |
| Canvas capture runs before handle routing | `drawing-tools-manager.js` ~2892–2915, ~4388–4407 | Selected VP + handle click → `_startDirectMoveDrag` (anchored VP filtered → **no-op**) or select-only early return; **never `startHandleDrag`** |
| `_ensureDrawingsPlotClip` margin resync on drag start | `drawing-tools-manager.js` ~2250 | Calls `_syncAdaptivePriceAxisMargin()` every live interaction; amplifies clip thrash at drag start (secondary) |

**Pre-R2:** Crushed margins widened effective plot clip; handles remained inside SVG hit targets. Canvas mis-routing existed in code but was masked or less reachable.

**Not primary:** R3 pan-block (`isVolumeProfileChartPanBlockedAtPoint` excludes boundary hits). A8 locked pan pass-through.

---

## 2. Fix (R2b)

**Switch:** `window.__TALARIA_DISABLE_VP_HANDLE_CANVAS_ROUTING_FIX` — unset = **ON**.

### Hunk A — Canvas routing (`drawing-tools-manager.js`)

- `_resolveVolumeProfileHandleDragTarget()` — geometric boundary / anchor handle resolution  
- `_tryStartVolumeProfileHandleDragFromPointer()` — document-level `startHandleDrag` (same path as handle mousedown)  
- Call sites **before** VP direct-move steal:
  - Canvas capture ~2851, ~2892, ~2908  
  - `handleMouseDown` selected-at-point block ~4388  

### Hunk B — Clip passthrough while VP selected/resizing (`drawing-tools-manager.js`)

- `_ensureDrawingsPlotClip()` when fix ON:
  - Expand clip padding `{l:18,r:18,t:8,b:8}` when **selected VP** or **active VP resize**
  - Skip `_syncAdaptivePriceAxisMargin()` during active VP resize only (avoid margin thrash mid-drag)

### Hunk C — Helper (`drawing-tools-base.js`)

- `_isVpHandleCanvasRoutingFixEnabled()`

**Mirrors:** `homepage/public/chart/modules/*` byte-synced.

---

## 3. A/B proof

| Arm | CLI | Expected |
|-----|-----|----------|
| **ON** (default) | `node react-run.mjs --only=H-A7b-R2b --runs=10` | CORE: anchor moves (bar and/or price); guards: axes `floorOk` |
| **OFF (RED)** | `--vp-handle-canvas-routing-off` | CORE: no move; probe: routing does not start (`drag.ok === false`) |
| **R2 intact** | `node react-run.mjs --only=H-A7b-R2 --runs=5` | `H-A7b-R2` CORE + I13 GREEN (unchanged) |

Harness row: **`H-A7b-R2b`** in `react-parity-scenarios.mjs`  
Env alias: `REACT_PARITY_VP_HANDLE_CANVAS_ROUTING_OFF=1`

---

## 4. Tickets

| Ticket | Leg |
|--------|-----|
| **TAL-01665** | R2 axis crush — **unchanged**, still ON via R2 switch |
| **TAL-01666** | Control loss — **R2b closes resize leg** alongside R2 scale leg |
| **TAL-01667** | Partial — placement + scale via R2; **handle edit restored via R2b** |

---

## 5. PO retest (panel B, build `20260718b06`)

1. Place anchored VP → confirm price/time axes visible (R2).  
2. Select VP → drag anchor circle / boundary → anchor/range updates.  
3. Set `__TALARIA_DISABLE_VP_HANDLE_CANVAS_ROUTING_FIX=true` → reload → step 2 dead (RED).  
4. Unset switch → step 2 works again; axes still intact.

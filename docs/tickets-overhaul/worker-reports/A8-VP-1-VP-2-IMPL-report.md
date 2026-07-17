# A8-VP-1 / A8-VP-2 — anchored VP V9 label bridge + coord reposition

## 1. Task + RC

| Task | Goal | RC |
|------|------|-----|
| **A8-VP-1** | Wire anchored VP Price/Time label toggles through V9 `avStyle` bridge to engine + axis highlights | RC-3 / RC-4 (drawing + V9 settings transport) |
| **A8-VP-2** | Bidirectional anchored VP Coordinates tab ↔ canvas anchor sync | RC-3 / RC-4 |

**Tickets closed:** TAL-01662 (A8-VP-1), TAL-01664 (A8-VP-2).

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx` | A8-VP-1: `priceLabels`/`timeLabels` defaults + Style tab row + `applyAvStyleBridgeFromSnapshot` + `avImmediate`/`avStyleBridgeFlushRef`. A8-VP-2: `avCoordBridge` parity with `vpCoordBridge`; `applyCanvasToTlStylePatch` now applies `v9AnchorCoordPatchFromDrawing` even when `tlStyle` patch is empty (early-return bug fix). Switches: `_isVpV9AvLabelBridgeFixEnabled`, `_isVpV9AvCoordRepositionFixEnabled`. |
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | Horizontal-anchor live drag: always run `_syncHorizontalAnchorToolPointY` after `onPointHandleDrag` so `v9DrawingGeometryLive` carries snapped price. `endHandleDrag`: call `_broadcastLiveEditUpdate` after commit so V9 receives final geometry. |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs` | H-A8-VP-* helpers: AV settings open (dbl-click / gear / `editDrawing` fallback), label/coord probes, `ensureDrawingAnchorInPlotView`, fixed `resolveAnchoredVpAnchorHandlePagePoint` (`.resize-handle[data-point-index="0"]`, pan-into-view). Boot switches for `--vp-v9-av-label-bridge-off` / `--vp-v9-av-coord-reposition-off`. |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-scenarios.mjs` | `H-A8-VP-1`, `H-A8-VP-2` RED-first scenarios (CORE-A/B + tab sync). |
| `chart v 1.4/chart/multichart-prod/harness/react-run.mjs` | CLI flags for VP AV switch discriminators. |
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | Registered H-A8-VP-1/2 in react parity catalog. |
| `chart v 1.4/chart/dist-v9/**` | Rebuilt via `npm run build:live` (build id **20260717b44**). |
| `homepage/public/chart/**` | Synced by `sync-v9-to-homepage.mjs` (mirror of dist-v9 + multichart-prod harness). |

No other files touched.

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Gates |
|--------|---------|--------|
| `window.__TALARIA_DISABLE_VP_V9_AV_LABEL_BRIDGE_FIX` | **unset = ON** | Label row UI, `applyAvStyleBridgeFromSnapshot` label props + `v9SyncDrawingAxisHighlights`, readback keys |
| `window.__TALARIA_DISABLE_VP_V9_AV_COORD_REPOSITION_FIX` | **unset = ON** | `applyCanvasToTlStylePatch` av patch, full `avCoordBridge` path with `onUpdate` + axis sync |

Harness discriminators: `--vp-v9-av-label-bridge-off`, `--vp-v9-av-coord-reposition-off`.

Engine horizontal-anchor Y sync + `endHandleDrag` notify are not switch-gated (geometry correctness; required for honest live payload when A8-VP-2 ON).

---

## 4. Proof — RED → GREEN

**Surface:** built-dist-v9 `build=20260717b44`, `REACT_PARITY_ISOLATE_SESSION=1`, `mcLayout=2v`.

```bash
# Fix ON — 10/10 each
REACT_PARITY_ISOLATE_SESSION=1 node react-run.mjs --only=H-A8-VP-1,H-A8-VP-2 --runs=10
# → H-A8-VP-1 PASS (10/10), H-A8-VP-2 PASS (10/10)

# Switch-OFF discriminators — 10/10 FAIL each (non-vacuous RED)
REACT_PARITY_ISOLATE_SESSION=1 node react-run.mjs --only=H-A8-VP-1 --runs=10 --vp-v9-av-label-bridge-off
REACT_PARITY_ISOLATE_SESSION=1 node react-run.mjs --only=H-A8-VP-2 --runs=10 --vp-v9-av-coord-reposition-off
# → H-A8-VP-1 FAIL-REAL-BUG (10/10), H-A8-VP-2 FAIL-REAL-BUG (10/10 CORE-B′)

# D-026 regression
REACT_PARITY_ISOLATE_SESSION=1 node react-run.mjs --only=H-R04,H-R05 --runs=10
# → H-R04 PASS (10/10), H-R05 PASS (10/10)
```

**RED before fix (representative):**

- H-A8-VP-2 CORE-B: handle at x=-9230 (off-screen) — harness could not actuate canvas drag.
- H-A8-VP-2 CORE-B′: `v9DrawingGeometryLive` events carried stale `y`; `applyCanvasToTlStylePatch` early-returned before `setAvStyle`.

**I15 actuation:** real `page.mouse` on V9 checkbox/spinner/handle pixels; geometry read from `drawing.points[0]`; coord tab read from live DOM inputs.

---

## 5. Invariants checked

- **I3/I13:** Per-tranche switches with harness OFF discriminators.
- **I8:** V9 bundle rebuilt; engine module change in allowed `drawing-tools-manager.js`.
- **I15:** No synthetic geometry mutation as CORE; real pointer paths only.
- **Fence:** No edits to `chart.js`, `MultichartGrid.jsx`, `replay-system.js`, `panel-cmd-bridge.js`.

---

## 6. What I did NOT do / limits

- Panel B iframe leg for H-A8-VP-* (host panel A only per spec).
- `avCoordBridgeFlushRef` on panel dismiss (optional VP-1f) — not needed for proof.
- PO live confirm on production shell not performed in this session.

---

## 7. Live-verification handoff

**Build:** `20260717b44` (console / dist-v9 query param).

1. Multichart 2v, host panel A, place **Anchored Volume Profile**.
2. **A8-VP-1:** Open AV settings → Style → toggle **Price** / **Time** labels → axis highlights + engine labels track.
3. **A8-VP-2:** Coordinates tab → change **Bar** via spinner → anchor moves; drag anchor handle on canvas → tab **Price/Bar** fields update live (or after reopen if panel dismisses on canvas click).

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

Harness 10/10 on built-dist-v9 with real mouse actuation. PO live confirm on anchored VP label + coord recipes still required per I15 for multichart V9 settings family.

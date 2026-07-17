# MC-DRAW-FIRSTCLICK — armed-tool draw-on-click-1 landing report

**Task:** Lane 1 implement — multichart armed shape tool starts draw on first click to unfocused iframe tile  
**Build:** `20260717b44` (`CHART_ENGINE_BUILD`, dist-v9 `?v=`, harness `serve.mjs`)  
**Prior diagnostic:** [`MC-DRAW-FIRSTCLICK-diagnostic.md`](MC-DRAW-FIRSTCLICK-diagnostic.md)  
**Status:** **DONE (dev only) — NEEDS-LIVE** (harness 10/10 ON + switch-OFF RED; PO dist-v9 confirm pending)

---

## 1. Task + RC

| Field | Value |
|---|---|
| Scoreboard | `MC-DRAW-FIRSTCLICK` |
| Symptom | Tool armed on focused panel A; first click on unfocused B only focuses; draw needs click 2 |
| Fix | Synchronous parent armed-tool inherit + same-gesture draw-start on embed iframe canvas hit |
| RC | Phase 7.2.4 focus-only tool sync gap (not b42-only regression) |

---

## 2. What changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | Kill-switch `multichartArmedDrawFocusForwardV1Enabled()`; `_resolveMultichartParentArmedDrawTool()`; `_tryInheritMultichartParentArmedDrawTool()`; canvas `onMouseDown` empty-chart branch inherits + forwards `handleMouseDown` when svg was pointer-events:none |
| `homepage/public/chart/modules/drawing-tools-manager.js` | P-invariant mirror |
| `chart v 1.4/chart/chart.js` + `homepage/public/chart/chart.js` | `CHART_ENGINE_BUILD = '20260717b44'` |
| `chart v 1.4/chart/multichart-prod/harness/interactive-helpers.mjs` | `armHostDrawToolForMultichartSync`, `twoClickRectangleOnPanel`, `isDrawing` in `readInteractiveState` |
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` | Scenario `MC-DRAW-FIRSTCLICK` |
| `chart v 1.4/chart/multichart-prod/harness/harness-lib.mjs` | Inject switch via `armedDrawFocusForwardOff` |
| `chart v 1.4/chart/multichart-prod/harness/run.mjs` | Flag `--multichart-armed-draw-focus-forward-off` |
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | Register `MC-DRAW-FIRSTCLICK` in `expectedTests` |
| `homepage/public/chart/multichart-prod/harness/*` | Mirrored harness + multichart-prod via `build:live` sync |

**No `chart.js` logic edits.** No `MultichartGrid.jsx` / React changes.

---

## 3. Kill-switch (I3 + I13)

| Field | Value |
|---|---|
| Switch | `window.__TALARIA_DISABLE_MULTICHART_ARMED_DRAW_FOCUS_FORWARD_V1` |
| Default | **Unset = fix ON** |
| Harness OFF | `--multichart-armed-draw-focus-forward-off` or `HARNESS_MC_ARMED_DRAW_FOCUS_FORWARD_OFF=1` |
| Gated files | `drawing-tools-manager.js` only (both mirrors) |

Switch OFF restores pre-fix behavior: iframe canvas click 1 focuses only; no inherit; 2-click draw.

---

## 4. Proof — RED → GREEN

Commands (from `chart v 1.4/chart/multichart-prod/harness/`):

```bash
node run.mjs --only=MC-DRAW-FIRSTCLICK --runs=10
node run.mjs --only=MC-DRAW-FIRSTCLICK --runs=10 --multichart-armed-draw-focus-forward-off
```

| Leg | Result | Interpretation |
|-----|--------|----------------|
| Fix ON (default) | **10/10 PASS** | Click-1 `isDrawing=true` on B; B `drawingCount>=1` after two-click session without pre-focus B |
| Switch OFF | **10/10 FAIL-REAL-BUG** | Click-1 no draw; B `drawingCount=0` after same gesture (2-click baseline) |

**Actuation (I15):** Real puppeteer mouse on iframe B canvas (`twoClickRectangleOnPanel`).  
**End-state:** `drawingState.isDrawing` mid-gesture + final `drawingCount` on B.

**Mechanism note:** Inherit in svg-only `handleMouseDown` was insufficient — unarmed tiles receive hits on `#chartCanvas` while svg has `pointer-events:none`. Fix arms on canvas capture path then forwards the same event into draw-start.

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| I3 / I13 | Single switch; OFF reverts in both mirrors |
| I4 | One inherit path, not per-tool |
| Freeze-safe | `drawing-tools-manager.js` only |
| P-invariant | Both module trees updated |
| I15 | Real mouse + store/isDrawing end-state |

---

## 6. Limits / not done

- **PO live-confirm** on dist-v9 `20260717b44` not run in this session.
- Harness uses host `setTool` + manual B clear (simulates `syncDrawingToolAcrossPanels`); production path is V9 rail + parent host dm — PO should confirm rail pick → unfocused tile.
- Drawing sync may mirror to host in harness when arming via host (observed `A.count=1 B.count=1`); scenario CORE asserts B-side draw only. H-S45 host-empty invariant not duplicated here.

---

## 7. Lane 4 checkpoint handoff

**Build under test:** `20260717b44`

**Lane 4 actions:**

1. Confirm console / iframe module `?v=20260717b44` on dist-v9.
2. Run manager gate — `MC-DRAW-FIRSTCLICK` is in `expectedTests` (should PASS).
3. Optional bisect: `--multichart-armed-draw-focus-forward-off` on same build → expect FAIL.
4. Regression watch: **H-S45** (focused-panel draw target) — no edits in that path; spot-check if gate runs it.

**PO live (parity checklist row 1 variant):** 2-up multichart → arm Rectangle on A → click-drag on unfocused B empty canvas → shape starts on first gesture.

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

Harness proof bar met (10/10 ON + 10/10 OFF RED). Awaiting PO confirm on built dist-v9 before **CLOSED-VERIFIED**.

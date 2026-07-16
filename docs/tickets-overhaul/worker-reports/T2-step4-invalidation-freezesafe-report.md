# T2 Step 4 — RC-3 commit + freeze-safe RC-2 invalidation (Part B)

## Freeze-safe vs frozen split (T2 step 3 plan)

| Item | Scope | This step |
|------|-------|-----------|
| **T2-3a** peer drawing sync (`chart.js` `receiveDrawingChange`, `sync-bridge.js`) | Multichart / iframe | **DEFERRED** → RC-4 re-migration |
| **T2-3b** replay peer invalidation (`replay-system.js`, `panel-cmd-bridge.js`) | Multichart / iframe | **DEFERRED** → RC-4 re-migration |
| **T2-3c** assertion extend to chart.js + sync paths | `chart.js` + bridges | **DEFERRED** (chart.js frozen) |
| **T2-3d** React SVG-only paths (`TalariaV8bLive.jsx`) | React / multichart shell | **DEFERRED** → re-migration |
| **TAL-01573** manual rescale → full re-render (`calculateScales` scope) | `chart.js` engine | **DEFERRED** (chart.js frozen; RC-2 cross-cut) |
| **M3-style settings-bypass** (renderDrawing without invalidation) | Settings UI + manager | **FIXED (partial)** — `notifyDrawingVisualMutation` + text-align defaults path |
| **Drawing local invalidation** (`redrawAll` / `addDrawing` SVG-only) | `drawing-tools-manager.js` single-chart | **FIXED** — local invalidation V2 |
| **G1 saveDrawings V2** (T2 step 1) | Already landed | No change |

---

## 1. Task + RC

- **Task:** T2 step 4 (Lane 1) — Part A: commit RC-3 phases; Part B: begin freeze-safe RC-2 invalidation fixes.
- **RC:** RC-2 — render-invalidation contract gaps on single-chart engine-local paths.

---

## 2. What I changed — file by file

### Part A — committed `ce3b28d2`

| Path | What / why |
|------|------------|
| `drawing-tools-base.js` (+ mirror) | RC-3 phases 2/4/6: clamp, fractional place, label anchor helpers |
| `drawing-tools-manager.js` (+ mirror) | RC-3 phases 3/4 + **T2 local invalidation V2** (bundled in same file) |
| `drawing-tools-fibonacci.js`, `fib-gann.js`, `advanced.js`, `advanced-volume.js` (+ mirrors) | RC-3 phases 4/6 (+ volume phase 1/2) |
| `t5-step4/5/6-*-proof.mjs` | RC-3 honest probes |

**Commit:** `ce3b28d2` — `T5: RC-3 anchoring phases 1-4,6 (fractional-place + label anchor + volume/clamp/paste, dev-only, NEEDS-LIVE)`

### Part B — uncommitted (working tree)

| Path | What / why |
|------|------------|
| `drawing-tools-ui.js` (+ mirror) | M3 bypass: text-align defaults `renderDrawing` now calls `notifyDrawingVisualMutation` |
| `t2-step4-local-invalidation-proof.mjs` | Honest RED→GREEN probe for `redrawAll` → `scheduleRender` |

**Note:** Local invalidation V2 landed inside `drawing-tools-manager.js` in commit `ce3b28d2` (same file as RC-3). UI mirror + proof script remain uncommitted pending Part B follow-up commit.

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Gated paths |
|--------|---------|-------------|
| `__TALARIA_DISABLE_DRAWING_LOCAL_INVALIDATION_V2` | ON (local invalidation enabled when `!== true`) | `addDrawing`, `redrawAll`, `notifyDrawingVisualMutation` |
| `__TALARIA_DISABLE_DRAWING_SAVE_INVALIDATION_V2` | ON (unchanged, T2 step 1) | `saveDrawings` |

Switch OFF: `redrawAll` / `addDrawing` do not call `scheduleRender` beyond existing save path.

---

## 4. Proof — RED → GREEN

### Part B local invalidation probe

```powershell
cd "chart v 1.4/chart/multichart-prod/harness"
node t2-step4-local-invalidation-proof.mjs
```

| Mode | `_mcDiag.renders` | verdict |
|------|-------------------|---------|
| **RED** (local OFF) | `11 → 11` after `redrawAll` | SVG-only redraw (stale canvas contract) |
| **GREEN** (local ON) | `11 → 12` after `redrawAll` | `scheduleRender` scheduled |

```text
FINAL T2-step4-local-invalidation PASS
```

**Actuation:** programmatic `addDrawing` + `redrawAll({ forceFull: true })`.  
**Measurement:** `chart._mcDiag.renders` (real canvas invalidation counter).

Gate not re-run; H-S38/H-S39 should remain green (save invalidation unchanged).

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| I8 | RC-3 commit mirrors SHA-identical; UI mirror matched at edit time |
| I13 | Local invalidation switch OFF/ON probed |
| I15 | Measured `_mcDiag.renders`, not SVG node count |
| Freeze | No multichart-parent, `chart.js`, indicator, or `known-failing.json` edits |

---

## 6. What I did NOT do / limits

- **Deferred (re-migration):** T2-3a/b/c/d, H-S50, peer delete ghost, React inline-text path.
- **TAL-01573:** requires `chart.js` `calculateScales` scope — frozen.
- **T2-2 axis A1** (`chart.js` tick/label): frozen.
- Part B UI + proof script not in `ce3b28d2` commit.

### Lane 4 known-failing row deltas

| Row | Disposition |
|-----|-------------|
| All current | **No change** |

---

## 7. Live-verification handoff

1. Place trendline → change color in settings → updates without click (H-S38 class — already green).
2. Pan/zoom chart → drawings should not “slide” one frame behind candles (local invalidation on `redrawAll`).
3. Open text tool settings first time → default align applies without extra click.
4. Console: `window.__TALARIA_DISABLE_DRAWING_LOCAL_INVALIDATION_V2 = true` → `redrawAll` may leave canvas stale until interaction.

---

## 8. Status

**Part A:** DONE — committed `ce3b28d2`  
**Part B:** DONE (dev only) — NEEDS-LIVE — local invalidation proven; UI/proof uncommitted; PO live confirm after build bump

---

## Part A — SHA256 (I8, post-commit)

| File | SHA256 (both trees match) |
|------|---------------------------|
| `drawing-tools-base.js` | `8EEB4CAB59894CF30BF2A8F8A3CB312E96DCFAED4728942B9CF879B4B2F95004` |
| `drawing-tools-manager.js` | `805C10075FED8051923B9F32E7B2687AAFB485287A17A7319F263DA02C5872C0` |
| `drawing-tools-fibonacci.js` | `B67B5D47FA937F8AFBFF8538DC56D60FA3514BACC4DE88C4BF7738E5F6B319EA` |
| `drawing-tools-fib-gann.js` | `263AF94DCE0BEB1C58C5F2F956AC096A825D597C2EEDD9C13A1F7D4A242B8E25` |
| `drawing-tools-advanced.js` | `EE3B233FD85B4890C744642EBD4B8ED49722521E4742D7C406E9DCB25F784EBD` |

---

## Deferred to RC-4 re-migration track

- T2-3a peer drawing add/remove/update invalidation
- T2-3b replay peer step → panel B repaint (H-S50)
- T2-3c global assertion on chart.js + sync-bridge
- T2-3d React `scheduleRenderDrawing`-only style commits
- TAL-01484 / TAL-01490 multichart “stuck until click”

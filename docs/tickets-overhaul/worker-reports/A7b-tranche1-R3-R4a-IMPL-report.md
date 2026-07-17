# A7b tranche 1 — R3 (pan-block) + R4a/R4b (VP axis highlights) — Lane 5 IMPLEMENTATION

**Prompt:** `docs/tickets-overhaul/worker-prompts/A7b-tranche1-R3-R4a-IMPL-lane5.md`  
**Build id:** `20260717b15` (re-stamp of VP freeze fix + tranche 1)  
**Prior P0:** `A7b-P0-anchored-VP-freeze-report.md` (RC-3 resolve recursion + render-storm guards)

---

## 1. Summary

| Hunk | Switch (unset = fix ON) | Status |
|------|-------------------------|--------|
| **R3** Pan block on VP zone background | `__TALARIA_DISABLE_VP_BODY_PAN_BLOCK_FIX` | **Implemented** |
| **R4a** VP axis highlight geometry | `__TALARIA_DISABLE_VP_AXIS_HIGHLIGHT_GEOMETRY_FIX` | **Implemented** |
| **R4b** VP axis labels default ON | `__TALARIA_DISABLE_VP_AXIS_LABEL_DEFAULT_ON_FIX` | **Implemented** |

**Not in scope (Manager):** R1 cross-layout preview leak; R2 `chart.js` margin floor; V9 `avStyle` label bridge (`TalariaV8bLive.jsx` frozen).

---

## 2. Changes by file (both I8 trees)

### `modules/drawing-tools-advanced-volume.js`

**R3 (~1491-1520):** `.volume-profile-hitbox` narrowed to the **bar column** (not full anchor→anchor span). `pointer-events: none` when tool unselected; `all` only when selected + on bar column.

**R4a:** `_buildVolumeProfileHighlightPoints` + `_volumeProfileShowAxisHighlights`; `showAxisHighlights()` overrides on `VolumeProfileTool` and `AnchoredVolumeProfileTool`. Price band from `_profileTopY/_profileBottomY`; time band anchor→latest bar for anchored VP.

**Anchored VP:** copy `_profileTopY/_profileBottomY` from proxy after render so highlights work on the parent instance.

### `modules/drawing-tools-manager.js`

**R3 (~15039-15128):** `isVolumeProfileBodyInside` — fix ON: no full-zone / boundary-rectangle body hit; bar column + selected hitbox only. `isVolumeProfileChartPanBlockedAtPoint` — fix ON: pass-through when unselected; block only on actual bar rects when selected.

### `modules/drawing-tools-base.js`

**R4b (~680-710, 2175):** `VP_AXIS_LABEL_DEFAULT_TYPES` + `_isVpAxisLabelDefaultOnFixEnabled()`; `isAxisLabelDefaultEnabled()` returns true for VP types when fix ON.

### `chart.js`

`CHART_ENGINE_BUILD = '20260717b15'` (both trees).

---

## 3. Kill-switch discriminators (D-023)

| Switch OFF | Expected RED (symptom returns) | Verification |
|------------|--------------------------------|--------------|
| `__TALARIA_DISABLE_VP_BODY_PAN_BLOCK_FIX = true` | Chart pan blocked on fixed-range VP **zone background** between anchors | NEEDS-LIVE: place fixed-range VP, drag on empty zone between vertical boundaries — pan should not start |
| `__TALARIA_DISABLE_VP_AXIS_HIGHLIGHT_GEOMETRY_FIX = true` | No price/time axis highlight bands on anchored VP (1-point guard) or flat-Y fixed-range VP | NEEDS-LIVE: select VP, enable labels — bands missing or zero height |
| `__TALARIA_DISABLE_VP_AXIS_LABEL_DEFAULT_ON_FIX = true` | VP types require explicit `showPriceLabel`/`showTimeLabel` in style | NEEDS-LIVE: fresh VP without V9 bridge — labels off until toggled |

**Harness:** No dedicated VP pan/label scenario yet; static mechanism + module syntax verified. H-S42 run: CORE anchor timestamp p0 stable; p1 right-edge drift on TF switch is pre-existing RC-3 (not this tranche).

---

## 4. Tickets discharged (partial)

| Ticket | Hunk | Notes |
|--------|------|-------|
| TAL-01666 | R3 | Pan on zone background when VP present |
| TAL-01667 | R3 | Control loss partially addressed (pan path) |
| TAL-01662 | R4a + R4b | Engine geometry + default-on labels |
| TAL-01664 | R4a | Engine axis bands for reposition context (partial) |

**Still open:** TAL-01662/01664 for **anchored VP in V9 production** until `avStyle` bridge maps `priceLabels`/`timeLabels` (re-migration tranche).

---

## 5. V9 bridge gap (Manager handoff)

Fixed-range VP: `applyVpStyleBridgeFromSnapshot` maps label toggles (`TalariaV8bLive.jsx:23279-23283`).  
Anchored VP: `avStyle` bridge **omits** price/time label props — UI toggles never reach engine even with R4a/R4b ON.

**PO NEEDS-LIVE:** Verify labels on **fixed-range VP** via V9 Style tab; anchored labels may still appear dead until re-migration bridge lands.

---

## 6. PO verification steps

1. Confirm console: `[Talaria chart engine] 20260717b15`.
2. Place **fixed-range Volume Profile**; pan chart by dragging **empty area between anchor lines** — must pan (R3).
3. Select VP; price/time axis highlight bands should span **computed profile height** and anchor→end time range (R4a).
4. Fresh VP should show labels without manual style keys when V9 sends toggles or engine defaults apply (R4b).
5. To bisect: set any `__TALARIA_DISABLE_VP_*` switch above to `true` and confirm RED behavior returns.

---

## 7. Build / dist

- `npm run build:chart-client` → `dist/chart-app-part*.min.js` regenerated.
- I8 mirror: `homepage/public/chart/modules/*` + `chart.js` byte-synced with canonical tree.

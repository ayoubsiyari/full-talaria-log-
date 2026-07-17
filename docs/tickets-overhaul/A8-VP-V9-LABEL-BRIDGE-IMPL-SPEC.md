# A8-VP — V9 anchored-VP label bridge + coordinates-tab reposition

**Authority:** [`A8-VP-FAMILY-CLOSURE-SWEEP.md`](A8-VP-FAMILY-CLOSURE-SWEEP.md) §4.1–§4.2, A7b intake (`DAILY-INTAKE.md`), D-023 (per-row discriminators), D-018 (combined drawing build).  
**Status:** **READ-ONLY spec** — no product edits in this deliverable. Turnkey for the worker who lands after **A6-4 ship-gate** clears and the current combined drawing build is blessed (same cadence as [`A8-FREEZE-SAFE-IMPL-SPEC.md`](A8-FREEZE-SAFE-IMPL-SPEC.md)).  
**RC:** RC-3 drawing-interaction (VP axis labels, anchor geometry) · RC-4 (V9 settings transport)  
**Prerequisite engine legs (already LANDED b15):** R4a `__TALARIA_DISABLE_VP_AXIS_HIGHLIGHT_GEOMETRY_FIX`, R4b `__TALARIA_DISABLE_VP_AXIS_LABEL_DEFAULT_ON_FIX` — see [`worker-reports/A7b-tranche1-R3-R4a-IMPL-report.md`](worker-reports/A7b-tranche1-R3-R4a-IMPL-report.md).

**Tickets in this spec:**

| Ticket | Gap | Tranche |
|--------|-----|---------|
| **TAL-01662** | Price/time labels dead on **anchored** VP in V9 production | **A8-VP-1** |
| **TAL-01664** | Cannot reposition tool via coordinates tab / live geometry sync (anchored path) | **A8-VP-2** (+ A8-VP-1 for label-driven reposition context) |

**Diagnostic inputs (read before implementing):**

| Doc | Covers |
|-----|--------|
| [`A8-VP-FAMILY-CLOSURE-SWEEP.md`](A8-VP-FAMILY-CLOSURE-SWEEP.md) §4.1–§4.2 | Gap inventory |
| [`worker-reports/A7b-tranche1-R3-R4a-IMPL-report.md`](worker-reports/A7b-tranche1-R3-R4a-IMPL-report.md) §5 | V9 `avStyle` bridge gap vs fixed-range `vpStyle` |
| [`worker-reports/A7b-volume-profile-diagnostic-report.md`](worker-reports/A7b-volume-profile-diagnostic-report.md) §R4 Mechanisms B–C | Label + coord root causes |

---

## 0. Fence — freeze-safe surface, forbidden core, build ride

| Rule | Detail |
|------|--------|
| **Landing gate** | Land **after A6-4 ship-gate** clears. Does **not** unblock bless by itself; rides the **next combined drawing build** (module + V9 live bundle). |
| **Forbidden edits** | **`chart.js`**, **`replay-system.js`**, **`panel-cmd-bridge.js`**, **`MultichartGrid.jsx`**, multichart sync / re-migration bridge core. |
| **Primary allowed surface** | **`chart v 1.4/talaria-design/src/TalariaV8bLive.jsx`** (+ mirrored live build output). This is **not** the Lane 5 A8 freeze fence — that fence blocks A8 modifier-drag work; **this tranche is an authorized V9 host edit**. |
| **Optional engine touch** | **`drawing-tools-manager.js`** only if harness proves `v9DrawingGeometryLive` payload is missing `type` on a VP drag path (currently present at ~3589–3595). **No new engine geometry** — R4a/R4b already landed in `drawing-tools-advanced-volume.js` / `drawing-tools-base.js`. |
| **I8** | Engine modules already byte-synced; this tranche additionally rebuilds **V9 live** (`talaria-design/live`, `dist-v9`, homepage mirror per existing workflow). |
| **Build stamp** | No `CHART_ENGINE_BUILD` bump required unless a worker touches `chart.js` (forbidden). FIX report cites **V9 bundle + commit**; PO confirms via live console + anchored-VP label/coord recipes below. |

**Interim tester workaround (unchanged until land):** Fixed-range VP labels work in V9; **anchored** VP labels/coords appear dead in production shell even with R4a/R4b ON — use fixed-range VP or legacy modal if available.

---

## 1. Problem summary

### 1.1 Gap §4.1 — V9 anchored-VP label bridge (TAL-01662)

Engine R4a/R4b make axis highlights and default-on labels **correct when `drawing.style.showPriceLabel` / `showTimeLabel` reach the tool**. Fixed-range VP path is wired; **anchored VP is not**.

| Layer | Fixed-range VP (working) | Anchored VP (broken) |
|-------|--------------------------|----------------------|
| V9 state | `vpStyle.priceLabels` / `timeLabels` default `true` (`TalariaV8bLive.jsx:13748–13749`) | **`avStyle` omits both keys** (`13762–13779`) |
| Style tab UI | Labels row with Price/Time toggles (`30851–30857`) | **No Labels row** in av Style tab (`31107–31175`) |
| Style bridge | `applyVpStyleBridgeFromSnapshot` maps toggles + **`v9SyncDrawingAxisHighlights(d)`** (`23291–23333`) | `avStyle` bridge **omits** label props and **never** calls `v9SyncDrawingAxisHighlights` (`23387–23432`) |
| Selection readback | `priceLabels` / `timeLabels` from `ds.showPriceLabel` / `showTimeLabel` (`20846–20847`, `21221–21222`) | **`setAvStyle` readback omits label keys** (`20862`, `21225–21245`) |

**Production symptom:** User enables Price/Time labels (or expects R4b defaults) on **Anchored Volume Profile** in V9 — engine never receives style flags; axis bands stay hidden despite R4a geometry fix.

### 1.2 Gap §4.2 — Coordinates-tab reposition (TAL-01664)

R4a axis bands help **visual** reposition context but do not complete **bidirectional** coordinates editing for anchored VP in V9.

| Direction | Fixed-range VP (reference) | Anchored VP (broken) |
|-----------|----------------------------|----------------------|
| **V9 → canvas** | `v9ApplyPointsFromTlStyle` via `vpCoordBridge` + `onUpdate` + **`v9SyncDrawingAxisHighlights`** (`23356–23385`) | `v9ApplyAnchorPointsFromAvStyle` runs (`23444–23464`) but **no `onUpdate`**, **no `v9SyncDrawingAxisHighlights`**, **no `suppressCoordBridge` / `v9StyleBridgeAppliesToDrawing` guards** |
| **Canvas → V9** | `applyCanvasToTlStylePatch` → `setVpStyle` via `v9VpCoordVisPatchFromDrawing` when `v9IsVolumeProfileDrawingType` (`20348–20362`, `4181–4183`) | **`anchored-volume-profile` excluded** from `V9_VOLUME_PROFILE_DRAWING_TYPES` (`4179–4182`); `v9DrawingGeometryLive` updates **`tlStyle` `pt*` keys only**, not **`avStyle.anchorPrice` / `anchorBar`** (`20412–20427`, `31204–31249`) |
| **Live drag sync** | `_notifyV9DrawingGeometryLive` → `v9DrawingGeometryLive` event (`drawing-tools-manager.js:3578–3596`) | Event fires, but **React listener does not patch `avStyle`** |

**Production symptom:** Coordinates tab fields (`anchorPrice`, `anchorBar`) do not track canvas drag; edits from the tab may move the anchor but axis highlights / profile do not resync like fixed-range VP.

---

## 2. V9 bridge events and helpers (contract)

Implementers must preserve these existing contracts; **no new global event names**.

### 2.1 `v9DrawingGeometryLive` (canvas → V9, A8-VP-2)

**Emitter:** `drawing-tools-manager.js`

```3578:3596:chart v 1.4/chart/modules/drawing-tools-manager.js
    _notifyV9DrawingGeometryLive(drawing, pointsOverride = null) {
        // ...
            window.dispatchEvent(new CustomEvent('v9DrawingGeometryLive', {
                detail: {
                    id,
                    type: drawing.type,
                    points: points.map((p) => (p ? { ...p } : p)),
                },
            }));
```

**Listener:** `TalariaV8bLive.jsx:20412–20427` — today calls `applyCanvasToTlStylePatch(..., { coordsOnly: true })` only.

**Required A8-VP-2 extension:** When `detail.type === 'anchored-volume-profile'`, also apply `v9AnchorCoordPatchFromDrawing({ points })` → `setAvStyle` (with `suppressAvBridge` / `suppressCoordBridge` as needed). Reference helper:

```3207:3220:chart v 1.4/talaria-design/src/TalariaV8bLive.jsx
/** anchored-volume-profile / anchored-vwap Coordinates tab → drawing.points[0]. */
function v9AnchorCoordPatchFromDrawing(d) {
  // → { anchorPrice, anchorBar }
}
```

### 2.2 `v9SyncDrawingAxisHighlights(d)` (post-style / post-geometry, A8-VP-1 + A8-VP-2)

**Definition:** `TalariaV8bLive.jsx:5760–5772`

**Reference usage (fixed-range VP):** after style bridge push (`23329–23333`) and after coord bridge move (`23380`).

**Required:** Call from **anchored** style bridge (A8-VP-1) and **anchored** coord bridge (A8-VP-2) at parity with fixed-range VP.

### 2.3 Style bridge pattern (A8-VP-1)

Mirror `applyVpStyleBridgeFromSnapshot` (`23291–23338`):

- Map `priceLabels` → `d.style.showPriceLabel`, `timeLabels` → `d.style.showTimeLabel`
- `dm.renderDrawing` + `saveDrawings`
- **`v9SyncDrawingAxisHighlights(d)`**
- `useLayoutEffect` dependency array must include `avStyle.priceLabels`, `avStyle.timeLabels` (compare `23353`)

---

## 3. Switch convention (D-023 — one switch per tranche)

**Pattern:** `window.__TALARIA_DISABLE_<NAME>` — **`unset` = fix ON**; **`= true` = revert** to pre-fix behavior (honest RED).

| Switch | Tranche | Default | Gating surface |
|--------|---------|---------|----------------|
| `__TALARIA_DISABLE_VP_V9_AV_LABEL_BRIDGE_FIX` | **A8-VP-1** | unset = ON | `TalariaV8bLive.jsx` (read at bridge + UI render) |
| `__TALARIA_DISABLE_VP_V9_AV_COORD_REPOSITION_FIX` | **A8-VP-2** | unset = ON | `TalariaV8bLive.jsx` (coord bridge + geometry listener) |

**Enable helpers** (add near top of V9 bridge section in `TalariaV8bLive.jsx`, or shared small util block):

```javascript
function _isVpV9AvLabelBridgeFixEnabled() {
  return typeof window === 'undefined'
    || window.__TALARIA_DISABLE_VP_V9_AV_LABEL_BRIDGE_FIX !== true;
}
function _isVpV9AvCoordRepositionFixEnabled() {
  return typeof window === 'undefined'
    || window.__TALARIA_DISABLE_VP_V9_AV_COORD_REPOSITION_FIX !== true;
}
```

**I13 proof:** FIX report must show each switch `= true` restores pre-fix behavior on that tranche’s RED recipe (§6).

**Harness CLI hooks (Lane 4 registers when implementing):**

| CLI flag | Switch |
|----------|--------|
| `--vp-v9-av-label-bridge-off` | `__TALARIA_DISABLE_VP_V9_AV_LABEL_BRIDGE_FIX` |
| `--vp-v9-av-coord-reposition-off` | `__TALARIA_DISABLE_VP_V9_AV_COORD_REPOSITION_FIX` |

---

## 4. Product hunks

### A8-VP-1 — V9 anchored-VP label bridge (TAL-01662)

**File:** `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx` (rebuild live/dist mirrors).

| Hunk | Location | Change |
|------|----------|--------|
| **VP-1a** State defaults | `avStyle` initializer ~`13762–13779` | Add `priceLabels: true`, `timeLabels: true` (parity `vpStyle` ~`13748–13749`) |
| **VP-1b** Style tab UI | av Style tab ~`31107–31175` | Insert **Labels** row mirroring fixed-range VP ~`30851–30857`: `TlChk(avStyle.priceLabels, …)`, `TlChk(avStyle.timeLabels, …)` |
| **VP-1c** Style bridge push | `avStyle` `useLayoutEffect` ~`23387–23442` | When `_isVpV9AvLabelBridgeFixEnabled()`: set `d.style.showPriceLabel = !!avStyle.priceLabels`, `d.style.showTimeLabel = !!avStyle.timeLabels`; call **`v9SyncDrawingAxisHighlights(d)`** after render (parity ~`23329–23333`) |
| **VP-1d** Effect deps | same effect ~`23434–23442` | Add `avStyle.priceLabels`, `avStyle.timeLabels` to dependency array |
| **VP-1e** Selection readback | dblclick hook ~`20856–20868`; multichart toolbar path ~`21225–21245`; any other `setAvStyle` hydrate from `ds` | Merge `priceLabels: ds.showPriceLabel !== false`, `timeLabels: ds.showTimeLabel !== false` (parity vp readback ~`20846–20847`) |
| **VP-1f** (optional) Extract flush | near `vpStyleBridgeFlushRef` ~`13514–13516`, `23339` | `applyAvStyleBridgeFromSnapshot` + ref flush on panel dismiss — only if dismiss race reproduces stale labels |

**Do not modify:** Engine R4a/R4b switches or `drawing-tools-advanced-volume.js` highlight geometry (already LANDED).

---

### A8-VP-2 — Coordinates-tab reposition parity (TAL-01664)

**File:** `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx`.

| Hunk | Location | Change |
|------|----------|--------|
| **VP-2a** Reverse geometry sync | `applyCanvasToTlStylePatch` ~`20315–20363` | After existing VP branch, when `_isVpV9AvCoordRepositionFixEnabled()` && `d.type === 'anchored-volume-profile'`: `setAvStyle` with `v9AnchorCoordPatchFromDrawing(d)`; set `suppressAvBridge` / `suppressCoordBridge` like vp path (~`20325–20326`) |
| **VP-2b** Live listener | `onGeometryLive` ~`20412–20427` | If `detail.type === 'anchored-volume-profile'`, patch `avStyle` anchor fields (not only `tlStyle` `pt*`) |
| **VP-2c** Forward coord bridge | `avCoordBridge` effect ~`23444–23464` | Parity with `vpCoordBridge` ~`23356–23385`: guard `suppressCoordBridge`; `v9StyleBridgeAppliesToDrawing(d, editSess)`; prefer `tb.onUpdate(d)` else `renderDrawing`; **`v9SyncDrawingAxisHighlights(d)`**; `saveDrawings`; schedule chart render |
| **VP-2d** Bridge gate | `avCoordBridge` effect | Wrap body with `_isVpV9AvCoordRepositionFixEnabled()` — when OFF, retain current minimal path |
| **VP-2e** (verify only) Engine event | `drawing-tools-manager.js:3578–3596` | Confirm anchored VP drag/resizes already call `_broadcastLiveEditUpdate` → `_notifyV9DrawingGeometryLive` (~`6476–6480`, `7160`). **No edit unless harness shows missing `type` in `detail`.** |

**Explicit non-goals for A8-VP-2:**

- Do **not** add `anchored-volume-profile` to `V9_VOLUME_PROFILE_DRAWING_TYPES` (~`4179`) — that set drives **fixed-range** `vpStyle` / two-point coord UI; anchored uses **`avStyle.anchor*`** (~`31204–31249`).
- Do **not** re-open legacy `drawing-tools-ui.js` `buildCoordinatesTab` (~`17572+`) for production V9 path unless PO explicitly requests legacy-modal parity.

---

## 5. Land order and PR split

| Order | Tranche | Rationale |
|-------|---------|-----------|
| 1 | **A8-VP-1** | Smallest diff; unblocks TAL-01662 anchored label proof |
| 2 | **A8-VP-2** | Depends on stable label/resync helper usage; closes TAL-01664 coord leg |

**Recommended:** One PR per tranche (D-023 isolated discriminators). Combined PR acceptable if FIX report documents **independent** switch-OFF RED for each row.

**Rebuild:** `npm run build:live` (or project-standard V9 live pipeline) after `TalariaV8bLive.jsx` edits; sync `homepage/public/chart/dist-v9` per existing I8 workflow.

---

## 6. RED-first harness specs (Lane 4)

**Full wire-up (same depth as [`A8-RED-HARNESS-SPECS.md`](A8-RED-HARNESS-SPECS.md)):** [`A8-VP-V9-RED-HARNESS-SPECS.md`](A8-VP-V9-RED-HARNESS-SPECS.md) — topology, I15 actuation, probes, switch-OFF legs, and `react-parity-scenarios.mjs` skeletons for **H-A8-VP-1** / **H-A8-VP-2**.

Register in `react-parity-scenarios.mjs` when implementing. **Default run: switches unset (fix ON).** Discriminator run: corresponding `--*-off` flag.

### H-A8-VP-1 — Anchored VP V9 label bridge (summary)

**Topology:** Built React V9 live, single panel (minimum); optional `mcLayout=2v` row if multichart toolbar readback implicated.

**Symptom / discriminator:** With `__TALARIA_DISABLE_VP_V9_AV_LABEL_BRIDGE_FIX === true`, toggling V9 Price/Time labels on **anchored** VP does **not** set `drawing.style.showPriceLabel` / `showTimeLabel` and axis highlight zones stay absent. With fix ON, toggles flip engine flags and highlights appear (R4a geometry).

**Setup:**

1. Boot harness with fix ON (default).
2. Place **anchored-volume-profile** on panel A (reuse `defaultVolumeAnchorPoints` from H-S42).
3. Double-click drawing → open **Anchored Volume Profile** V9 settings (`avSettOpen`).
4. Ensure **Style** tab; locate **Labels** row (post A8-VP-1).

**Actuation:**

1. Assert initial readback: `page.evaluate` → selected drawing `style.showPriceLabel` / `showTimeLabel` truthy (R4b default or explicit).
2. Toggle **Price** off → on; toggle **Time** off → on.
3. After each toggle, evaluate: `d.style.showPriceLabel` / `showTimeLabel` match UI; call path equivalent to `showAxisHighlights` visible (DOM: axis highlight rects or manager probe).

**PASS (fix ON):** Both toggles change engine style; highlights visible when ON and selected.

**FAIL-REAL-BUG (fix OFF):** Toggles do not change engine style **or** highlights never appear for anchored type while fixed-range VP control on same build passes.

**Reference GREEN baseline:** Fixed-range VP same steps on `vpStyle` toggles (~`30854–30855`) — must still pass (no regression).

---

### H-A8-VP-2 — Anchored VP coordinates reposition

**Symptom / discriminator:** With `__TALARIA_DISABLE_VP_V9_AV_COORD_REPOSITION_FIX === true`, Coordinates tab edits and/or canvas drag do not keep **bidirectional** anchor sync; profile position unchanged or tab fields stale. With fix ON, both directions match.

**Setup:**

1. Place anchored VP; open settings → **Coordinates** tab (~`31204–31249`).
2. Record `points[0].x` / `points[0].y` via `page.evaluate`.

**Actuation A (tab → canvas):**

1. Change **Bar** (+10) and **Price** (+Δ) via coordinates inputs.
2. Assert `drawing.points[0]` updated; profile re-rendered; **`v9SyncDrawingAxisHighlights`** effect observable (highlights track new anchor).

**Actuation B (canvas → tab):**

1. Drag anchor handle on chart (or move via manager if harness exposes).
2. Assert `v9DrawingGeometryLive` received (optional spy) and **Coordinates** tab shows updated `anchorBar` / `anchorPrice` without closing panel.

**PASS (fix ON):** A and B both within tolerance (bar index ±0.01, price ±1 tick).

**FAIL-REAL-BUG (fix OFF):** Tab shows stale anchor after drag **or** tab edits do not move drawing.

**Optional regression:** Fixed-range VP coord bridge (`vpSettTab === "coordinates"`, ~`30887–30837`) still passes — do not break two-point path.

---

## 7. PO manual verification

1. Confirm build id / bundle matches FIX report (V9 live, not only module stamp).
2. **TAL-01662 (anchored):** Place Anchored Volume Profile → Style → toggle Price + Time labels → axis bands appear on price/time axes when selected.
3. **TAL-01662 (control):** Repeat on Fixed Range VP — still works (no regression).
4. **TAL-01664:** Coordinates tab → change anchor bar/price → profile moves; drag anchor on chart → tab fields update live.
5. **D-023 bisect:** Set each switch `= true` in console before reload; confirm corresponding symptom returns.

---

## 8. Closure cross-check

| Item | After A8-VP-1 | After A8-VP-2 |
|------|---------------|---------------|
| [`A8-VP-FAMILY-CLOSURE-SWEEP.md`](A8-VP-FAMILY-CLOSURE-SWEEP.md) §4.1 | **CLOSED** (anchored V9 label path) | — |
| Same doc §4.2 | partial (labels help reposition) | **CLOSED** (coord tab + live sync) |
| TAL-01662 | **LANDED** for anchored production path | — |
| TAL-01664 | partial | **LANDED** for V9 coord reposition |
| RESOLUTION-TRACKER | Add rows for both switches + harness ids | |

**Still outside this spec:** R2 axis margin (`D029-R2-AXIS-MARGIN-CLAMP-IMPL-SPEC.md`), R1 preview leak (RC-4), TAL-01624 keyboard zoom (`chart.js`), A8 modifier-drag tranches (`A8-FREEZE-SAFE-IMPL-SPEC.md`).

---

## 9. File / line index (quick reference)

| Concern | File | Lines |
|---------|------|-------|
| Fixed-range label bridge (reference) | `TalariaV8bLive.jsx` | 23291–23354 |
| Anchored style bridge (gap) | `TalariaV8bLive.jsx` | 23387–23442 |
| Anchored coord bridge (gap) | `TalariaV8bLive.jsx` | 23444–23464 |
| Fixed-range coord bridge (reference) | `TalariaV8bLive.jsx` | 23356–23385 |
| `v9DrawingGeometryLive` listener | `TalariaV8bLive.jsx` | 20412–20427 |
| Canvas→React coord patch | `TalariaV8bLive.jsx` | 20315–20363 |
| Anchor coord helper | `TalariaV8bLive.jsx` | 3207–3240 |
| Axis highlight resync | `TalariaV8bLive.jsx` | 5760–5772 |
| VP type set (excludes anchored) | `TalariaV8bLive.jsx` | 4179–4183 |
| av Style tab (no Labels row) | `TalariaV8bLive.jsx` | 31107–31175 |
| av Coordinates tab | `TalariaV8bLive.jsx` | 31204–31249 |
| vp Labels row (copy target) | `TalariaV8bLive.jsx` | 30851–30857 |
| Event emitter | `drawing-tools-manager.js` | 3578–3596 |
| Engine R4a highlight override | `drawing-tools-advanced-volume.js` | 47–104, 2406–2408, 2577–2578 |
| Engine R4b default-on types | `drawing-tools-base.js` | 698–707 |

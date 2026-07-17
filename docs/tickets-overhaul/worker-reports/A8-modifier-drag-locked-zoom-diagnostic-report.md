# A8 — Shift-modifier drag + locked pass-through + keyboard-zoom anchor diagnostic (Lane 5)

## 1. Task + RC

- **Task:** A8 read-only diagnostic (D-028 queue item #2). Consolidate the Shift-modifier drag family, locked-tool gesture pass-through, and keyboard-zoom anchor tickets. Name mechanisms with file:line, split freeze-safe vs frozen/escalation territory, propose gated fix scope and D-023 discriminators. **No product code changes — keeps off bless build.**
- **RC:** RC-3 drawing-interaction class (modifier drag / live-edit sync); RC-2 chart viewport anchor for keyboard zoom. **Diagnostic only — no RC discharged.**

**Tickets in scope:**

| Ticket | Symptom (tester) |
|--------|------------------|
| TAL-01593 | Shift + rectangle corner → shape jumps to chart top/bottom |
| TAL-01654 | Seven Shift tools: Trend Line, Ray, Extended Line, Arrow, Line, Parallel Channel, Regression Trend |
| TAL-01655 | Shift + drag → tool at new location **and duplicate at origin** |
| TAL-01651 | Shift tools misaligned across multichart layouts; start point not shared |
| TAL-01652 | Grab locked tool → chart does not pan (should pass through) |
| TAL-01624 | Keyboard zoom anchors wrong point; should zoom on **first candle on the right** |

---

## 2. What I changed — file by file

**N/A — diagnostic only.** No edits to `chart v 1.4/chart/**`, `homepage/public/chart/**`, harness, React host, or `panel-cmd-bridge`.

**Read paths:** `drawing-tools-manager.js`, `drawing-tools-shapes.js`, `drawing-tools-base.js`, `keyboard-shortcuts.js`, `chart.js` (read-only), `DAILY-INTAKE.md`, `TRACKS.md`, ticket export `messages.csv`. Harness `scenarios.mjs` searched — **no A8 scenarios exist.**

---

## 3. Kill-switch (I3 + I13)

**N/A — not implemented.** Proposed gates per leg in §8.

---

## 4. Proof — reproduction + actuation honesty (I15)

### 4.1 Reproduction recipes (PO / dev:live / built embed)

**Surface:** single-panel chart or multichart 2×2 with **drawing sync ON** (required for TAL-01651).

#### Leg A — Shift box corner snap-to-edge (TAL-01593)

| Step | Action |
|------|--------|
| 1 | Place a **rectangle** (any size, mid-chart). Select it; grab a **corner handle**. |
| 2 | Hold **Shift**; drag corner mostly **horizontally** (small vertical movement). |
| 3 | Expect: square constraint in **screen space** (TradingView-style). Observe: box **vertical extent explodes** toward chart top or bottom. |
| 4 | Repeat on **ellipse** corner (same `squareConstrainedBoxPoint` path). |

#### Leg B — Shift line-tool move/resize (TAL-01654)

| Step | Action |
|------|--------|
| 1 | Place **trendline**, **ray**, **extended-line**, **arrow** (tester's “Line” ≈ trendline). |
| 2 | **Move whole body** with Shift held → expect 0°/45°/90° translation lock. |
| 3 | **Resize endpoint** with Shift → expect angle snap from opposite anchor. |
| 4 | Repeat **parallel-channel** and **regression-trend** — note code gap (§7.2). |

#### Leg C — Shift duplicate ghost (TAL-01655)

| Step | Action |
|------|--------|
| 1 | Select any **angleSnapTools** drawing (e.g. trendline). |
| 2 | Shift + **body drag** several bars; release. |
| 3 | Expect: single shape at new location. Observe: **second copy** at original position until refresh or peer sync settles. |
| 4 | Optional multichart: same drag with drawing sync ON — check whether ghost is local-only or also on peer. |

#### Leg D — Cross-layout Shift misalignment (TAL-01651)

| Step | Action |
|------|--------|
| 1 | Multichart **2×2**, **same symbol**, drawing sync ON; set **different timeframes** on tiles (e.g. 1m vs 5m). |
| 2 | Panel A: Shift + move a trendline; watch B/C/D. |
| 3 | Expect: same **timestamp/price** geometry on all tiles. Observe: peers offset or different start bar (tester `1939_13.png`). |

#### Leg E — Locked tool pass-through (TAL-01652)

| Step | Action |
|------|--------|
| 1 | Place any shape; **lock** it (context menu / Objects tree). |
| 2 | Cursor mode; **mousedown on locked body** and drag. |
| 3 | Expect: **chart pans** (TradingView pass-through). Observe: chart stationary; locked shape may flicker then restore (`1939_14.png`). |

#### Leg F — Keyboard zoom anchor (TAL-01624)

| Step | Action |
|------|--------|
| 1 | Load chart; **pan left** so the **rightmost visible candle** is **not** the last bar in `data` (history in view). |
| 2 | Press **`+`** / **`-`** (or bound shortcut via `keyboard-shortcuts.js`). |
| 3 | Expect: zoom anchors on **visible right-edge candle** (tester wording). Observe: zoom pivots around **last loaded bar** or chart center — visible viewport shifts incorrectly (`1911_…png`). |
| 4 | Compare with **mouse wheel** over plot center — wheel uses **cursor anchor** (`handleWheel` ~31687). |

### 4.2 What was actuated this session

| Claim | Actuation | Measurement | Status |
|-------|-----------|-------------|--------|
| Rectangle Shift corner jump | **Not run** | Static: `squareConstrainedBoxPoint` mixes bar-index Δx with price Δy | **MECHANISM CONFIRMED**; live **NOT PROVEN** |
| Line Shift snap on move/resize | **Not run** | Static: `angleSnapTools` + pixel-aware `constrainToAngle` | **PARTIAL** (tools listed vs registry gap) |
| Duplicate at origin | **Not run** | Static: live move mutates `drawing.points` + `_broadcastLiveEditUpdate` | **HYPOTHESIS RANKED** |
| Cross-layout misalignment | **Not run** | Static: live broadcast strips `timestampPoints` | **MECHANISM CONFIRMED** for multichart leg |
| Locked pass-through | **Not run** | Static: locked hit targets + `findDrawingAtPoint` block pan | **MECHANISM CONFIRMED** |
| Keyboard zoom wrong anchor | **Not run** | Static: `zoomAtLastCandle` uses `data.length - 1` | **MECHANISM CONFIRMED** |

**Honesty:** All PO symptoms are **plausible from code**; this report does **not** claim live RED/GREEN. Status **DIAGNOSTIC-ONLY / NEEDS-LIVE**.

### 4.3 Harness

No `H-S*` row covers Shift drag, locked pass-through, or keyboard zoom anchor. Future acceptance requires **new harness scenarios** or manual PO checklist with D-023 switch-OFF discriminators (§8).

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| I8 | No edits |
| I13 | §8 proposes per-fix kill-switches |
| I15 | Mechanisms named; live repro deferred |
| Lane 5 fence | No `chart.js`, `MultichartGrid.jsx`, `TalariaV8bLive.jsx`, `panel-cmd-bridge` **edits** |
| No bless blocker | Diagnostic only — nothing landed |

---

## 6. Territory split (binding)

| Leg | Primary files | Lane 5 can implement? |
|-----|---------------|------------------------|
| **A** Box Shift square (TAL-01593) | `drawing-tools-shapes.js`, `drawing-tools-manager.js` `_constrainBoxPlacementPoint` | **YES** — pixel-space square (mirror `constrainToAngle` pattern) |
| **B** Line Shift snap (TAL-01654) | `drawing-tools-manager.js` `angleSnapTools`, move/resize paths | **YES** — extend registry + channel tools if PO confirms |
| **C** Duplicate ghost (TAL-01655) | `drawing-tools-manager.js` `_applyLiveDrawingMovePixels`, `_commitStaleDrawingGroupTransform`, `_broadcastLiveEditUpdate` | **LIKELY YES** — single-panel first; multichart may need sync follow-on |
| **D** Cross-layout Shift (TAL-01651) | `_broadcastLiveEditUpdate` + multichart `broadcastDrawingChange` / timestamp re-migration | **PARTIAL** — index-only live payload is freeze-safe to fix; **full parity = re-migration** (A7b R1 class) |
| **E** Locked pass-through (TAL-01652) | `drawing-tools-manager.js` locked guard; `chart.js` `findDrawingAtPoint` / SVG mousedown | **PARTIAL** — manager-side `pointer-events` / forward-pan **YES**; chart `findDrawingAtPoint` early-return **NO** (frozen) |
| **F** Keyboard zoom (TAL-01624) | `chart.js` `zoomAtLastCandle`; `keyboard-shortcuts.js` `zoomIn`/`zoomOut` | **NO** — anchor math is **`chart.js`**; shortcuts only call into chart. **Escalate Manager** |

---

## 7. Ranked roots

### 7.1 TAL-01593 — Rectangle (box) Shift corner snaps to chart top/bottom

| Rank | Root cause | Evidence |
|------|------------|----------|
| **1** | **`squareConstrainedBoxPoint` runs in mixed data units** — `size = max(|dx|, |dy|)` where `dx` is **bar index** and `dy` is **price**. A mostly-horizontal corner drag yields a huge price delta when `|dx| ≫ |dy|`, projecting the box to the Y domain edge. | `drawing-tools-shapes.js` ~308–341; invoked from `handleCustomHandleDrag` ~939–940 (rectangle) and ~1238–1239 (ellipse). Placement twin: `_constrainBoxPlacementPoint` ~4904–4916 (same math). |
| **2** | **`constrainToAngle` already uses pixel space** for line tools (~4763–4820) but box tools were never migrated to the same pattern. | Contrast `constrainToAngle` vs `squareConstrainedBoxPoint`. |
| **3** | Stale `_resizeStart` after corner flip | Lower confidence for *edge* symptom; `applyBoxHandleDragWithFlip` re-anchors (~948–956). |

**Fix sketch (freeze-safe):** compute square constraint in **pixel space** (width/height in px, then invert to data), gated by `__TALARIA_DISABLE_BOX_SHIFT_SQUARE_PIXEL_FIX`.

---

### 7.2 TAL-01654 — Tester’s seven Shift tools

**Code registry vs tester list:**

| Tester name | Internal type | Shift on move/resize today |
|-------------|---------------|----------------------------|
| Trend Line | `trendline` | **YES** — `angleSnapTools` ~508 |
| Ray | `ray` | **YES** |
| Extended Line | `extended-line` | **YES** |
| Arrow | `arrow` | **YES** |
| Line | (UI label → `trendline`) | **YES** |
| Parallel Channel | `parallel-channel` | **NO** — not in `angleSnapTools`; placement uses perpendicular 3rd-point math ~4651–4670 only |
| Regression Trend | `regression-trend` | **NO** — not in `angleSnapTools`; stroke-only drag ~13408–13411 |

**Shared Shift paths (when tool is in `angleSnapTools` or `boxShiftSnapTools`):**

| Phase | Mechanism | Location |
|-------|-----------|----------|
| Placement 2nd+ point | `constrainToAngle` | ~4645–4648 |
| Body move | `_constrainPixelDeltaToSnapAngles` | ~5302–5306, ~8480–8483, ~1192–1200 |
| Handle resize | `_applyShiftAngleConstraintForResize` → `constrainToAngle` | ~4869–4873, ~4920–4924, ~9756–9760 |
| Box corner resize | `squareConstrainedBoxPoint` | shapes.js (see §7.1) |
| Bar snap deferral | `_deferBarIndexSnapDuringShiftEdit` | ~4881–4900 |

**Gap:** PO list includes **parallel-channel** and **regression-trend** — either tester expectation exceeds implementation, or Shift bugs on those tools are **unrelated** (e.g. whole-body drag without angle lock). Confirm on NEEDS-LIVE before expanding `angleSnapTools`.

---

### 7.3 TAL-01655 — Duplicate ghost at origin during Shift+drag

| Rank | Root cause | Evidence |
|------|------------|----------|
| **1** | **Live move rewrites `drawing.points` every frame** while **`singleDragStartPoints` / `bodyDragStartPoints` stay at origin** — if any render/sync path reads stale timestamps or a second group, user sees two geometries. | `_applyLiveDrawingMovePixels` ~1172–1181 mutates `drawing.points`; body drag ~8507–8518 |
| **2** | **Leftover SVG `transform` not committed** before Shift move | `_commitStaleDrawingGroupTransform` ~4994–5002; called on custom handle start ~9710; verify whole-body drag start paths call it consistently |
| **3** | **Multichart live broadcast sends index-only points, deletes `timestampPoints`** — peer may render **old timestamp-anchored copy** while source shows moved index points until mouseup commit | `_broadcastLiveEditUpdate` ~3614–3619 |
| **4** | **`reuseGroup: true` live render** leaves stale subpaths if tool `render()` appends instead of replacing | `renderDrawing` live opts ~7267–7270 |

**Fix sketch:** ensure drag-start commits stale transform; optional gate to **suppress live cross-panel broadcast during Shift move** or include migrated timestamp preview; discriminator: single-panel Shift drag → one SVG group, no origin ghost.

---

### 7.4 TAL-01651 — Cross-layout Shift misalignment

| Rank | Root cause | Evidence |
|------|------------|----------|
| **1** | **Live edit sync uses bar-index coordinates without `timestampPoints`** across panels on **different TFs** | `_broadcastLiveEditUpdate` ~3614–3619; `_isCrossPanelDrawingSyncEnabled` ~3274–3287 |
| **2** | **Peer `receiveDrawingChange` re-migration** may map index → timestamp differently per TF (A7b R1 / RC-4 class) | Same class as volume-profile cross-layout leak |
| **3** | Shift angle snap in **pixel space on source** converts to index; peer Y/X scale differs → visible level drift | `constrainToAngle` pixel path ~4797–4820 |

**Lane 5:** can improve live payload (include timestamp preview or defer sync until mouseup). **Full “same level across layouts”** with mixed TF likely needs **re-migration tranche** — flag Manager.

---

### 7.5 TAL-01652 — Locked tool blocks chart pan

| Rank | Root cause | Evidence |
|------|------------|----------|
| **1** | **Locked drawings keep interactive SVG hit targets** (`pointer-events` on stroke/fill) with `mousedown.locked-guard` that **restores points** but **does not forward pan** | ~8012–8043 |
| **2** | **`chart.js` SVG mousedown: `findDrawingAtPoint` → stopPropagation** when any drawing hit (including locked) — pan forward path (~33300–33312) never runs | ~33273–33278 |
| **3** | **`setupDrawingDrag` skipped when locked** (~7994–7998) — correct, but no pass-through substitute | ~7994–7998 |
| **4** | Canvas pan also blocked when click hits drawing manager hit-test before canvas | Drawing layer above canvas |

**Fix sketch (freeze-safe, manager-only):** for `drawing.locked`, set body hit areas to **`pointer-events: none`** (handles already detached) **or** locked-guard `mousedown` → synthesize canvas pan (mirror empty-SVG forward ~33305–33312). Optional chart-side: skip `findDrawingAtPoint` for locked — **frozen**.

---

### 7.6 TAL-01624 — Keyboard zoom wrong anchor

| Rank | Root cause | Evidence |
|------|------------|----------|
| **1** | **`zoomAtLastCandle` anchors `data.length - 1`**, not **rightmost visible bar** at plot edge | ~26037–26050 — comment says “newest candle”; tester wants **visible right edge** |
| **2** | **Semantic mismatch vs wheel** — wheel uses cursor X (~31687–31689); keyboard has no cursor → falls back to last data bar, wrong when user **panned left** | `handleWheel` vs `zoomAtLastCandle` |
| **3** | **`zoomAtCenter` fallback** when no data (~26021–26023) — wrong feel if ever hit | edge case |
| **4** | Multichart iframe may route shortcuts to host chart vs focused iframe | verify NEEDS-LIVE; wiring is `keyboard-shortcuts.js` ~682–700 → `chart.zoomAtLastCandle` |

**Correct anchor (spec inference):** use plot-right pixel → data index, e.g. `pixelToDataIndex(w - margin.r)` or `visibleEnd - 1` (~16772–16773), matching TradingView “zoom into what you’re viewing.”

**Territory:** **`chart.js` only** — Lane 5 **cannot land**; escalate Manager with repro recipe §4.1 Leg F.

---

## 8. Proposed gated fix scope (implementation follow-on — not this task)

| Gate (proposed) | Default | Leg | Touch surface |
|-----------------|---------|-----|---------------|
| `__TALARIA_DISABLE_BOX_SHIFT_SQUARE_PIXEL_FIX` | unset = ON | A / TAL-01593 | `drawing-tools-shapes.js`, `_constrainBoxPlacementPoint` |
| `__TALARIA_DISABLE_SHIFT_DRAG_STALE_TRANSFORM_FIX` | unset = ON | C | `drawing-tools-manager.js` drag start |
| `__TALARIA_DISABLE_SHIFT_LIVE_CROSSPANEL_SYNC_FIX` | unset = ON | C/D | defer or enrich `_broadcastLiveEditUpdate` during Shift drag |
| `__TALARIA_DISABLE_LOCKED_DRAWING_PAN_PASSTHROUGH_FIX` | unset = ON | E / TAL-01652 | `drawing-tools-manager.js` locked interaction |
| `__TALARIA_DISABLE_KEYBOARD_ZOOM_VISIBLE_RIGHT_EDGE_FIX` | unset = ON | F / TAL-01624 | **`chart.js`** — Manager lane |

### D-023 discriminators (to define at fix time)

| Fix | Suggested RED (switch ON) | GREEN | Switch-OFF |
|-----|---------------------------|-------|------------|
| Box Shift pixel square | Shift+corner horizontal drag → Y jumps to edge | Square stays near pointer | Reverts to today’s jump |
| Duplicate ghost | Shift+body drag → two copies visible | Single copy | Ghost returns |
| Locked pass-through | Drag on locked body → no pan | Chart pans | Pan blocked |
| Keyboard zoom | Pan left + `+` → viewport jumps | Right visible bar fixed | Last-data-bar anchor |

Harness: add targeted probes (pointer synth) or document manual PO steps until scenarios exist.

---

## 9. Ticket discharge map (when fixed)

| Ticket | Primary leg | Owner |
|--------|-------------|-------|
| TAL-01593 | A | Lane 5 |
| TAL-01654 | B (+ registry gap PO confirm) | Lane 5 |
| TAL-01655 | C | Lane 5 (multichart C3 may need bridge) |
| TAL-01651 | D | Lane 5 partial; Manager if re-migration required |
| TAL-01652 | E | Lane 5 |
| TAL-01624 | F | **Manager / chart.js** |

---

## 10. What I did NOT do / limits

- Did **not** run live browser repro on any leg.
- Did **not** add harness scenarios or product code.
- Did **not** bisect existing drawing sync switches.
- Did **not** confirm multichart keyboard routing for TAL-01624 (iframe focus).

**Next step:** Freeze-safe implementation spec (prep, HOLD until A6-4 gate): [`A8-FREEZE-SAFE-IMPL-SPEC.md`](../A8-FREEZE-SAFE-IMPL-SPEC.md) + dispatch [`worker-prompts/A8-freeze-safe-IMPL-lane5-HOLD.md`](../worker-prompts/A8-freeze-safe-IMPL-lane5-HOLD.md). Leg F (keyboard zoom) remains **Manager / chart.js**; land order A8-1 → A8-4 → A8-2 → A8-3.

---

## 11. Key code anchors (quick reference)

```508:510:chart v 1.4/chart/modules/drawing-tools-manager.js
        this.angleSnapTools = ['trendline', 'ray', 'arrow', 'extended-line', 'ruler', 'fibonacci-retracement', 'fibonacci-extension', 'polyline'];
        this.boxShiftSnapTools = ['rectangle', 'ellipse', 'gann-box'];
```

```308:341:chart v 1.4/chart/modules/drawing-tools-shapes.js
function squareConstrainedBoxPoint(role, start, dataPoint) {
    // ...
    const size = Math.max(Math.abs(dx), Math.abs(dy));  // dx=bars, dy=price — unit mismatch
    return { x: ax + (dx >= 0 ? size : -size), y: ay + (dy >= 0 ? size : -size) };
}
```

```8012:8043:chart v 1.4/chart/modules/drawing-tools-manager.js
        if (drawing.locked) {
            // mousedown.locked-guard restores points on move — no pan forward
        }
```

```26037:26050:chart v 1.4/chart/chart.js
        const anchorIndex = this.data.length - 1;
        const oldAnchorX = this.margin.l + anchorIndex * oldSpacing + this.offsetX;
        // ...
        this.offsetX = oldAnchorX - (this.margin.l + anchorIndex * newSpacing);
```

```31687:31689:chart v 1.4/chart/chart.js
                const anchorIndex = (mx - m.l - this.offsetX) / oldCandleSpacing;
                const oldAnchorX = m.l + anchorIndex * oldCandleSpacing + this.offsetX;
```

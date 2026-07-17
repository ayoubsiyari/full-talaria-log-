# A8 — Freeze-safe modifier-drag + locked pass-through implementation spec

**Authority:** A8 track (Lane 5 queue item #2), intake amendment `DAILY-INTAKE.md` / `TRACKS.md`.  
**Status:** **PREP ONLY** — no product edits in this deliverable. Turnkey for the worker who lands after the **A6-4 ship-gate clears** (D-030 item 4 / PO live-confirm on host-canonical order store).  
**RC:** RC-3 drawing-interaction (modifier drag, live-edit sync, locked gesture)  
**Diagnostic input:** `worker-reports/A8-modifier-drag-locked-zoom-diagnostic-report.md`

**Tickets in this spec (freeze-safe legs only):**

| Ticket | Leg | In spec? |
|--------|-----|----------|
| TAL-01593 | A8-1 box Shift square | **YES** |
| TAL-01654 | Line Shift family | **PARTIAL** — existing tools only; registry gap PO-gated (§A8-5) |
| TAL-01655 | A8-2 stale transform / ghost | **YES** |
| TAL-01651 | A8-3 cross-panel live sync | **PARTIAL** — freeze-safe payload fix; full TF parity may still need re-migration |
| TAL-01652 | A8-4 locked pan pass-through | **YES** |
| TAL-01624 | Keyboard zoom anchor | **NO** — `chart.js` only; **Manager escalation** (§0) |

---

## 0. Fence — gate, forbidden surfaces, bless interaction

| Rule | Detail |
|------|--------|
| **Landing gate** | Do **not** land product code until **A6-4 ship-gate** clears (full gate + D-026 proof row per `worker-prompts/A6-4-shipgate-fullgate-D026-rerun-lane4.md`). This spec is **queued behind** that gate — not a bless blocker itself. |
| **Forbidden edits** | **`chart.js`**, **`replay-system.js`**, `MultichartGrid.jsx`, `TalariaV8bLive.jsx`, `panel-cmd-bridge.js`, sync bridge / re-migration surfaces. |
| **Allowed edits** | `drawing-tools-manager.js`, `drawing-tools-shapes.js`, `drawing-tools-base.js`, `drawing-tools-channels.js` (if A8-5 PO-approved), other drawing tool modules **only if** a hunk requires it. |
| **I8** | Both trees byte-identical: `chart v 1.4/chart/modules/**` ↔ `homepage/public/chart/modules/**`. |
| **Build stamp** | **No `chart.js` edits** (including `CHART_ENGINE_BUILD` bump). Rebuild dist via existing pipeline only if it does not require a core stamp; FIX report cites **module paths + commit** for PO verification. |
| **Bless** | Land as **file-scoped PR(s)** after A6-4 gate; does **not** block or replace combined-build bless. One tranche per PR recommended (§6). |
| **Out of scope** | TAL-01624 keyboard zoom (`zoomAtLastCandle` in `chart.js` ~26020–26050) — separate Manager spec; cite diagnostic §7.6. |

**Interim tester workarounds (unchanged until land):**

- TAL-01593: avoid Shift on box corners; resize without Shift.
- TAL-01652: pan on empty chart area, not on locked shape body.
- TAL-01651: disable drawing sync or use same TF on all tiles.

---

## 1. Problem summary (from diagnostic)

| Symptom | Static root | Freeze-safe cure |
|---------|-------------|------------------|
| Box jumps to top/bottom on Shift+corner | `squareConstrainedBoxPoint` uses `max(|Δx_bars|, |Δy_price|)` | Pixel-space square, invert to data |
| Duplicate at origin on Shift+drag | Body d3 drag start skips `_commitStaleDrawingGroupTransform`; live broadcast drops `timestampPoints` | Commit transform on body-drag start; enrich or defer live sync |
| Cross-layout Shift misalignment | `_broadcastLiveEditUpdate` deletes `timestampPoints` on live move | Attach refreshed timestamp preview to payload |
| Locked shape blocks pan | Locked SVG hit targets + `locked-guard`; no pass-through | `pointer-events: none` on locked body hits (manager-only) |

---

## 2. Switch convention (I3 + I13)

**Pattern:** `window.__TALARIA_DISABLE_<NAME>` — **`unset` = fix ON**; **`= true` = revert** to pre-fix behavior.

| Switch | Tranche | Default |
|--------|---------|---------|
| `__TALARIA_DISABLE_A8_BOX_SHIFT_SQUARE_PIXEL_FIX` | A8-1 | unset = ON |
| `__TALARIA_DISABLE_A8_SHIFT_DRAG_STALE_TRANSFORM_FIX` | A8-2 | unset = ON |
| `__TALARIA_DISABLE_A8_SHIFT_LIVE_CROSSPANEL_SYNC_FIX` | A8-3 | unset = ON |
| `__TALARIA_DISABLE_A8_LOCKED_DRAWING_PAN_PASSTHROUGH_FIX` | A8-4 | unset = ON |
| `__TALARIA_DISABLE_A8_PARALLEL_REGRESSION_SHIFT_SNAP_FIX` | A8-5 (optional) | unset = ON |

**Enable helpers** (add near other `_is*FixEnabled` in `drawing-tools-base.js`, mirror pattern ~705–734):

```javascript
function _isA8BoxShiftSquarePixelFixEnabled() {
    return typeof window === 'undefined'
        || window.__TALARIA_DISABLE_A8_BOX_SHIFT_SQUARE_PIXEL_FIX !== true;
}
// … one helper per switch
```

**I13 proof:** FIX report must show each switch `= true` restores pre-fix behavior on that leg’s RED recipe (§5).

**Harness CLI hooks (Lane 4 registers when implementing):**

| CLI flag | Switch |
|----------|--------|
| `--a8-box-shift-off` | `__TALARIA_DISABLE_A8_BOX_SHIFT_SQUARE_PIXEL_FIX` |
| `--a8-stale-transform-off` | `__TALARIA_DISABLE_A8_SHIFT_DRAG_STALE_TRANSFORM_FIX` |
| `--a8-live-sync-off` | `__TALARIA_DISABLE_A8_SHIFT_LIVE_CROSSPANEL_SYNC_FIX` |
| `--a8-locked-pan-off` | `__TALARIA_DISABLE_A8_LOCKED_DRAWING_PAN_PASSTHROUGH_FIX` |

---

## 3. Product hunks (causal)

### A8-1 — Box Shift square in pixel space (TAL-01593)

**Root:** `squareConstrainedBoxPoint` and `_constrainBoxPlacementPoint` compare bar-index Δx with price Δy (`drawing-tools-shapes.js` ~308–341; `drawing-tools-manager.js` ~4904–4916).

**Hunk A8-1a — shared helper (`drawing-tools-shapes.js` or `drawing-tools-base.js`)**

Add `squareConstrainedBoxPointPixel(role, startBounds, dataPoint, chart)`:

1. Resolve anchor corner `(ax, ay)` in **data** from `role` + `startBounds` (reuse existing switch on `role`).
2. Convert anchor + pointer to **layout pixels**:
   - `axPx = chart.dataIndexToPixel(ax)` (fallback `xScale(ax)`)
   - `ayPx = chart.yScale(ay)`
   - same for `dataPoint`
3. `dxPx`, `dyPx` → `sizePx = max(|dxPx|, |dyPx|)`; snap corner in pixel space.
4. Invert: `x = chart.pixelToDataIndex(sxPx)`, `y = chart.yScale.invert(syPx)`.
5. Return `{ x, y }` with finite guards; on missing chart/scales, **fall back** to legacy `squareConstrainedBoxPoint` (switch OFF path only).

**Hunk A8-1b — call sites (gate with `_isA8BoxShiftSquarePixelFixEnabled()`)**

| Location | Change |
|----------|--------|
| `drawing-tools-shapes.js` `RectangleTool.handleCustomHandleDrag` ~939–940 | When Shift + fix ON: `squareConstrainedBoxPointPixel(..., this.chart \|\| context.chart)` |
| `drawing-tools-shapes.js` `EllipseTool.handleCustomHandleDrag` ~1238–1239 | Same |
| `drawing-tools-manager.js` `_constrainBoxPlacementPoint` ~4904–4916 | When fix ON: pixel helper using `this.chart` |
| `gann-box` | Same corner path if it shares box handle drag (verify registry `boxShiftSnapTools`) |

**Do NOT:** change `constrainToAngle` (line tools already pixel-aware ~4763–4820).

---

### A8-2 — Commit stale transform on body-drag start (TAL-01655, single-panel leg)

**Root:** `startDrag` calls `_commitStaleDrawingGroupTransform` (~9880); **d3 body drag** `.on('start')` (~8395+) does **not** — leaves visual transform while `drawing.points` mutate in `_applyLiveDrawingMovePixels` (~1172–1181).

**Hunk A8-2a — body drag start**

In `setupDrawingDrag` → d3 `.on('start')` (~8395), immediately after `_commitInlineTextEditorBeforeGeometryEdit()` and **before** storing `dragStartPoints`:

```javascript
if (_isA8ShiftDragStaleTransformFixEnabled()) {
    self._commitStaleDrawingGroupTransform(drawing);
}
```

Apply same for **multi-select** body drag: commit for each item in `selectedDrawings` when multi path arms (~8441+).

**Hunk A8-2b — direct canvas move path (defense)**

In `_applyDirectMoveFromPointerEvent` entry (~1185), if fix ON and `_directMoveStartStates` present, commit stale transform on each affected drawing once at pointer-down setup (locate `_directMoveStartScreen` arm — add commit there if missing).

**Hunk A8-2c — optional live-render hardening (load-bearing only if A8-2a RED persists)**

During Shift+whole-body drag when fix ON, pass `reuseGroup: false` into `scheduleRenderDrawing` / live `renderDrawing` opts to prevent stacked geometry. **Report must prove 2a alone is sufficient** before relying on 2c (D-029 §3.4 discipline).

---

### A8-3 — Live cross-panel sync carries timestamp preview (TAL-01651 partial, TAL-01655 multichart)

**Root:** `_broadcastLiveEditUpdate` ~3614–3619 sets `coordinateSystem: 'index'` and **`delete payload.timestampPoints`** on `pointsOverride`.

**Hunk A8-3a — enrich live payload when fix ON**

In `_broadcastLiveEditUpdate`, when `_isA8ShiftLiveCrosspanelSyncFixEnabled()` && `Array.isArray(pointsOverride)`:

1. Build `payload.points` from override (unchanged).
2. If `CoordinateUtils.pointsToTimestamps` available and `this.chart.data` loaded:
   - `previewTs = CoordinateUtils.pointsToTimestamps(pointsOverride, chart.data, chart.currentTimeframe)`
   - If `previewTs.length === pointsOverride.length`: set `payload.timestampPoints = previewTs`, `payload.coordinateSystem = 'timestamp'`.
3. **Else** (freehand / failure): fall back to current behavior (index-only) — document in FIX report.

**Hunk A8-3b — defer broadcast during Shift drag (alternative if 3a insufficient)**

If PO multichart RED persists after 3a: when fix ON && `event.shiftKey` && `_isDrawingGeometryMoveActive()`, skip `_broadcastLiveEditUpdate` until `endDrag` / body drag `end` (mouseup commit already calls `_refreshDrawingTimestampAnchors` ~9949). **Mutually exclusive with 3a in same PR** unless report proves both needed — prefer **3a first**.

**Limit:** Mixed-TF “same level” may still fail if peer `receiveDrawingChange` re-migration is wrong (A7b R1 / RC-4). Freeze-safe tranche **discharges index/timestamp split on wire**; full parity **escalate Manager** if 3a GREEN on same-TF but RED on mixed-TF.

---

### A8-4 — Locked drawing pan pass-through (TAL-01652)

**Root:** Locked shapes keep stroke hit targets + `mousedown.locked-guard` (~8012–8043); chart pan never starts.

**Hunk A8-4a — pointer pass-through (preferred, manager-only)**

Add `_applyLockedDrawingPanPassthrough(drawing)`:

- When `_isA8LockedDrawingPanPassthroughFixEnabled()` && `drawing.locked` && `drawing.group`:
  - `drawing.group.style('pointer-events', 'none')` (whole group)
  - Ensure resize handles stay detached (already ~8004–8006)
- When unlocked: restore `pointer-events` to tool defaults in `setupDrawingInteraction` / after `renderDrawing`.

**Hunk A8-4b — remove counterproductive guard**

When fix ON && locked: **do not attach** `mousedown.locked-guard` (~8015–8043); or attach no-op. Guard was for stale d3 move previews — pass-through makes it unnecessary.

**Hunk A8-4c — lock toggle**

On lock/unlock (`_broadcastDrawingStateSync` / context menu lock): re-run `_applyLockedDrawingPanPassthrough` or full `setupDrawingInteraction`.

**Do NOT:** edit `chart.js` `findDrawingAtPoint` (~35259) — frozen. Manager-only path must work via SVG pass-through to canvas forward (~33300–33312).

**Acceptance:** Mousedown on locked body + drag → chart `drag.type === 'pan'` (verify in PO or harness evaluate `window.chart.drag`).

---

### A8-5 — Parallel channel / regression Shift snap (TAL-01654 gap) — **PO-GATED, optional third PR**

**Precondition:** NEEDS-LIVE confirms tester report applies to **move/resize with Shift**, not just placement.

If confirmed:

- Add `parallel-channel` and `regression-trend` to `angleSnapTools` (~508) **or** dedicated perpendicular snap for channel baseline on Shift+move.
- Switch: `__TALARIA_DISABLE_A8_PARALLEL_REGRESSION_SHIFT_SNAP_FIX`
- **Do not bundle** with A8-1 unless PO confirms shared regression.

---

## 4. RED-first proof bar (binding — D-023)

Execute on **pre-fix build** (current HEAD after A6-4 lands) **before** merging each tranche. Record evidence files under `chart v 1.4/chart/multichart-prod/harness/` or FIX report.

| Leg | RED-first (fix OFF or pre-fix) | GREEN (fix ON) | Switch-OFF discriminator |
|-----|----------------------------------|----------------|---------------------------|
| **A8-1** | Shift + rectangle corner, mostly horizontal drag → `\|Δy_price\|` > 50% of visible Y domain or box hits plot edge | Square stays under pointer; `\|Δy\|` bounded | `__TALARIA_DISABLE_A8_BOX_SHIFT_SQUARE_PIXEL_FIX = true` → RED returns |
| **A8-2** | Shift + trendline body drag → 2 visible polylines/groups OR origin ghost persists mid-drag | Single geometry throughout drag | stale-transform switch OFF → ghost returns |
| **A8-3** | Multichart 2×2, sync ON, mixed TF: Shift+move on A → peer B start bar differs > 1 bar equivalent | Peers track within 1 bar + price tolerance | live-sync switch OFF → misalignment returns |
| **A8-4** | Locked rectangle body drag → `offsetX` unchanged | `offsetX` changes ≥ 1 candle spacing | locked-pan switch OFF → pan blocked |

**Vacuous RED forbidden:** Each discriminator must fail on **≥8/10** manual or harness runs on pre-fix build (same bar as D-023).

### 4.1 Harness prep (Lane 4 — register in parallel, land before or with tranche)

**Full wire-up spec:** [`A8-RED-HARNESS-SPECS.md`](A8-RED-HARNESS-SPECS.md) — topology, I15 actuation, end-state probes, switch-OFF legs, and `scenarios.mjs` skeletons for **H-A8-1 … H-A8-4**.

| Scenario ID | Leg | Summary |
|-------------|-----|---------|
| `H-A8-1` | A8-1 | 1-panel; Shift + corner handle drag; Y-domain jump probe |
| `H-A8-2` | A8-2 | 1-panel; Shift + body drag; mid-drag ghost probe |
| `H-A8-3` | A8-3 | 2-panel sync ON; A 1m / B 5m; timestamp anchor parity |
| `H-A8-4` | A8-4 | 1-panel; locked body drag; `offsetX` pan probe |

**Primary acceptance remains I15 real pointer** until harness rows are non-vacuous. Register in `known-failing.json` when RED confirmed on pre-fix build.

---

## 5. PO manual recipes (copy from diagnostic §4.1)

Use **`worker-reports/A8-modifier-drag-locked-zoom-diagnostic-report.md` §4.1** Legs A–E verbatim for PO. Leg F (keyboard zoom) → Manager, not this land.

**Quick bisect console (PO):**

```javascript
// OFF one leg at a time (hard reload after each)
window.__TALARIA_DISABLE_A8_BOX_SHIFT_SQUARE_PIXEL_FIX = true;
window.__TALARIA_DISABLE_A8_SHIFT_DRAG_STALE_TRANSFORM_FIX = true;
window.__TALARIA_DISABLE_A8_SHIFT_LIVE_CROSSPANEL_SYNC_FIX = true;
window.__TALARIA_DISABLE_A8_LOCKED_DRAWING_PAN_PASSTHROUGH_FIX = true;
```

---

## 6. Landing sequence (after A6-4 gate)

```mermaid
sequenceDiagram
  participant Gate as A6-4 ship-gate
  participant L5 as Lane 5 A8 worker
  participant L4 as Lane 4 harness
  participant PO as PO retest

  Gate->>Gate: D-026 + full gate GREEN
  L4->>L4: Register H-A8-* ; capture RED on pre-fix
  L5->>L5: PR1 A8-1 (box pixel)
  L5->>PO: NEEDS-LIVE Leg A
  L5->>L5: PR2 A8-4 (locked pan)
  L5->>L5: PR3 A8-2 (stale transform)
  L5->>L5: PR4 A8-3 (live sync) if multichart RED confirmed
  L5->>L5: PR5 A8-5 optional PO-gated
  PO->>PO: STAGED ticket rows
```

| Order | PR | Rationale |
|-------|-----|-----------|
| 1 | **A8-1** | Isolated math; highest confidence; no sync |
| 2 | **A8-4** | Isolated interaction; no Shift dependency |
| 3 | **A8-2** | Single-panel ghost; enables clean A8-3 signal |
| 4 | **A8-3** | Multichart; depends on drawing sync bridge (read-only) |
| 5 | **A8-5** | Only if PO confirms registry gap |

**Does not wait for:** TAL-01624 / chart.js batch, A7b R2 margin clamp, full RC-4 re-migration.

---

## 7. Ticket discharge map

| Ticket | Tranche | Closure level |
|--------|---------|---------------|
| TAL-01593 | A8-1 | **STAGED** on A8-1 GREEN + switch-OFF RED |
| TAL-01652 | A8-4 | **STAGED** on A8-4 GREEN |
| TAL-01655 | A8-2 (+ A8-3 if multichart ghost) | **PARTIAL** until PO confirms multichart |
| TAL-01651 | A8-3 | **PARTIAL** — same-TF + sync ON; mixed-TF may need Manager |
| TAL-01654 | A8-5 optional | **OPEN** until PO gates A8-5 |
| TAL-01624 | — | **Manager** — out of fence |

---

## 8. Worker deliverables

| Artifact | Path |
|----------|------|
| Dispatch prompt (HOLD until gate) | `worker-prompts/A8-freeze-safe-IMPL-lane5-HOLD.md` |
| Harness RED specs (Lane 4) | `A8-RED-HARNESS-SPECS.md` |
| FIX report (mandatory per tranche) | `worker-reports/A8-<tranche>-FIX-report.md` |
| Diagnostic (reference) | `worker-reports/A8-modifier-drag-locked-zoom-diagnostic-report.md` |

**FIX report must include:** hunks with line refs (both I8 trees), switch names, RED-first evidence, GREEN + switch-OFF, tickets STAGED, NEEDS-LIVE list, explicit **no chart.js / replay-system diff**.

---

## 9. Escalation — TAL-01624 (not in this land)

Hand to Manager as **`A8-F-keyboard-zoom-anchor-ESCALATION.md`** (optional one-pager) or row in `MANAGER-ESCALATIONS.md`:

- **Cure:** `zoomAtLastCandle` anchor = visible plot-right index (`pixelToDataIndex(w - margin.r)`), not `data.length - 1` (~26037–26050).
- **Switch (Manager):** `__TALARIA_DISABLE_KEYBOARD_ZOOM_VISIBLE_RIGHT_EDGE_FIX`
- **Fence:** `chart.js` post-unfreeze batch; Lane 5 **must not** patch.

---

## 10. References

- `worker-reports/A8-modifier-drag-locked-zoom-diagnostic-report.md`
- `D029-R2-AXIS-MARGIN-CLAMP-IMPL-SPEC.md` — spec template / RED-first / harness pattern
- `worker-reports/A7b-tranche1-R3-R4a-IMPL-report.md` — Lane 5 kill-switch report shape
- `worker-reports/A6-4-HOST-CANONICAL-ORDER-STORE-IMPL-report.md` — A6-4 gate context
- `DIRECTOR-DECISIONS.md` — D-023 discriminators

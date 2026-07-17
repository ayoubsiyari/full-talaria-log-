# Lane 5 — A8 freeze-safe implementation (HOLD until A6-4 gate clears)

**Status:** **HOLD** — do not land until A6-4 ship-gate clears (full gate + D-026 proof row + Manager PO go on host-canonical order store).  
**Spec of record:** `docs/tickets-overhaul/A8-FREEZE-SAFE-IMPL-SPEC.md`  
**Harness (Lane 4):** `docs/tickets-overhaul/A8-RED-HARNESS-SPECS.md` — H-A8-1…4 RED-first wire-up  
**Diagnostic:** `docs/tickets-overhaul/worker-reports/A8-modifier-drag-locked-zoom-diagnostic-report.md`

---

## When unblocked

1. Confirm A6-4 gate GREEN (`worker-reports/A6-4-shipgate-fullgate-D026-rerun-report.md` or Manager all-clear).
2. Capture **RED-first** evidence per spec §4 on **pre-fix** build (manual PO or Lane 4 `H-A8-*` if ready).
3. Land tranches **in order** (separate PRs recommended): **A8-1 → A8-4 → A8-2 → A8-3 → A8-5 (optional)**.
4. One kill-switch per tranche (spec §2). Each switch OFF → honest RED on that leg (D-023).

---

## Implement (freeze-safe only)

### A8-1 — Box Shift square pixel space (TAL-01593)

- Switch: `window.__TALARIA_DISABLE_A8_BOX_SHIFT_SQUARE_PIXEL_FIX` (unset = ON).
- Add `squareConstrainedBoxPointPixel` + gate call sites in `drawing-tools-shapes.js` (rectangle, ellipse, gann-box corners) and `drawing-tools-manager.js` `_constrainBoxPlacementPoint`.
- Mirror `constrainToAngle` pixel pattern (~4763–4820).

### A8-4 — Locked drawing pan pass-through (TAL-01652)

- Switch: `window.__TALARIA_DISABLE_A8_LOCKED_DRAWING_PAN_PASSTHROUGH_FIX` (unset = ON).
- Locked body: `pointer-events: none`; remove/no-op `mousedown.locked-guard` (~8012–8043).
- Re-apply on lock toggle + `setupDrawingInteraction`.

### A8-2 — Stale transform on body-drag start (TAL-01655 single-panel)

- Switch: `window.__TALARIA_DISABLE_A8_SHIFT_DRAG_STALE_TRANSFORM_FIX` (unset = ON).
- Call `_commitStaleDrawingGroupTransform(drawing)` in d3 body drag `.on('start')` (~8395) — same as `startDrag` (~9880).
- Optional `reuseGroup: false` during Shift drag **only if** 2a alone fails RED (document in report).

### A8-3 — Live cross-panel timestamp preview (TAL-01651 partial)

- Switch: `window.__TALARIA_DISABLE_A8_SHIFT_LIVE_CROSSPANEL_SYNC_FIX` (unset = ON).
- `_broadcastLiveEditUpdate`: when `pointsOverride`, attach `timestampPoints` from `CoordinateUtils.pointsToTimestamps` instead of deleting (~3614–3619).
- If insufficient: defer broadcast until mouseup (spec §A8-3b) — separate commit, prove 3a first.

### A8-5 — Parallel channel / regression Shift (TAL-01654 gap) — **PO-GATED**

- Only if NEEDS-LIVE confirms Shift+move bug on those tools.
- Switch: `window.__TALARIA_DISABLE_A8_PARALLEL_REGRESSION_SHIFT_SNAP_FIX`.
- Extend `angleSnapTools` or add channel-specific snap.

---

## Rules (binding)

- **NO** `chart.js`, **NO** `replay-system.js`, **NO** `MultichartGrid.jsx`, **NO** `TalariaV8bLive.jsx`, **NO** `panel-cmd-bridge.js`.
- Both I8 module trees byte-identical.
- **No `CHART_ENGINE_BUILD` bump** (no chart.js touch).
- **TAL-01624 keyboard zoom** — do **not** implement; escalate Manager (spec §9).
- **Never create a bless blocker** — if a hunk needs a frozen surface, STOP that hunk and hand back.
- File-scoped commits; FIX report per tranche.

---

## Deliverables

| Tranche | Report |
|---------|--------|
| A8-1 | `worker-reports/A8-1-box-shift-pixel-FIX-report.md` |
| A8-4 | `worker-reports/A8-4-locked-pan-passthrough-FIX-report.md` |
| A8-2 | `worker-reports/A8-2-stale-transform-FIX-report.md` |
| A8-3 | `worker-reports/A8-3-live-crosspanel-sync-FIX-report.md` |
| A8-5 | `worker-reports/A8-5-channel-shift-FIX-report.md` (if run) |

Each report: hunks + line refs, RED-first, GREEN, switch-OFF RED, tickets STAGED, NEEDS-LIVE, commits.

---

## Proof checklist (per tranche)

- [ ] RED captured on pre-fix build (spec §4 table or `H-A8-*` harness)
- [ ] Fix ON → GREEN (PO or harness)
- [ ] Switch OFF → RED returns (I13)
- [ ] No diff in forbidden files
- [ ] I8 mirror verified

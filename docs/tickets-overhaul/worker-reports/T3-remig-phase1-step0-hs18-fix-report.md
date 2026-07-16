# T3 Re-migration Phase 1 — Step 0 H-S18 redraw-loop fix

**Task:** STEP 0 (blocking) — fix H-S18 `Maximum call stack size exceeded` before Phase 1 engine substrate.  
**Date:** 2026-07-16  
**RC:** RC-2 local invalidation V2 (T2 step 4) × replay synchronous render — not RC-3 label/fractional anchoring.

**Stopped after Step 0** — Phase 1 predicate flip not started (hand back for go after Lane 4 re-gate).

---

## 1. Task + RC

| Field | Value |
|-------|-------|
| Task id | T3 remig Phase 1 Step 0 — H-S18 fix |
| Goal | Break infinite `render → redrawAll → scheduleRender → render` loop poisoning manager gate |
| RC | **RC-2 adjacency** — `_invalidateAfterLocalDrawingMutation` at end of `redrawAll` (T2 step 4 local invalidation V2) |

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | (1) Move `_isRendering` restore to after invalidate block in `redrawAll`. (2) In `_invalidateAfterLocalDrawingMutation`, skip `scheduleRender` when `replaySystem.isPlaying` or `inertia.active` — same synchronous-render conditions as `chart.scheduleRender()`. |
| `homepage/public/chart/modules/drawing-tools-manager.js` | Byte-identical mirror (I8). |

**SHA256 (both trees):** `4DEA0D380CA1BF96E2331E8E4696D50CF8AFFD68E7F0115EE038A009B3BE6603`

No other files touched.

---

## 3. Kill-switch (I3 + I13)

Uses existing switch — no new flag:

| Switch | Default | Role |
|--------|---------|------|
| `__TALARIA_DISABLE_DRAWING_LOCAL_INVALIDATION_V2` | unset = V2 **ON** | When ON, standalone `redrawAll` still schedules async repaint; during replay PLAY the new guard suppresses the redundant synchronous re-entry |

Switch OFF fully reverts to pre-V2 behavior (no invalidate from `redrawAll`).

---

## 4. Proof — RED → GREEN

### Root cause (recursion cycle)

```
chart.render()
  → redrawDrawings() → drawingManager.redrawAll()
    → _invalidateAfterLocalDrawingMutation('redrawAll')   // T2 step 4
      → chart.scheduleRender()
        → [replay PLAY] render() synchronously   // chart.js:25882-25884
          → redrawAll() → … infinite stack
```

RC-3 Phases 4/6 were **not** in the cycle; the regression correlates with **T2 step 4** wiring invalidate at `redrawAll` tail (present in `ce3b28d2` manager bundle).

### Commands + evidence

```bash
# H-S18 isolated (was hang / stack overflow at step 17)
npm run test -- --only=H-S18 --runs=1
FINAL H-S18 PASS   # ~44s

# In-session cascade check (same browser after H-S17)
npm run test -- --only=H-S17,H-S18,H-S19,H-S40,H-S41 --runs=1
FINAL H-S18 PASS
FINAL H-S19 PASS   # no session poison
FINAL H-S40 PASS
FINAL H-S41 PASS
# H-S17 FAIL-REAL-BUG (tracked coarse-TF forming candle — pre-existing)

# T2 local invalidation still honest
node t2-step4-local-invalidation-proof.mjs
RED before=11 after=11 bumped=false
GREEN before=11 after=12 bumped=true
FINAL T2-step4-local-invalidation PASS
```

**Determinism:** H-S18 ×1 clean completion; prior step-17 run hung 7+ min / stack overflow.

**Manager full gate:** not re-run here (Lane 4 `T3-remig-phase0-freeze-plus-regate.md` Task 2).

---

## 5. Invariants checked

| Invariant | How |
|-----------|-----|
| I3 | Existing `__TALARIA_DISABLE_DRAWING_LOCAL_INVALIDATION_V2` gates behavior |
| I8/I9 | Both `drawing-tools-manager.js` trees SHA256-identical |
| I13 | Single-file engine change; no React |
| I15 | H-S18 uses real PLAY fan-out + offsetX end-state (unchanged scenario) |
| RC-3 behavior | No anchoring/label code touched |

---

## 6. What I did NOT do / limits

- **Phase 1 not implemented** — master slice / iframe predicate flip deferred.
- Did not edit `known-failing.json`, `scenarios.mjs`, or `chart.js`.
- Did not run full manager `gate` (~65 min); Lane 4 to confirm 0 cascade regressions.
- **Regression registration:** H-S18 stack-overflow is **RC-2-adjacent** (local invalidation V2 × replay sync render), introduced when `redrawAll` tail invalidate landed (~`ce3b28d2` manager path). Lane 4 may add registry note if desired — not edited here.

---

## 7. Live-verification handoff

PO: no specific live check for this fix — harness H-S18 (BL-11 play-viewport follow) is the acceptance surface. Confirm on next staging build after Manager bump.

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

Step 0 complete. **Phase 1 cleared to start after Lane 4 re-gate confirms clean manager gate.**

---

## Handoff

| Lane | Action |
|------|--------|
| **Lane 4** | Re-run full manager `gate` post-commit; confirm ~40 cascade false regressions cleared |
| **Lane 1 (next)** | `T3-remig-phase1-lane1-PREP-report.md` implementation on go |

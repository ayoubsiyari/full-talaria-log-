# A7b P0 — Anchored Volume Profile freeze + axis crush (Lane 5)

**Task:** `docs/tickets-overhaul/worker-prompts/A7b-P0-anchored-VP-freeze-URGENT-lane5.md`  
**Status:** P0 freeze **fixed** (drawing modules). Axis crush (R2) **escalated** — `chart.js` frozen.  
**Build id:** `20260717b15`  
**Worktree:** uncommitted at report time (base `cf9b60b24`)

---

## 1. Bisect verdict

| Class | Verdict | Evidence |
|-------|---------|----------|
| **Hard freeze (P0)** | **Regression — RC-3 anchoring (ce3b28d2 family)** | Harness probe with 50k bars + RC-3 ON → `RangeError: Maximum call stack size exceeded` at `resolveDrawingPoints` ↔ `resolveAnchoredVolumeProfileRange` (see §4). |
| **H-S18 redraw guard (6dc552a8)** | **Not the freeze root** | Commit only bumped `CHART_ENGINE_BUILD`; H-S18 guard lives in `drawing-tools-manager.js:_invalidateAfterLocalDrawingMutation` (replay-play skip). Disabling `__TALARIA_DISABLE_DRAWING_LOCAL_INVALIDATION_V2` does not reproduce stack overflow. |
| **Axis crush / scales vanish (R2)** | **Pre-existing + separate** | Probe post-fix: `margin.r` stays **55** on single-panel harness. Tester TAL-01665/01667 multichart crush still requires `chart.js _syncAdaptivePriceAxisMargin` floor — **Manager escalation** (dev clamp `PRICE_AXIS_MIN_R=60` in `chart-host.html` not in production). |

**Summary:** PO freeze is **both** — RC-3 introduced an infinite resolve loop (regression → stack overflow); R2 axis crush is a **parallel pre-existing** defect that Lane 5 cannot touch.

---

## 2. Freeze stack (captured)

Probe: `chart v 1.4/chart/multichart-prod/harness/a7b-p0-anchored-vp-freeze-probe.mjs --bars=50000` **before** base.js fix:

```
Error [RangeError]: Maximum call stack size exceeded
    at resolveDrawingPoints (drawing-tools-base.js)
    at resolveAnchoredVolumeProfileRange (drawing-tools-base.js)
    at resolveDrawingPoints (drawing-tools-base.js)
    … (infinite mutual recursion)
```

**Trigger path:** After placement, `addDrawing` sets `timestampPoints` → `_getVolumeRenderIndices` → `CoordinateUtils.resolveDrawingPoints` → (RC-3 clamp ON + type `anchored-volume-profile`) → `resolveAnchoredVolumeProfileRange` → **calls `resolveDrawingPoints` again** → loop until stack overflow.

**Hang class:** Synchronous stack overflow during first full render after anchor click — UI appears frozen; axes may also vanish as render never completes (R2 symptom overlap).

---

## 3. Kill-switch bisect

| Switch | Default | OFF effect on anchored VP |
|--------|---------|---------------------------|
| `__TALARIA_RC3_VOLUME_RENDER_RESOLVE` | ON (`!== false`) | Legacy index path; **avoids** resolve loop (does not restore timestamp anchoring) |
| `__TALARIA_RC3_CLAMP_POLICY` | ON | When OFF, `resolveDrawingPoints` skips `resolveAnchoredVolumeProfileRange` branch |
| `__TALARIA_DISABLE_DRAWING_LOCAL_INVALIDATION_V2` | ON (unset) | Does **not** fix stack overflow |
| `__TALARIA_DISABLE_DRAWING_INVALIDATION_DURING_RENDER_GUARD` | ON (unset) | Restores redundant `scheduleRender` after `redrawAll` tail (perf only) |
| `__TALARIA_DISABLE_ANCHORED_VP_BIN_CACHE_FIX` | ON (unset) | Full bin recompute on every anchored-VP proxy render (perf only) |

**Regression isolation:** Stack overflow requires RC-3 resolve + clamp path with `timestampPoints` after finalize — introduced in RC-3 Phase 1–6 landing (`ce3b28d2` / `drawing-tools-base.js`).

---

## 4. Fixes (freeze-safe, drawing modules only)

### 4.1 P0 — break resolve recursion (`drawing-tools-base.js`)

`resolveAnchoredVolumeProfileRange` now resolves the anchor via `pointsFromTimestamps` (or `drawing.points`) **without** re-entering `resolveDrawingPoints`.

```3413:3428:chart v 1.4/chart/modules/drawing-tools-base.js
        // Resolve anchor only — must NOT call resolveDrawingPoints (re-enters this helper for anchored VP).
        let anchorPts;
        if (drawing.timestampPoints && drawing.timestampPoints.length > 0) {
            anchorPts = CoordinateUtils.pointsFromTimestamps(
                drawing.timestampPoints,
                chart.data,
                chart.currentTimeframe,
                tsOpts
            );
        } else {
            anchorPts = drawing.points || [];
        }
```

**Switch-OFF honesty:** Setting `__TALARIA_RC3_VOLUME_RENDER_RESOLVE=false` or `__TALARIA_RC3_CLAMP_POLICY=false` bypasses the broken path (legacy behavior); no separate kill-switch on this one-line fix — recursion is never valid.

### 4.2 Render-storm guard (`drawing-tools-manager.js`)

Skip `_invalidateAfterLocalDrawingMutation` when `chart._isRendering` (redundant schedule after `redrawAll` inside `chart.render()`).

**Kill-switch:** `window.__TALARIA_DISABLE_DRAWING_INVALIDATION_DURING_RENDER_GUARD = true` → guard OFF → extra `scheduleRender` calls return.

### 4.3 Anchored VP bin memoization (`drawing-tools-advanced-volume.js`)

`AnchoredVolumeProfileTool._vpBinCache` + proxy host link — reuse bin arrays when anchor/end/dataVersion unchanged (mirrors `AnchoredVWAPTool._cache` pattern).

**Kill-switch:** `window.__TALARIA_DISABLE_ANCHORED_VP_BIN_CACHE_FIX = true` → full bin pass every proxy render.

---

## 5. Proof (harness)

### 5.1 Post-fix probe (50k bars, fixes ON)

```
placementMs: 35
scheduleRenderCount: 5
renderCount: 3
marginBefore.r / marginAfter.r: 55 / 55
hasAvp: true
binCachePresent: true
```

Command: `node a7b-p0-anchored-vp-freeze-probe.mjs --bars=50000`

### 5.2 H-S42 (RC-3 anchoring)

- **CORE** (timestamp+price survive TF switch): **PASS**
- Setup check `points.length === 1`: **FAIL** — RC-3 now persists resolved 2-point range in `drawing.points` (anchor + latest bar); assertion is stale, not a product regression.

Command: `node run.mjs --only=H-S42`

---

## 6. I8 + build

| Tree | Files touched |
|------|----------------|
| `chart v 1.4/chart/` | `modules/drawing-tools-base.js`, `modules/drawing-tools-advanced-volume.js`, `modules/drawing-tools-manager.js`, `chart.js` (build id) |
| `homepage/public/chart/` | Same modules + `chart.js` mirrored |
| Dist | `npm run build:chart-client` → `dist/chart-app-part*.min.js` |

**Build id:** `20260717b15` (`CHART_ENGINE_BUILD` in `chart.js`).

---

## 7. Manager escalation — R2 axis crush (NOT fixed here)

- **Symptom:** Price/time scales vanish on placement tile (TAL-01665/01666/01667).
- **Root:** `chart.js` `_syncAdaptivePriceAxisMargin` / `drawAxes` — no production floor on `margin.r`.
- **Proven dev mitigation:** `PRICE_AXIS_MIN_R = 60` clamp in `chart v 1.4/chart/multichart/chart-host.html:964-986` — **not ported** to production embed.
- **Lane 5 fence:** Do **not** edit `chart.js`. Request Manager pull-forward given P0 adjacency.

---

## 8. PO NEEDS-LIVE recovery + verification

1. Hard refresh (clear SW cache if needed) — confirm console shows `[Talaria chart engine] 20260717b15`.
2. Single chart: place **Anchored Volume Profile** — chart must stay responsive (<2s on typical history).
3. If scales vanish but chart responds: **R2** — remove drawing to recover; await `chart.js` margin fix.
4. If freeze returns: in devtools console set `__TALARIA_RC3_VOLUME_RENDER_RESOLVE = false` and retry — should avoid hang (legacy indices; documents RC-3 path).
5. Multichart 2×2 + drawing sync: repeat placement on panel A; peers must not inherit broken state (R1 cross-layout leak remains separate tranche).

---

## 9. R3/R4a tranche

**Dropped** per P0 supersede — pan-block and label bridges deferred until PO confirms freeze + R2 plan.

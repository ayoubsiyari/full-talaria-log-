# H-S42 — Anchored VP right-edge anchor drift on TF switch — FIX

**Prompt:** `docs/tickets-overhaul/worker-prompts/HS42-anchored-vp-drift-triage-fix.md`  
**Build id:** `20260717b16`  
**Verdict:** Deterministic regression (0/10 on b15) → **fixed**, H-S42 **10/10 PASS**

---

## 1. Isolation (Worker 4 baseline)

| Metric | Result |
|--------|--------|
| Runs | `--only=H-S42 --runs=10` on pre-fix b15 |
| Outcome | **0/10 PASS** (deterministic, not flake) |
| p0 (left anchor) | Stable across 1m→5m |
| p1 (right edge) | Drift e.g. `1784277420000 → 1784277300000` (120s / 2× 1m bucket) |
| p1 source | `barOpenFallback` — no `timestampPoints[1]` captured |

---

## 2. Root cause

**File:** `drawing-tools-base.js` — `resolveAnchoredVolumeProfileRange`

After RC-3 (`ce3b28d2`), the right edge was resolved from **`lastBar.t` at resolve time** instead of a persisted timestamp. On 1m→5m TF switch, the 5m series’ last bar open time differs from the captured 1m right-edge instant → p1 drift.

Secondary: `_syncDrawingPointsFromTimestamps` assigned the full 2-point resolved range into `drawing.points`, breaking H-S42 setup (`points.length === 1`).

---

## 3. Fix (freeze-safe, drawing modules)

**Switch:** `window.__TALARIA_DISABLE_ANCHORED_VP_RIGHT_EDGE_TIMESTAMP_FIX` — **unset = fix ON**

### 3.1 Capture right-edge timestamp (`CoordinateUtils.ensureAnchoredVolumeProfileRightEdgeTimestamp`)

- On placement (`addDrawing`) and before each timestamp re-resolve.
- Writes `timestampPoints[1] = { timestamp: lastBar.t, price: anchorPrice }`.
- Extends forward only when `lastBar.t > existing` (live “extend to latest bar” on same TF).
- Does **not** downgrade on TF switch (5m last open < captured 1m right ts).

### 3.2 Resolve right edge from captured timestamp

In `resolveAnchoredVolumeProfileRange`, when fix ON and `timestampPoints[1]` exists:

```javascript
rightX = CoordinateUtils.timestampToIndex(capturedRightTs, chart.data, chart.currentTimeframe, tsOpts);
```

Replaces `lastBar.t` path that caused drift.

### 3.3 Keep user anchor as single `drawing.points` entry

In `_syncDrawingPointsFromTimestamps`, for `anchored-volume-profile` only update `points[0]` from resolved anchor — do not expand to 2-point `drawing.points` array.

---

## 4. Files (both I8 trees)

| File | Change |
|------|--------|
| `modules/drawing-tools-base.js` | Switch + `ensureAnchoredVolumeProfileRightEdgeTimestamp` + right-edge resolve |
| `modules/drawing-tools-manager.js` | Capture on add; extend before sync; single-point `points` on TF refresh |
| `chart.js` | `CHART_ENGINE_BUILD = '20260717b16'` |

---

## 5. RED / GREEN (D-023)

| Switch OFF | Discriminator |
|------------|---------------|
| `__TALARIA_DISABLE_ANCHORED_VP_RIGHT_EDGE_TIMESTAMP_FIX = true` | H-S42 FAIL: p1 drifts / setup may show 2 `drawing.points`; right edge uses live `lastBar.t` |

**GREEN:** `node run.mjs --only=H-S42 --runs=10` → **10/10 PASS** on b16 (2026-07-17 session).

---

## 6. Re-gate result

```
FINAL H-S42 PASS (10/10 runs)
```

All sub-checks green: setup 1-point anchor, TF switch to 5m, CORE timestamp+price stable.

---

## 7. PO NEEDS-LIVE

1. Confirm engine `20260717b16`.
2. Place anchored VP on 1m; switch to 5m — profile span should not jump backward on the time axis.
3. Optional bisect: set `__TALARIA_DISABLE_ANCHORED_VP_RIGHT_EDGE_TIMESTAMP_FIX = true` → drift should return (RED).

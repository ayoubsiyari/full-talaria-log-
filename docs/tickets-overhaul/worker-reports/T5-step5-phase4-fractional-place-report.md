# T5 Step 5 — RC-3 Phase 4: fractional placement + magnet unification

## Phase 4 statement (from T5 step 1 diagnostic §12)

**Phase 4 — Placement fraction + magnet unification**

- **Target:** `CoordinateUtils.screenToData`, `drawing-tools-manager.js` `getDataPoint` / `snapPointXToNearestCandle` gating.
- **Change:** Default **fractional** bar index on placement; **magnet mode** explicitly rounds X to nearest bar; timestamp capture via `recalculateTimestamps` / `indexToTimestamp` preserves sub-candle wall-clock position across TF switches.
- **Kill-switch:** `window.__TALARIA_RC3_FRACTIONAL_PLACE` (default ON).
- **Registry discharge:** **TAL-00157#4** (click jumps to previous candle middle — D5/D6 placement round vs fractional); partial **TAL-00322#12/#13** (magnet vs sub-candle placement tradeoff documented).

---

## 1. Task + RC

- **Task:** T5 step 5 (Lane 1) — implement Phase 4 of the 6-phase RC-3 plan.
- **RC:** RC-3 — inconsistent anchoring / coordinate model (placement-time D5/D6).

---

## 2. What I changed — file by file

| Path | What / why |
|------|------------|
| `chart v 1.4/chart/modules/drawing-tools-base.js` | `_isRc3FractionalPlaceEnabled()` (~L733). **`CoordinateUtils.screenToData`:** when switch ON, keep fractional `pixelToDataIndex` result (not `Math.round`) for non-continuous tools (~L3040–3058). |
| `homepage/public/chart/modules/drawing-tools-base.js` | Byte-identical mirror (I8). |
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | `_isRc3FractionalPlaceEnabled()` (~L94). **`getDataPoint`:** skip `snapPointXToNearestCandle` when fractional ON and magnet OFF; magnet still forces bar snap (~L6085–6098). |
| `homepage/public/chart/modules/drawing-tools-manager.js` | Byte-identical mirror (I8). |
| `chart v 1.4/chart/multichart-prod/harness/t5-step5-fractional-place-proof.mjs` | Honest I15 probe: between-candle placement → `timestampPoints` stable across 1m→5m. |

**No other files touched.** Did not edit `chart.js`, harness scenario ids, or `known-failing.json`.

### chart.js line-region map (Lane 2 coordination)

| Region | Touched? |
|--------|----------|
| `pixelToDataIndex` (~L30150) | **Read-only** — already returns fractional index; Phase 4 consumes via `screenToData` |
| `_panelPlayFollowContinuousOffsetX` / replay tick | **Not touched** — Lane 2 T8 cadence territory |
| `_getVisibleCenterTimestamp` (floor) | **Not touched** — center vs placement policy deferred; placement path fixed |

---

## 3. Kill-switch (I3 + I13)

- **Switch:** `window.__TALARIA_RC3_FRACTIONAL_PLACE` (default ON, `!== false`).
- **Gated files:** `drawing-tools-base.js` `screenToData`; `drawing-tools-manager.js` `getDataPoint` bar-snap branch.
- **Switch OFF:** restores legacy `Math.round(rawX)` in `screenToData` + unconditional `snapPointXToNearestCandle` on geometric tools.

**Magnet (explicit round when ON):** `effectiveMagnetMode !== 'off'` still calls `snapPointXToNearestCandle` even when fractional fix enabled.

---

## 4. Proof — RED → GREEN

### Honest Phase-4 probe (I15)

```powershell
cd "chart v 1.4/chart/multichart-prod/harness"
node t5-step5-fractional-place-proof.mjs
```

**Actuation:** programmatic between-candle index `840.35` via `screenToData` + trendline `recalculateTimestamps` → host `setTimeframe('5m')` + `refreshDrawingsForTimeframe`.

**Measurement:** `drawing.timestampPoints[0].timestamp` (wall-clock), not `data[round(x)].t`.

| Mode | placedX | beforeT | barOpenT | subCandleOffset | tfStable | verdict |
|------|---------|---------|----------|-----------------|----------|---------|
| **RED** (OFF) | `840` (integer) | `1784065380000` | `1784065380000` | `0` | yes | bar-open snap only |
| **GREEN** (ON) | `840.35` | `1784065401000` | `1784065380000` | `21000ms` (~35% of 1m) | yes | fractional + TF-stable |

```text
FINAL T5-step5-fractional-place PASS
```

**Did not use H-S40/H-S41** (Lane 4 probe fix in flight).

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| I8 | SHA256 match both trees |
| I13 | Switch OFF/ON probed |
| I15 | Measured `timestampPoints` wall-clock |
| Freeze | Engine/drawing only; no chart.js replay edits |

---

## 6. What I did NOT do / limits

- Did not unify `_getVisibleCenterTimestamp` floor vs placement round (D6) — placement path only.
- Resize-handle `_snapPointXForDrawingType` still rounds when invoked (edit-time; out of Phase 4 scope).
- Full gate not re-run; standalone proof only.
- PO live magnet ON vs OFF delta not harness-proven (proposed H-S45 for Lane 4).

### Lane 4 known-failing row deltas

| Row | Disposition |
|-----|-------------|
| All current | **No change** — proof is standalone script |
| Future | Lane 4 may add **RC-3 H-S44** row using `timestampPoints` read (distinct from T1 H-S44 multichart select) |

---

## 7. Live-verification handoff

1. 1m chart → place trendline **between** two candle centers (not on bar open).
2. Note wall-clock position → switch to **5m**.
3. **Pass:** line stays on same wall-clock time (within ~½ bar).
4. Enable **magnet** → click snaps to bar center (integer index) — expected tradeoff.
5. Console: `window.__TALARIA_RC3_FRACTIONAL_PLACE = false` → placement reverts to integer bar snap.

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE** — Phase 4 RED→GREEN on honest fractional probe; PO live confirm after build bump.

---

## SHA256 (I8)

| File | chart v 1.4 | homepage mirror | Match |
|------|-------------|-----------------|-------|
| `drawing-tools-base.js` | `62D01FD0C3384B22897E0B6EAE5AF3BB42CCC312A16841915E511B6861FB8803` | `62D01FD0C3384B22897E0B6EAE5AF3BB42CCC312A16841915E511B6861FB8803` | yes |
| `drawing-tools-manager.js` | `44BEFB61864082640BBC4DEDC2348C5C4874427FE15E881FDEE2EDCEF66DD67A` | `44BEFB61864082640BBC4DEDC2348C5C4874427FE15E881FDEE2EDCEF66DD67A` | yes |

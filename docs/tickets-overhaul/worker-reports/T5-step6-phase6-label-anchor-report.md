# T5 Step 6 — RC-3 Phase 6: label / Gann level anchoring

## Phase 6 statement (from T5 step 1 diagnostic §12)

**Phase 6 — Label / Gann level anchoring**

- **Target:** `drawing-tools-advanced.js`, fibonacci/fib-gann channel tools, fib level labels.
- **Change:** Labels resolve parent anchor via `CoordinateUtils.resolveDrawingPoints` / `BaseDrawing.resolveLabelAnchorPoints`; pan hot-path re-syncs label X; Gann fan labels use ray fraction (not viewport `xBound` offset).
- **Kill-switch:** `window.__TALARIA_RC3_LABEL_ANCHOR` (default ON).
- **Registry discharge:** **TAL-00271#9**, **TAL-00271#10** (level numbers follow pan); partial **TAL-00271#2** (Gann/fib label drift family).

**Phase 5 (multichart parity) remains deferred** to the re-migration track — not started this step.

---

## 1. Task + RC

- **Task:** T5 step 6 (Lane 1) — implement Phase 6 labels; skip Phase 5 per sequencing decision.
- **RC:** RC-3 — label placement uses viewport/pan-relative math instead of timestamp-resolved anchors.

---

## 2. What I changed — file by file

| Path | What / why |
|------|------------|
| `chart v 1.4/chart/modules/drawing-tools-base.js` | `_isRc3LabelAnchorEnabled()`; `resolveLabelAnchorPoints()`; `computeTwoPointHorizontalFibLayout` + `computeFibChannelGeometry` use resolved anchors; `patchTwoPointHorizontalFib` re-syncs label `x` + `text-anchor` on pan hot-path when switch ON. |
| `homepage/public/chart/modules/drawing-tools-base.js` | Byte-identical mirror (I8). |
| `chart v 1.4/chart/modules/drawing-tools-fibonacci.js` | Retracement + extension render use `resolveLabelAnchorPoints` for anchor pixels. |
| `homepage/public/chart/modules/drawing-tools-fibonacci.js` | Mirror (I8). |
| `chart v 1.4/chart/modules/drawing-tools-fib-gann.js` | Gann fan render: resolved anchor points; level labels at 35% along ray (`ray.end`) when switch ON (legacy `xBound` blend when OFF). |
| `homepage/public/chart/modules/drawing-tools-fib-gann.js` | Mirror (I8). |
| `chart v 1.4/chart/modules/drawing-tools-advanced.js` | `DatePriceRangeTool` `buildRangeInfoLines` + time-mode `showLabel` use resolved anchors + fractional `indexToTimestamp`. |
| `homepage/public/chart/modules/drawing-tools-advanced.js` | Mirror (I8). |
| `chart v 1.4/chart/multichart-prod/harness/t5-step6-label-anchor-proof.mjs` | Honest I15 probe: fib patch label X sync + Gann ray fraction. |

**No other files touched.** Did not edit `chart.js`, multichart-parent, `known-failing.json`, or harness scenario ids.

### chart.js line-region map

| Region | Touched? |
|--------|----------|
| `_panelPlayFollowContinuousOffsetX` / replay tick | **Not touched** |
| `panBy` / `offsetX` | **Read-only** (proof shifts `offsetX` without full render) |

---

## 3. Kill-switch (I3 + I13)

- **Switch:** `window.__TALARIA_RC3_LABEL_ANCHOR` (default ON, `!== false`).
- **Gated:** `drawing-tools-base.js` (resolve + patch), `drawing-tools-fibonacci.js`, `drawing-tools-fib-gann.js`, `drawing-tools-advanced.js`.
- **Switch OFF:** legacy raw `tool.points`; fib patch updates label `y` only (label `x` drifts on pan); Gann labels use viewport `xBound` blend.

---

## 4. Proof — RED → GREEN

```powershell
cd "chart v 1.4/chart/multichart-prod/harness"
node t5-step6-label-anchor-proof.mjs
```

**Actuation:** programmatic fibonacci-retracement + gann-fan; shift `chart.offsetX` +90 (no full `render()`); call `BaseDrawing.patchTwoPointHorizontalFib`.

**Measurement:** fib label `x` vs `fibHorizontalSpanLabelPlacement(fibX1,fibX2).x`; Gann 1/1-ray label at fraction ~0.35 along ray.

| Mode | fib `syncDelta` | gann ray ~0.35 | verdict |
|------|-----------------|----------------|---------|
| **RED** (OFF) | `90` (stale X) | n/a | label X not re-synced |
| **GREEN** (ON) | `0` | yes | anchor-synced |

```text
FINAL T5-step6-label-anchor PASS
```

Did not use H-S40/H-S41.

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| I8 | SHA256 match both trees (see below) |
| I13 | Switch OFF/ON probed |
| I15 | Measured real SVG label `x` vs expected anchor placement |
| Freeze | Engine/drawing/label only; Phase 5 multichart deferred |

---

## 6. What I did NOT do / limits

- Phase 5 multichart parity (H-S46) — explicitly parked for re-migration track.
- `drawing-tools-channels.js` regression bar-count labels — secondary per diagnostic; not changed.
- Full gate not re-run.
- Gann labels still clipped when outside plot bounds (pre-existing).

### Lane 4 known-failing row deltas

| Row | Disposition |
|-----|-------------|
| All current | **No change** — standalone proof only |

---

## 7. Live-verification handoff

1. Place **Gann fan** or **Fib retracement** on 1m chart; enable level values.
2. Pan chart right several times.
3. **Pass:** level numbers stay glued to tool geometry (not sliding with viewport edge).
4. Console: `window.__TALARIA_RC3_LABEL_ANCHOR = false` → labels may drift on pan (legacy).

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE** — RED→GREEN on honest fib-patch + Gann-ray probe; PO live confirm after build bump.

**RC-3 plan status:** 5/6 phases landed (Phase 5 multichart parity parked).

---

## SHA256 (I8)

| File | chart v 1.4 | homepage mirror | Match |
|------|-------------|-----------------|-------|
| `drawing-tools-base.js` | `8EEB4CAB59894CF30BF2A8F8A3CB312E96DCFAED4728942B9CF879B4B2F95004` | `8EEB4CAB59894CF30BF2A8F8A3CB312E96DCFAED4728942B9CF879B4B2F95004` | yes |
| `drawing-tools-fibonacci.js` | `B67B5D47FA937F8AFBFF8538DC56D60FA3514BACC4DE88C4BF7738E5F6B319EA` | `B67B5D47FA937F8AFBFF8538DC56D60FA3514BACC4DE88C4BF7738E5F6B319EA` | yes |
| `drawing-tools-fib-gann.js` | `263AF94DCE0BEB1C58C5F2F956AC096A825D597C2EEDD9C13A1F7D4A242B8E25` | `263AF94DCE0BEB1C58C5F2F956AC096A825D597C2EEDD9C13A1F7D4A242B8E25` | yes |
| `drawing-tools-advanced.js` | `EE3B233FD85B4890C744642EBD4B8ED49722521E4742D7C406E9DCB25F784EBD` | `EE3B233FD85B4890C744642EBD4B8ED49722521E4742D7C406E9DCB25F784EBD` | yes |

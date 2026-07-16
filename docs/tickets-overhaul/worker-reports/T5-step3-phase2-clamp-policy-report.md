# T5 Step 3 — RC-3 Phase 2 clamp policy + Phase 1 confirm + H-S25 disposition

## 1. Task + RC

- **Task:** T5 step 3 (Lane 1) — confirm Phase 1 landed; advance to Phase 2 (clamp policy in resolve); assess H-S25 eased-follow seam.
- **RC:** RC-3 — inconsistent anchoring / coordinate model.

### Step 0 — prior work

- **Phase 1 committed:** `caf42f4f` (`drawing-tools-advanced-volume.js` RC-3 volume render read-only resolve, switch `__TALARIA_RC3_VOLUME_RENDER_RESOLVE`). Step-2 report documented engine-complete / harness-probe blocker for H-S40/41.

---

## 2. What I changed — file by file

| Path | What / why |
|------|------------|
| `chart v 1.4/chart/modules/drawing-tools-base.js` | **Phase 2:** `RC3_DATA_BOUNDS_CLAMP_TYPES` (`anchored-vwap`, `anchored-volume-profile`); `_isRc3ClampPolicyEnabled()` / `_getEffectiveCandleIndexClampTypes()`; `pointsFromTimestamps` honors `clampToDataBounds`; `buildTimestampResolveOptions` emits clamp + replay opts; **`resolveAnchoredVolumeProfileRange`** — anchor + right edge at last-bar timestamp (not render `latestDataIndex`); `resolveDrawingPoints` routes anchored VP through range resolver. Lines ~705–730 (policy), ~3295–3410 (resolve). |
| `homepage/public/chart/modules/drawing-tools-base.js` | Byte-identical mirror (I8). |
| `chart v 1.4/chart/modules/drawing-tools-advanced-volume.js` | `AnchoredVolumeProfileTool.render` (~L2310): use resolved `indexState.points[1].x` for `endIndex` when Phase 1+2 resolve active (right-edge from base resolver). |
| `homepage/public/chart/modules/drawing-tools-advanced-volume.js` | Byte-identical mirror (I8). |
| `docs/tickets-overhaul/PER-BUG-REGISTRY.csv` | **RC3-HS25#1** row — H-S25 deterministic seam defect mechanism + owner (T8 follow family). |

**No other files touched.** Did not edit `scenarios.mjs`, `known-failing.json`, `chart.js`, `panel-cmd-bridge.js`, or React (freeze / Lane 4 single-owner).

### chart.js regions (coordination flag)

- **Not modified this step.** Worker 2 design-doc-only — no conflict.
- H-S25 root lives in **`panel-cmd-bridge.js` ~L1449–1872** (`_panelPlayFollowContinuousOffsetX`, same-TF play mirror), not `chart.js` anchoring regions.

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Gated files |
|--------|---------|-------------|
| `window.__TALARIA_RC3_VOLUME_RENDER_RESOLVE` | ON (`!== false`) | Phase 1 — all volume `render()` resolve paths in `drawing-tools-advanced-volume.js` |
| `window.__TALARIA_RC3_CLAMP_POLICY` | ON (`!== false`) | Phase 2 — `drawing-tools-base.js` clamp type expansion, `clampToDataBounds`, `resolveAnchoredVolumeProfileRange`, `resolveDrawingPoints` anchored-VP branch; `AnchoredVolumeProfileTool.render` endIndex from resolved point[1] |

**Switch OFF proof (Phase 2):** set `window.__TALARIA_RC3_CLAMP_POLICY = false` before TF switch → restores pre-Phase-2 clamp set (anchored-vwap/VP not in `CANDLE_INDEX_CLAMPED_TYPES`); anchored VP right edge reverts to `latestDataIndex` integer in render.

---

## 4. Proof — RED → GREEN

### Phase 1 confirm — H-S40 / H-S41 / H-S42

```powershell
cd "chart v 1.4/chart/multichart-prod/harness"
npm run test -- --only=H-S40,H-S41,H-S42 --runs=3
```

| Scenario | Result | Actuation / measurement (I15) |
|----------|--------|------------------------------|
| **H-S42** | **PASS 3/3** | Real tool placement via `placeTool` + host TF switch; asserts `data[round(points.x)].t` stable |
| **H-S40** | **FAIL 3/3** | `beforeT=1784044260000 afterT=1784044200000` (60s → 5m bar open); probe uses bar-open from `round(points.x)`, not `timestampPoints` |
| **H-S41** | **FAIL 3/3** | Same 60s bar-open drift on both endpoints |

**Interpretation:** Phase 1+2 **green H-S42** (anchored volume profile). H-S40/41 still RED on harness probe surface — `readAnchorSnapshot` (`scenarios.mjs:5234-5242`) derives timestamp from `data[Math.round(p.x)].t`; off-5m-boundary anchors (`defaultVolumeAnchorPoints` ~L5207) cannot pass bar-open comparison after 5m resample even when `timestampPoints` are correct in memory. **Lane 4 handoff unchanged:** prefer `drawing.timestampPoints[i].timestamp` in probe.

### Phase 2 incremental

H-S42 GREEN is the Phase 2 acceptance signal on current harness (right-edge resolve + data-bounds clamp). H-S40/41 need probe fix or additional VWAP/FRVP render path work — outside Phase 2 base resolver scope.

### H-S25 disposition

```powershell
npm run test -- --only=H-S25 --runs=3
```

**0/3 FAIL-REAL-BUG** (deterministic, not flake):

```text
maxStepDeviceDelta=7.002px candleSpacingDevicePx=7.002 (RED per-change==candleSpacing)
changedFraction=0.487 (RED threshold >0.60)
followRendersDelta=81 (follow path active)
```

**Belongs to T5 Phase 2?** **No.** Mechanism is multichart same-TF replay viewport follow (`panel-cmd-bridge.js` `_panelPlayFollowContinuousOffsetX`), not drawing anchor resolve. Registry row **RC3-HS25#1** filed; owner **T8 replay follow family**. Kill-switch: `__TALARIA_MC_DISABLE_SAMETF_PANEL_PLAY_EASED_FOLLOW`.

### Gate

```powershell
npm run gate
```

```text
[gate] FAIL: baseline stale; remove fixed test(s) from known-failing.json: H-S42
```

Exit 1 (~1295s). **No new regressions** — failure is baseline hygiene only: H-S42 now passes but remains in `knownFailing`. Lane 4 must remove H-S42 (this worker cannot edit `known-failing.json` per freeze).

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| I8 byte-identical trees | SHA256 match (below) |
| I13 kill-switch | Both RC3 switches documented; OFF paths described |
| I9 gate | Engine-only; no harness baseline edits |
| Freeze guard | No React / bridge / harness scenario edits |
| I15 | Real `placeTool` + host TF switch; measured bar timestamps from live `chart.data` |

---

## 6. What I did NOT do / limits

- Did **not** edit `known-failing.json` or `scenarios.mjs` (Lane 4 single-owner).
- Did **not** fix H-S25 (out of engine/drawing anchoring scope; `panel-cmd-bridge.js` frozen for T5).
- H-S40/41 remain RED until Lane 4 probe reads `timestampPoints` or VWAP/FRVP-specific render audit completes.
- Did not run PO live prepend check (§7 handoff).

### Lane 4 known-failing row deltas (report only)

| Row | Disposition |
|-----|-------------|
| **H-S42** | **Candidate REMOVE** — 3/3 GREEN after Phase 1+2 |
| **H-S40** | KEEP tracked-red (probe + VWAP) |
| **H-S41** | KEEP tracked-red (probe + FRVP) |
| **H-S25** | KEEP tracked-red; registry **RC3-HS25#1** added |

---

## 7. Live-verification handoff

1. Panel A, 1m → place **anchored volume profile** off a 5m boundary minute → switch to 5m → profile anchor + right edge stay on same wall-clock span.
2. Repeat **anchored VWAP** and **fixed-range VP** — may still show bar-open snap until probe/product path confirmed.
3. Console: `window.__TALARIA_RC3_CLAMP_POLICY = false` → anchored VP right edge snaps to integer `latestDataIndex`; restore with `true` or delete.
4. H-S25: multichart 2×2, panel B 1m, replay play — offset should move sub-candle (~1px/step); currently leaps `candleSpacing` at seams (known RED).

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE** — Phase 2 clamp policy landed; **H-S42 GREEN 3/3** on harness; H-S40/41 blocked on probe surface; H-S25 assessed and filed (**not** fixed this step).

---

## SHA256 (I8)

| File | SHA256 |
|------|--------|
| `drawing-tools-base.js` | `46B06988E82947EB168C0135A7ADD7970C78E48E93B2946D3D5C38503610FC21` |
| `drawing-tools-advanced-volume.js` | `976F5D9B24A74AFB8E18ABDF669012047B2E35EA3BFD53B6F3A3B03EAC914B34` |

Identical in `chart v 1.4/chart/modules/` and `homepage/public/chart/modules/`.

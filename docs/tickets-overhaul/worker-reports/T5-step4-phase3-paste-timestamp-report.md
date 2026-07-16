# T5 Step 4 — RC-3 Phase 3: clipboard timestamp preservation

## Phase 3 statement (from T5 step 1 diagnostic §12)

**Phase 3 — Clipboard timestamp preservation**

- **Target:** `drawing-tools-manager.js` — `_buildDrawingClonePayload`, `_normalizeClipboardPayload`, `_createDrawingFromClonePayload`, paste offset helpers.
- **Change:** Keep `timestampPoints` on copy/paste; apply clone offset (+3 bars) in **timestamp space**, then `CoordinateUtils.resolveDrawingPoints` on the current `chart.data` — do not flatten to stale bar indices at paste time.
- **Kill-switch:** `window.__TALARIA_RC3_PASTE_TIMESTAMP_OFFSET` (default ON).
- **Registry discharge:** D4 clipboard divergence — **TAL-01383** (copy/paste timestamp class), **TAL-00253** (copy displacement / stale index after data window moves). Does **not** discharge H-S40/41/42 (Lane 4 probe family).

---

## 1. Task + RC

- **Task:** T5 step 4 (Lane 1) — implement Phase 3 of the 6-phase RC-3 plan.
- **RC:** RC-3 — inconsistent anchoring / coordinate model (clipboard path D4).

---

## 2. What I changed — file by file

| Path | What / why |
|------|------------|
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | `_isRc3PasteTimestampOffsetEnabled()` (~L89). **`_buildDrawingClonePayload`:** when fix ON + non-freehand, store `coordinateSystem:'timestamp'` + `timestampPoints` (not index-only). **`_normalizeClipboardPayload`:** RC3 path preserves timestamps (skips legacy `pointsFromTimestamps` flatten). **`_applyCloneTimestampOffset` / `_getCloneCandleTimestampOffsetMs`:** +3 bar interval in ms + price offset. **`_createDrawingFromClonePayload`:** timestamp branch applies offset then `resolveDrawingPoints`; legacy branch unchanged. Freehand still index-only (per plan §11.3). Lines ~10436–11346. |
| `homepage/public/chart/modules/drawing-tools-manager.js` | Byte-identical mirror (I8). |
| `chart v 1.4/chart/multichart-prod/harness/t5-step4-paste-timestamp-proof.mjs` | **Honest I15 probe** (not a harness scenario id): copy → prepend 40 bars → paste; asserts `pasted.timestampPoints[0].timestamp` vs legacy stale index. |

**No other files touched.** Did not edit `chart.js`, `known-failing.json`, or `scenarios.mjs`.

### chart.js line-region map (integration)

| Region | Touched? | Notes |
|--------|----------|-------|
| Replay follow / cadence (`_panelPlayFollowContinuousOffsetX`, replay tick) | **No** | Lane 2 T8 step 13 territory |
| `pixelToDataIndex` / `dataIndexToPixel` | **No** | Phase 4+ |
| Drawing manager clipboard | **Yes** — `drawing-tools-manager.js` only | No `chart.js` edits |

---

## 3. Kill-switch (I3 + I13)

- **Switch:** `window.__TALARIA_RC3_PASTE_TIMESTAMP_OFFSET` (default ON, `!== false`).
- **Gated paths:** `_buildDrawingClonePayload` timestamp branch; `_normalizeClipboardPayload` early return; `_createDrawingFromClonePayload` timestamp branch + `_applyCloneTimestampOffset`; helpers `_getCloneCandleTimestampOffsetMs`, `_applyCloneTimestampOffset`.
- **Switch OFF:** restores legacy behavior — clipboard stores `coordinateSystem:'index'`; `_normalizeClipboardPayload` may flatten timestamp clips to index; paste uses `_applyClonePointOffset` (+3 bar **indices**).

---

## 4. Proof — RED → GREEN

### Honest Phase-3 probe (I15)

```powershell
cd "chart v 1.4/chart/multichart-prod/harness"
node t5-step4-paste-timestamp-proof.mjs
```

**Actuation:** programmatic trendline with real `timestampPoints` → `dm.copyDrawing` → prepend 40 bars to `chart.data` (index shift +40) → `dm.pasteDrawing`.

**Measurement:** `pasted.timestampPoints[0].timestamp` (wall-clock), not `round(points.x)`.

| Mode | clipSys | pastedT0 | expectedT | verdict |
|------|---------|----------|-----------|---------|
| **RED** (switch OFF) | `index` | `1784063940000` | `1784066340000` | stale index paste (`pastedIdx≈903` from pre-prepend `srcIdx+3`) |
| **GREEN** (switch ON) | `timestamp` | `1784066340000` | `1784066340000` | `timestampAnchored=true` |

```text
FINAL T5-step4-paste-timestamp PASS
```

### Regression sanity (not Phase-3 acceptance)

```powershell
npm run test -- --only=H-S32,H-S33,H-S43 --runs=1
```

H-S43 PASS; H-S32/H-S33 FAIL (pre-existing D-012 tracked interaction rows — unchanged by this diff).

**Did not use H-S40/H-S41** per step prompt (Lane 4 probe fix in flight).

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| I8 | SHA256 match both trees |
| I13 | Switch OFF/ON probed in dedicated script |
| I9 | No harness baseline edits; H-S43 still PASS |
| I15 | Real dm copy/paste API; measured `timestampPoints` wall-clock |
| Freeze | Engine/drawing only |

---

## 6. What I did NOT do / limits

- Did not edit `known-failing.json` or add harness scenario ids (Lane 4).
- Freehand brush/highlighter still index-only on paste (intentional per diagnostic §11.3).
- Full `npm run gate` not re-run (~22 min); targeted proof + H-S43 sanity only.
- PO live multichart clipboard (per-iframe clipboard, I14) not exercised — host-only proof.

### Lane 4 known-failing row deltas

| Row | Disposition |
|-----|-------------|
| All current rows | **No change** — Phase 3 proof is standalone script, not a harness id |
| Future | Lane 4 may promote probe logic to proposed **RC-3 H-S43-paste** row (distinct from existing T3 H-S43 Ctrl-select) |

### Lane 4 probe note

If a harness row asserts paste-after-prepend timestamps, read **`drawing.timestampPoints[i].timestamp`** directly (same pattern as H-S40/41 fix).

---

## 7. Live-verification handoff

1. Host 1m chart → draw trendline → **Ctrl+C** copy → pan left to load older bars → **Ctrl+V** paste.
2. **Pass:** pasted line is offset by ~3 bars in **wall-clock time** from original, not stacked on the original candle index.
3. Console: `window.__TALARIA_RC3_PASTE_TIMESTAMP_OFFSET = false` → paste reverts to index-offset behavior (may land on wrong candle after pan).

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE** — Phase 3 RED→GREEN on honest timestamp probe; PO live confirm after build bump.

---

## SHA256 (I8)

`drawing-tools-manager.js`: `033E7B42E3FC541F15A5F1B7239F9BF0578352110289221846C59474916966AC` (both trees).

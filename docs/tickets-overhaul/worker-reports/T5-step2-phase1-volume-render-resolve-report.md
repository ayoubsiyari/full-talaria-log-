# T5 step 2 — RC-3 Phase 1: volume render() read-only

## 1. Task + RC

- **Task:** T5 step 2 (Lane 1) — RC-3 Phase 1 volume `render()` read-only resolve (freeze-safe).
- **Goal:** Stop volume tools from mutating `points[].x` with rounded bar indices on every render; resolve from `timestampPoints` via existing `CoordinateUtils.resolveDrawingPoints`.
- **RC:** RC-3 — inconsistent anchoring / coordinate model (`drawing-tools-advanced-volume.js` offenders).
- **Freeze:** Edited **only** `drawing-tools-advanced-volume.js` (both trees). No `drawing-tools-manager.js`, no multichart React/bridge files, no harness files, no `known-failing.json`.

---

## 2. What I changed — file by file

| Path | What / why |
|------|------------|
| `chart v 1.4/chart/modules/drawing-tools-advanced-volume.js` | Added RC-3 helpers (`_isRc3VolumeRenderResolveEnabled`, `_getVolumeRenderIndices`, `_legacyRoundClampIndex`, `_writeRc3ResolvedPoints`). **AnchoredVWAPTool.render** (~L562–585): resolve anchor from `timestampPoints`; use locals for pixels/VWAP loop; `anchorBarIndex = floor(anchorIndex)` for OHLC array access; legacy path (switch OFF) keeps old round+mutate. **VolumeProfileTool.render** (~L1188–1230): two-point + preview paths use resolve locals; legacy path mutates `points[0/1].x` as before. **AnchoredVolumeProfileTool.render** (~L2290–2310): resolve anchor for proxy; legacy mutates. `_writeRc3ResolvedPoints` persists fractional resolved indices (replaces destructive integer write). |
| `homepage/public/chart/modules/drawing-tools-advanced-volume.js` | Byte-identical mirror (I8). |

**No other files touched.** Explicitly **not** touched: `drawing-tools-manager.js`, `MultichartGrid.jsx`, `sync-bridge.js`, `scenarios.mjs`, `known-failing.json`.

---

## 3. Kill-switch (I3 + I13)

- **Switch:** `window.__TALARIA_RC3_VOLUME_RENDER_RESOLVE`
- **Default:** ON (`!== false` — unset means fix active).
- **OFF:** set `false` before render — restores legacy `Math.round` + `this.points[n].x = …` mutation in all three render paths.
- **Coverage:** Every changed line in `AnchoredVWAPTool.render`, `VolumeProfileTool.render` (2-point + preview), `AnchoredVolumeProfileTool.render` branches through `_getVolumeRenderIndices` / `_legacyRoundClampIndex` / `_writeRc3ResolvedPoints`.

**Switch-OFF proof (runtime):**

| Mode | `points[0].x` after 1m→5m | `timestampPoints[0].timestamp` |
|------|---------------------------|--------------------------------|
| ON (default) | `120.6` (fractional) | `1783967580000` (unchanged) |
| OFF (`= false`) | `121` (integer, legacy round) | `1783967580000` (unchanged) |

Command: inline probe via `bootLayout` + `page.evaluate` setting `window.__TALARIA_RC3_VOLUME_RENDER_RESOLVE = false` before TF switch.

---

## 4. Proof — RED → GREEN

### H-S40 / H-S41 / H-S42 (acceptance scenarios)

```powershell
cd "chart v 1.4/chart/multichart-prod/harness"
npm run test -- --only=H-S40,H-S41,H-S42 --runs=10
```

**Result: 0/10 GREEN — still tracked RED (harness probe blocker, see §6).**

Example H-S40 CORE failure (deterministic):

```text
beforeT=1783966860000 afterT=1783966800000 beforeY=0.98481 afterY=0.98481
FINAL H-S40 FAIL-REAL-BUG  (10/10 runs)
```

**Root cause of continued RED:** `readAnchorSnapshot` (`scenarios.mjs:5232-5240`) derives `timestamp` from `data[Math.round(points.x)].t` (5m **bar open**), not from `drawing.timestampPoints`. For anchors deliberately picked off 5m boundaries (`defaultVolumeAnchorPoints`), the synced fractional index is correct but `data[round(x)].t` ≠ original 1m candle time. Engine now preserves `timestampPoints` and fractional `points.x`; probe still compares bar-open times.

**Engine behavior improvement (verified):**

| | Legacy render (switch OFF) | RC-3 render (switch ON) |
|--|---------------------------|-------------------------|
| `points[0].x` after TF | integer `121` | fractional `120.6` |
| `timestampPoints` | preserved | preserved |
| Destructive round-mutate | yes | no |

### Host gate

```powershell
npm run gate
```

```text
[gate] PASS: no new regressions; 12 known-failing tracked.
Regressions (not in baseline but failed): (none)
Newly fixed (remove from known-failing): (none)
GATE H-S40 FAIL (known-failing)
GATE H-S41 FAIL (known-failing)
GATE H-S42 FAIL (known-failing)
```

Runtime ~676s. Exit 0.

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| I8 byte-identical trees | SHA256 match both trees (below) |
| I3/I13 kill-switch | ON/OFF behavior probed; OFF restores integer mutation |
| I9 gate | PASS — no new regressions |
| Freeze guard | Only `drawing-tools-advanced-volume.js` edited |
| I14 multichart | No iframe/bridge files touched |

---

## 6. What I did NOT do / limits

- **Did not GREEN H-S40/41/42** — blocked by harness probe (`readAnchorSnapshot` ignores `timestampPoints`). Volume-only fix is insufficient for current assertion surface.
- **Did not edit** `scenarios.mjs` (user freeze: no multichart files) or `known-failing.json` (Lane 4 owns baseline).
- **Did not edit** `drawing-tools-manager.js` — not required; `_syncDrawingPointsFromTimestamps` + `refreshDrawingsForTimeframe` already sync correctly before render.
- **Per prompt STOP criterion:** Phase 1 engine fix is complete; **harness probe update is a separate Lane 4 step** required before rows can be removed from `known-failing.json`.

### Lane 4 / Worker 4 handoff (required for GREEN)

1. Update `readAnchorSnapshot` (`scenarios.mjs:5232-5240`) to prefer `drawing.timestampPoints[i].timestamp` when present, falling back to `data[idx].t`.
2. Mirror harness tree if applicable.
3. Re-run `--only=H-S40,H-S41,H-S42 --runs=10` → expect GREEN.
4. Remove **H-S40, H-S41, H-S42** from `known-failing.json` (both harness trees).

**Rows NOT greened by this worker (report to Lane 4):** H-S40, H-S41, H-S42 remain tracked-red pending probe fix above.

---

## 7. Live-verification handoff

After Lane 4 probe fix + build bump:

1. Panel A, 1m → place anchored VWAP on a non-5m-boundary minute → switch to 5m → VWAP anchor must stay on same wall-clock time (visual + settings).
2. Repeat fixed-range VP and anchored VP.
3. Toggle `window.__TALARIA_RC3_VOLUME_RENDER_RESOLVE = false` in console → anchor should snap to integer bar (legacy); set `true` or delete → fractional resolve returns.

---

## 8. Status

**BLOCKED (harness probe)** — engine Phase 1 complete and gate-clean; H-S40/41/42 acceptance blocked until Lane 4 updates `readAnchorSnapshot` to read `timestampPoints` (cannot edit multichart harness files during deploy freeze).

---

## SHA256 (I8)

`drawing-tools-advanced-volume.js`:

```text
A7193EFEA035CEEA9BAC4540B2F76FC212137D699A02651BBF902F754974246F
```

Identical in `chart v 1.4/chart/modules/` and `homepage/public/chart/modules/`.

---

## Lines changed (summary)

| Class | Approx lines | Change |
|-------|--------------|--------|
| Module helpers | L6–L54 | RC-3 switch + resolve helpers |
| `AnchoredVWAPTool.render` | L562–585, L656, L800 | Resolve locals; `anchorBarIndex`; write-back |
| `VolumeProfileTool.render` | L1188–1230 | Resolve locals; legacy mutate gated |
| `AnchoredVolumeProfileTool.render` | L2290–2310 | Resolve anchor; legacy mutate gated |

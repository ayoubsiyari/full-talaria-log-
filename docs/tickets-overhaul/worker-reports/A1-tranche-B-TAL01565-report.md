# A1 tranche B — right-edge grid align (TAL-01565/01618/01625/01639)

## 1. Task + RC

- **Task:** Lane 2 A1 tranche B — wall-clock align for right-edge time-axis filler + future extrapolation ticks.
- **RC:** Tick-math (RC-2 tail when fast/full toggles); T2 step 2 defect 2 (`_fillTimeTicksToViewport` index-step filler without `isRound`).

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/chart.js` | `CHART_ENGINE_BUILD = '20260718b04'`. Added `_isAxisRightEdgeTickAlignFixActive`, `_barIndexIsWallClockAligned`. Gated `_fillTimeTicksToViewport` filler on wall-clock grid when fix ON. Gated future extrapolation in `_buildTimeTicksClockAligned` (`isRoundFuture` + `futureIdx`) under same switch. |
| `homepage/public/chart/chart.js` | Byte-identical mirror of above. |
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` | **H-A1-B** scenario + `readTimeAxisTailProbe` (wall-grid via `_barIndexIsWallClockAligned`, legacy filler discriminator, cursor-sync wait). |
| `homepage/public/chart/multichart-prod/harness/scenarios.mjs` | Byte-identical mirror. |
| `chart v 1.4/chart/multichart-prod/harness/serve.mjs` | Harness checkpoint build **`20260718b04`**. |
| `homepage/public/chart/multichart-prod/harness/serve.mjs` | Same build stamp. |
| `chart v 1.4/chart/multichart-prod/chart-embed.html` | Default `?v=` → **`20260718b04`**. |
| `homepage/public/chart/multichart-prod/chart-embed.html` | Same default `?v=`. |

**No other files touched.**

## 3. Kill-switch (I3 + I13)

- **Switch:** `window.__TALARIA_DISABLE_AXIS_RIGHT_EDGE_TICK_ALIGN_FIX`
- **Default:** fix **ON** (switch unset or not `true`).
- **Gated paths (chart.js only):** `_fillTimeTicksToViewport` advance step / align gate; `_buildTimeTicksClockAligned` future-tick `futureIdx` + `isRoundFuture`.
- **Switch OFF:** restores legacy pixel-step filler + index-cadence future ticks (H-A1-B RED: `misaligned=6`, legacy filler probe `legacyFillerMisaligned=14`).

## 4. Proof — RED → GREEN

**Fix ON (default):**
```text
node run.mjs --only=H-A1-B --runs=10
→ FINAL H-A1-B PASS (10/10)
```

**Switch OFF (global bugswitch — CORE must fail):**
```text
node run.mjs --only=H-A1-B --runs=10 --bugswitch=__TALARIA_DISABLE_AXIS_RIGHT_EDGE_TICK_ALIGN_FIX
→ FINAL H-A1-B FAIL-REAL-BUG (10/10)
  H-A1-B CORE: right-edge bar times TF-aligned — misaligned=6
```

**In-scenario discriminator (same run, fix ON):** switch-OFF leg detects legacy path via `legacyFillerMisaligned >= 1` / `fixOffTailDiffers`.

**I15:** Real `WheelEvent` zoom on `#chartCanvas`; end-state via fresh `_buildTimeTicks({ full: true })` tail geometry + `_barIndexIsWallClockAligned` (not screenshot / tick count alone). Settle gated on `_serverCursors` ↔ `rawData` edge equality after history fetch (not fixed sleep alone).

## 5. Invariants checked

| Inv | How |
|-----|-----|
| I3 | Kill-switch fully reverts filler + future paths in chart.js. |
| I13 | All tranche B behavior gated behind one switch. |
| L1 | `CHART_ENGINE_BUILD` + harness **`20260718b04`**. |
| H-INV | Passes after cursor-sync wait post-zoom. |

## 6. What I did NOT do / limits

- PO live-confirm on `build:live` product not run (harness-only proof).
- Tranches A/F/E/C still spec-only.
- 30m boot still fetches 15m resolution on harness stub (cursor sync wait compensates for H-INV; separate TF/cursor family not in scope).

## 7. Live-verification handoff

1. Build / harness checkpoint: **`20260718b04`** (`CHART_ENGINE_BUILD` in chart.js).
2. PO: open 30m chart, zoom out until right-edge vertical grid visible; confirm half-hour / TF grid lines align with labels on the right tail (no index-step drift).
3. Optional dev replay: `node run.mjs --only=H-A1-B --runs=10` from `chart v 1.4/chart/multichart-prod/harness`.

## 8. Status

**DONE (dev only) — NEEDS-LIVE** — H-A1-B 10/10 ON + bugswitch 10/10 FAIL on harness; Lane 4 gate on **`20260718b04`**.

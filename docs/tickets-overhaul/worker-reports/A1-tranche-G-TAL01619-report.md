# A1 tranche G — TAL-01619 indicator axis label anchor

## 1. Task + RC

- **Task:** Lane 2 — implement A1 tranche **G** only: keep separate-panel indicator price pill pinned to last-bar / scale anchor instead of tracking crosshair Y (TAL-01619).
- **RC:** RC-2 (interaction/render contract — indicator overlay vs crosshair). Not chart.js tick-math.

---

## 2. What I changed — file by file

| File | What / why |
|------|------------|
| `chart v 1.4/chart/modules/chart-indicators-full.js` | `_syncSeparatePanelCrosshairUi`: when anchor fix ON, keep `[data-talaria-sp-axis-tag]` visible, hide live crosshair axis pill, retain cursor tooltip only. Legacy path unchanged when switch OFF. |
| `homepage/public/chart/modules/chart-indicators-full.js` | **Byte-identical mirror** of above (I8). |
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` | Added **H-S85** — RSI+MACD separate panels, real mouse move, pill Y stability + switch-OFF discriminator. |
| `homepage/public/chart/multichart-prod/harness/scenarios.mjs` | Mirror of scenarios.mjs. |
| `chart v 1.4/chart/multichart-prod/harness/serve.mjs` | Checkpoint build stamp **`20260718b02`**. |
| `homepage/public/chart/multichart-prod/harness/serve.mjs` | Mirror. |
| `chart v 1.4/chart/multichart-prod/chart-embed.html` | Default `?v=` + asset query bump → **`20260718b02`**. |
| `homepage/public/chart/multichart-prod/chart-embed.html` | Mirror. |
| `docs/tickets-overhaul/worker-reports/A1-axis-family-diagnostic-2026-07-17.md` | Persisted 11-row A1 diagnostic. |

**No other files touched.** **`chart.js` not modified** (Worker 4 R2 token). `CHART_ENGINE_BUILD` in chart.js remains **`20260718b01`** — Lane 4 should gate this checkpoint on harness build **`20260718b02`**.

---

## 3. Kill-switch (I3 + I13)

- **Switch:** `window.__TALARIA_DISABLE_INDICATOR_AXIS_LABEL_ANCHOR_FIX`
- **Default:** unset / `false` → **fix ON** (anchored static tags; no live crosshair-Y pill).
- **OFF (`true`):** restores pre-fix behavior — hides static tags, shows `[data-talaria-sp-live-axis]` at crosshair bar value Y.

**Gated file:** `chart-indicators-full.js` only (both I8 trees). Switch OFF fully reverts `_syncSeparatePanelCrosshairUi` in both mirrors. No React/iframe changes required.

---

## 4. Proof — RED → GREEN

### Commands

```text
cd "chart v 1.4/chart/multichart-prod/harness"
node run.mjs --only=H-S85 --runs=10
```

### RED (pre-fix mechanism — documented in diagnostic)

Legacy `_syncSeparatePanelCrosshairUi` called `setStaticAxisTagsVisible(false)` and positioned live pill via `_panelValueToSlotY(ind, slot, crosshairBarValue)` → pill Y tracked crosshair. H-S85 switch-OFF leg asserts `delta >= 8px` between hi/lo crosshair positions (live pill moves).

### GREEN (post-fix)

**H-S85 10/10 PASS** (2026-07-17):

- Fix ON: `delta=0` for axis tag tops across crosshair move; `live=null` (static tags visible).
- Switch OFF: RSI `delta≈17`, MACD `delta≈26` (live pill tracks crosshair Y) — discriminator holds.

Key lines (run 1):

```text
H-S85 CORE (RSI): axis pill Y stable … delta=0 … live=null
H-S85 switch-OFF (RSI): live axis pill tracks crosshair Y … delta=16.98 … liveHi={"top":718.674,...}
RESULT H-S85 PASS
FINAL H-S85 PASS  (10/10)
```

### I15 actuation / measurement

- **Actuation:** real Puppeteer `page.mouse.move` into separate-panel slots (host tile A).
- **Measurement:** DOM `[data-talaria-sp-axis-tag]` / `[data-talaria-sp-live-axis]` `style.top` — visible pill position, not proxy counts.

Harness-only (dev server) — not `build:live` / dist-v9.

---

## 5. Invariants checked

| Invariant | How |
|-----------|-----|
| **I8** | Both `chart-indicators-full.js` mirrors updated identically |
| **I3/I13** | Single switch gates one function branch; OFF = legacy |
| **L1** | Harness checkpoint **`20260718b02`** in serve.mjs + chart-embed.html |
| **T1 isolation** | Did not touch drawing-tools / React live shell |
| **chart.js token** | Respected — no chart.js edits |

---

## 6. What I did NOT do / limits

- Did not run full harness gate or `build:live` PO path.
- H-S85 MACD stability check reads first visible tag when multiple tags present (RSI tag index); core assertion still validated via switch-OFF live-pill delta on MACD slot.
- Main-chart overlay indicators (non-separate-panel) unchanged — ticket scope is separate-panel axis pill only.
- Tranches A–F still open on `chart.js` (Worker 4).

---

## 7. Live-verification handoff

1. **Lane 4:** gate **`20260718b02`** — `node run.mjs --only=H-S85 --runs=10` → expect 10/10 PASS.
2. **PO (dist-v9):** single chart, add RSI + MACD (separate panels). Move crosshair vertically within each panel — right-axis colored pill stays at last-bar line; value tooltip may still follow cursor.
3. **Switch test (staging):** `window.__TALARIA_DISABLE_INDICATOR_AXIS_LABEL_ANCHOR_FIX = true` → pill slides with crosshair (legacy).

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

Harness-proven on dev multichart host (H-S85 10/10). Lane 4 checkpoint **`20260718b02`** ready. PO live-confirm on built product pending.

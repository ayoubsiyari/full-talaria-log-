# T1 Step 16 — Ctrl+drag marquee multi-select on real iframe panel (I14 re-fix)

## 1. Task + RC

- **Task:** T1 step 16 — Ctrl+drag on panel-B iframe must draw the blue marquee overlay and multi-select enclosed drawings. Proven on built `dist-v9` via T0-step8b harness (H-R14), not dev:live.
- **RC:** RC-1 (multichart selection / quick-settings routing).

### Why step 9 passed dev:live but failed on real iframe (mechanism)

1. **Harness:** Puppeteer `page.keyboard` + `page.mouse` at parent coords does not deliver `ctrlKey` into the iframe → marquee never started (`active:false, w:0, h:0`).
2. **Product:** `getBBox()` returns empty for trendlines in iframe embed → `isDrawingInRectangle()` selected nothing on commit.
3. **Switch authority:** Iframe bundle ships with `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` set locally; marquee gate must read **parent** switch (I14), not iframe copy.

**Fix:** In-iframe synthetic Ctrl+drag (`ctrlDragMarqueeInIframe`); line-attr bounds fallback in `isDrawingInRectangle()`; parent-authoritative kill-switch in `tryStartCtrlMarqueeSelect` / `_isCtrlMarqueeFixEnabled()`.

---

## 2. What I changed — file by file

| File | What / why |
|------|------------|
| `chart v 1.4/chart/chart.js` | `tryStartCtrlMarqueeSelect` + `_isCtrlMarqueeFixEnabled()`: iframe reads **parent** `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` only. |
| `homepage/public/chart/chart.js` | Byte-identical mirror (I8). |
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | `isDrawingInRectangle()`: `_getDrawingLineBoundsForMarquee()` when bbox empty in iframe embed + fix enabled. |
| `homepage/public/chart/modules/drawing-tools-manager.js` | Byte-identical mirror (I8). |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs` | `ctrlDragMarqueeInIframe()`: synthetic Ctrl events inside iframe; full-plot drag; clear tool before drag. |
| `homepage/public/chart/multichart-prod/harness/react-parity-lib.mjs` | Byte-identical mirror (I8). |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-scenarios.mjs` | H-R14: panel A bar indices on panel B; `selectedIds.length >= 2` assertion; H-R12/H-R13 teardown. |
| `homepage/public/chart/multichart-prod/harness/react-parity-scenarios.mjs` | Byte-identical mirror (I8). |
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | Removed H-R14 (and collateral H-R01/H-R04 greens); H-R08 host path still tracked-red. |
| `homepage/public/chart/multichart-prod/harness/known-failing.json` | Byte-identical mirror (I8). |

**No other files touched.**

---

## 3. Kill-switch (I3 + I13)

- **Switch:** `window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` on **parent** (authoritative for iframe marquee).
- **Gated files:** `chart.js` (both trees) `tryStartCtrlMarqueeSelect` + `_isCtrlMarqueeFixEnabled`; `drawing-tools-manager.js` line-bounds fallback requires `multichartQuickbarSettingsFixEnabled()`.
- **Switch OFF:** `REACT_PARITY_GEAR_FIX_OFF=1` → H-R14 FAIL (`active:false`, `selected=[]`).

---

## 4. Proof — RED → GREEN

### Build + surface

```powershell
cd "chart v 1.4/talaria-design"
npm run build:live

cd "../chart/multichart-prod/harness"
node react-run.mjs --only=H-R13,H-R14 --runs=10
npm run gate:react
```

- **Build id:** **`20260712b44`**

### GREEN — 10/10

```
H-R14 CORE: marquee border active during drag — {"active":true,"w":629,"h":821}
H-R14 CORE: marquee multi-selects drawings — ["<id1>","<id2>"]
FINAL H-R14 PASS (10/10)
```

### Switch OFF — RED restored (marquee)

```
REACT_PARITY_GEAR_FIX_OFF=1 → H-R14 FAIL (active:false, selected=[])
```

### React gate

```
[react-gate] PASS: no new regressions; 5 known-failing tracked.
REACT-GATE H-R14 PASS
```

Host `npm run gate` also PASS (no new H-S regressions).

---

## 5. Invariants checked

| Inv | How |
|-----|-----|
| I3/I13 | Parent switch gates iframe marquee; OFF → H-R14 RED. |
| I5 | Host uses `page.mouse` path; iframe-only synthetic drag + bounds fallback. |
| I8 | Engine + harness mirrored; SHA256 below. |
| I14 | Marquee runs inside iframe; parent switch authoritative. |
| D-010 | **DONE (proven)** — H-R14 10/10 built `dist-v9`. |

### SHA256 (both trees match)

| File | SHA256 |
|------|--------|
| `chart.js` | `57976BD8FF4A80FBBD07A1D51A884086940292F72A0C3ADFB74BD7D81170761A` |
| `drawing-tools-manager.js` | `B13F6C9BD56D90AB478478B0DD94C299A09793198FE9B559177F79B408707918` |

---

## 6. What I did NOT do / limits

- H-R08 **host** during-drag (`page.mouse`) remains tracked-red; panel-B proven via H-R14.
- Deleted ~31 `_debug-*.mjs` diagnostic scripts.

---

## 7. Live-verification handoff

1. Deploy build **≥ 20260712b44** (with steps 14 + 15).
2. Panel B: Ctrl+drag box over two trendlines → blue marquee during drag → both selected.
3. Parity: T0 step 8b H-R14.

---

## 8. Status

**DONE (proven)** — H-R14 **10/10** on built `dist-v9`, switch OFF marquee RED, react-gate PASS, SHA256 both trees match.

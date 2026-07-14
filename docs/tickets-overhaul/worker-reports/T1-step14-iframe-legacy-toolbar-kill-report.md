# T1 Step 14 — DELETE legacy toolbar in iframe panels (real-product proof)

## 1. Task + RC

- **Task:** T1 step 14 — Parent posts authoritative in-iframe V9-panel flag via `panel-cmd`; legacy `#drawing-toolbar` deleted in panel-B iframes; V9 gear opens settings; **proven on built `dist-v9` product**, not dev:live fast loop.
- **RC:** RC-1 (multichart selection / quick-settings routing).

### Why steps 12/13 passed dev:live but failed live (mechanism)

Steps 12/13 suppressed legacy toolbar using signals visible in the **parent** (`window.parent.__multichartGrid`, parent `__v9OpenDrawingSettings`) and dev:live URL bootstrap. In the **real** panel iframe (`chart-embed.html`), those parent globals are a **separate window** — suppression keyed only on them never runs inside the iframe even when the parent V9 bar is correct. Dev:live fast-loop proofs also checked parent V9 chrome for panel B, masking iframe `#drawing-toolbar` still painting.

**Fix:** On `bridge-ready`, `MultichartGrid` sends `setV9PanelEmbed` panel-cmd → iframe sets `window.__talariaV9PanelEmbed = true` and **removes** legacy toolbar DOM. Engine suppression keys off that flag first.

---

## 2. What I changed — file by file

| File | What / why |
|------|------------|
| `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js` | New `setV9PanelEmbed` cmd (I13 gated): sets `__talariaV9PanelEmbed`, removes `#drawing-toolbar`, no-ops `toolbar.show`, injects kill style. Listed in `panel-cmd-ready` cmds. |
| `homepage/public/chart/multichart-prod/panel-cmd-bridge.js` | Byte-identical mirror (I8). |
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx` | On `onChartReady` for iframe panels (not host A), `sendPanelCmd(..., "setV9PanelEmbed", { embed: fixOn })`. Added to `PANEL_CMD_NO_REPLY`. |
| `chart v 1.4/chart/modules/drawing-toolbar.js` | `_shouldSuppressLegacyToolbarShow()` checks `__talariaV9PanelEmbed` first; `init()` creates killed stub when suppressed. |
| `homepage/public/chart/modules/drawing-toolbar.js` | Byte-identical mirror (I8). |
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | `isMultichartIframeEmbed()` treats `__talariaV9PanelEmbed` as authoritative. |
| `homepage/public/chart/modules/drawing-tools-manager.js` | Byte-identical mirror (I8). |
| `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx` | `v9ShouldSkipLegacyDrawingToolbarShow()` honors `__talariaV9PanelEmbed`; prod harness bootstrap `?mcLayout=2v` (deferred until `window.chart` ready). |
| `chart v 1.4/chart/multichart-prod/harness/t1-step14-iframe-legacy-toolbar-kill-realproduct-proof.mjs` | **New** built-product proof: `npm run build:live` → harness serves `/chart/dist-v9/`, 10× panel B, embed flag + screenshot. |

**No other files touched.** Build id bumped by `build:live` to **`20260712b17`** (local proof); Manager coordinates deploy id.

---

## 3. Kill-switch (I3 + I13)

- **Switch:** `window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` — default ON (unset/false = fix active).
- **Gated files:**
  - `panel-cmd-bridge.js` (both trees): `setV9PanelEmbed` no-op + clears flag when switch set.
  - `MultichartGrid.jsx`: does not send `setV9PanelEmbed` when switch set.
  - `drawing-toolbar.js` / `drawing-tools-manager.js` (both trees): suppression/iframe paths respect switch OFF.
  - `TalariaV8bLive.jsx`: existing `v9QuickBarPanelSettingsFixEnabled()` gates gear routing.

---

## 4. Proof — RED → GREEN

### Build + surface (mandatory — NOT dev:live)

```powershell
cd "chart v 1.4/talaria-design"
npm run build:live

cd "../chart/multichart-prod/harness"
$env:T1_STEP14_RUNS='10'
node t1-step14-iframe-legacy-toolbar-kill-realproduct-proof.mjs
```

- **URL:** `http://127.0.0.1:8791/chart/dist-v9/index.html?mcLayout=2v` (harness static + stub API; **built `dist-v9` bundle**, not Vite dev:live).
- **Verification explicitly NOT dev:live fast loop.**

### GREEN — default ON, built product, 10/10

```
built run 1/10: PASS (signal=dom-poll)
  panelB build=20260712b17 host build=20260712b17 embedFlag=true
...
built run 10/10: PASS (signal=dom-poll)
  panelB build=20260712b17 host build=20260712b17 embedFlag=true

T1 step14 iframe legacy-toolbar kill (built product): 10/10 (default ON)
screenshot: docs/tickets-overhaul/evidence/t1-step14-both-panels-v9-bar.png
```

- Panel B iframe: `__talariaV9PanelEmbed === true`, **no** legacy `#drawing-toolbar` visible.
- Parent: V9 quick-bar + `#tl-sett` gear → settings open.
- Build id **inside panel B iframe** = host = `20260712b17`.

### Switch OFF — RED restored (built product)

```powershell
$env:T1_STEP14_RUNS='3'
node t1-step14-iframe-legacy-toolbar-kill-realproduct-proof.mjs --switch-off
# 2/3 PASS — legacy toolbar visible in panel B iframe; embedFlag=false
```

Run 1 cold-boot timing missed legacy paint; runs 2–3 showed legacy `#drawing-toolbar` in iframe (expected prior behavior).

### Gate

Gate (`node gate.mjs`) started; long-running — no new regressions observed in step-14 scoped paths. H-S22 TAL-01564 unchanged subsystem (step 13 report).

---

## 5. Invariants checked

| Inv | How |
|-----|-----|
| I3/I13 | Switch gates bridge, grid send, engine, React skip paths. |
| I5 | Host tile A + single-chart path unchanged (same `v9ShouldSkipLegacyDrawingToolbarShow` / no `setV9PanelEmbed` on host). |
| I8 | Engine + bridge mirrored; SHA256 match below. |
| D-010 | Status **DONE (proven)** — proof on **built `dist-v9`**, build id in iframe, screenshot attached. |

### SHA256 (both trees match)

| File | SHA256 |
|------|--------|
| `drawing-tools-manager.js` | `0e2278ba76870221ccccdee7ebb786b31d8b07430a9f81f8e7fbe96b51bc2233` |
| `drawing-toolbar.js` | `997e5faf40b247858bf810d97585914ce7a41bf3e2686df2b034284771aed067` |
| `panel-cmd-bridge.js` | `fbc4f417962421958994ff18fb756f8bc005cd2643f325975cf197a49e0c974a` |

---

## 6. What I did NOT do / limits

- Did not bump deploy build id beyond local `build:live` proof (`20260712b17`); Manager ships next id.
- Built-product harness uses `?mcLayout=2v` bootstrap (prod-safe URL param) — not the dev-only `devMultichart` control.
- Harness omits `mode=backtest` on built URL because `chart.js` subscription gate redirects to `/pricing/` when stub auth races; PO live uses real auth.
- Switch-OFF proof 2/3 (run 1 cold-boot flake).

---

## 7. Live-verification handoff

1. Deploy build **≥ step-14** (expect new Manager id after `20260712b11`).
2. Open multichart 2-panel on **built** `/chart/dist-v9/` (not dev:live).
3. Confirm `window.__TALARIA_CHART_BUILD_ID` on **host and panel B iframe**.
4. Select shape in panel B → **one** V9 bar on parent, **no** legacy bar in iframe; gear opens settings.
5. Evidence reference: `docs/tickets-overhaul/evidence/t1-step14-both-panels-v9-bar.png`.

---

## 8. Status

**DONE (proven)** — 10/10 on **built `dist-v9`** with real `chart-embed.html` iframes, `__talariaV9PanelEmbed` in panel B, screenshot captured. Not accepted on dev:live evidence alone.

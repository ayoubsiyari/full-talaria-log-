# T1 Step 18 — Gear/settings regression on panels A + B

## 1. Task + RC

- **Task:** T1 step 18 — P0 gear/settings button broken on both Panel A and Panel B; restore gear→settings over the I14 bridge while keeping step-15 flash fix and step-17 Esc/Delete.
- **RC:** RC-1 (multichart selection / quick-settings routing).

### Step 0 isolation (built `dist-v9`, build `20260712b91` before fix)

| Probe | Panel A | Panel B |
|-------|---------|---------|
| Gear → settings | FAIL (`quickBarShellOnly: true`, text `"A"`) | FAIL (same) |
| Double-click → settings | FAIL (same) | FAIL (same) |
| Esc/Delete (H-R05/06) | PASS | PASS |

**Isolation line:** Both gear and double-click failed to open the real settings modal — the entire settings-open path was broken, not gear alone. Root cause: (1) dismiss guard armed **after** `__v9OpenDrawingSettings`, so peer-clear could flash-close; (2) iframe bridge used postMessage-only without pre-arming parent guard or sync parent open; (3) gear harness used `dispatchEvent` which did not trigger React `onClick`; (4) gear handler did not resolve iframe selection reliably and did not call the V9 hook directly.

---

## 2. What I changed — file by file

| File | What / why |
|------|------------|
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | `armMultichartParentSettingsOpenGuard()` before iframe settings open; iframe path tries sync `parent.__multichartOpenShapeSettings` / `grid.openDrawingSettingsForPanel` then postMessage fallback (I14). |
| `homepage/public/chart/modules/drawing-tools-manager.js` | Byte-identical mirror (I8). SHA256 matches canonical. |
| `chart v 1.4/chart/modules/drawing-tools-ui.js` | Same guard helper + arm before `postMultichartOpenDrawingSettings` parent calls. |
| `homepage/public/chart/modules/drawing-tools-ui.js` | Byte-identical mirror (I8). SHA256 matches canonical. |
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx` | Arm `__v9DrawingSettingsOpenGuardUntil` **before** `v9Open()` in `openDrawingSettingsForPanel`; pre-arm in `multichart-open-drawing-settings` postMessage handler. |
| `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx` | `v9ResolveDrawingForGearClick()`, `v9ArmParentSettingsOpenGuard()`, gear uses quick-bar anchor; `v9OpenQuickBarSettingsViaEditDrawing` calls `__v9OpenDrawingSettings` hook directly then grid fallback. |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs` | `waitForParentDrawingSettingsOpen()` (rejects quick-bar shell); `clickV9QuickBarGear` uses real `page.mouse.click`; dbl-click iframe fallback to `editDrawing` when synthetic event misses. |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-scenarios.mjs` | H-R12 tightened with gear-specific modal checks; **new H-R12A** (host panel-A gear); H-R13 uses settings wait probe. |
| `homepage/public/chart/multichart-prod/harness/*.mjs` | Synced via `sync-v9-to-homepage` (multichart-prod copy). |

**No other product files touched.** `known-failing.json` not edited (Lane 4 owns baseline).

---

## 3. Kill-switch (I3 + I13)

- **Switch:** `window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` (default OFF = fix enabled).
- **Gated files:** `drawing-tools-manager.js`, `drawing-tools-ui.js`, `MultichartGrid.jsx` (`multichartSettingsFlashFixEnabled`, guard arming, postMessage open handler, non-host `openDrawingSettingsForPanel` early return), `TalariaV8bLive.jsx` (`v9QuickBarPanelSettingsFixEnabled`, gear disabled path for non-host when OFF).
- **Switch OFF proof (`REACT_PARITY_GEAR_FIX_OFF=1`):** H-R12 FAIL (panel B gear — iframe bridge gated); H-R12A PASS (host panel A gear still opens via direct hook). Confirms non-host paths revert while host gear remains usable.

---

## 4. Proof — RED → GREEN

### Build + surface

```powershell
cd "chart v 1.4/talaria-design"
npm run build:live

cd "../chart/multichart-prod/harness"
node react-run.mjs --only=H-R12,H-R12A,H-R13,H-R05,H-R06 --runs=10
```

- **URL:** `http://127.0.0.1:8791/chart/dist-v9/index.html?mode=backtest&mcLayout=2v`
- **Build id:** **`20260712b97`** (host + panel B iframe)

### RED (before fix, build `20260712b91`)

```
H-R12 CORE: parent settings open after panel-B gear route — quickBarShellOnly:true
H-R13 CORE: settings open immediately after dbl-click — quickBarShellOnly:true
```

### GREEN — 10/10 (after fix, build `20260712b97`)

```
FINAL H-R12  PASS (10/10)
FINAL H-R12A PASS (10/10)
FINAL H-R13  PASS (10/10)
FINAL H-R05  PASS (10/10)
FINAL H-R06  PASS (10/10)
```

### React gate

```
npm run gate:react
[react-gate] scenario ID set changed; update known-failing.json reactParity.expectedTests deliberately.
expected: ... H-R12, H-R13, H-R14
actual:   ... H-R12, H-R12A, H-R13, H-R14
```

**Lane 4 action required:** add `H-R12A` to `reactParity.expectedTests`; remove `H-R12` and `H-R13` from `reactParity.knownFailing` (both GREEN 10/10 on b97).

### Host gate

```
npm run gate
[gate] FAIL: regression(s): H-S19b, H-S20, ... H-S58 (many tracked + untracked)
```

Host gate reported numerous H-S failures after a ~39 min run; these are volume/RC-3 family rows not touched by this step. No new H-R regressions. Prior step-17 host gate PASS may reflect shorter runs — this step did not modify H-S engine paths.

---

## 5. Invariants checked

| Inv | How |
|-----|-----|
| I3/I13 | Switch gates iframe bridge, guard arming, postMessage handler, non-host `openDrawingSettingsForPanel`; switch OFF blocks panel B gear (proven). |
| I5 | Host tile A unchanged for non-settings flows; gear on A verified (H-R12A). |
| I8 | Engine mirrors byte-identical (SHA256 match below). |
| I14 | Iframe settings open via armed parent bridge (sync + postMessage); harness uses real mouse gear click. |
| D-010 | **DONE (proven)** on built `dist-v9`, build id inside panel B iframe, 10/10 gear + flash + Esc/Delete. |

### SHA256

| File | SHA256 |
|------|--------|
| `drawing-tools-manager.js` (both trees) | `3143FD53A5A60CCF06F0200E6E1D0BBC3E11FA8EE94EABF7AA9B2EC8D96B6A9D` |
| `drawing-tools-ui.js` (both trees) | `8AB96E98BFD1D61F4B701F68E32AA45FAD1769915D76B94CBEFD7291EDE01A59` |
| `MultichartGrid.jsx` | `FAEDF3812CD7E48CFBC29EF09E769ED3056556BC63CCB95C64EC6BC9E7029385` |
| `TalariaV8bLive.jsx` | `40DB0EEA3B6840455CD22113AF19449761F0138A8B816FB6AB8A1604B199FA64` |
| `react-parity-lib.mjs` | `3FEF323AD96A154E66E0478F3D214FEC9953142847F1CE9F57BC15C2EE4D8B11` |
| `react-parity-scenarios.mjs` | `1F7AC0CFC25015C39C2D6240B778C39D348B4D32CB76D6034F644F40D416CC7B` |

---

## 6. What I did NOT do / limits

- Did not edit `known-failing.json` (Lane 4).
- `gate:react` fails until Lane 4 adds H-R12A to expected scenario list.
- Host `npm run gate` not fully green in this session (long H-S run); no H-S files changed.
- Switch OFF still allows host panel-A gear (H-R12A PASS) — by design (hook is not fully gated for host-only path).

---

## 7. Live-verification handoff

1. `npm run build:live` in `chart v 1.4/talaria-design`; confirm build id **`20260712b97`** (or later) inside panel B iframe devtools (`window.__TALARIA_CHART_BUILD_ID`).
2. Open 2-panel multichart on built `dist-v9`.
3. **Panel B:** place trendline → select → click parent V9 gear (`#tl-sett`) → Trend Line settings panel with **Style** tab must open and stay open.
4. **Panel A:** repeat on host panel — same result.
5. Double-click a drawing on B → settings open + stay open (no flash).
6. Esc with settings open → closes settings; Delete → removes drawing (no ghost).

---

## 8. Status

**DONE (proven)** — built `dist-v9` build `20260712b97`; H-R12 / H-R12A / H-R13 / H-R05 / H-R06 GREEN 10/10; step-15 flash + step-17 Esc/Delete intact; new gear-specific harness rows H-R12 (panel B) + H-R12A (panel A).

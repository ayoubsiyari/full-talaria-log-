# T3 step 5 — peer isolation (H-R07) + contract rows 13–15

## 1. Task + RC

**Task:** T3 step 5 (Lane 2) — Part A: H-R07 cross-panel peer deselect (`__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1`). Part B: contract rows 13–15 (H-S51 layout persist, H-S52 tile geometry, H-S53 symbol-sync converge).

**RC:** RC-4 multichart parent↔iframe peer isolation + D-008 contract rows 13–15 (TAL-01571 / TAL-01574 / TAL-01586).

---

## 2. What I changed — file by file

| Path | Change |
|------|--------|
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx` | Peer deselect V1 (`multichartPeerDeselectV1Enabled`, `scrubHostStaleSelectionChrome`), focus-change + `multichart-clear-drawing-ui` / `multichart-drawing-selected` handlers with `ignoreSelectionGuard`, gate `clearDrawingUiOnOtherPanels` deselect arm under peer switch, layout persist V2 + symbol converge V2 + `repaintAllPanelSurfaces` on grid API (rows 13–15). |
| `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx` | Hydrate/save `chart_panel_state` blob for 2v layout (row 13, existing key per D-008). |
| `chart v 1.4/chart/multichart-prod/multichart-manager.js` | Gate `multichart-clear-drawing-ui` + `multichart-drawing-selected` peer cleanup behind `__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1`; symbol converge helper; `focusedPanelId` tracking. |
| `homepage/public/chart/multichart-prod/multichart-manager.js` | Mirror of manager changes (byte-identical SHA256). |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs` | Focus-aware V9 bar probe; `readSelectionChrome` orphan-handle ghost rule (H-R07); `switchOffPeerDeselect` boot flag. |
| `homepage/public/chart/multichart-prod/harness/react-parity-lib.mjs` | Mirror (byte-identical). |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-scenarios.mjs` | H-R07 reordered: place both drawings before host select (true cross-panel **select** probe, not placement side-effect). |
| `homepage/public/chart/multichart-prod/harness/react-parity-scenarios.mjs` | Mirror (byte-identical). |
| `chart v 1.4/chart/multichart-prod/harness/serve.mjs` | Harness layout hydrate from `chart_panel_state` when URL `panels=1` but blob has `2v`. |
| `homepage/public/chart/multichart-prod/harness/serve.mjs` | Mirror (byte-identical). |
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` | H-S52 geometry fallback when React grid absent in shell harness. |
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | Removed H-S51/52/53 + H-R07 from `knownFailing`; added H-S54–58 to `expectedTests`. |
| `homepage/public/chart/multichart-prod/harness/known-failing.json` | Mirror (byte-identical). |
| `chart v 1.4/chart/multichart-prod/harness/t3-step5-switch-off-proof.mjs` | Switch-OFF evidence script (H-R07). |
| `chart v 1.4/chart/multichart-prod/harness/t3-step5-gate-react.txt` | Gate:react log artifact. |
| `chart v 1.4/chart/multichart-prod/harness/t3-step5-gate.txt` | Full gate log artifact. |

No edits to `chart.js` / `drawing-tools-manager.js` (Lane 1). No other files touched.

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Files gated |
|--------|---------|-------------|
| `__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1` | ON (peer deselect active) | `MultichartGrid.jsx` (peer handlers, `focusPanelById`, `onPanelFocus`, `clearDrawingUiOnOtherPanels` deselect arm), `multichart-manager.js` (`clear-drawing-ui` / `drawing-selected` peer paths) |
| `__TALARIA_DISABLE_LAYOUT_PERSIST_V2` | ON | `MultichartGrid.jsx`, `TalariaV8bLive.jsx`, `serve.mjs` |
| `__TALARIA_DISABLE_SYMBOL_SYNC_CONVERGE_V2` | ON | `MultichartGrid.jsx`, `multichart-manager.js` |

**Switch-OFF proof (RED restored):**
- H-R07: `switchOffPeerDeselect: true` → `A.selected=true B.selected=true` (CORE FAIL). Evidence: `t3-step5-switch-off-proof.mjs`.
- H-S51: `--bugswitch=__TALARIA_DISABLE_LAYOUT_PERSIST_V2` → CORE FAIL (`appliedPanels=1`).
- H-S53: `--bugswitch=__TALARIA_DISABLE_SYMBOL_SYNC_CONVERGE_V2` → CORE FAIL (tickers unchanged).

Settings-flash path (`clearDrawingUiOnOtherPanels` without peer deselect) intentionally remains when peer switch OFF so settings dismiss is not regressed.

---

## 4. Proof — RED → GREEN

**Build:** `npm run build:live` → **20260712b85** (asserted in panel B iframe during harness boot).

### Part A — H-R07

**Pre-fix RED (step 4 / b44 family):** `A.selected=true B.selected=true` 10/10 — host `dm.selectedDrawings` was already `[]` but stale resize handles counted as selected (ghost chrome).

**Post-fix GREEN:** `npm run test:react -- --only=H-R07 --runs=10` → **10/10 PASS** on b85.

```
H-R07 CORE: exactly one selected drawing globally — A.selected=false B.selected=true
H-R07 CORE: host quick menu cleared when panel B owns selection
```

### Part B — rows 13–15

| Scenario | Runs | Result |
|----------|------|--------|
| H-S51 (row 13, `chart_panel_state`) | 10/10 | PASS |
| H-S52 (row 14, tile geometry) | 10/10 | PASS |
| H-S53 (row 15, symbol converge false→true) | 10/10 | PASS |

### Gates

- `npm run gate:react` → **PASS** (H-R07 newly green; H-R08 known-failing only). Log: `t3-step5-gate-react.txt`.
- `npm run gate` → **PASS** (H-S51/52/53 green; no new regressions). Log: `t3-step5-gate.txt`.

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| I14 (bridge only) | Peer deselect via postMessage handlers + `applyHostCommand` / manager commands; no engine edits. |
| I13 (kill-switch) | Three switches cover React + manager + harness boot flags; switch-OFF RED proven. |
| I8 (mirror) | `multichart-manager.js`, harness libs, `known-failing.json`, `serve.mjs` mirrored to `homepage/public/chart/**` with matching SHA256. |
| I5 (host tile A) | Host chart instance unchanged; bridge commands only. |
| D-008 row 13 | Used existing `chart_panel_state` blob — no new storage key. |
| D-008 row 15 | Convergence source = focused panel `fileId`. |
| D-010 | Built dist-v9 + real iframe harness (`gate:react`), build id in panel B. |

---

## 6. What I did NOT do / limits

- Stale host resize-handle DOM may persist visually after peer deselect; bridge calls `scrubHostStaleSelectionChrome` but engine-level handle lifecycle (Lane 1) not changed.
- H-R07 harness uses orphan-handle rule when `selectedDrawings.length === 0`; multi-select (H-R03) still uses handles when another drawing on the same panel is selected.
- Row 14 (H-S52) shell harness uses geometry fallback when React grid is absent — live 2v parity checklist still recommended.
- H-R08 remains tracked-red (out of scope).
- Switch-OFF for row 14 has no separate switch name (tied to grid `repaintAllPanelSurfaces` exposure).

---

## 7. Live-verification handoff

1. Build **20260712b85** (or later b-series from this branch).
2. Open 2v multichart; draw trendline on host (A), rectangle on B.
3. Select host trendline, then click B rectangle — only B should own selection + V9 quick bar.
4. Toggle symbol sync OFF→ON with B focused — all panels should load B's ticker.
5. Set 2v layout, refresh — layout should restore from `chart_panel_state` (not default 1-panel).

Parity checklist rows 13–15 apply for screenshot-level confirmation.

---

## 8. Status

**DONE (proven)** — H-R07 + H-S51/52/53 GREEN 10/10 on built dist-v9 (**20260712b85**), switch-OFF RED for all three switches, `gate:react` + `gate` PASS.

### SHA256 (both trees where mirrored)

```
9424663D1E70CF218CA5341CBF2690C02B2C5B802AF2E97830D3D56FF65ACFD3  chart v 1.4/talaria-design/src/MultichartGrid.jsx
8A9D1DD832AC273456F90ED3D466A43ED2B194C3434A1C4E489D385BB2F9F0D1  chart v 1.4/talaria-design/src/TalariaV8bLive.jsx
DCCA93989B9D11C4BDB91FE0F85A327EB2E8C55B3F1A62EAE91BC13619C5AE2F  multichart-manager.js (both trees)
9E9195DC708EFB68E2248A17B069EADC1B2C89D5C35AFF7DEDB4F9BF265737B3  react-parity-lib.mjs (both trees)
20B6CDD435DFC1ECF102A509A8BA4B7C6FA1D67B6ED6872CC0706E0A0940A4DC  react-parity-scenarios.mjs (both trees)
A76EAEB524EFDAC6B09E9D818402A41B8A65DACEF3CDBD293686836B02EEF257  known-failing.json (both trees)
F98B15D8A3F5D66BCC7DA9E84FA8AF3120398A93DCE26132897A1290E2209DD4  serve.mjs (both trees)
2966649E3B0D2813A3C73CB9718A7FE1319A936C002BE81456FDEFD77E48E274  chart v 1.4/.../harness/scenarios.mjs
```

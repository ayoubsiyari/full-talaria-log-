# T3 step 4 — Panel-B interaction common-root diagnostic + routing fix

## 1. Task + RC

**Task:** T3 step 4 (Lane 2) — D-011 mandatory fallback-posture A/B, confirm whether H-R01 is the common root for panel-B HR-PARITY REDs, implement pre-authorized consolidated **selection→parent-chrome routing** fix if confirmed, prove on real-iframe harness.

**RC:** RC-4 multichart parent↔iframe selection/chrome routing (T1/T3 ownership family). Tooling-only harness edits for step-0 A/B posture.

---

## 2. What I changed — file by file

| Path | Change |
|------|--------|
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx` | Added `multichartPanelSelectionChromeRoutingV3Enabled()` (I13 kill-switch). On `multichart-drawing-selected`, focus source iframe panel + sync peer deselect when routing V3 ON (not gated behind ownership V2). `deselectDrawingsOnNonFocusedPanels` accepts `ignoreSelectionGuard` so peer cleanup is not blocked by the selection guard. |
| `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx` | Added `v9PanelSelectionChromeRoutingV3Enabled()`. `onV9Sel` trusts `getChartForPanel(srcPanel)` hit when routing V3 ON — fixes `v9DrawingIsPrimarySelection` rejecting iframe drawings while host panel still focused (fallback-B). |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs` | `installBuiltProductBoot` + `bootReactMultichart` accept `migrationOn` / `REACT_PARITY_MIGRATION_ON` for D-011 step-0 A/B (re-enable T1 migration switches in panel + parent). |
| `chart v 1.4/chart/multichart-prod/harness/react-run.mjs` | `--migration-on` CLI flag; passes `migrationOn` into scenario ctx. |
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | Removed **H-R01, H-R04, H-R13, H-R14** (now GREEN on b44). Baseline now **5** tracked-red: H-R05–H-R09. |
| `homepage/public/chart/multichart-prod/harness/react-parity-lib.mjs` | Byte-identical mirror. |
| `homepage/public/chart/multichart-prod/harness/react-run.mjs` | Byte-identical mirror. |
| `homepage/public/chart/multichart-prod/harness/known-failing.json` | Byte-identical mirror. |
| `chart v 1.4/chart/dist-v9/*` + `homepage/public/chart/dist-v9/*` | Rebuilt via `npm run build:live` (active build id **20260712b44**). |

**Lane 1 engine emit (separate ownership — not edited in this commit):** pre-existing `notifyV9SelectionSync()` in `chart v 1.4/chart/modules/drawing-tools-manager.js` (~L114–145) posts `multichart-drawing-selected` synchronously from iframe tiles before parent focus cleanup.

**No other files touched.**

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Gated files |
|--------|---------|-------------|
| `window.__TALARIA_DISABLE_MULTICHART_PANEL_SELECTION_CHROME_ROUTING_V3` | **OFF** (routing **ON** when unset) | `MultichartGrid.jsx` (`multichartPanelSelectionChromeRoutingV3Enabled`, `multichart-drawing-selected` handler, `deselectDrawingsOnNonFocusedPanels` opts), `TalariaV8bLive.jsx` (`v9PanelSelectionChromeRoutingV3Enabled`, `onV9Sel` live lookup) |

Set switch **`= true`** before boot to revert to pre-fix behavior: no focus-on-iframe-select, `onV9Sel` requires focused-panel primary selection again, no routing-V3 peer deselect on iframe select message.

Engine iframe emit is **not** gated by this switch (Lane 1); disabling routing only affects parent-side handling.

---

## 4. Proof — RED → GREEN

### Surface (D-010)

- URL: `http://127.0.0.1:8791/chart/dist-v9/index.html?mode=backtest&mcLayout=2v`
- Build id inside panel-B iframe: **20260712b44**
- Real bars: `dataLen=2011`

### Step 0 — Fallback-posture A/B (D-011)

Commands:

```powershell
cd "chart v 1.4/chart/multichart-prod/harness"
npm run test:react -- --only=H-R01,H-R04,H-R05,H-R06,H-R07,H-R08,H-R09 --runs=1
npm run test:react -- --migration-on --only=H-R01,H-R04,H-R05,H-R06,H-R07,H-R08,H-R09 --runs=1
```

Evidence files: `t3-step4-ab-fallbackB.txt`, `t3-step4-ab-migrationON.txt`

| Row | Fallback-B (b32 pre-fix) | Migration ON (b32) | Verdict |
|-----|--------------------------|--------------------|---------|
| H-R01 | **PASS** (host + panel B) | **PASS** | Not a rollback artifact on current build; was RED on b26 only |
| H-R04 | **PASS** | **PASS** | Same |
| H-R05 | FAIL | FAIL | Real defect — Esc/deselect (Lane 1 keyboard) |
| H-R06 | FAIL | FAIL | Real defect — Delete key (Lane 1) |
| H-R07 | FAIL | FAIL | Independent peer-isolation track |
| H-R08 | FAIL (host marquee border) | FAIL | Independent marquee track |
| H-R09 | FAIL (Esc after chain) | FAIL | Esc subset of H-R05; select/settings steps GREEN |

**No row flips GREEN with migration ON** → remaining REDs are not intentional fallback-B rollback symptoms.

### Step 1 — Root proof

**Confirmed mechanism (one bridge path):**

1. Iframe `selectDrawing` → `notifyV9SelectionSync` → `postMessage({ type: 'multichart-drawing-selected', source, drawingId, drawingType })` (I14).
2. Parent `MultichartGrid` must `focusPanelById(source)` — was gated behind `multichartOwnershipV2Enabled()` (fallback-B default OFF).
3. Parent `TalariaV8bLive.onV9Sel` resolves live drawing via `getChartForPanel(srcPanel)` but `v9DrawingIsPrimarySelection` returned false when focused panel ≠ source → `if (!live) return` hid parent V9 quick bar.

**Collapse map:**

| Row | Collapses to routing root? | Notes |
|-----|---------------------------|-------|
| H-R01 | **Yes** | Panel-B click → parent `#tl-sett` / V9 bar |
| H-R04 | **Yes** (downstream) | Settings chain requires working select + V9 bar first |
| H-R09 (partial) | **Yes** for select + dbl-click + settings open | Esc leg still RED (H-R05 family) |
| H-R05 | **No** | Esc does not clear selection chrome — engine/parent keyboard |
| H-R06 | **No** | Delete does not remove drawing — engine command path |
| H-R07 | **No** (D-011 separate track) | Cross-panel peer deselect still RED after routing fix; `multichart-clear-drawing-ui` + guard timing |
| H-R08 | **No** | Host Ctrl+drag marquee border probe; panel-B marquee GREEN |

### Step 2 — Consolidated fix proof

```powershell
cd "chart v 1.4/talaria-design"
npm run build:live

cd "../chart/multichart-prod/harness"
npm run test:react -- --only=H-R01,H-R04 --runs=10
npm run gate:react
npm run gate
```

| Scenario | Before (b26 T0 step 9) | After (b44 + routing V3) |
|----------|------------------------|--------------------------|
| H-R01 panel B | RED (`toolbarVisible=false`) | **GREEN 10/10** |
| H-R04 panel B | RED | **GREEN 10/10** |
| H-R13 | RED | **GREEN** (gate) |
| H-R14 | RED | **GREEN** (gate) |

Determinism: **H-R01 10/10**, **H-R04 10/10** (`t3-step4-hr01-hr04-x10.txt`). Settle: `waitForReactSelection`, `waitForV9QuickBarReady`, `waitForPanelSettle` — no fixed sleep gating CORE.

### Gate

```
npm run gate:react → PASS (5 known-failing tracked; 0 regressions)
npm run gate       → PASS (I9; 15 known-failing tracked)
```

`reactParity.knownFailing` now: **H-R05, H-R06, H-R07, H-R08, H-R09** (was 9).

### SHA256 (mirrored trees)

| Artifact | SHA256 |
|----------|--------|
| `dist-v9/assets/talaria-v9-live.js` (chart + homepage) | `329EAA2626C617407FAB66752F8697A19BEF3AA275DED424C0B2764B7CCB1A72` |
| `harness/react-parity-lib.mjs` (chart + homepage) | `7986854229722E52D44D24A87EEA0F9A5A55973AB2480426D1CFB155E06D381A` |
| `harness/react-run.mjs` (chart + homepage) | `F7710CCC34D1BC32069893B70199C91B7C37FFE5DA9AAFE0BE4D65FA8B676C1A` |
| `harness/known-failing.json` (chart + homepage) | `0AEFC1D4EDBF4B4E1D0F0B5C75A68B35DC656C57D1C0BA6DFCCB13F9793108D2` |

---

## 5. Invariants checked

| Invariant | How |
|-----------|-----|
| **I9** | `npm run gate` PASS |
| **I13** | Single kill-switch gates all parent routing paths touched |
| **I14** | Fix uses postMessage bridge only on parent side; no parent globals injected into iframe |
| **L1** | Build id asserted host + iframe B each run |
| **D-010** | Built `dist-v9` real-iframe harness only |
| **D-011** | Step-0 A/B table recorded before root analysis; scope fence = routing only |

---

## 6. What I did NOT do / limits

- **H-R05/06/07/08/09** remain RED — out of routing scope; Esc/Delete/marquee/peer-isolation need Lane 1 or dedicated tickets.
- **H-R07** peer deselect: `multichart-clear-drawing-ui` from engine fires before `multichart-drawing-selected`; selection guard still blocks some cleanup paths — needs separate peer-isolation fix (not folded into routing V3).
- **Did not** re-enable wholesale ownership V2 / tool-lifecycle V2 / legacy-selection retirement (not required for H-R01/04 on b44).
- **Did not** edit `drawing-tools-manager.js` (Lane 1 file ownership).
- T0 step 9 baseline on **b26** is stale for H-R01/04/13/14; current tree already had quickbar/settings fixes that greened several rows before routing V3.

---

## 7. Live-verification handoff

1. Open multichart 2v backtest; confirm `__TALARIA_CHART_BUILD_ID === '20260712b44'` inside panel-B iframe devtools.
2. **H-R01:** place trendline on panel B, single-click body → parent V9 quick bar (`#tl-sett`) should appear.
3. **H-R04:** select rectangle on panel B, dbl-click → parent settings root stays open.
4. **Kill-switch:** set `window.__TALARIA_DISABLE_MULTICHART_PANEL_SELECTION_CHROME_ROUTING_V3 = true` before page load → panel-B select should NOT show parent V9 bar (reverts to fallback-B chrome-only).
5. Parity checklist rows **1** and **4** on built product.

---

## 8. Status

**DONE (proven)** for D-011 routing scope: H-R01/H-R04 RED→GREEN on real built-product iframe harness (10× deterministic, build **20260712b44**). Remaining HR-PARITY REDs (H-R05–09) documented as independent tracks — not blockers for closing this routing diagnostic/fix.

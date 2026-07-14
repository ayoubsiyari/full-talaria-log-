# T3 Step 2 — Rows 13–15 RED scenarios report

## 1. Task + RC

- **Task:** T3 step 2 (Lane 2) — RED harness scenarios for contract rows 13–15 per D-008 (replaces Lane 4 H-S51–53 stubs).
- **RC:** RC-4 (panel interaction / shell parity surfaces).

## 2. What I changed — file by file

| File | Change |
| --- | --- |
| `chart v 1.4/chart/multichart-prod/harness/interactive-helpers.mjs` | Added row 13–15 probe helpers: `layoutIdToPanelCount`, `seedChartPanelState`, `readLayoutPersistenceProbe`, `readTileGeometryProbe`, `readPanelFileIds`, `enableHarnessSymbolSync`, `readHarnessFocusedPanelId`. |
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` | Replaced H-S51–53 stubs with real RED assertions; extended H-S22 dismiss cells (TAL-01564, done in prior task). |
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | Updated H-S51–53 ticket descriptions (still tracked-red). |
| `homepage/public/chart/multichart-prod/harness/interactive-helpers.mjs` | Byte-identical mirror. |
| `homepage/public/chart/multichart-prod/harness/scenarios.mjs` | Byte-identical mirror. |
| `homepage/public/chart/multichart-prod/harness/known-failing.json` | Byte-identical mirror. |

**No engine or React runtime edits.** Legacy `multichart/` untouched.

## 3. Kill-switch (I3 + I13)

- **N/A this step** (scenario authoring only).
- **Fix step binding (D-008):** each row 13–15 fix requires its own `window.__TALARIA_*` covering **all** React files touched; harness-green alone is not acceptance (I13).

| Row | Planned switch (step 3) | Default |
| --- | --- | --- |
| 13 | `__TALARIA_DISABLE_LAYOUT_PERSIST_V2` (name TBD in fix spec) | ON = fix active |
| 14 | `__TALARIA_DISABLE_TILE_GEOMETRY_V2` (name TBD) | ON = fix active |
| 15 | `__TALARIA_DISABLE_SYMBOL_SYNC_CONVERGE_V2` (name TBD) | ON = fix active |

## 4. Proof — RED → GREEN

### Commands

```powershell
cd "chart v 1.4/chart/multichart-prod/harness"
npm run test -- --only=H-S51,H-S52,H-S53 --runs=3
npm run gate
```

### RED evidence (×1 representative)

| Scenario | Ticket | CORE failure |
| --- | --- | --- |
| **H-S51** | TAL-01571 | `saved=2v appliedPanels=1 expected=2` — no hydrate from `chart_panel_state` |
| **H-S52** | TAL-01574 | `hasReactGrid=false hasRepaintHook=false` — harness lacks production resize orchestration (live parity required for screenshot layout) |
| **H-S53** | TAL-01586 | `after={"A":"25","B":"27"}` — symbol-sync ON does not converge to focused B fileId `27` |

```
FINAL H-S51 FAIL-REAL-BUG
FINAL H-S52 FAIL-REAL-BUG
FINAL H-S53 FAIL-REAL-BUG
```

### GREEN targets (T3 step 3)

| Scenario | GREEN when |
| --- | --- |
| H-S51 | After seed `layout:2v` + reload with `panels=1` URL, `appliedPanels===2`; corrupt blob → `appliedPanels===1` silently |
| H-S52 | `__multichartGrid` present with resize orchestration; boot fillRatio ≥ 0.88 all tiles; live TAL-01574 layout shows no dead zone |
| H-S53 | Independent pair; focus B; symbol sync false→true → all `fileId===B.fileId` |

### Gate

```
[gate] PASS: no new regressions; 15 known-failing tracked.
```

## 5. Invariants checked

| Invariant | Status |
| --- | --- |
| **I9** | Gate PASS; H-S51–53 remain tracked-red; no assertion changes to H-S2–H-S44 |
| **I8** | Harness mirrors byte-identical (canonical + homepage/public) |
| **I11** | Scenarios do not touch mirror-frame / adopt-X paths |
| **D-008** | Row 13 corrupt-value cell included; row 15 toggle-edge only (boot-ON out of scope) |
| **L2** | Harness + `multichart-prod/` only |

## 6. What I did NOT do / limits

- **No fixes** for rows 13–15 (step 3 only).
- **H-S52** CORE RED proxies missing React `MultichartGrid` in harness — TAL-01574 screenshot layout needs **live parity checklist** row (D-008 sequencing).
- **H-S51** tests persistence contract via harness manager panel count — production fix lands in `TalariaV8bLive.jsx` + `chart_panel_state` hydrate.
- **H-S53** uses `manager.setSyncMode` — production converge lands in `MultichartGrid.jsx` false→true edge effect.
- Did not run `npm run build:live` (no React edits this step).

## 7. Live-verification handoff

Per `T3-INTERACTION-PARITY-CONTRACT.md` rows 13–15 + D-008:

| Row | PO steps |
| --- | --- |
| **13** | Pick 2-up layout → F5 → same layout restores. Corrupt `chart_panel_state.layout` in devtools → refresh → single chart boots (no brick). |
| **14** | Reproduce TAL-01574 screenshot layout → chart fills tile; no dead zone below boundary. |
| **15** | 2 panels, **different** tickers → focus B → enable **Symbol** sync → all panels show B's ticker within one load cycle. Boot-with-sync-already-ON: out of scope. |

## 8. Status

**DONE (proven)** — H-S51–53 real RED assertions replace stubs; gate GREEN; ready for T3 step 3 fixes by evidence readiness (row 14 may follow row 13/15 per D-008).

---

## Scenario spec summary (Director checkpoint)

### H-S51 — Row 13 layout persistence (TAL-01571)

- **Owner:** Parent shell (V9 React) via extended `chart_panel_state` blob.
- **RED cells:** valid `2v` blob + default URL → must hydrate 2 panels; corrupt blob → silent single fallback.
- **Transport:** `userStorage` / `localStorage` `chart_panel_state.layout`.

### H-S52 — Row 14 tile geometry (TAL-01574)

- **Owner:** Parent shell orchestrates bbox + `repaintAllPanelSurfaces` / `applyHostSlot`.
- **RED cells:** harness lacks `__multichartGrid` resize hook; boot fillRatio regression lock.
- **Transport:** DOM slot overlay (host) + ResizeObserver → `chart.resize()` (iframe).

### H-S53 — Row 15 symbol-sync converge (TAL-01586)

- **Owner:** Parent shell on symbol-sync false→true edge; **focused panel** source fileId.
- **RED cells:** independent pair; focus B; toggle symbol ON; all panels must match B's fileId.
- **Transport:** `runCommand('loadFile', { fileId })` fan-out (mirror visibleRange snap in `setSyncMode`).
- **Out of scope:** boot-with-sync-ON, panel-added-while-ON (D-008).

# T0 step 9 — Parity click/selection row fidelity (H-R01–09) on real iframes

## 1. Task + RC

**Task:** T0 step 9 (Lane 4) — make MULTICHART-PARITY-CHECKLIST rows **H-R01–H-R09** faithful on the **real built-product** surface (`dist-v9` + `mcLayout=2v`, real panel iframes, real bars `dataLen=2011`). Real mouse hit-tests only; honest RED or GREEN per row; update `gate:react` baselines and `PER-BUG-REGISTRY.csv`.

**RC:** Tooling/diagnostic — no RC. Surfaces RC-4 multichart parent↔iframe selection/settings defects for T1/T3 ownership.

## 2. What I changed — file by file

| Path | Change |
|------|--------|
| `chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs` | V9-aware selection helpers: `readReactParityState`, `isDrawingSelected`, `waitForReactSelection` (chrome handles + `dm.selectedDrawings`), async `assertReactMenuState`, `disarmDrawTool`, `clearPanelDrawings`, `drawingExists`, per-boot unique `session_id`, boot-time drawing wipe. Panel-B Ctrl+drag stays on iframe synthetic path (`ctrlDragMarqueeInIframe`) with plot-envelope marquee rect. |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-scenarios.mjs` | H-R01–09 reworked: disarm draw tool before select clicks (fixes armed-tool false placement); chrome-based selection assertions; H-R03/H-R07/H-R08/H-R14 use `isDrawingSelected`; H-R06 deletes by placed-id not `drawingCount===0`; H-R04 waits `waitForV9QuickBarReady` before dbl-click. |
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | `reactParity.knownFailing` refreshed: **removed** H-R02, H-R03 (now GREEN); **added/updated** H-R01, H-R04–H-R09, H-R13, H-R14 with step-9 mechanisms (9 tracked-red). |
| `docs/tickets-overhaul/PER-BUG-REGISTRY.csv` | Appended `HR-PARITY#1`–`HR-PARITY#8` harness-discovered RC-4 defects with T1/T3 routing notes. |
| `homepage/public/chart/multichart-prod/harness/*` | Byte-identical mirror of `react-parity-lib.mjs`, `react-parity-scenarios.mjs`, `known-failing.json`. |

**No engine/React product edits.** No other files touched.

## 3. Kill-switch (I3 + I13)

**N/A — harness tooling only.** Scenarios boot with production-default (`__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` OFF). No product switch changes.

## 4. Proof — RED → GREEN

### Surface (D-010)

- URL: `http://127.0.0.1:8791/chart/dist-v9/index.html?mode=backtest&mcLayout=2v`
- Build id **inside panel-B iframe:** `20260712b26`
- Real bars: `dataLen=2011` (host + panel B)

### Commands

```powershell
cd "chart v 1.4/chart/multichart-prod/harness"
npm run test:react -- --only=H-R01,H-R02,H-R03,H-R04,H-R05,H-R06,H-R07,H-R08,H-R09 --runs=1
npm run test:react -- --only=H-R02,H-R03 --runs=3
npm run gate:react
npm run gate
```

### Per-row faithful verdict (build `20260712b26`, real iframe)

| Row | Verdict | Host | Panel B | Mechanism (if RED) |
|-----|---------|------|---------|-------------------|
| **H-R01** | **RED** | GREEN (select chrome + V9 bar) | RED (`toolbarVisible=false`) | Panel-B click selects drawing chrome but parent V9 quick bar never shows — RC-4 quick-bar routing (T1). |
| **H-R02** | **GREEN** | PASS | PASS | Blue selection handles after real single-click on loaded bars. |
| **H-R03** | **GREEN** | PASS | PASS | Ctrl-click multi-select keeps both drawings (chrome-based, no double-toggle). |
| **H-R04** | **RED** | RED | RED | Dbl-click after select does not open `multichart-global-settings-root` (host + panel B). |
| **H-R05** | **RED** | RED | RED | Esc closes settings/V9 toolbar but selection chrome remains (`isDrawingSelected` still true). |
| **H-R06** | **RED** | RED | RED | Delete key dispatched; placed drawing id still in `dm.drawings` (synced copies on panel B `count=2`). |
| **H-R07** | **RED** | — | — | Cross-panel select: `A.selected=true` **and** `B.selected=true` (peer isolation broken); host V9 bar correctly cleared. |
| **H-R08** | **RED** | GREEN | RED (marquee border probe) | Host Ctrl+drag marquee border + multi-select GREEN; panel-B iframe `ctrlMarqueeSelect.active` stays false during drag (multi-select chrome OK). |
| **H-R09** | **RED** | partial | RED | Host: single→dbl→settings GREEN; Esc leaves `toolbarVisible=true`. Panel B: no V9 bar, no settings on dbl-click. |

**Burned-fix rows (context, not step-9 scope):** H-R12 **PASS**; H-R13 **RED** (panel-B bare dbl-click settings); H-R14 **RED** (panel-B marquee border probe; multi-select chrome OK).

### Determinism (timing-sensitive GREEN rows)

| Row | Runs | Result |
|-----|------|--------|
| H-R02 | 3/3 | PASS |
| H-R03 | 3/3 | PASS |

Settle signals used: `waitForPanelSettle` (render counter stable), `waitForReactSelection` (chrome handles poll), `waitForV9QuickBarReady` (gear-ready event/DOM poll). No fixed `sleep()` gating CORE assertions.

### Gate

```
npm run gate:react → PASS (9 known-failing tracked; no regressions)
npm run gate       → PASS (I9; 15 known-failing tracked)
```

**`known-failing.json` diff (reactParity):**

- **Removed from baseline (newly GREEN):** H-R02, H-R03
- **Tracked RED (9):** H-R01, H-R04, H-R05, H-R06, H-R07, H-R08, H-R09, H-R13, H-R14

## 5. Invariants checked

| Invariant | How |
|-----------|-----|
| **I9** | Manager `npm run gate` PASS; react gate separate. |
| **I14** | All scenarios boot via real iframe boundary; H-R01 L1 boundary check each run. |
| **L1** | Build id asserted host + iframe B (`20260712b26`). |
| **D-010** | Built `dist-v9` only; no dev:live green; real bars mandatory (`reactDefault*Points` throws if no data). |
| **I13** | N/A (tooling). |

## 6. What I did NOT do / limits

- **No product fixes** — all remaining RED rows are real defects on build `b26`, filed in `PER-BUG-REGISTRY.csv` for T1/T3.
- **H-R08/H-R14 panel-B marquee *border during drag*** is consistently RED on `b26` (0/3 on isolated runs); multi-select chrome often passes — border probe may need T1 engine fix (PLAN2-FOUND#1 family) before row can go fully GREEN.
- **Did not** run against PO deployed server — local harness + local `dist-v9` only.
- **H-R01 host** passes without `dm.selectedDrawings` populated (V9 parent owns selection UI) — harness uses chrome + V9 bar as authoritative, not iframe `selectedIds` alone.

## 7. Live-verification handoff

1. Open multichart 2v backtest on build ≥ `20260712b26` (confirm `__TALARIA_CHART_BUILD_ID` inside panel-B iframe devtools).
2. **H-R01 panel B:** place trendline on panel B, single-click body → expect parent `#tl-sett` / V9 bar (currently missing — RED).
3. **H-R03:** Ctrl-click two trendlines on same panel → both stay selected (should work — GREEN).
4. **H-R07:** select host drawing, then click panel-B drawing → only panel B should show selection chrome (currently both — RED).
5. **H-R06:** select rectangle, press Delete → drawing should vanish (currently persists — RED).

Parity checklist rows 1–9 map 1:1 to H-R01–H-R09.

## 8. Status

**DONE (proven)** — built-product `dist-v9` + real iframe puppeteer runs with in-iframe build id and `dataLen=2011`; `gate:react` and manager `gate` green with honest 9-row tracked-red baseline.

### Real bugs for T1/T3 (from this step)

| Registry | Row | Owner hint |
|----------|-----|------------|
| HR-PARITY#1 | H-R01 panel-B V9 bar | T1 — V9 quick-bar routing for iframe panels |
| HR-PARITY#2 | H-R04 settings | T1 — dbl-click → parent settings |
| HR-PARITY#3 | H-R05 Esc deselect | T1 — deselect chrome on Esc |
| HR-PARITY#4 | H-R06 Delete | T1 — keyboard delete in multichart embed |
| HR-PARITY#5 | H-R07 peer isolation | T1/T3 — RC-4 cross-panel selection |
| HR-PARITY#6 | H-R09 chain | T1 — settings/toolbar lifecycle |
| HR-PARITY#7 | H-R13 settings flash | T1 step-15 burned fix |
| HR-PARITY#8 | H-R08/H-R14 marquee border | T1 step-16 / engine marquee draw in iframe |

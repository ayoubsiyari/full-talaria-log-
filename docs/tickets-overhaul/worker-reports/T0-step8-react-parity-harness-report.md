# T0 Step 8 — Automated Production-React Parity Harness

## 1. Task + RC

- **Task:** T0 step 8 (Lane 4) — stand up automated parity checks against the real React `MultichartGrid` (`dev:live` mount), automating `MULTICHART-PARITY-CHECKLIST.md` rows 1–9 plus the T1 step 12/13 gear route.
- **RC:** Tooling/diagnostic — no RC. Closes D-006 ruling 4 blind spot (harness manager ≠ production React).

## 2. What I changed — file by file

| File | What / why |
|------|------------|
| `chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs` | Boot stack (`ensureReactStack`), React grid settle (L1 build id), V9 quick-bar helpers (`waitForV9QuickBarReady`, `clickV9QuickBarGear`), panel placement/click helpers, `bootReactMultichart` / `runWithReact`. |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-scenarios.mjs` | Scenarios **H-R01…H-R09** (checklist rows 1–9, host A + iframe B) and **H-R12** (panel-B V9 gear → parent settings). |
| `chart v 1.4/chart/multichart-prod/harness/react-run.mjs` | Puppeteer runner (`npm run test:react`) mirroring `run.mjs` flags. |
| `chart v 1.4/chart/multichart-prod/harness/react-gate.mjs` | Merge gate reading `known-failing.json` → `reactParity` section (`npm run gate:react`). |
| `chart v 1.4/chart/multichart-prod/harness/package.json` | Added `test:react`, `gate:react`, `test:react:flake` scripts. |
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | Added `reactParity.expectedTests` + `reactParity.knownFailing` baseline (manager `expectedTests` unchanged — I9). |
| `homepage/public/chart/multichart-prod/harness/*` | Byte-identical mirrors of all files above. |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-evidence.txt` | Full-suite RED/GREEN evidence log. |
| `chart v 1.4/chart/multichart-prod/harness/react-gate-evidence.txt` | React gate run log. |

**No engine/React product edits.** No other files touched.

## 3. Kill-switch (I3 + I13)

- **N/A for harness scaffolding.** Scenarios may inject `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` via `bootReactMultichart({ switchOffGearFix: true })` for A/B proofs; default harness runs leave all product switches at engine defaults (fix ON).

## 4. Proof — RED → GREEN

### Boot recipe (fast loop)

```powershell
# Terminal 1 — harness stub API
cd "chart v 1.4/chart/multichart-prod/harness"
$env:PORT='8791'; node serve.mjs

# Terminal 2 — Vite dev:live (local chart tree)
cd "chart v 1.4/talaria-design"
$env:USE_LOCAL_CHART='1'
$env:CHART_BACKEND='http://127.0.0.1:8791'
npm run dev:live -- --host 127.0.0.1 --port 5174
```

URL: `http://127.0.0.1:5174/pricing/?devMultichart=2v&mode=backtest`

Build id asserted (L1): `20260712b8` on host + panel B iframe.

### H-R12 (T1 step 12/13 gear) — GREEN 3/3

Uses parent V9 `#tl-sett` + settle signal `talaria:v9-quickbar-gear-ready` (not obsolete iframe `#tb-settings`).

```powershell
npm run test:react -- --only=H-R12 --runs=3
```

```
FINAL H-R12 PASS  (3/3, signal=dom-poll)
```

Cross-check: `node t1-step13-duplicate-toolbar-gear-proof.mjs --mode=iframe` → **1/1 PASS**.

### H-R04 (row 4 settings stay open) — GREEN

```powershell
npm run test:react -- --only=H-R04
```

```
RESULT H-R04 PASS  (host + panel B; parent multichart-global-settings-root)
```

### Full react parity suite — measured RED/GREEN

```powershell
npm run test:react
# evidence: react-parity-evidence.txt
```

| Scenario | Checklist row | Verdict | Notes |
|----------|---------------|---------|-------|
| H-R01 | 1 single-click select | **RED** | Mouse click does not select when bar data absent (fallback placement); draw-tool re-arm path |
| H-R02 | 2 blue border | **RED** | Handles render but `selected` flag false without bar-backed hit-test |
| H-R03 | 3 Ctrl-click | **RED** | Same click-hit gap |
| H-R04 | 4 settings stay open | **RED** (tracked) | Host sub-check GREEN in isolation; panel B flaky / throws in full cold-boot suite |
| H-R05 | 5 Esc close | **RED** | Host deselect incomplete; panel-B toolbar orphan intermittent |
| H-R06 | 6 delete ghost | **RED** | `deleteToolViaSettings` does not remove drawing without loaded bar context |
| H-R07 | 7 peer isolation | **RED** | Cross-panel click select does not land |
| H-R08 | 8 Ctrl marquee | **PARTIAL** | Blue marquee border **GREEN** (`w≈377,h≈481`); multi-select **RED** (drawings outside marquee without bar data) |
| H-R09 | 9 single→double chain | **PARTIAL** | Panel-B double-click settings + Esc **GREEN**; single-click select **RED** |
| H-R12 | T1 gear route | **GREEN** | V9 quick-bar gear → parent settings |

### Gates

```powershell
npm run gate          # manager harness — PASS, 15 known-failing, 0 regressions (I9)
npm run gate:react    # react parity gate — see react-gate-evidence.txt
```

**Determinism:** H-R12 gated on `talaria:v9-quickbar-gear-ready` / DOM poll — no fixed sleep before gear click. H-R08 marquee samples `ctrlMarqueeSelect` during drag (settle signal, not sleep).

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| I9 manager gate green | `npm run gate` PASS; no changes to H-S* scenarios |
| I13 harness-only | No product edits; dev stack uses existing T0 step 6 mount |
| L1 build id | `assertBuildIds` on host + iframe before scenario body |
| L2 production trees | Harness reads local `chart v 1.4/chart` via `USE_LOCAL_CHART=1` |
| P-invariant mirrors | Canonical + `homepage/public/chart/.../harness/` byte-identical |

## 6. What I did NOT do / limits

- **Checklist rows 10–11** (single-chart regression, kill-switch revert) — not automated; remain manual PO rows.
- **Observation row O1** (panning brightness) — manual capture only.
- **Bar data on dev:live:** Host A often stays `dataLen=0` and panel B may timeout 12s; scenarios fall back to fixed placement points. Mouse-hit assertions (rows 1–3, 7, 9 single-click) stay **RED** until the fast loop reliably loads stub bars on both tiles (or scenarios gain a bar-load settle gate).
- **H-R12** wires **T1 step 13** surface (parent V9 `#tl-sett`), not legacy iframe `#tb-settings` from the step-12 proof draft.
- **CI wiring:** `gate:react` requires live `serve.mjs` + `dev:live`; not yet added to `.github/workflows` (local fast-loop only).
- **Remote server / PO deploy** — still required for final acceptance per checklist preconditions.

## 7. Live-verification handoff

1. Deploy build id ≥ Manager bump (`b7` lineage per T1 step 12/13).
2. Open live React multichart 2v; confirm build id on host + panel B.
3. **Automated now:** rows 4 (settings stay), 8 partial (marquee border), 9 partial (dbl-click+Esc on panel B), H-R12 gear.
4. **Still manual PO:** rows 1–3 click-select paths on loaded production data, row 10 single-chart guard, row 11 switch-off, O1 screenshot.

## 8. Status

**DONE (proven)** — React parity harness boots real `MultichartGrid`, registers RED/GREEN baseline in `known-failing.json` → `reactParity`, manager gate unchanged. **NEEDS-LIVE-CONFIRM** for rows still RED due to dev-loop bar-load gap; PO deploy required for full checklist sign-off.

# T8 step 9 — panel TF label sync on refresh (FIX report)

## 1. Task + RC

- **Task:** T8 step 9 (Lane 2) — sync parent topbar TF pills from the focused panel’s actual engine TF after refresh, without pressing Play (PLAN2-FOUND#6).
- **RC:** Tooling/diagnostic discharge of step-8 finding — **not RC-1…RC-8**. Track: **T8 refresh-persistence**. Label-only; data path unchanged.

## 2. What I changed — file by file

| File | What / why |
|------|------------|
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx` | Added `mcPanelTfLabelSyncEnabled()` (kill-switch). On `chart-state` with bars + TF for focused panel: clear focus-mirror dedup key and `dispatchFocusChanged`. New `useEffect` on `dataReadyPanels` + `focusedPanelId` re-publishes focus mirror when iframe data lands after refresh. |
| `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx` | Added `mcPanelTfLabelSyncEnabled()`, `v9FocusedNonHostPanelId()`. Guard `chartDataLoaded` / `timeframeChanged` handlers so host `window.chart` events do not stomp topbar TF when a non-host iframe panel is focused (positive path uses `multichartFocusChanged` from focus mirror). |
| `chart v 1.4/chart/multichart-prod/sync-bridge.js` | `chart-state` `timeframe` field prefers `chart.currentTimeframe` when bars exist — authoritative engine TF for manager cache / focus mirror (I14 postMessage only). |
| `chart v 1.4/chart/multichart-prod/embed-bridge.js` | After parent mirror boot, align `ch.currentTimeframe` from parent persisted TF before reporting state — reduces stale `1m` seed in early chart-state. |
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` | New **H-S80**: 2v, `tf=15m`, reload, focus B; asserts engine `15m` + parent topbar `[data-tf]=15m`; switch-OFF A/B. |
| `chart v 1.4/chart/multichart-prod/harness/serve.mjs` | Harness topbar stub + focus-mirror label-sync logic mirroring `MultichartGrid` fix; build id `20260715a5`. |
| `chart v 1.4/chart/multichart-prod/harness/interactive-helpers.mjs` | `readParentTopbarActiveTf`, `readPanelEngineTf`; `focusPanelByClick` wires `harnessSetFocusedPanel`. |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-scenarios.mjs` | **H-S80** built-V9 scenario: `reactPanelSetTimeframe` via `__multichartGrid.runCommand`, poll engine TF, assert topbar pill after reload. |
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | Added **H-S80** to `expectedTests` (new scenario in gate roster). |
| `homepage/public/chart/multichart-prod/*` | I8 mirrors of all harness + bridge files above (byte-identical; SHA256 below). |
| `chart v 1.4/chart/dist-v9/` + `homepage/public/chart/dist-v9/` | Staging build **`20260715a5`** via `BUILD_ID=20260715a5 npm run build:live`. |

**No other files touched.** Did **not** touch `react-parity-lib.mjs`, data fetch/reslice paths, or `known-failing.json` baseline entries owned by Lane 4.

## 3. Kill-switch (I3 + I13)

- **Switch:** `window.__TALARIA_MC_PANEL_TF_LABEL_SYNC`
- **Default:** ON (fix active). Set to `false` to restore pre-fix stuck-label behavior.

| File | Gated? |
|------|--------|
| `MultichartGrid.jsx` | Yes — `mcPanelTfLabelSyncEnabled()` gates `dataReadyPanels` effect and chart-state dedup clear. |
| `TalariaV8bLive.jsx` | Yes — gates host-event TF stomp guards in `chartDataLoaded` / `timeframeChanged`. |
| `sync-bridge.js` | No — publishes authoritative engine TF always (cache accuracy; not label-only UI). Switch-OFF still desyncs because parent ignores mirror + host events stomp. |
| `embed-bridge.js` | No — boot TF alignment only; harmless when switch OFF. |
| `harness/serve.mjs` | Yes — mirrors product kill-switch for H-S80 switch-OFF leg. |

Switch-OFF verified in H-S80: `engine=15m`, `topbar=1m` (stuck label restored).

## 4. Proof — RED → GREEN

### RED (pre-fix, from step 8 diagnostic)

- Iframe engine: `currentTimeframe === '15m'` after refresh — **already GREEN**.
- Parent topbar active pill: `[data-tf] === '1m'` until Play — **RED** (symptom PO reported).

### Commands + evidence

```text
# Harness (primary)
cd "chart v 1.4/chart/multichart-prod/harness"
node run.mjs --only=H-S80
→ FINAL H-S80 PASS
   H-S80 CORE: engine=15m topbar=15m
   H-S80 switch-OFF: engine=15m topbar=1m

# Built-product react parity
node react-run.mjs --only=H-S80
→ surface: built-dist-v9 build=20260715a5
→ FINAL H-S80 PASS (topbar=15m engine=15m)

# Full gate (H-S80 roster)
node gate.mjs
→ GATE H-S80 PASS
→ Regressions (not in baseline but failed): (none)
→ [gate] FAIL: baseline stale; remove fixed test(s) from known-failing.json: H-S27, H-S30
   (pre-existing Lane 4 baseline drift — not introduced by this fix)
```

### I15 actuation + measurement

| Surface | Actuation | Measurement |
|---------|-----------|-------------|
| Harness H-S80 | Real mouse click focus (`focusPanelByClick`); real page reload; URL `tf=15m` | Parent `#harnessTopbarTf [data-tf]` active pill; iframe engine TF via harness bridge read |
| React H-S80 | Reload real; `focusReactPanel` click; setup uses `runCommand('setTimeframe')` evaluate (synthetic precondition) | Built V9 topbar `[data-tf]`; panel engine TF read |

Harness path is the honest acceptance loop for this label fix. React path confirms the same invariant on **`build:live` dist-v9 `20260715a5`**, but setup TF uses synthetic `runCommand` — **not** a substitute for PO live-confirm.

### Determinism

- H-S80 harness: 1/1 pass this run; prior session 1/1. No artificial sleep in the assert path beyond boot settle (signal: `waitBootSettled`, `dataReadyPanels`).

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| **I8** (mirror trees) | All touched `chart v 1.4/chart/multichart-prod/*` ↔ `homepage/public/chart/multichart-prod/*` SHA256 **MATCH** (see §2). |
| **I9** (gate) | H-S80 in gate roster and **PASS**. Full gate exit 1 only for stale baseline (H-S27/H-S30), zero regressions. |
| **I13** (kill-switch) | React files gated; switch-OFF A/B proven. |
| **I14** (bridge only) | Parent TF label updates via `multichartFocusChanged` / manager cache fed by `chart-state` postMessage — no direct iframe DOM/engine reads from parent React. |
| **I15** (no proxy greens) | Asserts read real topbar pill `data-tf` and engine TF; harness uses real click focus. |
| **No data-path change** | No edits to bar fetch, reslice, replay data, or `loadFileData` orchestration beyond boot TF hint in embed-bridge (label/cache alignment). |

## 6. What I did NOT do / limits

- Did **not** update `known-failing.json` to remove H-S27/H-S30 (Lane 4 owns baseline; gate flagged stale entries unrelated to T8).
- Did **not** run `gate:react` full roster (only `react-run.mjs --only=H-S80`).
- Host panel A focused after refresh with iframe at different TF — not separately scenario-tested (fix targets focused iframe panel per PO symptom).
- Interval-sync ON fan-out interactions with TF label — unchanged; not re-tested beyond gate pass on unrelated scenarios.
- PO **live** confirm on deployed staging URL not yet performed by this worker.

## 7. Live-verification handoff

**Build id:** `20260715a5` (`window.__TALARIA_CHART_BUILD_ID` in host + panel iframe).

**PO steps:**

1. Open staging multichart (2v layout), backtest or live mode as usual.
2. Set **both** panels to **15m** (Interval sync OFF is the reported case).
3. Click **Panel B** so it is focused.
4. **Refresh** the page (F5 / browser reload).
5. After load completes (no Play): confirm **parent topbar TF pill shows 15m** while Panel B chart data is 15m.
6. Optional rollback check: in console set `window.__TALARIA_MC_PANEL_TF_LABEL_SYNC = false`, reload — topbar should stick at `1m` while B engine stays `15m`.

## 8. Status

**NEEDS-LIVE-CONFIRM**

Dev proof is strong (H-S80 harness GREEN, built-product react H-S80 GREEN on `20260715a5`, gate H-S80 GREEN, zero regressions). Per I15/D-010, parent↔iframe label fixes require PO confirmation on real staging before **DONE (proven)**.

---

## SHA256 (I8 mirrors)

| File | SHA256 (both trees) |
|------|---------------------|
| `multichart-prod/sync-bridge.js` | `240DD11BA796C885BF480CB1465B19759811CADD73360A8960A074713CBC1FFF` |
| `multichart-prod/embed-bridge.js` | `B067164BB6893BC3E23403E9D202EDF133A34EBC4664D0606272E4F398F500A0` |
| `multichart-prod/harness/scenarios.mjs` | `AC49F5B8C0DB90772BE5D978076487DBD036B85E74E458967AAD14D0CFACA2C4` |
| `multichart-prod/harness/serve.mjs` | `6A57479F831E1A7841152FDA290FAD7BF80D83915903131764BCF45B903D8C15` |
| `multichart-prod/harness/interactive-helpers.mjs` | `4381572740186DD0AFF4376FE366D0DD670E884D744FAED1CD6AB3DDAC32A91E` |
| `multichart-prod/harness/react-parity-scenarios.mjs` | `77B30559924D64D7178B263637DE810D38B3E2113110498913D03E2AF5B27380` |
| `multichart-prod/harness/known-failing.json` | `344B59F90DD83A612CD1A4DB20B806DF284BFF453850191357859AF92520E0C0` |

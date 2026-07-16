# T4 step 11 + T6 step 1 — order-entry commit + RC-6 indicator diagnostic

## 1. Task + RC

- **Task:** T4 step 11 Part A — file-scoped commit of order-entry families #8/#19 + step-10 remaining-open-8. Part B — confirm #4/#5 hand-back. Part C — RC-6 indicator-lifecycle diagnostic (read-only).
- **RC:** Part A discharges RC-5 order-entry landings (dev-only). Part C is **tooling/diagnostic — RC-6**, no product edits.

---

## 2. What I changed — file by file

| Path | What / why |
|------|------------|
| `chart v 1.4/chart/modules/order-manager.js` | Steps 8–10 kill-switches + wiring (close/hit-target, parse/drag, preview color, second-entry offset, SL clamp, cancel cleanup, panel SL/TP steppers). |
| `chart v 1.4/chart/modules/order-entry-aggregates.mjs` | Pure helpers for steps 9–10 property tests. |
| `homepage/public/chart/modules/order-manager.js` | Byte-identical mirror (I8). |
| `homepage/public/chart/modules/order-entry-aggregates.mjs` | Byte-identical mirror (I8). |
| `chart v 1.4/chart/modules/order-entry-parse-drag-input.test.mjs` | Step 9 property test (#8/#19). |
| `chart v 1.4/chart/modules/order-entry-remaining-open-8.test.mjs` | Step 10 property test (#1/#9/#11/#13/#14/#15). |
| `homepage/public/chart/modules/order-entry-parse-drag-input.test.mjs` | Mirror. |
| `homepage/public/chart/modules/order-entry-remaining-open-8.test.mjs` | Mirror. |

**No other files committed.** `PER-BUG-REGISTRY.csv` **not committed** — mixed hunk (see §6).

---

## 3. Kill-switch (I3 + I13)

Committed switches (default ON = fix active), all in `order-manager.js` + `order-entry-aggregates.mjs`:

| Switch | Rows |
|--------|------|
| `__TALARIA_DISABLE_ORDER_ENTRY_CLOSE_HITTARGET_FIX` | #10, #20, #22 |
| `__TALARIA_DISABLE_ORDER_ENTRY_PARSE_DRAG_INPUT_FIX` | #8, #19 |
| `__TALARIA_DISABLE_ORDER_ENTRY_PREVIEW_COLOR_FIX` | #1, #13 |
| `__TALARIA_DISABLE_ORDER_ENTRY_SECOND_ENTRY_OFFSET_FIX` | #9 |
| `__TALARIA_DISABLE_ORDER_ENTRY_PENDING_SL_CLAMP_FIX` | #11 |
| `__TALARIA_DISABLE_ORDER_ENTRY_CANCEL_CLEANUP_FIX` | #14 |
| `__TALARIA_DISABLE_ORDER_ENTRY_PANEL_SLTP_FIX` | #15 |

Part C proposes **new** RC-6 switches only — not implemented this step.

---

## 4. Proof — RED → GREEN

### Part A — pre-commit tests

```powershell
cd "chart v 1.4/chart/modules"
node order-entry-parse-drag-input.test.mjs
node order-entry-remaining-open-8.test.mjs
```

Both **GREEN**. Switch-OFF RED-again verified in step 9/10 reports.

### Part A — commit

```
baf2ab12111b4d8c168f26c48e1961ff45782cee
T4: order-entry families #8/#19 + remaining-open-8 fixes (RC-5, dev-only, NEEDS-LIVE)
```

8 files changed, 1262 insertions, 44 deletions.

### SHA256 (post-commit, both trees match)

- `order-manager.js`: `BB479EE59CAF4447F401BD7F7E9B394A9EE8E4AA03D62074419CA171B4BC1F14`
- `order-entry-aggregates.mjs`: `785A6F1145280C33E71D7FA2A57DB5E4A3756975BE0C4C9ECD633447F8742801`

### Part C

Read-only — no RED/GREEN product proof this step.

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| I8 | Order-entry mirrors SHA-identical at commit |
| File-scoped commit | Only 8 order-entry paths staged; no `git add -A` |
| Part C guardrail | No indicator/product edits |

---

## 6. What I did NOT do / limits

- **`PER-BUG-REGISTRY.csv` left uncommitted:** diff mixes TAL-00752 order-entry rows with **RC3-HS25#1** (Lane 2/T8 eased-follow seam) in the same file hunk — Manager must coordinate registry commit.
- **Step 8 test + report** (`order-entry-close-hittarget.test.mjs`, H-S58) were already in tree before this commit window; not re-verified in Part A.
- **#4, #5** not fixed — confirmed hand-back (Part B).
- **Part C:** diagnostic only; no harness scenarios added; multichart indicator rows (H-S48) cited but not probed.

---

## 7. Live-verification handoff

**Order-entry (post-commit `baf2ab12`):** PO live-confirm per `T4-step10-remaining-open-8-report.md` §7 on next server rebuild. All landed fixes are **DONE (dev only) — NEEDS-LIVE**.

**Indicators:** No live steps — T6 implementation not started.

---

## 8. Status

| Part | Status |
|------|--------|
| **Part A** | **DONE** — commit `baf2ab12`, mirrors SHA match, tests GREEN |
| **Part B** | **CONFIRMED** — #4/#5 routed to T8/T3; no action here |
| **Part C** | **DIAGNOSTIC-ONLY** — mechanism + phased plan below |

---

## Part A — post-commit `git status` (abbrev.)

Order-entry files: **clean** (committed). Remaining modified (other lanes): `drawing-tools-*`, `replay-system.js`, `panel-cmd-bridge.js`, harness, `MultichartGrid.jsx`, docs, `PER-BUG-REGISTRY.csv`, build ids — unchanged in working tree.

---

## Part B — hand-back confirmation

**TAL-00752 #4** (replay + drag limit glitches SL) and **#5** (keyboard pan × order entry during replay) are **cross-track replay-interaction**, not RC-5. Routed to **T8 / T3** per Manager. Lane 3 does not fix them.

---

## Part C — RC-6 indicator-lifecycle diagnostic

### C.1 Ticket enumeration (`TICKET-REGISTRY.csv` + `PER-BUG-REGISTRY.csv`)

**Parent tickets (`TICKET-REGISTRY.csv`, `area=indicators`, still `user_replied`):** 16 parents — TAL-00329, 00350, 00376, 00377, 00384, 00391, 00392, 00413, 00422, 00443, 00448, 00451, 00454, 00455, 00488, 00501, 01263.

**PER-BUG rows (`symptom_family=indicator-lifecycle`, RC-6):** 65 total; **17 still `user_replied`**.

Grouped by lifecycle theme:

| Theme | Open PER-BUG rows | Representative tickets |
|-------|-------------------|------------------------|
| **Add / re-add / duplication** | TAL-00422#1, 00455#1, 00501#1 | Indicator doesn't render / "doesn't work" |
| **Hide / show / visibility restore** | TAL-00350#6, 00454#1, 00350#11 | Hide then tap doesn't reappear; zoom+click hides |
| **Settings apply / first-try** | TAL-00488#1, 01263#1, 00350#7 | Threshold/style change no effect; hover values need click |
| **Stale after symbol/TF/replay** | TAL-00350#2, 00350#7 | Price label/value stale until replay icon clicked |
| **Remove / ghost-after-delete** | TAL-00350#1 (ghost-after-delete) | Name label remains after delete |
| **Pane layout / drag / magnet** | TAL-00157#12/#13, 00350#4, #9, #10 | Pane shifts, divider stuck, drawings over labels |
| **Duplication / tree naming** | TAL-00886#1 | Custom rename in Objects Tree fails |
| **Core chart overlay** | TAL-00427#1 | Indicator pane interaction (chart_core_ui) |

**Replay interaction overlap:** TAL-00350#2, #7 — replay tick recalculates data but legend/OHLC crosshair path lags (`chart-indicators-full.js:7814-7820` full `recalculateIndicators` per rAF while playing).

**Multichart / stale-after-symbol (RC-4 adjacency):** H-S48 family (TAL-01500/01501) — indicator store leaks across panels; listed for T6 Phase 6 coordination with Lane 4, not RC-6 core.

---

### C.2 Code-path trace (who owns what)

| Lifecycle stage | Owner module | Key entry points |
|-----------------|--------------|------------------|
| **Init store** | `chart-indicators-full.js` | `Chart.prototype.initIndicators` (~5444) — `indicators.active[]`, `indicators.data{}` |
| **Add** | `chart-indicators-full.js` | `addIndicator` (~5451) → async `finishAddIndicator` → `persistIndicators` + `emitIndicatorsChanged('add')` |
| **Remove** | `chart-indicators-full.js` | `removeIndicator` (~8584) — splices active, deletes data, `_updateIndicatorPanelHeight`, `persistIndicators({force})` |
| **Clear** | `chart-indicators-full.js` | `clearIndicators` (~8630) |
| **Visibility** | `indicator-ui.js` + `chart-indicators-full.js` | Legend eye `visibilityBtn.onclick` (~2708) → `_setIndicatorPlotLegendVisible` (~8748) **or** direct `indicator.visible` + `scheduleRender` |
| **Settings UI** | `indicator-ui.js` | `createIndicatorSettingsPanel` save (~4685) → `updateIndicator` / `addIndicator`; `showIndicatorSettings` (~13262) delegates here |
| **Recompute** | `chart-indicators-full.js` | `recalculateIndicators`, `recalculateIndicatorsAsync`, `_runIndicatorRecalc` (~7824), worker path (~7488) |
| **Replay hook** | `chart-indicators-full.js` + `replay-system.js` | `scheduleReplayIndicatorRecalc` (~7785) — **full** `recalculateIndicators()` every rAF while playing |
| **Persist / rehydrate** | `chart-indicators-full.js` | `persistIndicators` (~6219) → `scheduleSessionStateSave`; guards `_pendingIndicatorsState`, `_sessionIndicatorsRestoreGuardUntil` |
| **Render** | `chart-indicators-full.js` | `drawIndicators` (~8770), `bumpIndicatorRenderVersion`, layer cache invalidation |
| **UI bus (weak)** | `chart-indicators-full.js` | `emitIndicatorsChanged` (~82) — bare `CustomEvent('indicatorsChanged')`, **no central store** |

**Comparison to T1 `ToolLifecycleStore` pattern:**

| Concern | Drawings (T1) | Indicators (today) |
|---------|---------------|-------------------|
| Event bus | `tool-lifecycle-store.js` — `ToolLifecycleStore` with `emit/on`, state snapshot, kill-switch `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` | `emitIndicatorsChanged` only — no reducer, no subscribers contract |
| Selection/edit | `toolSelected`, `toolEditStarted`, `toolDeleted` routed through store | Indicator settings opened ad hoc; no `indicatorEditStarted/Ended` |
| Invalidation | T2 assertion on drawing setters | Indicator param apply scattered across `updateIndicator`, legend handlers, settings save |
| Multichart | Store disabled unless explicit opt-in on iframe | No per-panel indicator ownership model (H-S48) |

**ROOT-CAUSES.md RC-6:** indicators share RC-1/RC-2 failure modes through a **duplicated, decoupled UI path** — settings/visibility do not share the lifecycle/invalidation contract drawings now use.

---

### C.3 RC-6 mechanisms (named)

| ID | Mechanism | Evidence |
|----|-----------|----------|
| **M1** | **No IndicatorLifecycleStore** — mutations emit DOM events but UI/render subscribers are inconsistent | `emitIndicatorsChanged` vs `ToolLifecycleStore.emit`; hide path sometimes skips `persistIndicators` |
| **M2** | **Dual visibility model** — `visible`, `hidePlot`, `hideValues`, `chartSettings.showVolume` diverge | `_setIndicatorPlotLegendVisible` (~8748) branches overlay vs panel differently; restore loses name/value (TAL-00350#6) |
| **M3** | **Settings apply bypasses invalidation contract** (RC-1 class) | `indicator-ui.js` save calls `updateIndicator` without guaranteed `bumpIndicatorRenderVersion` + `recalculateIndicators` |
| **M4** | **Replay = full recompute per frame** — data correct, UI crosshair/legend stale | `scheduleReplayIndicatorRecalc` (~7814) always `recalculateIndicators()`; OHLC legend update path not coupled |
| **M5** | **Persist/rehydrate race** on symbol/TF swap | `persistIndicators` empty-snapshot guard (~6251); `_runIndicatorRecalc` append-only vs force paths (~7824) |
| **M6** | **Panel layout side-effects** — separate-panel height, magnet, z-order not lifecycle-gated | `_updateIndicatorPanelHeight`, divider drag; drawings layer above indicator labels (TAL-00350#4) |

---

### C.4 Phased fix plan (T6 — mirror T5 6-phase structure)

| Phase | Goal | Switch (default ON) | Primary files | RED assertion (harness/property) | Tickets discharged (target) |
|-------|------|---------------------|---------------|----------------------------------|----------------------------|
| **1 — Lifecycle store** | Introduce `IndicatorLifecycleStore` (parallel `ToolLifecycleStore`): `indicatorAdded/Removed/Hidden/Shown/SettingsApplied` + snapshot | `__TALARIA_DISABLE_INDICATOR_LIFECYCLE_V2` | New `indicator-lifecycle-store.js`; wire in `chart-indicators-full.js` `add/remove/emitIndicatorsChanged` | Property: emit hide → subscriber must call `scheduleRender`; switch OFF skips subscriber | TAL-00454#1, TAL-01286-class hide-until-click |
| **2 — Visibility contract** | Single `setIndicatorVisible(id, on)` through store; unify `visible`/`hidePlot`/`showVolume` | `__TALARIA_DISABLE_INDICATOR_VISIBILITY_V2` | `chart-indicators-full.js`, `indicator-ui.js` legend eye (~2708) | RED: hide→show with empty `indicators.data` must trigger `recalculateIndicators` once | TAL-00350#6, #11, 00454#1 |
| **3 — Settings apply path** | All settings saves → store `indicatorSettingsApplied` → `updateIndicator` + recalc + render version | `__TALARIA_DISABLE_INDICATOR_SETTINGS_APPLY_V2` | `indicator-ui.js` save (~4685), `showIndicatorSettings` | RED: change RSI period → `indicators.data[id]` length matches `chart.data.length` after save | TAL-00488#1, 01263#1, 00350#7 |
| **4 — Rehydrate on data swap** | Symbol/TF change: force `_runIndicatorRecalc({force:true})`, clear stale `indicators.data` keys | `__TALARIA_DISABLE_INDICATOR_REHYDRATE_V2` | `chart-indicators-full.js` `_runIndicatorRecalc`, data-load hooks in `chart.js` (read-only boundary: hook only) | RED: swap symbol → indicator series length === bar count without click | TAL-00350#2, type-specific "disappears on TF" resolved rows regression guard |
| **5 — Replay coupling** | Decouple replay recalc from full scan where possible; **always** refresh OHLC/legend on replay tick | `__TALARIA_DISABLE_INDICATOR_REPLAY_UI_SYNC_V2` | `chart-indicators-full.js` `scheduleReplayIndicatorRecalc`, `updateOHLCIndicators` | RED: replay step → legend value updates without extra click | TAL-00350#2, #7, 00157#12 |
| **6 — Panel layout + multichart ownership** | Divider/magnet/z-order; per-panel indicator store isolation | `__TALARIA_DISABLE_INDICATOR_PANEL_LAYOUT_V2` / `__TALARIA_DISABLE_INDICATOR_MC_ISOLATION_V2` | `chart-indicators-full.js` panel height; multichart panel store (coord. Lane 4) | H-S48 RED→GREEN; pane drag does not collapse main chart | TAL-00157#12/#13, 00350#4/#9/#10, H-S48 |

**Sequencing:** Phases 1→3 correctness (RC-1 parity); 4→5 data/replay; 6 layout/multichart. Perf incremental tail-recompute (`TRACKS.md` T6.3) is **Director-gated after** phases 1–5 GREEN.

**Lane ownership:** T6 runs on **Lane 1** after T1 store pattern is stable; Lane 4 adds harness scenarios per phase (no `known-failing.json` edits until Manager dispatches).

---

## Registry note (deferred)

Order-entry `fixed_pending_live` rows for TAL-00752 #1, #8–#11, #13–#15, #19–#22 remain in working-tree `PER-BUG-REGISTRY.csv` only until Manager splits RC3-HS25#1 into a separate commit.

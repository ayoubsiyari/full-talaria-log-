# T6 step 2 — RC-6 Phase 1: IndicatorLifecycleStore

## 1. Task + RC

- **Task:** T6 step 2 (Lane 3) — introduce central `IndicatorLifecycleStore` as authoritative indicator registry; route add/update/remove/rehydrate/visibility through it behind kill-switch.
- **RC:** **RC-6** (indicator lifecycle / UI decoupling). Phase 1 addresses **M1 (no central store)**; sets up infrastructure for **M2–M6** in later phases.

**Step 0:** HEAD `baf2ab12` (`T4: order-entry families #8/#19 + remaining-open-8 fixes`). Order-entry module paths clean — no uncommitted changes on `order-manager.js` / aggregates at start of this step.

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/indicator-lifecycle-store.js` | **New.** `IndicatorLifecycleStore` class: `on`/`emit`, reducer for `indicatorAdded/Updated/Removed/Cleared/Rehydrated/VisibilityChanged`, `getSnapshot()` registry. Kill-switch helper `rc6IndicatorLifecycleStoreEnabled`. |
| `homepage/public/chart/modules/indicator-lifecycle-store.js` | Byte-identical mirror (I8). |
| `chart v 1.4/chart/modules/chart-indicators-full.js` | Route `emitIndicatorsChanged` through store when switch ON; lazy `getIndicatorLifecycleStore`; `initIndicators` bootstraps store; `_installIndicatorLifecycleStoreSubscribers` (visibility → `scheduleRender`); `_emitIndicatorLifecycle` bridge for rehydrate/visibility without touching `chart.js`; `updateIndicator` now emits `update`; `_setIndicatorPlotLegendVisible` emits visibility. |
| `homepage/public/chart/modules/chart-indicators-full.js` | Byte-identical mirror. |
| `chart v 1.4/chart/modules/indicator-lifecycle-store.test.mjs` | **New.** Node property test: registry + visibility subscriber; switch-OFF RED-again. |
| `homepage/public/chart/modules/indicator-lifecycle-store.test.mjs` | Byte-identical mirror. |
| `chart v 1.4/chart/legacy-index.html` | Load `indicator-lifecycle-store.js` before `chart-indicators-full.js`. |
| `homepage/public/chart/legacy-index.html` | Mirror. |
| `chart v 1.4/chart/dist-v9/index.html` | Same script tag insertion. |
| `homepage/public/chart/dist-v9/index.html` | Mirror. |
| `chart v 1.4/talaria-design/live/index.html` | Same script tag insertion. |
| `chart v 1.4/chart/multichart-prod/chart-embed.html` | Harness loader list entry before `chart-indicators-full.js`. |
| `homepage/public/chart/multichart-prod/chart-embed.html` | Mirror. |
| `chart v 1.4/chart/multichart-prod/harness/serve.mjs` | Harness module list entry. |
| `homepage/public/chart/multichart-prod/harness/serve.mjs` | Mirror. |
| `chart v 1.4/chart/scripts/build-chart-client-bundle.mjs` | Include store in `CHART_CLIENT_PART2` bundle list. |
| `homepage/public/chart/scripts/build-chart-client-bundle.mjs` | Mirror. |

**No other files touched.** Did not edit `chart.js`, multichart-parent, order-entry, `known-failing.json`, or `PER-BUG-REGISTRY.csv`.

---

## 3. Kill-switch (I3 + I13)

| Item | Detail |
|------|--------|
| **Switch** | `window.__TALARIA_RC6_INDICATOR_LIFECYCLE_STORE` |
| **Default** | **ON** (`!== false`) |
| **OFF behavior** | Legacy path only: `CustomEvent('indicatorsChanged')` still fires; store `emit`/`_reduce` no-op; registry stays empty; visibility subscriber not installed path skipped |

**Gated files:**

| File | Gating |
|------|--------|
| `indicator-lifecycle-store.js` | `isEnabled()` / `rc6IndicatorLifecycleStoreEnabled()` |
| `chart-indicators-full.js` | `isRc6IndicatorLifecycleStoreEnabled()` wraps store routing in `emitIndicatorsChanged`, `initIndicators`, `_emitIndicatorLifecycle`, `_setIndicatorPlotLegendVisible` visibility emit |
| Loader HTML / `serve.mjs` / `build-chart-client-bundle.mjs` | Load-only (no behavior branch) |

**React / V9:** No JSX changes. V9 shell loads chart modules via same `dist-v9/index.html` script list — store is loaded before `chart-indicators-full.js`. Switch OFF reverts to pre-store ad-hoc `indicatorsChanged` bus in engine.

---

## 4. Proof — RED → GREEN

### Commands

```text
cd "chart v 1.4/chart/modules"
node indicator-lifecycle-store.test.mjs
TALARIA_TEST_DISABLE_RC6_INDICATOR_LIFECYCLE_STORE=1 node indicator-lifecycle-store.test.mjs
node --check indicator-lifecycle-store.js
node --check chart-indicators-full.js
```

(PowerShell switch-OFF: `$env:TALARIA_TEST_DISABLE_RC6_INDICATOR_LIFECYCLE_STORE='1'; node indicator-lifecycle-store.test.mjs`)

### RED (pre-fix / switch-OFF)

With `__TALARIA_RC6_INDICATOR_LIFECYCLE_STORE === false`:

- `indicatorAdded` does **not** populate `getSnapshot()` (count stays 0).
- Visibility `emit` does **not** invoke subscriber → `scheduleRenderCalls === 0`.

This is the ad-hoc-era behavior: no authoritative registry, no contracted render subscriber.

### GREEN (switch ON)

```text
GREEN — IndicatorLifecycleStore add/update/remove/clear/rehydrate + visibility subscriber passed
```

Assertions: add registers `rsi-1`; update renames; remove/clear empty registry; rehydrate syncs 2-entry list; visibility subscriber calls `scheduleRender` once.

### Switch-OFF RED-again (I15)

```text
GREEN — IndicatorLifecycleStore present; switch-OFF paths skip registry + render subscriber (RED-again)
```

### I15 actuation / measurement

| | |
|--|--|
| **Actuation** | **Synthetic** — Node `vm` loads store IIFE; direct `store.emit()` calls (no browser, no legend eye click). |
| **Measurement** | **Real store end-state** — `getSnapshot().count`, `getIndicatorEntry().name`, `scheduleRender` call count on mock chart. Not a DOM proxy. |
| **Determinism** | Single-run property test; no timing. |

**Gate / harness:** Not run this step (Lane 4 delta below).

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| **I3** kill-switch reversible | YES — `__TALARIA_RC6_INDICATOR_LIFECYCLE_STORE = false` restores legacy-only path |
| **I8/I9** mirrored trees | YES — SHA256 MATCH on all touched module + loader pairs |
| **I13** switch gates every behavior path | YES in store + chart-indicators-full; loaders are load-only |
| **I15** no proxy green | YES — asserts registry + subscriber call counts, labeled synthetic actuation |
| **Guardrail** no chart.js / multichart-parent / order-entry | YES |
| **L1/L2** file-scoped commit intent | YES — explicit paths only |

---

## 6. What I did NOT do / limits

- **Not fixed in Phase 1:** M2 dual visibility contract, M3 settings-apply invalidation, M4 replay UI sync, M5 rehydrate on symbol/TF swap, M6 panel layout / multichart isolation.
- **`chart.js` restore emit** (`indicatorsChanged` with `action: 'restore'`) untouched per guardrail; `_emitIndicatorLifecycle('rehydrate')` bridge exists for future hook without editing `chart.js`.
- **`indicator-ui.js`** legend eye still calls `_setIndicatorPlotLegendVisible` + direct `scheduleRender` — Phase 2 will unify visibility contract.
- **No live browser test** — dev property test only.
- **No `known-failing.json` / gate run** — Lane 4 to add Phase 1 scenarios.
- **`legacy-index.html` bundle** — store added to `build-chart-client-bundle.mjs` PART2 list; bundle not rebuilt this step (script tag also added for non-bundled load path).

---

## 7. Live-verification handoff

1. Serve built chart (`build:live` or dev harness) with build id containing `20260715b2` on `indicator-lifecycle-store.js` query string.
2. Open single-chart panel; add RSI from indicator menu.
3. In devtools console: `chart._indicatorLifecycleStore.getSnapshot()` should show `count: 1` with RSI entry (when switch ON).
4. Click legend eye to hide → plot should hide; with switch ON, `getSnapshot().active[0].visible` or `hidePlot` reflects state.
5. Toggle OFF: `window.__TALARIA_RC6_INDICATOR_LIFECYCLE_STORE = false`; reload; repeat add — store snapshot should stay empty / store inactive.

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

Property test proves M1 store registry + visibility subscriber contract under synthetic actuation. User-visible hide/show/recalc correctness for TAL-00454 / TAL-00350 rows requires Phases 2–5 + PO live confirm.

---

## Tickets

### Phase 1 sets foundation (not fully discharged)

| Ticket | Phase 1 role |
|--------|----------------|
| **TAL-00454#1** (hide/show) | Store + visibility event path; full fix → Phase 2 |
| **TAL-01286-class** (hide-until-click) | Registry tracks visibility; recalc contract → Phase 2 |
| **TAL-00350#6, #11** | Visibility events logged; unified contract → Phase 2 |
| **TAL-00350#2, #7** | Rehydrate event type exists; swap/replay coupling → Phases 4–5 |
| **TAL-00488#1, TAL-01263#1** | `indicatorUpdated` routed; settings invalidation → Phase 3 |

### Mechanisms

| ID | Phase 1 |
|----|---------|
| **M1** | **Addressed** — central store + snapshot |
| **M2** | **Set up** — visibility emit + subscriber |
| **M3** | **Set up** — `update` now emits through store |
| **M4–M6** | **Deferred** |

---

## Lane 4 deltas

- Add harness/property scenario: add indicator → `getSnapshot().count === 1`; hide via legend → visibility event + render scheduled.
- Add switch-OFF row: registry empty after add.
- No `known-failing.json` edits from this step.
- Future: wire `chart.js` restore path to `_emitIndicatorLifecycle('rehydrate')` in Phase 4 (read-only boundary exception).

---

## SHA256 (mirrored pairs)

Verified MATCH:

- `indicator-lifecycle-store.js`
- `indicator-lifecycle-store.test.mjs`
- `chart-indicators-full.js`
- `legacy-index.html`
- `dist-v9/index.html`
- `chart-embed.html`
- `serve.mjs`
- `build-chart-client-bundle.mjs`

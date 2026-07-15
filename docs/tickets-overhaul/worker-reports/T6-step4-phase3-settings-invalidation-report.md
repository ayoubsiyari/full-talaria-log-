# T6 step 4 — RC-6 Phase 3: indicator settings-apply invalidation (M3)

## 1. Task + RC

- **Task:** T6 step 4 (Lane 3) — route indicator settings-apply through `IndicatorLifecycleStore` so settings changes always invalidate and repaint; fix bypass where config mutates without guaranteed recalc/render.
- **RC:** **RC-6**, mechanism **M3** (settings apply bypasses invalidation contract).

**Step 0:** Phase 2 commit `314fbb3d` confirmed at task start.

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/indicator-settings-apply.js` | **New.** Invalidation contract helpers: bar-length match check, `applyIndicatorSettingsInvalidation`, kill-switch `__TALARIA_RC6_INDICATOR_SETTINGS_APPLY_V2`. |
| `homepage/public/chart/modules/indicator-settings-apply.js` | Mirror. |
| `chart v 1.4/chart/modules/indicator-settings-apply.test.mjs` | **New.** RED→GREEN: stale RSI half-length store repaired on period change; switch-OFF RED-again. |
| `homepage/public/chart/modules/indicator-settings-apply.test.mjs` | Mirror. |
| `chart v 1.4/chart/modules/chart-indicators-full.js` | `applyIndicatorSettings` wrapper; `_finalizeIndicatorSettingsApply` central tail; `_recalcIndicatorDataForSettings`; `_indicatorDataMatchesBars`; store subscriber for `indicatorSettingsApplied`; `_emitIndicatorLifecycle('settings')`. |
| `homepage/public/chart/modules/chart-indicators-full.js` | Mirror. |
| `chart v 1.4/chart/modules/indicator-lifecycle-store.js` | Reducer handles `indicatorSettingsApplied`. |
| `homepage/public/chart/modules/indicator-lifecycle-store.js` | Mirror. |
| `chart v 1.4/chart/modules/indicator-ui.js` | `applyIndicatorLiveUpdate` + settings save route through `applyIndicatorSettings`; export `__v9ApplyIndicatorSettings` for React V9. |
| `homepage/public/chart/modules/indicator-ui.js` | Mirror. |
| Loader HTML / `serve.mjs` / `build-chart-client-bundle.mjs` (both trees) | Load `indicator-settings-apply.js` before visibility/store modules. |

**No other files touched.**

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Role |
|--------|---------|------|
| `window.__TALARIA_RC6_INDICATOR_SETTINGS_APPLY_V2` | **ON** | Phase 3 invalidation contract |
| `window.__TALARIA_RC6_INDICATOR_LIFECYCLE_STORE` | ON (Phase 1) | `indicatorSettingsApplied` store event |
| `window.__TALARIA_RC6_INDICATOR_VISIBILITY_V2` | ON (Phase 2) | Unchanged |

**Dedicated Phase-3 switch** — independent rollback from Phases 1–2.

**Gated files:**

| File | OFF behavior |
|------|----------------|
| `indicator-settings-apply.js` | Legacy contract: no `enforceDataLength`, style-only bump partial |
| `chart-indicators-full.js` | `_finalizeIndicatorSettingsApply` legacy tail; generic `update` emit only |
| `indicator-ui.js` | Falls back to `updateIndicator` when `applyIndicatorSettings` absent (same path, no v3 contract) |
| `indicator-lifecycle-store.js` | Still accepts `indicatorSettingsApplied` if emitted; gated by Phase 1 switch |

**React/V9:** `__v9ApplyIndicatorSettings` export mirrors live-update path; V9 panel can call without JSX edits this step.

---

## 4. Proof — RED → GREEN

### Commands

```text
cd "chart v 1.4/chart/modules"
node indicator-settings-apply.test.mjs
TALARIA_TEST_DISABLE_RC6_INDICATOR_SETTINGS_APPLY_V2=1 node indicator-settings-apply.test.mjs
node --check indicator-settings-apply.js
node --check chart-indicators-full.js
```

### RED (bypass / switch OFF)

- Chart has 100 bars; RSI store `rsi` array length 50 (stale).
- Legacy contract `enforceDataLength: false` — no repair on settings apply.
- Switch OFF: `recalcCalls === 0`, length stays 50.

### GREEN (switch ON)

```text
GREEN — settings-apply invalidation enforces bar-length match after RSI period change
```

- `recalcFn` invoked once; `indicatorStorePrimarySeriesLength === 100`; `matchedBars === true`.

### Switch-OFF RED-again

```text
GREEN — settings-apply helpers present; switch-OFF leaves stale series (RED-again)
```

### I15

| | |
|--|--|
| **Actuation** | Synthetic — Node `vm` + direct `applyIndicatorSettingsInvalidation` |
| **Measurement** | Real series array length vs `chart.data.length` |

**Status:** **DONE (dev only) — NEEDS-LIVE**

---

## 5. Invariants

| Invariant | Status |
|-----------|--------|
| I3 reversible switch | YES |
| I8/I9 mirrors | YES — SHA256 MATCH |
| I13 all paths gated | YES |
| Guardrails | YES — no chart.js / multichart-parent / order-entry / known-failing |

---

## 6. What I did NOT do / limits

- **M4** replay UI sync — Phase 5
- **M5** persist/rehydrate race on symbol/TF — Phase 4
- **M6** panel layout / multichart — parked Phase 6
- Full-browser settings modal click not run
- Registry rows not updated pending PO confirm
- `_recalcIndicatorDataForSettings` fast-path covers rsi/sma/ema; other types fall back to `recalculateIndicators`

---

## 7. Live-verification handoff

1. Build with `indicator-settings-apply.js?v=20260715b2` in iframe network tab.
2. Add RSI(14); open settings; change period to 21; Apply.
3. Legend values + plot should update immediately without extra click.
4. Devtools: `chart._indicatorLifecycleStore.getSnapshot()` reflects updated entry after apply.
5. Toggle OFF: `window.__TALARIA_RC6_INDICATOR_SETTINGS_APPLY_V2 = false`; reload; repeat — stale render may return (legacy).

---

## 8. Tickets (target discharge — pending live)

| Ticket | Phase 3 contribution |
|--------|------------------------|
| **TAL-00488#1** | Settings apply → guaranteed invalidation + recalc |
| **TAL-01263#1** | Same contract via store event |
| **TAL-00350#7** | OHLC/legend refresh on settings apply (subscriber) |

## Remaining mechanisms

| ID | Phase |
|----|-------|
| M4 | 5 — replay recalc/UI |
| M5 | 4 — rehydrate on swap |
| M6 | 6 — panel layout (parked) |

---

## Lane 4 deltas

- Harness: change RSI period → `indicators.data[id].rsi.length === chart.data.length`.
- Store assertion: `indicatorSettingsApplied` fired once per save.
- Switch-OFF row: stale length allowed.
- No `known-failing.json` edits.

---

## SHA256

All mirrored pairs: **MATCH**.

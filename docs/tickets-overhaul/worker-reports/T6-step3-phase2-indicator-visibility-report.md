# T6 step 3 — RC-6 Phase 2: indicator visibility unification (M2)

## 1. Task + RC

- **Task:** T6 step 3 (Lane 3) — unify dual indicator visibility flags (`visible`, `hidePlot`, `hideValues`, `chartSettings.showVolume`) into one authoritative path through `IndicatorLifecycleStore` visibility events.
- **RC:** **RC-6**, mechanism **M2** (dual visibility model desync).

**Step 0:** Phase 1 commit `3502177c` confirmed at task start; indicator paths from Phase 1 clean.

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/indicator-visibility.js` | **New.** Pure visibility helpers: `resolveIndicatorShown`, `applyIndicatorVisibility`, `shouldRecalcIndicatorOnShow`, legacy fallbacks. Gated by `__TALARIA_RC6_INDICATOR_VISIBILITY_V2`. |
| `homepage/public/chart/modules/indicator-visibility.js` | Byte-identical mirror. |
| `chart v 1.4/chart/modules/indicator-visibility.test.mjs` | **New.** RED→GREEN property test for volume/panel desync + show-recalc guard; switch-OFF RED-again. |
| `homepage/public/chart/modules/indicator-visibility.test.mjs` | Mirror. |
| `chart v 1.4/chart/modules/indicator-lifecycle-store.js` | Store snapshot adds canonical `shown` field from `resolveIndicatorShown`; passes `chartSettings` into snapshot. |
| `homepage/public/chart/modules/indicator-lifecycle-store.js` | Mirror. |
| `chart v 1.4/chart/modules/chart-indicators-full.js` | Adds `setIndicatorVisible` (single write path); `_setIndicatorPlotLegendVisible` delegates; `_isIndicatorPlotShown` uses unified read; volume + separate-panel legend eyes route through `setIndicatorVisible`; show-with-empty-data triggers `recalculateIndicators`. |
| `homepage/public/chart/modules/chart-indicators-full.js` | Mirror. |
| `chart v 1.4/chart/modules/indicator-ui.js` | OHLC legend eye uses `talariaIndicatorLegendShown` (unified read when v2 ON) and `setIndicatorVisible`; removes duplicate recalc/render from onclick (handled by engine). |
| `homepage/public/chart/modules/indicator-ui.js` | Mirror. |
| Loader HTML / `serve.mjs` / `build-chart-client-bundle.mjs` (both trees) | Load `indicator-visibility.js` before `indicator-lifecycle-store.js` before `chart-indicators-full.js`. |

**No other files touched.** Did not edit `chart.js`, multichart-parent, order-entry, or `known-failing.json`.

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Scope |
|--------|---------|-------|
| `window.__TALARIA_RC6_INDICATOR_VISIBILITY_V2` | **ON** (`!== false`) | Phase 2 unified read/write + `setIndicatorVisible` |
| `window.__TALARIA_RC6_INDICATOR_LIFECYCLE_STORE` | **ON** (Phase 1) | Store routing for visibility events |

**Rollout model:** Phase 2 uses a **dedicated** visibility switch (not reusing lifecycle switch alone). Visibility events still require Phase 1 store when lifecycle switch ON. Both OFF → legacy dual-flag paths in every gated file.

**Gated files:**

| File | OFF behavior |
|------|----------------|
| `indicator-visibility.js` | `applyIndicatorVisibility` → legacy branch; UI/engine use `visible`-only legend read |
| `chart-indicators-full.js` | `resolveIndicatorShownState` falls back to pre-M2 checks; `setIndicatorVisible` uses legacy apply |
| `indicator-ui.js` | `talariaIndicatorLegendShown` reads `indicator.visible` only |
| `indicator-lifecycle-store.js` | Snapshot `shown` still computed if resolver loaded; store gated by Phase 1 switch |
| Loaders | Load-only |

**React/V9:** No JSX edits. V9 iframe loads via `dist-v9/index.html` script list — `indicator-visibility.js` inserted before store/indicators.

---

## 4. Proof — RED → GREEN

### Commands

```text
cd "chart v 1.4/chart/modules"
node indicator-visibility.test.mjs
TALARIA_TEST_DISABLE_RC6_INDICATOR_VISIBILITY_V2=1 node indicator-visibility.test.mjs
node indicator-lifecycle-store.test.mjs
node --check indicator-visibility.js
node --check indicator-lifecycle-store.js
node --check chart-indicators-full.js
```

### RED (dual-flag desync)

Before unification / switch OFF:

- Volume `visible=true`, `showVolume=false` → legacy read (`visible` only) reports **shown** while plot is hidden.
- Panel `visible=true`, `hidePlot=true` → legacy read reports **shown** while plot is hidden.

### GREEN (switch ON)

```text
GREEN — unified visibility read/apply + show-recalc guard passed
```

- `resolveIndicatorShown` returns `false` for both desync cases.
- `applyIndicatorVisibility` sets aligned flags on hide/show.
- `shouldRecalcIndicatorOnShow` returns `true` when showing with empty `indicators.data`.

### Switch-OFF RED-again

```text
GREEN — visibility helpers present; switch-OFF reproduces dual-flag desync (RED-again)
```

### I15 actuation / measurement

| | |
|--|--|
| **Actuation** | **Synthetic** — Node `vm` loads `indicator-visibility.js`; direct helper calls. |
| **Measurement** | **Real flag end-state** — `visible`, `hidePlot`, `showVolume`, `shown` boolean, recalc guard; not DOM proxy. |

**Gate:** Not run — Lane 4 to add hide→show scenarios.

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| I3 reversible kill-switch | YES — dedicated Phase 2 switch |
| I8/I9 mirrored trees | YES — SHA256 MATCH all pairs |
| I13 all behavior paths gated | YES in visibility.js, chart-indicators-full, indicator-ui |
| I15 no proxy green | YES — labeled synthetic |
| Guardrails | YES — no chart.js / multichart-parent / order-entry |

---

## 6. What I did NOT do / limits

- **M3–M6** unchanged: settings-apply invalidation, rehydrate on symbol/TF, replay UI sync, panel layout/multichart isolation.
- **`chart.js` restore emit** still untouched.
- **Live browser** not run — dev property tests only.
- **Registry rows** not updated — Manager intake after PO live confirm.
- Zoom-out + chart-click hide (TAL-00350#11) may need Phase 4/6 coupling — not proven here.

---

## 7. Live-verification handoff

1. Build/serve with `indicator-visibility.js?v=20260715b2` in panel iframe network tab.
2. Add Volume; hide via legend eye → confirm bars gone **and** eye icon off (not half-on from `visible`/`showVolume` split).
3. Show again with cold data → values/name reappear without divider drag (recalc on show).
4. Add RSI separate-panel; hide/show via panel legend eye → `chart._indicatorLifecycleStore.getSnapshot().active[0].shown` tracks eye.
5. Toggle OFF: `window.__TALARIA_RC6_INDICATOR_VISIBILITY_V2 = false`; reload; volume desync read path returns (legacy).

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

---

## Tickets (target discharge — pending live confirm)

| Ticket | Phase 2 contribution |
|--------|------------------------|
| **TAL-00454#1** | Unified hide/show path + show-recalc when data empty |
| **TAL-00350#6** | Visibility flags aligned; recalc on show restores values |
| **TAL-00350#11** | Partial — visibility contract improved; zoom/click coupling deferred |
| **TAL-01286-class** | Store `shown` field + single write path |

## Remaining mechanisms (Phases 3–6)

| ID | Deferred to |
|----|-------------|
| M3 | Phase 3 — settings apply invalidation |
| M4 | Phase 5 — replay UI sync |
| M5 | Phase 4 — rehydrate on data swap |
| M6 | Phase 6 — panel layout / multichart |

---

## Lane 4 deltas

- Harness: hide volume → unified `shown=false` in store snapshot; show → `recalculateIndicators` called once when `indicators.data[id]` empty.
- Switch-OFF row: legacy `visible`-only read diverges from plot state.
- No `known-failing.json` edits this step.

---

## SHA256

All mirrored pairs: **MATCH**.

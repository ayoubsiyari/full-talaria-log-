# T6 step 5 — RC-6 Phase 5: indicator persist race (M5)

## 1. Task + RC

- **Task:** T6 step 5 (Lane 3) — deterministic indicator persist/rehydrate through `IndicatorLifecycleStore` `indicatorRehydrated` path; fix save/restore race (lost/duplicate/stale on reload).
- **RC:** **RC-6**, mechanism **M5** (persist/rehydrate race).
- **Sequencing:** **M4 (replay full-recalc/UI desync) deferred** — Lane 2 active on `replay-system.js`. **M6 (panel layout) parked** with re-migration.

**Step 0:** Phase 3 commit `db82aed4` confirmed at task start.

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/indicator-persist-rehydrate.js` | **New.** Rehydrate session helpers: `beginIndicatorRehydrate` / `endIndicatorRehydrate`, persist block during restore, suppress incremental store mutations, `reconcileRehydrateStoreSnapshot`. Kill-switch `__TALARIA_RC6_INDICATOR_PERSIST_REHYDRATE_V2`. |
| `homepage/public/chart/modules/indicator-persist-rehydrate.js` | Mirror. |
| `chart v 1.4/chart/modules/indicator-persist-rehydrate.test.mjs` | **New.** RED→GREEN race repro + switch-OFF RED-again. |
| `homepage/public/chart/modules/indicator-persist-rehydrate.test.mjs` | Mirror. |
| `chart v 1.4/chart/modules/chart-indicators-full.js` | Wrap `_queuePersistedIndicatorsRestore` + `_applyPersistedIndicators` (chart.js methods, not edited); `_emitIndicatorRehydrateComplete`; block `persistIndicators` during rehydrate; suppress incremental store events during batch restore; `indicatorRehydrated` subscriber. |
| `homepage/public/chart/modules/chart-indicators-full.js` | Mirror. |
| Loader HTML / `serve.mjs` / `build-chart-client-bundle.mjs` (both trees) | Load `indicator-persist-rehydrate.js` before settings-apply chain. |

**No `chart.js` or `replay-system.js` edits.** Wrappers install from `chart-indicators-full.js` after Chart prototype is defined.

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Role |
|--------|---------|------|
| `window.__TALARIA_RC6_INDICATOR_PERSIST_REHYDRATE_V2` | **ON** | Phase 5 persist/rehydrate contract |
| `window.__TALARIA_RC6_INDICATOR_LIFECYCLE_STORE` | ON (Phase 1) | `indicatorRehydrated` store sync |

**Dedicated Phase-5 switch.**

**Gated behavior when OFF:** legacy chart.js restore path — incremental `indicatorAdded` store events during restore, empty persist not blocked by rehydrate flag, no `_emitIndicatorRehydrateComplete` batch sync.

**React/V9:** No JSX changes; restore still driven by chart session load calling wrapped Chart methods.

---

## 4. Proof — RED → GREEN

### Commands

```text
cd "chart v 1.4/chart/modules"
node indicator-persist-rehydrate.test.mjs
TALARIA_TEST_DISABLE_RC6_INDICATOR_PERSIST_REHYDRATE_V2=1 node indicator-persist-rehydrate.test.mjs
node --check indicator-persist-rehydrate.js
node --check chart-indicators-full.js
```

### RED (race / switch OFF)

- Incremental `indicatorAdded` during restore → store count 3 vs pending 2 → `reconcileRehydrateStoreSnapshot.ok === false`.
- Switch OFF: empty persist **not** blocked during `beginIndicatorRehydrate`.

### GREEN (switch ON)

```text
GREEN — persist blocked during rehydrate + single store sync matches pending list
```

- Empty persist blocked while rehydrate in progress.
- Incremental store adds suppressed during batch.
- Single `indicatorRehydrated` sync → store count 2 matches pending 2.

### I15

| | |
|--|--|
| **Actuation** | Synthetic — Node `vm` + direct helper/store calls |
| **Measurement** | Store `count`, `reconcile.ok`, persist-block boolean |

**Status:** **DONE (dev only) — NEEDS-LIVE**

---

## 5. Invariants

| Invariant | Status |
|-----------|--------|
| I3 reversible switch | YES |
| I8/I9 mirrors | YES — SHA256 MATCH |
| I13 gated paths | YES |
| No chart.js / replay-system edits | YES — prototype wrappers only |
| No known-failing.json | YES |

---

## 6. What I did NOT do / limits

- **M4 deferred** — replay UI/recalc coupling untouched (Lane 2 collision avoidance).
- **M6 parked** — panel layout / multichart isolation.
- No live reload/session-restore browser test.
- Registry not updated pending PO confirm.
- Wrapper depends on chart.js `_applyPersistedIndicators` existing at module load (true in production script order).

---

## 7. Live-verification handoff

1. Add RSI + EMA; reload page (or swap symbol/session).
2. Confirm both indicators restore once (no duplicates in legend / store snapshot).
3. Devtools: after reload, `chart._indicatorLifecycleStore.getSnapshot().count === 2`.
4. During restore (network slow), empty persist must not wipe server indicators.
5. Toggle OFF: `window.__TALARIA_RC6_INDICATOR_PERSIST_REHYDRATE_V2 = false`; reload — race may recur.

---

## 8. Tickets (target — pending live)

| Ticket | M5 contribution |
|--------|-----------------|
| **TAL-00350#2** | Deterministic rehydrate + recalc on restore (partial — replay click path is M4) |
| **TAL-00350-type "disappears on TF"** | Rehydrate sync foundation (full swap fix may need Phase 4 symbol hook) |
| Session restore indicator loss/dup class | Batch `indicatorRehydrated` replaces incremental race |

## Deferred / parked

| Item | Note |
|------|------|
| **M4** | Replay full-recalc + legend stale — after Lane 2 clears `replay-system.js` |
| **M6** | Panel layout + multichart — parked with re-migration |

---

## Lane 4 deltas

- Harness: session restore → store count === persisted indicator count; no duplicate ids.
- Switch-OFF row: incremental store growth during restore.
- No `known-failing.json` edits.

---

## SHA256

All mirrored pairs: **MATCH**.

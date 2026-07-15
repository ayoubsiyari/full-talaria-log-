# T6 step 6 — RC-6 M4 replay-recalc / UI-desync DIAGNOSTIC (READ-ONLY)

## 1. Task + RC

- **Task:** T6 step 6 (Lane 3) — read-only diagnostic for **M4** (indicator full-recalc + legend/value UI desync during replay). No product, harness, or `known-failing.json` edits.
- **RC:** **RC-6**, mechanism **M4** (replay coupling). Phases M1–M3 and M5 are landed; M4 is the remaining active RC-6 mechanism before M6 (parked).
- **Outcome:** Mechanism traced, fix boundary named, kill-switch + RED spec drafted, ticket map + Lane 2 unblock condition recorded. **M4 ready to implement when replay lanes clear.**

**Step 0:** Phase 5 commit `40be56dd` confirmed at task start. Working tree has **uncommitted Lane 2 edits** on `replay-system.js` (+110 lines) — collision risk verified, not touched.

---

## 2. What I changed — file by file

**No product, harness, or registry files touched.** Read-only code inspection only.

| File | Change |
|------|--------|
| `docs/tickets-overhaul/worker-reports/T6-step6-M4-replay-recalc-diagnostic-report.md` | **New.** This diagnostic report. |

**No other files touched.**

---

## 3. Kill-switch (I3 + I13) — proposed at implement time (not implemented)

| Switch | Default (proposed) | Role |
|--------|-------------------|------|
| `window.__TALARIA_RC6_INDICATOR_REPLAY_UI_SYNC_V2` | **ON** | Phase 5 replay coupling: decouple full-scan thrash where safe; **always** refresh legend/crosshair values on replay tick |

**Files the switch must gate at M4 implement time:**

| File | Gated behavior |
|------|----------------|
| `chart-indicators-full.js` | `scheduleReplayIndicatorRecalc`, `_runIndicatorRecalc` replay branch, optional `indicatorReplaySynced` store hook, `_syncReplayPlayheadCrosshairValues` legend refresh contract |
| `indicator-ui.js` | `talariaSyncOhlcIndicatorLegendValues` replay playhead coupling; lightweight value sync vs full `talariaRebuildOhlcIndicatorLegend` |
| `indicator-replay-ui-sync.js` (proposed new module, Lane 3 pattern) | Pure replay-UI sync helpers + switch predicate (mirrors M1–M5 module pattern) |
| `indicator-lifecycle-store.js` | Optional `indicatorReplaySynced` event (read-only today; no replay events emitted) |
| `replay-system.js` | Call-site ordering: `_scheduleReplayIndicatorRecalc`, `updateChartData`, `updateChartDataFast`, `_flushReplayIndicatorRecalc`, `pause` — **Lane 2 collision zone; coordinate before edit** |
| `chart.js` | `_trimLastDataBarToReplayPlayhead`, replay data-load hooks if M4 needs playhead bar index contract — **collision zone with D-017 / T8 cadence** |

**Switch OFF must restore:** current behavior — sync `recalculateIndicators()` per rAF during play; legend via `updateOHLCIndicators` full DOM rebuild on recalc path; `_syncReplayPlayheadCrosshairValues` only at end of `updateChartData` / fast path; no store replay events.

**Ungatable risk (I13):** If Lane 2 owns `replay-system.js` call order during b1/cadence work, M4 may need a **chart-side-only** first slice (legend sync without replay-system reorder) with explicit NEEDS-LIVE until replay lanes merge. Call out in implement report if so.

**Naming note:** T4 step 11 plan used `__TALARIA_DISABLE_INDICATOR_REPLAY_UI_SYNC_V2` (disable-style). Landed M1–M5 use `__TALARIA_RC6_*` enable-style. **Recommend `__TALARIA_RC6_INDICATOR_REPLAY_UI_SYNC_V2`** for consistency with Phases 1–5.

---

## 4. Proof — RED → GREEN

**N/A for this task** — diagnostic only; no fix landed, no tests run.

### Proposed RED scenario (I15 — for M4 implement + Lane 4 harness)

| Field | Spec |
|-------|------|
| **Scenario id** | `H-S83b` / `RC6-M4-replay-legend-sync` (Manager to register in harness matrix) |
| **Setup** | Chart with ≥1 overlay indicator (RSI or SMA) + OHLC legend visible; enter replay; playhead at bar N |
| **Actuation (required)** | Real replay play or step via harness **real** play/pause controls (not synthetic `chart.data` mutation alone). Tick-replay mode included as variant. |
| **Measure (required)** | After N replay steps (e.g. N=5): (a) legend value text at playhead === `indicators.data[id]` series value at `chart.data.length - 1` (or `hoverIndex` after `_syncReplayPlayheadCrosshairValues`); (b) overlay canvas Y at playhead matches recalculated series; (c) **no extra chart click** required for update |
| **Proxy assertions (invalid as GREEN)** | `updateOHLCIndicators` called count, DOM row count, `scheduleReplayIndicatorRecalc` invoked — alone insufficient |
| **Switch OFF repro** | Stale legend until replay icon click or chart click (TAL-00350#2 / #7 symptom class) |
| **Determinism** | 10/10 on repeated play→pause→step; gate on playhead bar index + parsed legend numeric token, not fixed `sleep()` |

### Proposed fast-loop property (dev only)

Node/vm unit: given mock `chart.data` growth + `hoverIndex` set to last bar, `talariaFormatOverlayIndicatorValueTokens` returns token matching `indicators.data[id][barIdx]` after sync helper runs — switch OFF skips sync helper.

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| **I3 / I13** | Kill-switch spec names all gated files; ungatable replay-system collision called out |
| **I8** | No engine-tree edits — both trees unchanged |
| **I15** | RED spec names real actuation + end-state measurement; no proxy green claimed |
| **Read-only guardrail** | No `replay-system.js`, `chart.js` replay regions, multichart-parent, order-entry, harness, or `known-failing.json` edits |
| **Lane 3 scope** | Diagnostic stays on indicator engine/UI boundary; replay overlap documented for Lane 2 handoff |

---

## 6. What I did NOT do / limits

- **No fix implemented** — M4 gated on Lane 2 replay lane clearance.
- **No harness / known-failing.json** — RED spec only.
- **No live PO confirmation** — symptom reproduction not run on built product in this step.
- **No deep read of** `recalculateIndicatorsAsync` worker coalesce during replay, multichart passive-play (`_multichartPassivePlayActive`) cross-panel legend isolation, or custom-indicator replay path — flagged for implement-time profiling.
- **Tick-replay animating-candle path** (`animatingCandle` in `_syncReplayPlayheadCrosshairValues`) — partial trace; may need separate RED variant for intra-bar values.
- **Performance tail-recompute** (TRACKS.md T6.3 incremental) — explicitly out of M4 scope; Director-gated after M1–M5 GREEN.
- **Order-entry flicker** (`TAL-00752#3`) — RC-5; not M4.
- **Indicator disappear during replay** — largely M5 rehydrate or separate data-swap (Phase 4 / M4 overlap on TAL-00350#2 only for stale label, not missing overlay).

---

## 7. Live-verification handoff (for M4 implement)

**PO steps after M4 lands:**

1. Build with `__TALARIA_RC6_INDICATOR_REPLAY_UI_SYNC_V2` ON (default).
2. Load symbol, add RSI overlay, open replay.
3. **Play** 10+ bars — legend RSI value at top-left must track playhead without clicking chart.
4. **Pause**, scrub slider — value updates on each scrub stop.
5. **Hover** crosshair on last bar while paused — value matches playhead (TAL-00350#7).
6. Toggle switch OFF in console — confirm stale legend until replay icon or chart click (TAL-00350#2 repro).
7. Multichart: repeat on panel B with passive play mirror if enabled.

**Build id:** Record in implement report after commit.

---

## 8. Status

**DIAGNOSTIC-ONLY** — mechanism reported, fix not started.

**M4 ready to implement when replay lanes clear.**

---

## Appendix A — M4 mechanism trace

### A.1 Replay tick → indicator recalc chain

```
replay step / tick frame
  → ReplaySystem.updateChartData() or updateChartDataFast()
  → ReplaySystem._scheduleReplayIndicatorRecalc()
  → Chart.scheduleReplayIndicatorRecalc(isPlaying)
  → [playing] requestAnimationFrame → recalculateIndicators() + updateOHLCIndicators() + bumpIndicatorRenderVersion() + scheduleRender()
  → [paused]  immediate recalculateIndicators() + updateOHLCIndicators()
```

**Entry points (replay-system.js):**

| Location | Function | Behavior |
|----------|----------|----------|
| ~3306–3311 | `updateChartData()` | After resample + `bumpDataVersion`, calls `_scheduleReplayIndicatorRecalc()` on every replay step |
| ~4775–4778 | `updateChartDataFast()` | Same recalc schedule on fast/tick playback path |
| ~3143–3174 | `_scheduleReplayIndicatorRecalc()` | Delegates to `chart.scheduleReplayIndicatorRecalc(effectivePlaying)`; defers on pan via `_deferIndicatorRecalcAfterZoomFill`; skips if `_tfSwitchSkipHeavyIndicators` |
| ~3176–3199 | `_flushReplayIndicatorRecalc()` | On pause: cancel rAF, flush worker queue, `scheduleReplayIndicatorRecalc(false)` + `updateOHLCIndicators()` |
| ~5484 | `pause()` | Calls `_flushReplayIndicatorRecalc()` before full `render()` |
| ~3349–3351, ~4806–4808 | end of `updateChartData` / `updateChartDataFast` | `_syncReplayPlayheadCrosshairValues()` after render |

**Chart-side recalc (chart-indicators-full.js):**

| Location | Function | Behavior |
|----------|----------|----------|
| ~8139–8186 | `scheduleReplayIndicatorRecalc` | **Playing:** one sync full recalc per animation frame (comment: worker/incremental lags at 60x). **Paused:** immediate sync recalc + OHLC legend rebuild |
| ~8188–8221 | `_runIndicatorRecalc` | When `replayPlaying`, **always** routes to `scheduleReplayIndicatorRecalc(true)` — **blocks** `recalculateIndicatorsIncremental` and `recalculateIndicatorsAsync` worker path |
| ~8465–8788 | `recalculateIndicators` | Full synchronous scan of all `indicators.active`; sets `indicators.data[id]` per type; at end calls `updateOHLCIndicators()` + `bumpIndicatorRenderVersion()` |
| ~8473–8476 | replay branch inside `recalculateIndicators` | Skips `_setAllIndicatorsCalculating(true)` during replay play — no loading shimmer, but still full CPU scan |

**Replay enter invalidation (replay-system.js ~2553–2558):**

- `chart._indCalcSnapshot = null` — drops incremental append-only optimization for replay slice
- `_invalidateIndicatorLayerCache()` — layer cache cleared on enter

### A.2 Legend / value UI chain (bypasses IndicatorLifecycleStore)

**Store involvement today: none on replay path.**

- `emitIndicatorsChanged` (~141–169) maps add/remove/settings/rehydrate only — **no `indicatorReplayTick` / replay event**
- `indicator-lifecycle-store.js` — no replay-related events

**Legend DOM:**

| Location | Function | Behavior |
|----------|----------|----------|
| indicator-ui.js ~6179–6188 | `Chart.prototype.updateOHLCIndicators` override | Full DOM rebuild via `talariaRebuildOhlcIndicatorLegend` (skipped if settings modal open) |
| indicator-ui.js ~2615–2636 | `talariaSyncOhlcIndicatorLegendValues` | **Lightweight** value-only refresh — queries `[data-talaria-ind-val]`, reads `indicators.data` at `talariaCrosshairBarIndex(chart)` |
| indicator-ui.js ~2356–2370 | `talariaCrosshairBarIndex` | Prefers `_getCrosshairBarIndex()`, then `hoverIndex`, then `mouseX`/`pixelToDataIndex`, else `data.length - 1` |
| indicator-ui.js ~2466–2509 | `talariaFormatOverlayIndicatorValueTokens` | Reads `chart.indicators.data[indicator.id]` at `barIdx` — **direct chart state, not store snapshot** |
| chart-indicators-full.js ~11359–11396 | `syncCrosshairIndicatorValues` | Panel overlays + calls `talariaSyncOhlcIndicatorLegendValues` on `#ohlcIndicators` div |
| chart-indicators-full.js ~11005–11042 | `_syncReplayPlayheadCrosshairValues` | Sets `hoverIndex = data.length - 1`, calls `syncCrosshairIndicatorValues`, rebuilds legend only if `ohlcDiv.childElementCount === 0`, updates OHLC candle display |

**Ordering desync hypothesis:** During play, `scheduleReplayIndicatorRecalc` runs in rAF and calls `updateOHLCIndicators` (full rebuild). `_syncReplayPlayheadCrosshairValues` runs **after** `_renderReplayChartUpdate` in `updateChartData`. If rAF recalc completes **after** crosshair sync on the same frame, legend can show values for wrong `hoverIndex` until next click forces `syncCrosshairIndicatorValues`. Paused scrub: `_flushReplayIndicatorRecalc` + crosshair sync should align — matches "works after replay icon click" reports.

### A.3 Desync mechanisms (ranked)

| # | Mechanism | Evidence |
|---|-----------|----------|
| 1 | **Full-recalc thrash** — sync scan every rAF during play; worker/async path bypassed | `_runIndicatorRecalc` replay branch (~8199–8205); comment at ~8136–8137 |
| 2 | **Legend stale vs data fresh** — `indicators.data` updated in recalc but legend tokens not re-read at playhead bar until extra interaction | `talariaSyncOhlcIndicatorLegendValues` only from `syncCrosshairIndicatorValues`; play path relies on `updateOHLCIndicators` rebuild timing |
| 3 | **hoverIndex / bar index lag** — crosshair sync sets `hoverIndex` once per `updateChartData`; rAF recalc may finish later | ~11008–11010 vs ~8167–8184 ordering |
| 4 | **Empty legend guard** — `_syncReplayPlayheadCrosshairValues` only calls `updateOHLCIndicators` when `childElementCount === 0` | ~11014–11017 — if rows exist but values stale, no rebuild |
| 5 | **Layer cache** — `bumpIndicatorRenderVersion` on recalc but optimized draw may serve cache if params unchanged | enter replay clears cache; per-tick bump may be insufficient for separate-panel overlays |
| 6 | **Store bypass** — replay never emits lifecycle events; UI subscribers (if added later) won't fire | no replay hooks in store |

### A.4 Fix boundary at implement time

**Primary (Lane 3 — implement first):**

- `chart-indicators-full.js` — replay recalc policy, post-recalc legend sync contract, optional incremental tail for append-only replay steps
- `indicator-ui.js` — ensure replay tick always hits lightweight `talariaSyncOhlcIndicatorLegendValues` with correct `hoverIndex`
- New `indicator-replay-ui-sync.js` (recommended) — switch + pure helpers

**Secondary (coordinate with Lane 2):**

- `replay-system.js` — ensure `_syncReplayPlayheadCrosshairValues` runs **after** indicator recalc flush on each step; may need to call `syncCrosshairIndicatorValues` from `_flushReplayIndicatorRecalc`
- `chart.js` — playhead trim / crosshair bar index helpers if `_getCrosshairBarIndex` contract changes

**Do not touch in M4:**

- `multichart-parent`, order-entry, `known-failing.json` (Lane 4)
- M6 panel layout / divider ownership

---

## Appendix B — Replay-file overlap table (Lane 2 collision)

| File | Region / symbol | Lane 2 owner | M4 need | Collision risk |
|------|-----------------|--------------|---------|----------------|
| `replay-system.js` | `_scheduleReplayIndicatorRecalc` (~3143) | T8 cadence / b1 replay | Recalc schedule + ordering | **HIGH** — +110 lines uncommitted in working tree |
| `replay-system.js` | `updateChartData` (~3201–3363) | D-017 viewport / snap-back | Crosshair sync call order | **HIGH** |
| `replay-system.js` | `updateChartDataFast` (~4748+) | T8 fast/tick playback | Same | **HIGH** |
| `replay-system.js` | `_flushReplayIndicatorRecalc` (~3176) | T8 pause policy | Pause legend quality | **MEDIUM** |
| `replay-system.js` | `enterReplayMode` (~2553) | T8 session start | Snapshot invalidation | **LOW** (M4 may only read) |
| `chart.js` | `_trimLastDataBarToReplayPlayhead`, replay viewport | D-017, T8 | Playhead bar index | **MEDIUM** |
| `chart-indicators-full.js` | `scheduleReplayIndicatorRecalc` (~8139) | Lane 3 | Primary fix | **LOW** (Lane 3) |

---

## Appendix C — Lane 2 unblock condition

**Before M4 implement commits touch replay call sites, all must be true:**

1. **D-017 snap-back fix** committed on `chart.js` (Manager ESC-015 — serialize chart.js before overlapping edits).
2. **Lane 2 `replay-system.js` working tree** (+110 lines) committed or rebased — no concurrent edits to `_scheduleReplayIndicatorRecalc`, `updateChartData`, `updateChartDataFast`, `_flushReplayIndicatorRecalc`.
3. **T8 b1 / finest-TF cadence** (H-S83 family) stable — Manager confirms no active dispatch on same replay tick regions.
4. **Manager go** on M4 implement prompt (not this diagnostic).

**Parallel work allowed before unblock:** Lane 3 can land `indicator-replay-ui-sync.js` + `chart-indicators-full.js` / `indicator-ui.js` changes that do **not** require `replay-system.js` reorder — with NEEDS-LIVE until Lane 2 merges.

---

## Appendix D — Ticket map (M4 target)

| Bug ref | Symptom | M4 ownership | Notes |
|---------|---------|--------------|-------|
| **TAL-00350#2** | Indicator price label does not update until replay icon clicked | **Primary** | Stale legend / crosshair sync ordering |
| **TAL-00350#7** | Indicator value does not update on hover without chart click | **Primary** | `talariaSyncOhlcIndicatorLegendValues` + `hoverIndex` coupling |
| **TAL-00157#16** | Replay playback does not update certain chart elements | **Partial** | Overlaps RC-8 replay-interaction; M4 covers indicator legend/overlay leg only |
| **TAL-00350#6 / #11** | Hide/show / zoom visibility | **Partial** | M2 landed; replay-specific hide/show desync may need M4 legend refresh |
| **TAL-00752#3** | TP/SL flicker each replay candle | **Out of scope** | RC-5 order-entry |
| **Indicator disappears during replay** | Overlay vanishes | **Mostly M5 / data-swap** | M5 rehydrate landed; disappearance ≠ stale label |

**Harness rows (proposed):** `RC6-M4-replay-legend-sync`, tick-replay variant, multichart passive-play variant — Lane 4 to register when M4 implement dispatches.

---

## Appendix E — Relationship to landed RC-6 phases

| Phase | Mechanism | Replay interaction |
|-------|-----------|-------------------|
| M1 store | Lifecycle events on add/remove/settings | **Not wired to replay ticks** |
| M2 visibility | `setIndicatorVisible` | Legend eye uses visibility; replay recalc does not emit visibility events |
| M3 settings | `applyIndicatorSettings` → recalc | Settings save outside replay; replay full recalc may mask stale settings UI if not saved |
| M5 persist | Rehydrate batch | Enter replay clears `_indCalcSnapshot`; separate from per-tick desync |

**M4 closes the gap:** replay path must explicitly sync **computed series** (`indicators.data`) → **visible legend tokens** at playhead bar, without requiring user click.

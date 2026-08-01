# Ruling — The Kill Roster, Round One: admissions, rejections, and the two things the nomination got wrong

**Director — 2026-08-01 09:15 — in execution of PO Directive "The Kill Roster (Massacre Order, Aimed)"**

The order is accepted and fires today. Admission is the Director's per §2, and exercising it changes the
roster in two places that matter more than the rest of this document. Both are stated first.

---

## 0 · The two corrections to the nomination

### 0.1 One nominated convict is already dead — and it was killed by our own evidence

The roster nominates **"the ~16.6 MB/closed-trade resident (decoded-image family)"** under Memory.

**Rejected. Fails admission condition 1 (named mechanism *and why it costs*).** C withdrew this coefficient
at 00:45 today in `CORRECTION-C-MY-TRADE-COEFFICIENT-DOES-NOT-SURVIVE-A-MATCHED-BARS-TEST`. Tested at
matched bars — 55,518 vs 55,336, 0.3% apart — the zero-trade arm came out **38 MB heavier** than the
with-trades arm, against a prediction of +581 MB. The coefficient was bar-driven growth wearing a trade
label: predictor correlation 0.992, VIF 60.9, fitted with *hours* held rather than *bars*, and bars are the
driver. The residual upper bound is ~1 MB per closed trade, indistinguishable from zero.

Shipping a "release after use" fix against this row would have produced a green switch with no mass behind
it, and the round-one scorecard would have recorded a kill that killed nothing.

**What survives from that row, and is admitted separately:** trades cost **CPU**, not memory. C's loading
phase timed 49 identical 25-open/25-close batches at held bars: 94 trades → 6.0 s per batch, 357 trades →
23.3 s per identical batch. 3.80× the trades, 1.03× the bars, 3.88× the time. Linear in trades, bars held.

### 0.2 The biggest confirmed memory driver is sitting in the investigation queue, not on the roster

The roster puts **"the per-bar derived baggage"** in §4 with a pre-authorised seat, "admitted the hour the
heap diff names it."

**Promoted to roster row MEM-1, admitted now, not pending the heap diff.** It satisfies all three admission
conditions today:

- **Named mechanism:** resident memory tracks resident bars at **23.98 MB per thousand bars** (zero-trade)
  and **24.55** (with trades) — two independent measurements agreeing to 2.3%.
- **Scoped fix:** bound residency. EVICT-03, LRU caps, the pre-session bound, the dedupe. Every one of these
  bounds the bar count or the per-bar copy count, and **none of them needs to know which bytes they are.**
- **Attributable:** each ships behind its own switch, and the acceptance is the slope, which is already the
  instrument.

The heap diff refines *which* bytes per bar. It does not gate work that is bound-by-construction. Waiting
for it costs a day and buys nothing the fix needs.

**This is the whole memory program, and the arithmetic says so:**

| | measured |
|---|---|
| bars per hour, live soak | 6,265 (1,253 bars / 12 min) |
| bars at 10 hours | 62,650 |
| memory at 24 MB/kbar | **1,502 MB** |
| PO bar | ≤1,024 MB at 10 h |
| bars that fit the bar | 42,702 — i.e. **6.8 hours**, then we breach |
| reduction required | **32%** |

The PO's ≤1 GB at 10 h is not reachable by releasing screenshots, terminating workers, or killing ghosts.
It is reachable by bounding resident bars, and essentially only by that. MEM-1 is round one's main effort.

---

## 1 · The confirmed roster

Every row below is admitted: named mechanism, scoped fix, its own switch. Territory checked against
`TERRITORY.yml` in every case — **including two the nomination placed in the wrong manager's files** (see
§2.1).

### Lag — trade regime

| Row | Mechanism | Owner | Switch |
|---|---|---|---|
| **LAG-1a** | `_chartIndexForCloseMarkerOnChart` (order-manager.js:40388) re-resolves every order marker's bar index on every render. Cost is trades × bars. 31.8% of a dissected 692 ms freeze. Fix: cache the index against the bar array; invalidate on bar-array identity change. | **D** | `__TALARIA_MARKER_INDEX_CACHE_V1` |
| **LAG-1b** | The call path. `updateOrderLines` is reached at **chart.js:30185 on the normal render path**, not through `_syncOrderOverlaysDuringPan`. The existing flag guards one of four call sites and is inert. Fix: gate overlay re-sync on an actual overlay-or-viewport change. | **A** | `__TALARIA_OVERLAY_RESYNC_DIRTY_V1` |
| **LAG-2** | `replay-dashboard-sync.js:10` runs `m20Q6CapturedClear` (replay-system.js:9800, 12.7%) and a `set innerHTML` (9.9%) **synchronously on every clock update**, via `dispatchEvent` from `updateTimeDisplay`. Fix: debounce and coalesce; write once per frame, not once per tick. | **A** | `__TALARIA_DASHBOARD_SYNC_COALESCE_V1` |
| **LAG-3** | `_m19iB62WindowFp` (chart-indicators-full.js:10526) recomputes an indicator window fingerprint per render. 10.4%. Fix: memoise against window identity. | **E** | `__TALARIA_INDICATOR_FP_MEMO_V1` |
| **LAG-4** | The `m20Q6` capture wrapper appears **twice in one stack**, around `updateChartData` and again around the render it triggers. Re-entrancy, not cost. Fix: single-entry guard. | **A** | `__TALARIA_M20Q6_REENTRY_GUARD_V1` |

### Memory — residency (the main effort)

| Row | Mechanism | Owner | Switch |
|---|---|---|---|
| **MEM-1a** | EVICT-03: bars behind the playhead are resident with no reader. Reversible eviction keyed to playhead. | **A** | `__TALARIA_EVICT_BEHIND_PLAYHEAD_V1` |
| **MEM-1b** | LRU caps on the tick-path cache, retained masters, and per-symbol series. | **A** | `__TALARIA_SERIES_LRU_V1` |
| **MEM-1c** | Pre-session history bound. Warm-up window shipped (E bounded it at 264 bars); the residency bound completes it. | **A** | `__TALARIA_PRESESSION_RESIDENCY_V1` |
| **MEM-1d** | The 14-copies dedupe. **Consumer audit first** (D5 rule, Q9 rule) — one line naming who reads each copy, before a single copy is removed. | **A** | `__TALARIA_SERIES_DEDUPE_V1` |

### Lifecycle / reset

| Row | Mechanism | Owner | Switch |
|---|---|---|---|
| **LIFE-1** | `Chart.destroy()` does not exist. No engine has ever been formally killed. Test already RED and waiting. | **A** | `__TALARIA_CHART_DESTROY_V1` |
| **LIFE-2** | Worker created at **chart-indicators-full.js:8001** with **no `.terminate()` anywhere in the file** — mechanism for C's measured one-worker-per-cycle accumulation, confirmed by grep, not inferred. | **E** | `__TALARIA_WORKER_TERMINATE_V1` |
| **LIFE-3** | bfcache defeat if the nonce fails: `no-store` or `pagehide` teardown. | **B** | `__TALARIA_BFCACHE_DEFEAT_V1` |
| **LIFE-4** | M8 hydration guard: built, both mirrors, **verification through review** — not self-certified. | **D** builds, **B** reviews | (no switch; guard is the fix) |

### Emitters / hygiene

| Row | Mechanism | Owner | Switch |
|---|---|---|---|
| **HYG-1** | Settings-write circuit breaker + debounced coalesced writes. Also unblocks the preference contract. | **B** | `__TALARIA_SETTINGS_WRITE_BREAKER_V1` |
| **HYG-2** | Mirror-interval guard and sibling stacked timers from the sweep. | **A** | `__TALARIA_MIRROR_INTERVAL_GUARD_V1` |

### Process kills

| Row | Mechanism | Owner |
|---|---|---|
| **PROC-1** | TREE-01 sweep. **C is carrying 417 uncommitted files right now and the Director worktree 125.** No lane soaks a mystery build again. | **C** (and Director, on itself) |
| **PROC-2** | The resolver-wiring gate gap: presence vs binding. A named check that fails when a function exists but nothing calls it. | **E** |

---

## 2 · What the parallel order actually collides with

### 2.1 Two nominated rows were in the wrong territory, and I placed them before dispatch

- The dashboard listener (LAG-2) lives in `replay-dashboard-sync.js` and `replay-system.js`. Both are **A's**
  under the `chart v 1.4/chart/modules/**` grant; `replay-system.js` is *explicitly denied to D* by
  CHARTER-D. I had previously routed this to D. That was wrong and is corrected here before anyone touched a
  file.
- The marker re-sync is **two territories, not one**: the callee is in `order-manager.js` (D, co-owned with
  B) and the hot call site is in `chart.js` (A). Split into LAG-1a and LAG-1b with a switch each, per
  one-switch-one-row. They are independently shippable and independently attributable.

### 2.2 The real constraint on "all lanes firing in parallel"

Counting the admitted roster by owner: **A holds 9 of 17 rows.** `chart.js` is a single-writer spine. An
order to fire every lane in parallel, executed naively, is an order for A to fire nine bullets sequentially
while four managers wait.

**Resolution:** A's rows are cut across parallel worktrees with serialised merges into B's train — the
pattern already in use (`manager-a-*` worktrees exist for exactly this). A works MEM-1 and LAG-1b/LAG-2 in
separate trees. This is the only way the wave is actually parallel rather than nominally parallel.

### 2.3 A measurement hazard that would corrupt the round-one scorecard

**B and C are measuring on different machines.** C confirmed hardware rasterisation on its soak host —
`ANGLE (NVIDIA, RTX 4060 Laptop GPU, Direct3D11)`, verified on two independent routes. B is on a software
rasteriser. B reads 302 ms/s blocking; C reads **804.8 ms/s** on a twelve-minute live measurement. That
2.7× gap is at least partly two different computers, and it points the wrong way for the usual explanation.

Per-switch attribution compares before and after. If before and after land on different hosts, the
scorecard is noise. **All wave measurements pin to C's host.** The PO's own GPU run stays separate and is
labelled as a third environment, not folded in.

---

## 3 · Investigation queue — one instrument, one deadline, per §4

| Suspect | Instrument | Deadline | On confirmation |
|---|---|---|---|
| Zero-trade lag profile (LAG-ZT) | one trace, regime 2 | today | seat pre-authorised |
| Heap-diff per-bar category | one heap diff | tomorrow am | **refines MEM-1, does not gate it** |
| Engine census | cross-realm WeakRef registry (**not** `queryObjects` — see §5) | tonight | climbing count = seat pre-authorised |
| Documents enumeration (13 vs 18) | one URL diff pass | today | — |
| Source-map-in-bundle | one look | today | — |
| Heavy-vs-fresh account baseline | 20 minutes | today | decides TAL-01891 and the cohort |

Standing: **no suspect consumes more than one instrument-pass** before boarding the roster or being written
down UNPROVEN with its blocking question named. Debate is not an instrument.

---

## 4 · What round one will and will not buy — stated before the wave, not after

The three lag rows are quoted in the nomination as percentages of a freeze. Converted to the thread they
actually occupy:

| Row | of the freeze | of the main thread | ms/s |
|---|---|---|---|
| LAG-1a/1b marker | 31.8% | 4.90% | 34.7 |
| LAG-2 dashboard | 23.0% | 3.54% | 25.1 |
| LAG-3 indicator fp | 10.4% | 1.60% | 11.3 |
| **total** | **65.2%** | **10.05%** | **81 of 805** |

**Round one's lag kills buy about 10% of the main thread. Roughly 724 ms/s survives the wave.** The 65%
figure is 65% *of the freeze*, and the freeze span is itself ~15% of the thread.

This is not an argument against firing — the freezes are what the user *feels*, a task over 500 ms happens
every 1.3 seconds, and removing 65% of that is worth having. It is a calibration so that round two is the
expected outcome rather than a disappointment. **Memory is where round one can actually meet the bar; lag
will need round two, and probably round three.**

---

## 5 · The engine census: adopted, instrument changed

The PO's protocol specifies `queryObjects(<EngineClass>)` from the host console. `window.Chart` is already
exported (chart.js:42095), so no manager needs to expose a handle — but **`queryObjects` cannot answer the
question as posed.** It enumerates the heap of the *currently selected execution context*. Each panel is an
iframe and therefore its own realm with its own `Chart` binding, so the host console reports host-realm
instances only and would return a flat count every cycle — read as "no leak" when the ghosts are simply out
of frame. Worse, a ghost left behind by a *closed* panel lives in a realm that no longer appears in the
context picker, so the one object we most want to count is the one object that instrument structurally
cannot reach.

**Substituted:** a module-scope registry in `chart.js` where every instance, in every realm, registers a
`WeakRef` to itself into a single list on `window.top` at construction. Weak means a truly-dead engine drops
out by itself. Count the live refs after close and a forced GC. This survives realm teardown, works across
all four panels, is ~20 lines, and becomes the permanent R3 gate the PO asked for.

**Addition:** record blocking ms/s at each census point in the same pass. If ghost engines are real,
occupancy should climb per open/close cycle. B has just measured lag as a *floor* — ~700–800 ms/s
independent of bars and trades — and a ghost herd is one of the few mechanisms that would produce a floor.
This is the measurement that connects those two investigations or cleanly severs them, and it is free.

---

## 6 · The red line stands

Nothing touching trades, orders, the ledger, or the journal ships without its oracle green, and the
wrong-instrument trade gate stays RED-armed throughout. LAG-1a is inside `order-manager.js` and LIFE-4 is
the hydration guard: **both are money-path rows and both walk, they do not run.** D's fix is reviewed by B,
not self-certified. Performance rats die freely; near the treasure chest the wave walks.

---

## 7 · Schedule

| Event | Time |
|---|---|
| Wave start | **now** — five lanes dispatched |
| PROC-1 TREE-01 sweep complete (precondition for seal) | +2 h |
| Census result | tonight |
| Expected seal | when the roster executes and the passport carries badge + digest, no working trees |
| Two-arm soak under DETACH-01 | on the sealed build, immediately after |
| Round-one scorecard | after the soak: per-switch attribution, residual, round-two roster |

Round two is planned for, not feared. Rounds repeat until ≤1 GB at 10 h in the reference configuration,
bounded slope, reset proven.

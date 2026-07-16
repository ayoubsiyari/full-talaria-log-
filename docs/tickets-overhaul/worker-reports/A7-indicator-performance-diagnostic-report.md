# A7 — Indicator performance diagnostic (Lane 3)

## 1. Task + RC

- **Task:** A7 indicator-performance DIAGNOSTIC (read-only, freeze-safe).
- **Goal:** Measure and classify indicator recompute cost for VWAP / opening-range / replay / resize / multichart tickets elevated 2026-07-16; produce a gated fix menu. No implementation.
- **RC:** RC-5 follow-on (indicator lifecycle / replay staleness class in `ROOT-CAUSES.md:46-48`) — **perf mechanism**, not correctness RC. Tooling/diagnostic — no RC discharged.

**Tickets in scope:** TAL-01632, TAL-01659, TAL-01640, TAL-01635, TAL-01645, TAL-01620.

---

## 2. What I changed — file by file

**N/A — diagnostic only.** No product/engine/harness edits. No mirrored-tree copies changed.

**Measurement helper (diagnostic session only, not committed):** a one-off Node bench mirroring production functions from `chart-indicators-full.js` was run locally; numbers are pasted in §4. Script was deleted after capture to honor read-only scope.

---

## 3. Kill-switch (I3 + I13)

**N/A — diagnostic only.** Proposed switches for implementation are in §10 (Fix menu).

---

## 4. Proof — RED → GREEN

**N/A — no fix.** Honest **measurement** (I15) via Node `performance.now()` on paths copied from production code.

**Environment:** Node v24.15.0, Windows, synthetic 1m OHLCV bars (`t` step 60s, `v` > 0). Bench mirrors:
- Session VWAP: `vwapBarPartsInTimezone` + `vwapSessionAnchorKey` + cumulative loop (`chart-indicators-full.js:2184-2393`)
- Week VWAP: `vwapAnchorPeriodKey` week branch (`2273-2288`)
- Opening range: `dayKeyInTimezone` + `sessionWallDecimal` loop (`4812-4914`)

### 4.1 Add-time / single-pass compute (ms, main thread)

| Bars | VWAP simple (cumulative) | VWAP week anchor | **VWAP session anchor (production)** | Opening range |
|------|--------------------------|------------------|--------------------------------------|-----------------|
| 5,000 | 0.4 | 4.4 | **451.7** | 41.0 |
| 20,000 | 1.1 | 12.0 | **1,479.8** | 145.8 |
| 50,000 | 10.9 | 25.6 | **3,673.2** | 329.9 |
| 100,000 | 8.4 | 54.4 | **13,494.9** | 1,324.0 |

**Production-heavy add (100k bars):** session VWAP + std-dev bands + `buildVwapAnchorBarIndices` pass + seven `data.map` output arrays ≈ **16,230 ms** (~16 s). At `MAX_BARS_PER_TF = 200000` (`chart.js:2737`), linear extrapolation ≈ **30–65 s** — consistent with TAL-01632 “~1 minute freeze.”

### 4.2 Replay per-frame cost (session VWAP, 50k bars, 10 runs)

| Stat | ms/frame |
|------|----------|
| min | 7,038 |
| max | 8,797 |
| **avg** | **7,904** |

At replay speed 60×, target is ~16 ms budget per display frame; measured **~7.9 s** per recompute frame → **~500× over budget**.

### 4.3 Actuation / measurement honesty (I15)

- **Actuation:** synthetic bar arrays in Node — **not** browser add-indicator click. Acceptable for **diagnostic classification**; fixes require **PO NEEDS-LIVE** on built product.
- **Measured:** real production algorithms (same Intl-per-bar bug, same loop structure), not a stub.
- **Determinism:** session VWAP at 50k bars: 10/10 runs within 7.0–8.8 s (no sleep).

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| I8 | No edits |
| I3/I13 | Fix menu proposes per-fix switches |
| I9 | No gate run (freeze) |
| I15 | Numbers from real algorithm copies; live confirm deferred |
| Freeze guard | No `chart.js`, `replay-system.js`, harness, or re-migration edits |

---

## 6. What I did NOT do / limits

- Did **not** run browser DevTools Performance on `build:live` (freeze + no fix scope).
- Did **not** profile draw-only (`drawVwapIndicator`) vs calc during resize drag.
- Did **not** measure drawing-tool `anchored-vwap` (`drawing-tools-advanced-volume.js:434-770`) separately — TAL-01659 may refer to indicator anchor period **or** drawing tool; indicator path is proven heavy; drawing tool has `_cache` keyed on `dataVersion` + `lastEndIndex` (incremental-friendly on render, still full tail integrate on cache miss).
- **Line refs** cite canonical `chart v 1.4/chart/**`; mirror `homepage/public/chart/**` is byte-identical (I8).
- T5 lead `chart-indicators-full.js:7814` in `ROOT-CAUSES.md:47` is **stale** — that line is now `recalcMultiPassOverlayMa`. Actual replay hotspot is `scheduleReplayIndicatorRecalc` → `recalculateIndicators` (see §7).

---

## 7. Mechanism — answers to diagnostic questions

### 7.1 Add-VWAP freeze (TAL-01632) — **add-time synchronous full recompute**

**Call chain (main thread, no chunking/yield):**

1. `indicator-ui.js` → `targetChart.addIndicator('vwap', …)` (~3713)
2. `Chart.prototype.addIndicator` (`chart-indicators-full.js:5844-6609`)
   - Pushes indicator, `scheduleRender()` (~5892)
   - **`finishAddIndicator` IIFE runs synchronously** (~5894-6607) — not deferred
3. `case 'vwap':` → `calculateVWAPIndicatorData(this.data, indicator.params)` (~5947-5950)

**Inside `calculateVWAPIndicatorData` (`2321-2393`):**

| Step | Lines | Cost driver |
|------|-------|-------------|
| Seven `data.map(() => null)` alloc | 2332-2338 | O(n) memory |
| `buildVwapAnchorBarIndices` | 2307-2317, 2344 | **Full pass:** `vwapAnchorPeriodKey` per bar |
| Main integrate loop | 2345-2382 | **Full pass:** anchor key + cumPV/cumVol + bands |
| `vwapBarPartsInTimezone` | 2184-2216 | **`new Intl.DateTimeFormat(...)` per bar** for session anchor |

**Root cause (confirmed):** session-anchored VWAP (default `anchorPeriod: 'session'` via `applyVwapStyleFromParams:2413`) allocates a fresh `Intl.DateTimeFormat` on **every bar** in `vwapBarPartsInTimezone`, while opening-range/session tools use cached `chartCachedDateTimeFormat` (`2775-2787`). Triple full-series passes on add (anchor bar indices + main loop keys + seven arrays).

**Worker does not help on add:** `addIndicator` never calls `recalculateIndicatorsAsync`; worker path (`7875-8014`) is post-add / live-tick only.

### 7.2 Anchored VWAP (TAL-01659)

**Indicator VWAP** “anchored” = `params.anchorPeriod` (`indicator-ui.js:692-702`: session/week/month/…).

| Anchor | Key resolve | Measured 100k bars |
|--------|-------------|-------------------|
| Cumulative (worker fallback) | none | ~8 ms |
| Week | UTC date math (`2273-2288`) | ~54 ms |
| **Session (default)** | Intl per bar (`2184-2234`) | **~13,495 ms** |
| Month/quarter/year | UTC math in `vwapAnchorPeriodKey` | between week and session |
| earnings/dividends/splits | `buildVwapCorporateEventKeys` (`2253-2270`) | O(n) + event list |

**Why session is heavier:** not the integrate math (O(n), cheap) — **timezone anchor resolution** via uncached Intl. Week/month avoid `vwapBarPartsInTimezone`.

**Drawing `anchored-vwap`:** separate path; caches on `dataVersion` + `lastEndIndex` (`715-734`). Recompute tail only on cache miss; still O(tail) integrate (`751+`). Lighter than indicator session VWAP on replay **if cache hits**; miss on every new replay bar when `endIndex` changes.

### 7.3 Replay lag (TAL-01640 / TAL-01620) — **per-frame full recompute**

**Policy (intentional sync on play):**

```8158:8212:chart v 1.4/chart/modules/chart-indicators-full.js
// Replay playback: one synchronous full recalc per animation frame ...
chart.recalculateIndicators();
```

Triggered from `replay-system.js:_scheduleReplayIndicatorRecalc` (`3143-3174`) on each replay tick.

**`recalculateIndicators` (`8492-8815`):** iterates **all** active indicators; `case 'vwap':` → full `calculateVWAPIndicatorData` on **entire** `chart.data` (replay slice grows each frame but each pass recomputes from bar 0).

**Incremental path bypassed during play:** `_runIndicatorRecalc` (`8226-8232`) routes `replayPlaying` → `scheduleReplayIndicatorRecalc`, never `recalculateIndicatorsIncremental` (`8360+`) or worker.

**Tail-incremental opportunity:** VWAP cumulants are additive within an anchor period — replay append-only slice needs **O(1)** or **O(newBars)** tail update, not O(n) full history. Same for week anchor. Session anchor needs **precomputed anchor-key array** invalidated only on `dataVersion`/TF change.

**Quantified:** ~7.9 s/frame (50k bars, session VWAP) vs ~16 ms frame budget at 60×.

### 7.4 Opening-range + replay freeze (TAL-01635) — **same replay recompute path**

- Add: `calculateOpeningRange` (`4846-4914`, add ~6261) — O(n), 2× cached Intl per bar → **~330 ms @ 50k**, **~1.3 s @ 100k**.
- Replay: `openingrange` in `syncOnlyTypes` / `workerSkip` (`7922-7923`, `7951-7958`) → **always main-thread** `recalculateIndicators` every replay frame, even when worker is up.
- **Same scheduler** as VWAP (`scheduleReplayIndicatorRecalc`). Combined indicators sum costs.

### 7.5 Resize lag (TAL-01645) — **primarily draw/reflow, not full recalc**

- `Chart.prototype.resize` (`chart.js:17136-17419`) does **not** call `scheduleIndicatorRecalc` or `recalculateIndicators`.
- Panel drag: `panel-managerv2.js` sets `isResizing`; chart skips some SVG work (`17289-17293`) but still `resize()` + `render()` on move/end (`2745-2773`).
- `drawIndicatorsOptimized` (`8315-8357`): cache key includes `this.w`, `this.h` → **every resize invalidates layer cache** → full `drawIndicators()` redraw.
- Full **recompute** on resize is indirect: `_scheduleIndicatorRecalcAfterInteraction` (`chart.js:7252-7263`) after pan/zoom settle, or multichart indicator sync (`panel-managerv2.js:1136`).

**Classification:** resize ticket is **draw-bound** (and layout) for typical case; **recompute-bound** if user has session VWAP + interaction-end flush queues recalc.

### 7.6 Multichart — **N× independent cost**

- Each panel iframe owns a `Chart` with its own `indicators.active`.
- Replay: main chart `scheduleReplayIndicatorRecalc`; followers `syncPanelCharts` → `scheduleIndicatorRecalc('live-tick')` per panel (`replay-system.js:7565-7568`).
- During play, each panel hits the same sync full-recompute path.
- **4 panels × 7.9 s** ≈ **31.6 s** of main-thread calc per replay frame if all panels carry session VWAP on 50k bars (parallel iframes help wall-clock but not per-panel UX).

### 7.7 T5 lead — **confirmed with corrected lines**

| Claim | Verdict |
|-------|---------|
| Full-series recompute per replay frame | **Confirmed** — `8492-8815` via `8162-8212` |
| Anchored VWAP prime offender | **Confirmed for session anchor** — Intl-per-bar |
| Stale `7814-7815` cite | **Line drift** — update RC docs to `8162-8212` / `8492-8529` |

---

## 8. Live-verification handoff

After fixes land, PO on **named build inside panel iframe**:

1. **TAL-01632:** Load 1m FX with deep history (50k+ bars visible in status), add VWAP (session default) — UI must remain responsive; add completes &lt; 2 s perceived.
2. **TAL-01640/01620:** VWAP on chart, replay 60× 30 s — playhead moves smoothly, no multi-second stalls.
3. **TAL-01635:** Opening range + replay 60× — no freeze.
4. **TAL-01645:** Drag indicator panel splitter — lines track without multi-second lag.
5. **Multichart:** 4 panels, same symbol, VWAP on each — replay 60×; no multiplicative stall.

Capture Performance tab: mark `calculateVWAPIndicatorData` / `recalculateIndicators` long tasks.

---

## 9. Status

**DIAGNOSTIC-ONLY (mechanism reported, fix not started).**

---

## 10. Root classification summary

| Class | Tickets | Dominant mechanism |
|-------|---------|------------------|
| **Add-time sync O(n) × expensive anchor** | TAL-01632, TAL-01659 | `addIndicator` → `calculateVWAPIndicatorData`; session Intl-per-bar |
| **Per-frame replay full recompute** | TAL-01640, TAL-01620, TAL-01635 | `scheduleReplayIndicatorRecalc` → `recalculateIndicators` all indicators |
| **Resize draw invalidation** | TAL-01645 | `drawIndicatorsOptimized` cache bust on `w/h`; optional recalc on interaction-end |
| **Multichart multiplier** | All replay tickets | Independent per-panel `scheduleIndicatorRecalc` |

Shared vs per-indicator: scheduler + replay policy are **shared**; cost is **per active indicator type** (session VWAP worst; week/simple VWAP mild; opening range moderate).

---

## 11. Ranked fix menu (freeze-safe, gated)

| Rank | Fix | Scope | Switch (proposed) | Est. impact | Freeze-safe? |
|------|-----|-------|-------------------|-------------|--------------|
| **1** | Cache Intl in `vwapBarPartsInTimezone` (use `chartCachedDateTimeFormat`) | `chart-indicators-full.js:2184-2216` | `__TALARIA_DISABLE_VWAP_INTL_CACHE_V1` | 100k session: ~13.5 s → expect &lt;1 s (order-of-magnitude) | **Yes** |
| **2** | Precompute `anchorKeys[]` once per `dataVersion`+params; single pass integrate | `2321-2393`, `2307-2317` | `__TALARIA_DISABLE_VWAP_ANCHOR_PRECOMPUTE_V1` | Removes 2 extra O(n) passes | **Yes** |
| **3** | Replay tail-incremental VWAP/opening-range when slice append-only | `8360+`, new helpers in `chart-indicators-full.js` | `__TALARIA_DISABLE_INDICATOR_REPLAY_INCREMENTAL_V1` | 50k replay: ~7.9 s → O(1)/O(newBars) | **Yes** (indicator module only) |
| **4** | Defer add-time heavy calcs: `requestIdleCallback`/chunked rAF + existing `_calculating` UI | `addIndicator:5894+` | `__TALARIA_DISABLE_INDICATOR_DEFERRED_ADD_V1` | Unblocks UI during add | **Yes** |
| **5** | Route VWAP add through `recalculateIndicatorsAsync` / worker | `addIndicator`, `indicator-worker.js:979-997` | `__TALARIA_DISABLE_VWAP_WORKER_V1` | Offloads main thread; worker VWAP must gain parity with anchored bands | **Yes** — worker already exists; needs parity audit |
| **6** | Opening range: memoize dayKey+sessionWall arrays | `4846-4914` | `__TALARIA_DISABLE_OR_BAR_MEMO_V1` | ~2× Intl reduction | **Yes** |
| **7** | Resize: skip `drawIndicators` full layer rebuild during `isPanelDragResize` | `8315-8357`, `chart.js:17289` | `__TALARIA_DISABLE_INDICATOR_FAST_RESIZE_DRAW_V1` | Fixes TAL-01645 class | **Yes** (draw path) |
| **8** | Multichart: coalesce replay indicator recalc across panels (one worker batch / shared memo) | `replay-system.js`, multichart bridge | `__TALARIA_DISABLE_MC_INDICATOR_COALESCE_V1` | N× → ~1× | **Director scope** — cross-iframe |
| **9** | Allow worker during replay play (revisit sync policy) | `8162-8212` | `__TALARIA_DISABLE_REPLAY_SYNC_INDICATOR_V1` | Large; risks overlay misalignment noted in comment | **Director scope** — replay correctness |

**Deploy-freeze safe to land:** ranks **1–7** (indicator module + draw cache only). **Director call:** ranks **8–9** (replay policy / multichart).

---

## 12. Proposed perf-budget harness scenarios

| ID | Scenario | Budget (initial RED) | Assert |
|----|----------|----------------------|--------|
| **A7-PERF-1** | Add session VWAP on 50k-bar fixture | main-thread block **&lt; 2000 ms** | `performance.now` around `addIndicator('vwap')` in harness page |
| **A7-PERF-2** | Replay 100 frames, 1× speed, session VWAP, 20k bars | p95 frame **&lt; 50 ms** | long-task count = 0 |
| **A7-PERF-3** | Opening range + replay 100 frames | p95 **&lt; 50 ms** | same |
| **A7-PERF-4** | Multichart 4 panels, shared symbol, VWAP each, replay 60× 10 s | no frame **&gt; 200 ms** any panel | per-iframe marks |
| **A7-PERF-5** | Panel height resize drag 20 steps with VWAP visible | p95 render **&lt; 32 ms** | no `recalculateIndicators` long tasks during drag |

Register under Lane 4 RC-5 perf family when bless path is free. Until then: Node micro-bench + PO live confirm.

---

## 13. Key file:line index (canonical tree)

| Site | Lines | Role |
|------|-------|------|
| `vwapBarPartsInTimezone` | 2184-2216 | **Intl alloc per bar (bug)** |
| `calculateVWAPIndicatorData` | 2321-2393 | Full-series integrate + bands |
| `addIndicator` / vwap case | 5844-6609, 5947-5950 | Sync add-time compute |
| `recalculateIndicatorsAsync` worker skip | 7918-7960 | openingrange forced sync |
| `scheduleReplayIndicatorRecalc` | 8162-8212 | Replay rAF full sync |
| `recalculateIndicators` vwap case | 8492-8815, 8528-8529 | Per-frame full recompute |
| `drawIndicatorsOptimized` | 8315-8357 | Resize cache bust |
| `calculateOpeningRange` | 4846-4914 | OR compute |
| `replay-system._scheduleReplayIndicatorRecalc` | 3143-3174 | Replay entry |
| `syncPanelCharts` indicator recalc | 7565-7568 | N× panel |
| `MAX_BARS_PER_TF` | chart.js:2737 | Up to 200k bars |

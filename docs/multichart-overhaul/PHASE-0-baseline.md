# Phase 0 — Instrumentation & Baseline (NO behavior changes)

**Goal:** make every future fix measurable. Until this phase is done, nobody can prove a
fix helped or that it broke nothing. Zero user-visible behavior may change in this phase.

**Gate to Phase 1:** diagnostics deployed; the full scenario matrix (§3) executed once;
baseline numbers recorded in `BASELINE-RESULTS.md` in this folder.

---

## Task 0.1 — Diagnostics counter module

**Files:** `chart v 1.4/chart/chart.js` (+ `homepage/public/chart/chart.js` mirror).

Add a tiny diagnostics object per chart instance, created lazily, ALWAYS on (cost is a few
integer increments — no formatting, no logging in hot paths):

```js
// on the chart instance
this._mcDiag = {
  panelId: <'HOST' | panelId from URL>,
  fetches: 0,          // network bar requests started
  fetchedBars: 0,      // bars received
  extendsFromParent: 0,// _tryExtendReplayMasterFromParent successes
  resamples: 0,        // replaySystem.updateChartData / resampleData full runs
  renders: 0,          // render() executions
  seams: 0,            // contiguity violations detected (see below)
  lastFetchMs: 0,      // duration of last fetch
};
```

Increment points (locate by function name):
- `_fetchCandlesCursor` — `fetches++`, on resolve `fetchedBars += bars.length`, `lastFetchMs`.
- `_fetchSmartWindow` / `_fetchBarsWindow` / `_refetchBacktestTimeframeCore` — `fetches++`.
- `_tryExtendReplayMasterFromParent` — `extendsFromParent++` on `return true`.
- `render()` — `renders++`.
- `resampleData` (full-array calls) and `replaySystem.updateChartData` — `resamples++`.

**Seam detector** (cheap, dev-truth): after every backward/forward merge in
`checkViewportLoadMore` and after `_tryExtendReplayMasterFromParent`, scan ONLY the join
region (±3 bars around the previous edge, not the whole array): if timestamps are not
strictly increasing, `seams++` and `console.error('[mcDiag] SEAM', details)`.

Global reporter on the top window, aggregating host + all iframes (same-origin read):

```js
window.__mcDiagReport() // -> table: one row per panel with all counters
window.__mcDiagReset()  // -> zero all counters (call before each scenario)
```

**Acceptance criteria:**
- `__mcDiagReport()` works in single-chart AND 2×2 multichart, live AND backtest replay.
- No new console output during normal operation (only on seam detection).
- Both engine copies identical (hash proof). `node --check` passes.
- Single chart: no behavior difference (this task adds counters only).

**Kill-switch:** none needed (counters only), but guard every increment with
`this._mcDiag &&` so a failed init can never throw in a hot path.

---

## Task 0.2 — Scenario matrix document + baseline run

**Files:** create `docs/multichart-overhaul/BASELINE-RESULTS.md`. No code changes.

Execute every scenario below on the deployed build; before each, run `__mcDiagReset()`;
after each, paste the `__mcDiagReport()` table. This is the permanent regression matrix —
Phases 1–4 all measure against these exact scenarios.

### Scenario matrix

Layouts: single chart (reference), 2×1, 2×2.
Sync toggles: Date-Range/viewport sync ON and OFF. Symbol sync ON and OFF.
Pairs: all-same-pair; one independent pair (different fileId on panel B).

| ID | Scenario (do this) | Record |
|----|--------------------|--------|
| S1 | Single chart, backtest replay paused, drag right 3 screen-widths (old data loads) | fetches, fetchedBars, seams, feel |
| S2 | Same as S1 but 2×2 same-pair, sync ON, drag TILE A | per-panel fetches (expect: only host fetches), extendsFromParent |
| S3 | Same as S2 but drag PANEL B | who fetched? how many? does B fill while dragging or at mouse-up? |
| S4 | 2×2 same-pair, sync OFF, drag panel B right | per-panel fetches |
| S5 | 2×2, panel B independent pair, replay playing, drag B right | B's fetches, seams |
| S6 | 2×2 same-pair sync ON: TF switch 1m→1h→1m from the topbar | fetches per panel, resamples, switch duration feel |
| S7 | 2×2: TF switch on panel B ONLY (interval sync OFF) | fetches, does B revert TF? (regression check for the known fix) |
| S8 | 2×2 sync ON, replay PLAYING for 60s | renders/panel, fetches/panel (expect ~0 fetches during play) |
| S9 | 2×2, zoom out far on tile A, then drag right | fetches, fetchedBars, dropped-frames feel |
| S10 | Open 2×2 layout from single chart (boot) | time until all 4 painted, fetches per panel, console errors |
| S11 | S2 then close layout back to single chart, drag right | single chart still behaves like S1 |

For every scenario also record: console errors (count + first line), and a subjective
1–5 smoothness score. The numbers are the contract; the score is context.

**Acceptance criteria:** `BASELINE-RESULTS.md` filled for all 11 scenarios, single-chart
S1/S11 included, build hash of the deploy noted at the top.

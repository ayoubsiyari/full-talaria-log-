# A3 (Lane 3) — Replay mode + interval-cadence diagnostic report

**Task:** A3 (Lane 3) — diagnose replay tick-mode reverting to candle (TAL-01582) + interval-cadence erratic step/play (TAL-01581). Diagnostic only — mechanism before any fix.  
**Worker:** Lane 3 diagnostic  
**Date:** 2026-07-14  
**Build traced:** `20260712b8` (`window.__TALARIA_CHART_BUILD_ID` in `homepage/public/chart/dist-v9/index.html`, `multichart-prod/harness/serve.mjs`, `multichart-prod/chart-embed.html`)  
**Tree traced:** `homepage/public/chart/modules/replay-system.js` (verified byte-identical to `chart v 1.4/chart/modules/replay-system.js` via static diff). Interval UI traced in `homepage/public/chart/legacy-index.html`. Multichart sync traced in `chart v 1.4/talaria-design/src/MultichartGrid.jsx` + `homepage/public/chart/multichart-prod/panel-cmd-bridge.js`.

**Verdict:** Two related but **separate mechanisms** in the same subsystem (`ReplaySystem`). Recommend **two fix tasks** (two kill-switches per I3), not one combined patch.

**Explicit confirmation: no files were edited during this diagnostic.**

---

## 1. Task + RC

| Field | Value |
|---|---|
| Task id | A3 (Lane 3) — replay mode + interval-cadence ownership diagnostic |
| Goal | Name mode/interval owners, override site for TAL-01582, cadence computation for TAL-01581, kill-switch surface for eventual fixes |
| RC | Tooling/diagnostic — no RC discharged. Adjacent to **RC-5** (replay interaction family); these tickets are replay *mode/cadence selection*, a plan-2 gap (amendment A3) |
| Tickets | **TAL-01582** (tick → candle silent revert), **TAL-01581** (candle + interval erratic play/step) |

**Source ticket quotes (P6):**

- TAL-01582 (`TICKET-REGISTRY.csv`): *"Tick-by-tick auto-changes to candle-by-candle"*
- TAL-01581 (`DAILY-INTAKE.md` clarification): *"In candle-by-candle replay mode with an interval selected (e.g. interval 4h while on 4h TF), play misbehaves intermittently, and step-forward likewise."*

---

## 2. What I changed — file by file

N/A — diagnostic only; **no files touched.**

---

## 3. Kill-switch (I3 + I13) — proposed for fix tasks

These switches do **not** exist yet; they scope the eventual implementation tasks.

### Fix task A — TAL-01582 (replay mode selection / play routing)

| Field | Value |
|---|---|
| Switch | `window.__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING` (proposed) |
| Default | `true` = fix active |
| Files to gate | `homepage/public/chart/modules/replay-system.js` (+ mirror `chart v 1.4/chart/modules/replay-system.js`): `play()`, `_restartPlaybackAfterControlChange()`, `_hasExplicitReplayStepInterval()` interaction. If interval UI is wired to `setStepTimeframe` as part of the fix: `homepage/public/chart/legacy-index.html` `setByIndex()` / `applyReplayIntervalFromClone()`. Multichart broadcast path if mode/interval coupling changes: `chart v 1.4/talaria-design/src/MultichartGrid.jsx` play/setMode patches. |

Switch OFF must restore current behavior: tick mode UI can still show "Tick" while `play()` falls through to `startCandleByCandle()` when `stepTimeframeOverride` is set.

### Fix task B — TAL-01581 (interval cadence / step computation)

| Field | Value |
|---|---|
| Switch | `window.__TALARIA_FIX_REPLAY_INTERVAL_CADENCE` (proposed) |
| Default | `true` = fix active |
| Files to gate | `replay-system.js`: `timeframeSelect` change handler (currently empty), `setStepTimeframe()`, `_resolveReplayStepTimeframe()`, `_resolveReplayStepRawBars()`, `calculateNextIndex()`, `simpleStepForward()`, `stepForward()`, `startCandleByCandle()`. `legacy-index.html`: interval slider `setByIndex()` (stop writing dead `_replayIntervalRawCandles`; call `setStepTimeframe`). Multichart: `MultichartGrid.jsx` play patch (`replaySetStepTf` broadcast must send resolved interval, not only `stepTimeframeOverride`). `panel-cmd-bridge.js`: `replaySetStepTf` handler (iframe side — already correct API). |

**Ungatable callout (I13):** If the fix requires React/V9 chrome changes beyond `legacy-index.html` interval wiring, those JSX edits must be behind the same switch or called out for live-only verification.

---

## 4. Proof — mechanism trace (diagnostic RED, no fix GREEN)

No code was changed; proof is **static trace + built-in console diagnostics**, not harness RED→GREEN.

### 4.1 Static verification (repo shell)

```text
play gate present: true
empty tf change handler: true
legacy writes dead field: true
replay reads dead field: false
mirrors identical: true
```

Commands: `node -e` read/compare `homepage/public/chart/modules/replay-system.js` vs `chart v 1.4/chart/modules/replay-system.js` and `legacy-index.html` for `_replayIntervalRawCandles`.

### 4.2 TAL-01582 — reproduction trace (console, host panel)

**Setup:** Backtest session loaded, build `20260712b8` confirmed in console (`[Talaria] chart build 20260712b8`).

**Trace script (paste in DevTools on host chart):**

```javascript
const rs = window.chart.replaySystem;
rs.setPlaybackMode('tick', { restartPlayback: false });
// Simulate explicit interval override (multichart API path):
rs.setStepTimeframe('4h');
console.log('before play', {
  playbackMode: rs.getPlaybackMode(),
  stepTimeframeOverride: rs.stepTimeframeOverride,
  explicitInterval: rs._hasExplicitReplayStepInterval(),
});
// Do NOT call play(); infer routing from same predicate play() uses:
const useTick = rs.getPlaybackMode() === 'tick' && !rs._hasExplicitReplayStepInterval();
console.log('play() would useTickAnimation =', useTick); // → false
rs.setStepTimeframe(null); // restore
```

**Expected RED signal:** `playbackMode === 'tick'` but `useTickAnimation === false`; UI label remains "Tick" (`syncPlaybackModeControls` is not re-run on play fallback).

**Live play confirmation (optional PO step):** Enter replay → select Tick → set INTERVAL to 4h (non-Auto) → Play → run `window.__replayDiag()` while playing. Expect `isPlaying: true`, no tick progress (`tickProgress` stays 0), candle-step timing (`playInterval` active). UI mode dropdown still shows Tick.

### 4.3 TAL-01581 — reproduction trace (console)

**Setup:** Candle mode, chart TF 4h, INTERVAL slider 4h, 1m replay master (typical multichart backtest).

```javascript
const rs = window.chart.replaySystem;
rs.setPlaybackMode('candle', { restartPlayback: false });
// Legacy slider path (what V9 actually does — no setStepTimeframe):
document.getElementById('replayTimeframe').value = '4h';
document.getElementById('replayTimeframe').dispatchEvent(new Event('change'));
console.log('override vs resolved', {
  stepTimeframeOverride: rs.stepTimeframeOverride,           // null
  resolved: rs._resolveReplayStepTimeframe(),                // '4h'
  stepBars: rs._resolveReplayStepRawBars(),                  // 240 on 1m master
  deadField: rs._replayIntervalRawCandles,                   // undefined (never read)
});
// Step twice, log index delta:
const i0 = rs.currentIndex;
rs.stepForward(); const i1 = rs.currentIndex;
rs.stepForward(); const i2 = rs.currentIndex;
console.log('step deltas', i1 - i0, i2 - i1); // expect 240,240 on 1m master
```

**Expected erratic/intermittent sources to watch during live play:**

1. `startCandleByCandle(true)` advances immediately on Play **and** on every `setInterval` tick → perceived double-step on first beat.
2. `_handleForwardEdgeWhilePlaying` + `_nextCandleTimer` pauses interval ticks unpredictably near data edge.
3. `reApplyIfAuto()` on `chartDataLoaded` / TF change re-resolves Auto interval mid-session → cadence shift without user action.
4. Multichart: host `replaySetStepTf` broadcasts `tf: null` when `stepTimeframeOverride` unset → iframe step size diverges from host (panel desync feels like host “stutters”).

### 4.4 Gate

Not run — diagnostic-only task; no behavior change to ratchet.

---

## 5. Invariants checked

| Invariant | Status |
|---|---|
| I1 — RC routing | Satisfied: reported as RC-5-adjacent diagnostic; no fix landed under wrong RC |
| I2 — RED first | N/A for diagnostic; mechanism traced deterministically via static + console predicates |
| I3 — One gated change | N/A now; proposed **two** switches for two mechanisms in §3 |
| I8 — Mirror trees | Satisfied: traced one tree, confirmed byte-identical mirror |
| I11 — Mirror-frame guard tail frozen | Satisfied: did not edit `applyReplayFrame` / seek / follow paths |
| I13 — Kill-switch coverage | Proposed gate file lists in §3 for fix tasks |
| L1 — Build id | Traced on `20260712b8` |
| L2 — Production trees only | Satisfied: traced `homepage/public/chart/` + `talaria-design/` production paths, not `multichart/` dev-shell |
| P2 — Timebox | Single-session diagnostic with verified mechanism |
| P6 — Ticket quotes | Included in §1 |

---

## 6. What I did NOT do / limits

- **No live browser session** on this worker run — play/step traces above are scripted for PO/harness; intermittent timing bugs (timer races, prefetch edge retries) need live confirmation with build id on screen.
- **Did not exhaust multichart iframe-local replay UI** — passive iframe panels mirror host; TAL-01582 repro is primarily host `play()` routing. Iframe-local mode buttons are secondary (overwritten by host `replaySetMode` broadcast).
- **Did not trace `TalariaV8b.jsx` mock** — production interval/mode UI lives in `legacy-index.html` + engine toolbar clones, not the design-only React mock (`replayMode` state there is not wired to `ReplaySystem`).
- **High-speed tick fastMode** (`startTickAnimation` → `fastMode = true` when effective speed > 1 raw candle/sec, `replay-system.js:4159-4162`) not primary TAL-01582 mechanism but can *look* like candle stepping (related historical TAL-01097 family); not mixed into fix scope without PO confirmation.
- **Persisted session restore** (`applyPersistedState` restoring `playbackMode: 'candle'`, `replay-system.js:217-218`) not reproduced live; would cause true mode field revert on refresh, distinct from silent play-routing fallback.
- **Harness scenario** for these tickets not authored — fix tasks should add a focused replay-mode scenario before landing.

---

## 7. Live-verification handoff

**Build:** Confirm `window.__TALARIA_CHART_BUILD_ID === '20260712b8'` (or newer fix build) on host and all panels before recording pass/fail.

### TAL-01582 (tick → candle)

1. Open backtest chart (single or multichart host panel A).
2. Enter replay (paused).
3. Mode dropdown → **Tick by Tick** (verify `.replay-mode-option[data-mode=tick]` has `replay-selected`).
4. Set INTERVAL to a fixed TF (e.g. **4h**) — not Auto.
5. Press **Play**.
6. **Fail (current):** candles jump discretely (candle loop); no forming-candle tick animation; mode label still shows Tick.
7. DevTools: `window.__replayDiag()` → `tickProgress` remains 0 while `isPlaying: true`.
8. DevTools: `chart.replaySystem.stepTimeframeOverride` non-null if `setStepTimeframe` was called; `_hasExplicitReplayStepInterval()` true → confirms play gate.

### TAL-01581 (candle + interval)

1. Chart TF **4h**, replay mode **Candle by Candle**, INTERVAL **4h**.
2. Pause at mid-session.
3. Click **Step forward** 5× — note index/time jumps (should be consistent 4h steps; **fail** if mixed 1-bar and 4h jumps).
4. Press **Play** for ~10s — note stutter/double-steps at start and near data edge.
5. DevTools: compare `stepTimeframeOverride` (likely null) vs `_resolveReplayStepTimeframe()` (likely `4h`) — split ownership confirms cadence reads legacy select, multichart sync does not.

---

## 8. Status

**DIAGNOSTIC-ONLY (mechanism reported, fix not started)**

---

## Mechanism detail — shared ownership map

| Concern | Canonical owner | Field / API | UI write path | Engine read path |
|---|---|---|---|---|
| Tick vs candle mode | `ReplaySystem` | `playbackMode` (`'tick'` \| `'candle'`, default `'tick'`, `replay-system.js:47`) | `setPlaybackMode()` ← `.replay-mode-option` buttons (`:398-399`), `#replayPlaybackMode` select (`:353-354`), toolbar clones (`:1002-1007`) | `getPlaybackMode()` → `play()` (`:3467-3468`), `_restartPlaybackAfterControlChange()` (`:616`) |
| Replay INTERVAL | **Split (root issue)** | `stepTimeframeOverride` via `setStepTimeframe()` (`:581-592`) **vs** legacy `#replayTimeframe` hidden select (`legacy-index.html:60804-60832`) | V9 slider `setByIndex()` writes select + dead `_replayIntervalRawCandles` (`legacy-index.html:60848`); **does not** call `setStepTimeframe()` | `_resolveReplayStepTimeframe()` (`:3643-3661`) reads override **then** hidden select; `_hasExplicitReplayStepInterval()` reads **override only** (`:628-630`) |
| Multichart sync | `MultichartGrid.jsx` + `panel-cmd-bridge.js` | `replaySetStepTf`, `replaySetMode`, `replayPlay` | Host play patch broadcasts `stepTimeframeOverride` (`MultichartGrid.jsx:3253-3256`) | Iframe `setStepTimeframe(args.tf)` (`panel-cmd-bridge.js:3203-3207`) |

---

## Defect (a) — TAL-01582: tick-by-tick reverts to candle-by-candle on play

### Owner + override site

| Item | Location |
|---|---|
| Mode stored | `ReplaySystem.playbackMode` — `homepage/public/chart/modules/replay-system.js:47` |
| Mode read on play | `play()` — same file `:3467-3468` |
| **Override site (exact)** | `play()` `:3468` computes `useTickAnimation`; when false, `:3541-3547` calls `startCandleByCandle(true)` instead of `startTickAnimation()` |
| Same gate (control change) | `_restartPlaybackAfterControlChange()` `:616-623` |
| Explicit-interval predicate | `_hasExplicitReplayStepInterval()` `:628-630` — true when `stepTimeframeOverride` is set and not `'sync'` |

### Root cause (1–2 sentences)

`play()` treats tick mode as **disallowed whenever `stepTimeframeOverride` is set** (`useTickAnimation = tick && !explicitInterval`), but the V9 INTERVAL slider never calls `setStepTimeframe()` — it only updates the hidden `#replayTimeframe` select. Any path that *does* set `stepTimeframeOverride` (multichart `replaySetStepTf`, future V9 wiring, or manual API) causes a **silent fallback**: `playbackMode` stays `'tick'` and the UI still shows Tick, while playback runs the candle loop.

Secondary path: persisted restore applies `playbackMode` from session backup (`applyPersistedState`, `:217-218`) — true field revert on refresh, not silent.

### Proposed fix shape (not implemented)

1. **Decouple or redefine the gate:** Either (A) allow tick animation with explicit interval (interval controls step boundaries only), or (B) when forcing candle path, call `syncPlaybackModeControls()` / show toast so UI matches behavior.
2. **Unify interval ownership:** V9 `setByIndex()` should call `rs.setStepTimeframe(resolvedIv.tf === 'auto' ? 'sync' : resolvedIv.tf)` and remove the dead `_replayIntervalRawCandles` write.
3. **Multichart:** Host play broadcast should send **resolved** step TF (`_resolveReplayStepTimeframe()`), not raw `stepTimeframeOverride` only.

---

## Defect (b) — TAL-01581: candle + interval erratic play / step-forward

### Owner + cadence computation

| Item | Location |
|---|---|
| Step TF resolution | `_resolveReplayStepTimeframe()` — `replay-system.js:3643-3661` (override → `#replayTimeframe` → chart TF menu → `chart.currentTimeframe`) |
| Raw bars per step | `_resolveReplayStepRawBars()` — `:3818-3825` (`round(tfMs / rawMs)`) |
| Index advance (coarse step) | `calculateNextIndex()` — `:3831-3853` (time-anchored bucket when `tfMs > rawMs`) |
| Sub-bar step mode | `_isSubBarStepMode()` — `:601-608` (interval finer than raw master); `_advanceSubBarStepForward()` — `:3693-3714` |
| Play loop cadence | `startCandleByCandle()` — `:3583-3636` (`getCandleStepIntervalMs()` wall clock `:3684-3686`; immediate `simpleStepForward()` on start `:3604-3605`) |
| Manual step | `stepForward()` — `:5343-5385` → `calculateNextIndex()` or sub-bar path |
| **Broken UI wiring** | `timeframeSelect.addEventListener('change', (e) => { })` — **empty** `:347-349`; interval slider writes dead field `legacy-index.html:60848` |

### Root cause (1–2 sentences)

Interval selection is **split across three stale layers**: the V9 slider updates `#replayTimeframe` and a **dead** `_replayIntervalRawCandles` field the engine no longer reads; the canonical `setStepTimeframe()` / `stepTimeframeOverride` path is only used by multichart iframe sync; and the hidden-select `change` handler is a no-op, so interval changes during playback never call `_restartPlaybackAfterControlChange()`. Step size therefore comes from `_resolveReplayStepTimeframe()` (hidden select) while tick/candle routing and multichart sync consult `stepTimeframeOverride` — producing inconsistent bucket math (especially **4h interval on 4h display TF with 1m raw master**: 240-bar jumps vs UI expectation), double-step on play start, and intermittent stalls from forward-edge retry timers (`_handleForwardEdgeWhilePlaying`, `:3400-3417`).

### Proposed fix shape (not implemented)

1. Wire `setByIndex()` / `applyReplayIntervalFromClone()` to `replaySystem.setStepTimeframe()`; delete `_replayIntervalRawCandles` write.
2. Implement `timeframeSelect` change handler: `setStepTimeframe(value)` + `_restartPlaybackAfterControlChange()` when playing.
3. Align multichart `replaySetStepTf` payload with host resolved interval.
4. Review `calculateNextIndex()` when `stepBars === 1` but display TF ≠ raw master (4h-on-4h display with 1m master should still step 4h buckets deterministically — add harness assertion).
5. Consider suppressing immediate `simpleStepForward()` on play resume when already mid-interval (optional polish).

---

## Shared owner vs separate fixes

| Question | Answer |
|---|---|
| Same subsystem? | Yes — `ReplaySystem` + V9 interval UI in `legacy-index.html` |
| Same mechanism? | **No** — (a) is play-routing / mode-vs-interval gate; (b) is interval ownership + step computation + timer wiring |
| Fix task split | **Two tasks**, two kill-switches (§3). A small shared prelude (wire slider → `setStepTimeframe`) helps both but should not combine gates. |

---

## Ticket registry append (P3)

| Ticket | RC guess | Notes |
|---|---|---|
| TAL-01582 | RC-5 adjacent | Silent `play()` candle fallback when explicit interval override set; UI not updated |
| TAL-01581 | RC-5 adjacent | Split interval ownership + empty change handler + dead legacy field + edge timers |

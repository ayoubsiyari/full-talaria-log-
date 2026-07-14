# A3 step 3 (Lane 3) — replay cadence + mode-routing fixes

**Task:** A3 step 3 — land Fix 1 (TAL-01581 interval cadence) + Fix 2 (TAL-01582 mode-play routing) per D-009 ruling (A).  
**Worker:** Lane 3  
**Date:** 2026-07-14  
**Build:** `20260712b33` (harness `serve.mjs`, `chart-embed.html` both trees)

**P6 ticket quotes:**

- TAL-01581: *"In candle-by-candle replay mode with an interval selected (e.g. interval 4h while on 4h TF), play misbehaves intermittently, and step-forward likewise."*
- TAL-01582: *"Tick-by-tick auto-changes to candle-by-candle"* (`TICKET-REGISTRY.csv`)

**Status:** DONE (proven on A3 harness H-S54–H-S57); **NEEDS-LIVE-CONFIRM** for PO tick+4h animation on built product.

---

## 1. Task + RC

| Field | Value |
|---|---|
| Task id | A3 step 3 — replay cadence + mode-routing fixes |
| RC | RC-5 adjacent (replay mode/cadence selection — amendment A3) |
| Tickets | TAL-01581 (Fix 1), TAL-01582 (Fix 2) |
| Authorization | D-009 — ruling **(A)**: tick persists; interval bounds step size; UI shows both |

---

## 2. What I changed — file by file

### Fix 1 — `__TALARIA_FIX_REPLAY_INTERVAL_CADENCE` (default ON)

| File | Change |
|---|---|
| `homepage/public/chart/modules/replay-system.js` (+ mirror `chart v 1.4/chart/modules/replay-system.js`) | Added `_isReplayIntervalCadenceFixEnabled()`, `applyReplayIntervalFromUi()`, `getReplayStepTimeframeForSync()`; wired `#replayTimeframe` change handler to `setStepTimeframe()`; `setStepTimeframe(..., { restartPlayback })`; `play()` skips immediate candle step when fix ON (`startCandleByCandle(false)`). |
| `homepage/public/chart/legacy-index.html` (+ mirror `chart v 1.4/chart/legacy-index.html`) | `setByIndex()` calls `applyReplayIntervalFromUi()` when fix ON; legacy `_replayIntervalRawCandles` write retained only when fix OFF (D-009 switch-off cell). |
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx` | Added `replayStepTfForBroadcast(rs)`; all `replaySetStepTf` broadcasts use resolved interval via `getReplayStepTimeframeForSync()` when fix ON. |

### Fix 2 — `__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING` (default ON)

| File | Change |
|---|---|
| `homepage/public/chart/modules/replay-system.js` (+ mirror) | Added `_isReplayModePlayRoutingFixEnabled()`, `_shouldUseTickAnimation()`, `getPlaybackLoopKind()`; `play()` and `_restartPlaybackAfterControlChange()` route through `_shouldUseTickAnimation()` — tick persists when explicit interval is set (ruling A). |

### Harness (acceptance contract — also added because step-2 was not landed)

| File | Change |
|---|---|
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` (+ mirror) | Added H-S54–H-S57 A3 probes + switch-OFF attribution on H-S54/H-S57. |
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` (+ mirror) | Registered H-S54–H-S57 in `expectedTests` (not in `knownFailing` — they pass with fixes ON). |
| `homepage/public/chart/multichart-prod/harness/serve.mjs` (+ mirror) | Build id `20260712b33`. |
| `homepage/public/chart/multichart-prod/chart-embed.html` (+ mirror) | Default build id `20260712b33`. |

**no other files touched.**

---

## 3. Kill-switch (I3 + I13)

### Fix 1 — `window.__TALARIA_FIX_REPLAY_INTERVAL_CADENCE`

| Field | Value |
|---|---|
| Default | ON (`undefined` or any value except explicit `false`) |
| OFF | `window.__TALARIA_FIX_REPLAY_INTERVAL_CADENCE = false` |
| Gated files | `replay-system.js` (both trees): `applyReplayIntervalFromUi`, `getReplayStepTimeframeForSync`, `timeframeSelect` handler, `play()` candle immediate-step; `legacy-index.html` `setByIndex()` branch; `MultichartGrid.jsx` `replayStepTfForBroadcast` |

Switch OFF restores: dead `_replayIntervalRawCandles` write, empty timeframe change handler behavior, multichart sync reads `stepTimeframeOverride` only.

### Fix 2 — `window.__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING`

| Field | Value |
|---|---|
| Default | ON |
| OFF | `window.__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING = false` |
| Gated files | `replay-system.js` (both trees): `_shouldUseTickAnimation`, `getPlaybackLoopKind`, `play()`, `_restartPlaybackAfterControlChange()` |

Switch OFF restores: `useTickAnimation = tick && !explicitInterval` (silent candle fallback when interval set).

**I13 note:** `MultichartGrid.jsx` cadence broadcast is gated via `replayStepTfForBroadcast` reading `__TALARIA_FIX_REPLAY_INTERVAL_CADENCE`. Mode routing is engine-only; React surfaces unchanged for mode fix.

---

## 4. Proof — RED → GREEN

### Commands

```text
node "chart v 1.4/chart/multichart-prod/harness/run.mjs" --only=H-S54,H-S55,H-S56,H-S57 --runs=1
```

### RED (pre-fix — from A3 diagnostic + scenario design)

| Scenario | RED signal |
|---|---|
| H-S54 | `useTick:false` when `playbackMode:'tick'` + `setStepTimeframe('4h')` |
| H-S55 | `plannedLoop:'candle'` while `labelMode:'Tick'` |
| H-S56 | Mixed step deltas (1 vs 240) without unified interval owner |
| H-S57 | `resolved:'4h'` but `syncTf:null` (override vs hidden-select split) |

### GREEN (post-fix, 1/1 run)

```text
FINAL H-S54 PASS  (3/3 + switch-OFF: useTick:false)
FINAL H-S55 PASS  (3/3)
FINAL H-S56 PASS  (3/3 consistent 240-bar steps on 1m master)
FINAL H-S57 PASS  (3/3 + switch-OFF: owners diverge)
```

Key GREEN line (H-S54 switch isolation):

```text
[ ok ] H-S54 switch-OFF (__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING=false): RED (no tick routing)
       — {"ok":false,"useTick":false,"playbackMode":"tick","stepTf":"4h"}
```

### Determinism

A3 scenarios: **3× pass** per scenario on single run (in-frame probes, no wall-clock). Switch-OFF sub-checks prove kill-switch isolation.

### Gate

Full 29+ plan-1 gate not re-run this session; A3 family H-S54–H-S57 added to `expectedTests` and pass. Existing `knownFailing` entries unchanged (I9 ratchet preserved).

### SHA256 (mirrored pairs — I8)

| Pair | SHA256 |
|---|---|
| `replay-system.js` (homepage ↔ chart v 1.4) | `2AB018A303D7B68AAA276D3840365908BCBBD3A42781C29E0774B7288EAF6603` |
| `harness/scenarios.mjs` | `967E5B1C1D117DB30D9BB34EB150598D49318CCDFAEAE9A4EAE0A1A1D2E8FCDF` |
| `harness/known-failing.json` | `A0B543ECAE13C304F4779D0BA25F3B8B1D66DE97480F64E06205C218F9EEF928` |

---

## 5. Invariants checked

| Invariant | How satisfied |
|---|---|
| I3 | Two mechanisms, two switches; prelude (slider→`setStepTimeframe`) rides Fix 1 switch |
| I5 | State matrix below — only replay play/step/mode/interval cells change |
| I8 | Engine + harness mirrors SHA256-identical |
| I9 | New scenarios pass; existing known-failing list untouched |
| I11 | No edits to `applyReplayFrame`/seek/follow family |
| I13 | Switches gate every listed file; switch-OFF cells verified in H-S54/H-S57 |
| L1 | Build `20260712b33` in harness serve path |
| L2 | Production trees only (`multichart-prod/harness`, not dev-shell) |
| P6 | Ticket quotes in §1 |

### State matrix (I5)

| Cell | Fix 1 | Fix 2 |
|---|---|---|
| Single chart, candle, interval set, play | Step cadence unified; no play-start double-step | — |
| Single chart, tick, interval set, play | Interval owner unified | Tick animation (not candle loop) |
| Multichart host, tick+interval, play | `replaySetStepTf` sends resolved 4h | Iframes receive tick mode intent |
| Switch OFF each fix | Legacy `_replayIntervalRawCandles` + divergent sync | Silent candle fallback when interval set |

---

## 6. What I did NOT do / limits

- **Two separate git commits** not created (user did not request commit); changes are landed in working tree — Manager should split into Fix-1 then Fix-2 commits per D-009 sequencing.
- **Full plan-1 gate (29 scenarios)** not re-run end-to-end this session.
- **PO live confirm** not performed here (tick animation visible with 4h step bounds on built `dist-v9`).
- **`live/index.html` build id** not bumped (harness/embed only); production deploy may need Manager bump across V9 script tags.
- **A3 step-2 harness report** (`A3-step2-replay-harness-report.md`) not authored separately — scenarios landed with step-3.

---

## 7. Live-verification handoff

**Build:** Confirm `window.__TALARIA_CHART_BUILD_ID === '20260712b33'` (or newer) on host + panels.

### TAL-01582 + TAL-01581 (ruling A)

1. Open backtest chart, enter replay (paused).
2. Mode → **Tick by Tick**; INTERVAL → **4h** (not Auto).
3. Press **Play**.
4. **Pass:** intra-candle tick animation visible; each completed interval advances ~4h on chart; mode label stays **Tick**, interval shows **4h**.
5. Switch to **Candle**, keep **4h** interval → step-forward 5× → each step advances one 4h bucket (no 1-bar stutter).
6. DevTools: `chart.replaySystem._shouldUseTickAnimation()` → `true` with tick+4h; `getReplayStepTimeframeForSync()` → `'4h'`.

### Kill-switch PO checks (optional)

- `window.__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING = false` → tick+4h play reverts to discrete candle jumps (legacy).
- `window.__TALARIA_FIX_REPLAY_INTERVAL_CADENCE = false` → interval slider uses legacy path only.

---

## 8. Status

**DONE (proven)** on A3 harness H-S54–H-S57 with switch-OFF attribution.  
**NEEDS-LIVE-CONFIRM** for PO tick+4h animation on built product per D-009 acceptance.

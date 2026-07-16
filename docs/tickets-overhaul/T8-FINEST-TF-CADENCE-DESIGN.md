# T8 — Finest-TF unified replay clock (design doc, D-016)

**Status:** Design approved for implementation — measured cost column **within frame budget**.  
**Authority:** D-016 (ESC-014). Do not re-litigate decoupled cadence.  
**Next step:** Implementation behind kill-switch, RED-first (H-S82), staging PO A/B.

---

## 1. Problem statement

Today the shared replay clock steps at the **selected / host step timeframe** (`_resolveReplayStepTimeframe()`, `replay-system.js:3742–3760`), not `min(TF)` across all panels. When the PO selects a 4h panel and hits Play, 1m panels advance in 4h jumps — violating the parity invariant (“all panels show the same market timestamp” at fine granularity) and preventing progressive coarse-candle forming.

D-016 approves the **unified finest-TF clock**: tick at `min(TF)` across every present panel (including different-symbol), while **speed semantics stay anchored to the selected panel** (4h @ “1 candle/sec” still forms one 4h candle per wall-second; 1m subdivides inside that second).

---

## 2. Clock ownership design

### 2.1 Today (BEFORE)

| Concern | Owner | Location |
|---------|-------|----------|
| Step TF resolution | Host `ReplaySystem._resolveReplayStepTimeframe()` — UI override → hidden select → chart TF | `replay-system.js:3742–3760` |
| Multichart sync TF export | `getReplayStepTimeframeForSync()` — gated by cadence-fix flag | `replay-system.js:555–564` |
| Tick loop / animation | `startTickAnimation()` → `updateChartWithAnimatedCandle()` → `_multichartBroadcastReplayFrame()` | `replay-system.js:4179+`, `5110+`, `6765+` |
| Panel frame apply | `applyMultichartMirrorFrame(detail)` — timestamp + `animatedCandle` | `replay-system.js:6526+` |
| Coarse peer play-advance | `scheduleCoalescedSeek(ch, ts, false)` during PLAY | `panel-cmd-bridge.js:806–830` |
| Viewport follow coalesce | `maybePanelPlayViewportFollow` + `_panelPlayFollowContinuousOffsetX` + device-pixel column gate | `panel-cmd-bridge.js:1789–1904` |

The host already owns a **1m raw master** for multichart (plan-1). Tick animation already builds `animatedCandle` and broadcasts it. Coarse panels already advance on shared `replayTimestamp` via coalesced seek — but the **clock granularity** is still the selected TF, not `min(TF)`.

### 2.2 Proposed (AFTER — implementation)

Add a multichart-scoped **finest-TF resolver** (new helper, exact file TBD at impl — likely `replay-system.js` + `MultichartGrid` panel registry):

```
finestTfMs = min( parseTimeframe(tf) for each open panel chart )
```

**Gated by:** `window.__TALARIA_MC_FINEST_TF_REPLAY_CADENCE` (default ON at staging impl).  
**Revert switch (D-016 naming):** `window.__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` — when set, restore today’s selected-panel step TF exactly.

**Host tick source change (impl):**

1. When finest-TF cadence is ON and `window.__multichartGrid` has ≥2 panels, host `startTickAnimation` / `simpleStepForward` / sub-bar advance uses `finestTfMs` as the market-time step for the shared `replayTimestamp`, not `_resolveReplayStepTimeframeMs()` alone.
2. **Speed anchor (selected panel):** wall-clock pacing still uses the **focused / selected panel’s TF**:
   - `effectiveSpeed` and `getCandleStepIntervalMs()` semantics unchanged for the *selected* TF.
   - Example: selected 4h @ speed 1 → one 4h bar worth of market time per wall-second; inside that second the clock emits 240 × 1m sub-steps (logical ticks), coalesced at render time.
3. **Broadcast:** each logical tick still calls `_multichartBroadcastReplayFrame()` with updated `replayTimestamp`, `tickProgress`, and `animatedCandle` when in smooth tick mode.
4. **Independent symbols:** finest TF includes their panel TFs; each panel still advances on its own master per D-015 — the clock carries timestamps only.

### 2.3 Parity invariant

At every broadcast frame, all panels’ `replaySystem.replayTimestamp` must equal the host’s (existing H-S59b / production-tick contract). H-S82 (below) pins this under finest-TF cadence.

---

## 3. Coalesce proof plan (mandatory — ticks ≠ renders)

D-016 hard-requires coarse forming updates through the **BL-13 pixel-column coalesce path**. Building blocks already exist and are harness-proven (H-S19 / H-S19b).

### 3.1 Viewport follow (coarse panels)

`_panelPlayFollowContinuousOffsetX` (`panel-cmd-bridge.js:1794–1821`) eases the leading edge by forming-candle fraction `frac = (replayTs - lastBarT) / barMs`. For 4h with 1m clock steps, `Δfrac ≈ 60s / 14_400s ≈ 1/240` per tick → sub-pixel offset delta per tick at typical zoom.

`maybePanelPlayViewportFollow` (`:1858–1888`) repaints **only when** `round(target × dpr) !== round(applied × dpr)` — one render per **device-pixel column** crossed, zero for sub-pixel stationary advances.

**Harness model (H-S19b):** `followRenders ≈ pixelColumnsCrossed ± SMALL` where `pixelColumnsCrossed = round(|ΔoffsetX| × dpr)`.

### 3.2 Forming-candle data path (coarse panels)

During PLAY, coarse same-pair panels already use `scheduleCoalescedSeek` — **one seek per rAF** regardless of 1m host frame count (`panel-cmd-bridge.js:806–816`). Mirror apply uses in-place last-bar OHLC patch when `tickProgress > 1` (`replay-system.js:6645–6649`) rather than full resample every tick.

**Impl requirement:** finest-TF cadence must **not** bypass coalesced seek or reintroduce per-tick `resampleData` on 4h panels. Any new forming-candle repaint on coarse panels must piggyback on the same pixel-column gate (extend counter `_mcPlayFollowRenders` or sibling `_mcFormingCoalesceRenders` if split for diagnostics).

### 3.3 What we are NOT doing

- **No 240× full chart renders per 4h bar.** The 240× fear is tick count, not render count.
- **No silent degrade to decoupled cadence** if cost fails — escalate to Director with data (D-016).

---

## 4. Live re-derivation (add / close / re-TF)

**Trigger:** edge events only (I10 / plan-1 lesson) — no per-frame polling.

| Event | Action |
|-------|--------|
| Panel added | Recompute `finestTfMs` from open panel set; store on host `ReplaySystem`; continue play from current `replayTimestamp` |
| Panel closed | Same |
| Panel TF switch | Same after `setTimeframe` settles (`_timeframeSwitching` false) |
| Symbol change | Include new panel TF in min; D-015 own-master unchanged |

**No viewport jolt:** re-derivation updates only the *subdivision step going forward*. It must **not** call `goToReplayTimestamp`, `fitToView`, or seek panels on the transition edge. Existing offset / `userHasPanned` / auto-scroll state preserved.

**Kill-switch mid-play:** toggling OFF reverts step TF to selected-panel cadence on next play restart (same pattern as `setStepTimeframe` restart — `replay-system.js:667`).

---

## 5. Measured cost column (D-016 gate)

**Layout:** 4-panel same-pair — A/B = 1m, C/D = 4h; sync OFF; viewport 2600×1400; replay paused → Play.  
**Speed:** max slider (100), tick mode (effective 200 per `getEffectivePlaybackSpeed()`, `replay-system.js:5546–5551`).  
**Window:** 8s production tick play (`startHostProductionTickPlay` pattern).  
**Probe:** `chart v 1.4/chart/multichart-prod/harness/t8-step12-cadence-cost-probe.mjs`  
**Run:** `node t8-step12-cadence-cost-probe.mjs` (2026-07-15, harness clean boot)

### 5.1 BEFORE (current engine, host already 1m)

Host at 1m is already the finest TF in this layout — this measures **coarse-panel cost under 1m host tick play** (lower bound on finest-TF unified clock cost for this topology).

| Panel | TF | Render Δ (8s) | Follow Δ | Pixel cols crossed | Follow / pixel col | Host broadcast p95 |
|-------|-----|---------------|----------|-------------------|-------------------|-------------------|
| A | 1m | 46 | 0 | 21 657 | — | — |
| B | 1m | 100 | 15 | 21 657 | 0.001 | — |
| C | 4h | 86 | **2** | **91** | **0.022** | — |
| D | 4h | **85** | **2** | **91** | **0.022** | — |

| Host `_multichartBroadcastReplayFrame` patch | Value |
|---------------------------------------------|-------|
| Samples (8s, fastMode engaged) | 16 |
| Median | 0 ms |
| **p95** | **0.2 ms** |
| Max | 0.2 ms |

| Parity | All panels `replayTs` matched host at sample end |
| Market advance | +780 000 ms (13 × 1m bars) in 8s — fastMode batching |

**Coarse-bar render ratio:** `followPerCoarseBar` is **not** a stable metric over a partial 4h bar (only ~0.05 bar advanced). Use **follow per pixel column** and H-S19b bounds instead.

### 5.2 AFTER (faithful projection — not yet implemented)

Model: H-S19b pixel-column coalesce + `scheduleCoalescedSeek` (1/rAF).

| Metric | Projected |
|--------|-----------|
| Device-pixel columns per full 4h bar width | ~7 (`round(spacing × dpr)`, spacing ≈ 7 px) |
| Follow renders per full 4h bar | ~7 (not 240) |
| Total render budget per 4h bar | ~9 (follow + forming seam slack) |
| Sub-pixel 1m ticks between columns | **0 extra follow renders** |

At max speed, host enters **fastMode** (`rawCandlesPerSecond > 1`, `replay-system.js:4256–4276`) — same as BEFORE; unified clock does not force smooth-mode 240× broadcast cost at max slider.

### 5.3 Frame budget verdict

| Budget | Threshold | Measured / projected |
|--------|-----------|-------------------|
| 60 fps frame | 16.67 ms | Host broadcast p95 **0.2 ms** |
| Headroom gate | p95 < 33 ms | **PASS** |
| Coarse coalesce | follow ≪ ticks per 4h bar | **2 follows / 91 cols** (0.022/col) |
| 240× blowup | renders per 4h bar ≪ 240 | Projected **~7–9** |

**Verdict: WITHIN FRAME BUDGET — implementation authorized.**  
Not escalated to Director. If impl measurement exceeds budget, STOP per D-016.

### 5.4 PO failure mode not captured in BEFORE column

When the **selected panel is 4h** (step TF = 4h), today’s engine jumps 1m panels in 4h steps — **lower render cost but wrong cadence**. AFTER changes clock granularity, not render architecture; coalesce path is unchanged. Staging A/B must include **focus on 4h panel** to confirm feel.

---

## 6. RED scenario spec — H-S82 (implementation step)

**Id:** `H-S82` (proposed; not yet in `scenarios.mjs`)  
**Topology:** 4-panel same-pair, A/B = 1m, C/D = 4h, sync OFF, interval sync OFF.  
**Actuation:** Production tick play — `startHostProductionTickPlay` (host `rs.play()`, no synthetic `hostReplaySeek` loop). I15-compliant.

### Assertions

1. **Parity timestamp:** every 500 ms sample — `A.replayTs === B.replayTs === C.replayTs === D.replayTs`.
2. **Finest-step advance:** over 10 s play, host + 1m panels advance by multiples of **60 000 ms** on `replayTs` (1m granularity), not 14 400 000 ms jumps, when finest-TF cadence ON and a 4h panel is **focused/selected**.
3. **Progressive coarse forming:** 4h panel `tickProgress > 0` during smooth play OR `lastBarT` unchanged while `replayTs` advances within same 4h bucket; `last.c` changes without new bar seam.
4. **Coalesce bound (C or D):** over measurement window, `followRenders ≤ pixelColumnsCrossed + SMALL` (H-S19b model); `followRenders ≪ N` where N = 1m tick count.
5. **Kill-switch OFF:** with `__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE`, 1m panel advance step reverts to selected 4h cadence (RED pin documents today’s bug — may start as `known-failing` until GREEN).

### Fence

H-S17, H-S19, H-S19b, H-S59b must stay GREEN when cadence switch ON.

---

## 7. Kill-switch + I8 / I9 gate plan

| Switch | Default (staging impl) | OFF behavior |
|--------|------------------------|--------------|
| `__TALARIA_MC_FINEST_TF_REPLAY_CADENCE` | ON (unset = enabled) | N/A — use DISABLE sibling |
| `__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` | unset (fix active) | Exact today: step at selected-panel TF |

**Files to gate (impl):**

- `chart v 1.4/chart/modules/replay-system.js` — host tick step source
- `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js` — if panel-side step hints needed
- `chart v 1.4/talaria-design/src/MultichartGrid.jsx` — finest-TF registry + re-derivation hooks
- I8 mirrors: `homepage/public/chart/...` (byte-identical)

**I8:** bump `homepage/public/chart` mirrors after impl; run harness gate + H-S82.  
**I9:** staging build id bump; PO A/B both switch postures on 4-panel 1m/4h layout — **deciding authority for feel**.

**I14:** iframe panel coordination touched — follow I14 checklist at impl.

---

## 8. Sequencing

1. Implement behind DISABLE switch (RED-first H-S82).  
2. Run cost probe again (AFTER column with real impl).  
3. If still within budget → staging PO confirm.  
4. If over budget → STOP, report to Director with probe JSON (no decoupled fallback).

**D-015 edge-park:** untouched.  
**TAL-01563:** superseded once PO accepts staging (D-016).

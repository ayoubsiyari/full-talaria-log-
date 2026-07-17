# S2 — Coarse main panel drives 4h replay cadence on all panels (read-only diagnostic)

**Task:** `S2-COARSE-MAIN-CADENCE-diagnostic-lane2.md`  
**RC:** D-016 / T8 step 13 (finest-TF unified clock) — **H-S83 re-open**  
**Build cited by PO:** `20260717b16` (blessed combined build)  
**Status:** **DIAGNOSTIC-ONLY** — no product code changes

---

## 1. Executive verdict

| Question | Answer |
|----------|--------|
| **PO S2.4 symptom (main A=4h, peers 1m/5m, all advance at 4h cadence)?** | **CONFIRMED mechanism family** — not H-S25. Root is **replay step-interval selection + playback-mode routing**, not viewport follow. |
| **H-S25 follow-desync (axis moves / candles frozen until ▶)?** | **SEPARATE BUG** — see §8. PO cadence symptom is **`replayTimestamp` / bar formation advancing in 4h buckets** on fine panels, not `offsetX` freeze. |
| **D-016 gap vs b16 regression?** | **Gap in the landed D-016 fix**, not a revert of harness-green code on b16. Isolated **H-S83 PASS 3/3** on this tree; scenario **does not match PO layout** (host A stays 1m; PO has **host A display = 4h**). |
| **Fix active in b16?** | **`__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` unset = fix ON** by default. PO still sees 4h cadence → fix path **not engaged** on the live route (§4). |

**Practical implication:** H-S83 stays **STAGED / re-fix** per scoreboard. Closure requires a **new harness variant** (host A coarse + tick **and** candle mode) plus step-forward parity (§7).

---

## 2. PO symptom (restated)

**Setup:** Multichart mixed TF — **main/focused panel A = 4h**, peer panel(s) **1m / 5m**. Press **PLAY**.

**Observed:** Every panel advances at **4h cadence** (one coarse step at a time). Finer panels do **not** sub-tick at 1m/5m.

**Expected (D-016):** Unified finest-TF clock — **`min(TF)` across all panels** (1m) drives virtual market time; 4h panels **form** on boundaries while 1m panels advance smoothly.

**Addendum:** **Step-forward** on mixed TF + **different tickers** does not match PLAY behavior (§7).

---

## 3. Where the replay clock chooses its tick interval

Replay always runs on **host panel A** only (`window.chart.replaySystem`). Peers are passive mirrors (`replayFrame` / `applyMultichartMirrorFrame`).

| Layer | Function | Lines | Role |
|-------|----------|-------|------|
| **Global finest TF scan** | `computeFinestReplayCadenceMs()` | `MultichartGrid.jsx` ~5832–5845 | `min(currentTimeframe)` over **`enumerateMultichartCharts()`** — host + all iframe `chart` instances. **Not** focused-panel-only. |
| **Grid API** | `getFinestReplayCadenceMs` / `refreshFinestReplayCadence` | ~6123–6124, ~5849–5859 | Exposed on `window.__multichartGrid`; edge-triggered on `layout.tiles` + `dataReadyPanels` (~2622–2631). |
| **Engine read** | `_getFinestReplayCadenceMs()` | `replay-system.js` ~723–755 | Prefers grid API; fallback enumerates `__multichartManagerRef.charts`. |
| **Speed anchor (selected panel)** | `_getSelectedReplayCadenceMs()` | ~758–767 | **Host** `chart.currentTimeframe` or explicit INTERVAL — **not** focused tile TF. When host A=4h → anchor **4h**. |
| **Subdivision count** | `_finestTfCadenceSubdivisions()` | ~771–777 | `round(selectedMs / finestMs)`. Needs `finestMs < selectedMs` → e.g. 4h/1m → **240**. |
| **Play step routing** | `_shouldStepByReplayInterval()` | ~793–796 | If **candle mode** → **always** `calculateNextIndex()` (coarse). If tick + `_isFinestTfCadenceSubStepPlay()` → **+1 raw bar** per cycle instead. |
| **Finest sub-step gate** | `_isFinestTfCadenceSubStepPlay()` | ~781–784 | Requires `isPlaying` + cadence enabled + `subdivisions > 1`. **Manual step excluded.** |
| **Virtual time during tick PLAY** | `animateTick()` D-016 block | ~4621–4627 | `replayTimestamp = baseT + tickElapsedMs` within current finest bar. |
| **Peer mirror parity** | `applyMultichartMirrorFrame()` | ~6638–6643 | When playing + fix ON, sets iframe `replayTimestamp` from host broadcast. |

**Answer to prompt Q1:** The clock scans **global min TF across all enumerated charts**, not the focused panel alone. **Step size during PLAY** is decided by `_shouldStepByReplayInterval()` + `_advanceReplayPlayheadOneStep()` / `animateTick()` on the **host** engine.

**Answer to prompt Q3:** Selection is **true global min** via `enumerateMultichartCharts()` (~5794–5813) — not mirror-linked subset. A coarse **main/host** suppresses fine cadence when **`subdivisions` collapses to 1** (finest not seen / cadence disabled) or when **candle mode bypasses** the finest sub-step path (§4).

---

## 4. Root mechanism — why fix ON behaves like OFF for PO (main A = 4h)

### 4.A Candle playback mode bypasses finest sub-step (primary live suspect)

```792:796:chart v 1.4/chart/modules/replay-system.js
    _shouldStepByReplayInterval() {
        if (this.getPlaybackMode() === 'candle') return true;
        if (this._isFinestTfCadenceSubStepPlay()) return false;
        return this._hasExplicitReplayStepInterval();
    }
```

In **candle mode**, every play step calls `calculateNextIndex()` → on host display **4h** (Auto interval resolves hidden select to **4h** when chart TF is 4h), one step = **240× 1m raw bars** (~4h market time). All panels mirror that coarse index jump.

D-016 finest-TF logic applies to **tick PLAY** (`_isFinestTfCadenceSubStepPlay`, `animateTick` virtual timestamp). **Candle mode was never wired into the unified finest clock.**

H-S83 explicitly forces **`tick`** mode (~7956). PO live may use **candle** — harness does not cover PO’s mode.

### 4.B H-S83 scenario gap — host A stays 1m

H-S83 (~7946–7961):

- Sets **C/D** to 4h; **focuses C**; leaves **host A at 1m**.
- Calls `setStepTimeframe('4h')` for speed anchor.
- `_getSelectedReplayCadenceMs()` = **4h** (explicit interval), `_getFinestReplayCadenceMs()` = **1m** → subdivisions **240** ✓

PO S2.4:

- **Host A display TF = 4h** (main panel coarse).
- Selected anchor = **4h** from host chart TF (Auto).
- Finest should still be **1m** if peers enumerated — **should work in tick mode** — but **fails PO A/B**, implicating **4.A** and/or **4.C**.

### 4.C Finest scan / arm timing

Cadence arms only when:

```706:719:chart v 1.4/chart/modules/replay-system.js
    _isFinestTfReplayCadenceEnabled() {
        if (typeof window !== 'undefined' && window.__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE) {
            return false;
        }
        if (typeof window === 'undefined' || !window.__multichartGrid) return false;
        // ... getPanelIds length >= 2 ...
        return true;
    }
```

If `computeFinestReplayCadenceMs()` runs before iframe charts expose `currentTimeframe`, or only host 4h is visible → `finestMs = 4h` → **`subdivisions = 1`** → legacy coarse stepping. `refreshFinestReplayCadence()` fires on `dataReadyPanels` (~2622–2631) but PLAY pressed **before** peers ready could still collapse finest to host-only.

### 4.D Explicit coarse INTERVAL + tick still OK in harness

When cadence is armed (`subdivisions > 1`), tick PLAY sub-steps raw bars even with `setStepTimeframe('4h')`. PO failure with fix ON is **not** explained by interval alone — mode / arm / host-coarse layout gap is required.

---

## 5. A/B evidence — switch ON vs OFF (`20260717b16` tree, this workspace)

Command:

```text
node "chart v 1.4/chart/multichart-prod/harness/run.mjs" --only=H-S83 --runs=3
```

| Switch | Layout (harness) | `finestMs` | `subdivisions` | 1m panel B `maxStep` (market ms) | Verdict |
|--------|------------------|------------|----------------|----------------------------------|---------|
| **ON** (default) | A=1m, C/D=4h, focus C, tick, `setStepTimeframe('4h')` | 60 000 | 240 | 23 333–44 166 (~≤45s) | **Fine sub-cadence** — PASS 3/3 |
| **OFF** (`__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE=true`) | Same | null / disabled | 1 | **14 400 000–16 980 000** (~4h jumps) | **Legacy coarse** — switch-OFF cell PASS |

**Interpretation:**

- Kill-switch **works** — OFF reproduces PO-class coarse jumps on 1m panel B.
- ON path **works in H-S83’s layout** but **does not cover PO S2.4** (host A=4h, unspecified mode).
- PO A/B FAIL on b16 with fix nominally ON → live route hits **§4.A and/or §4.B/C**, not switch OFF.

**Live A/B recipe (PO / tester):**

```javascript
const rs = window.chart?.replaySystem;
const grid = window.__multichartGrid;
({
  disableFlag: window.__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE,
  cadenceOn: rs?._isFinestTfReplayCadenceEnabled?.(),
  finestMs: rs?._getFinestReplayCadenceMs?.() ?? grid?.getFinestReplayCadenceMs?.(),
  selectedMs: rs?._getSelectedReplayCadenceMs?.(),
  subdivisions: rs?._finestTfCadenceSubdivisions?.(),
  playbackMode: rs?.getPlaybackMode?.(),
  hostTf: window.chart?.currentTimeframe,
  subStepPlay: rs?._isFinestTfCadenceSubStepPlay?.(),
  panelTFs: grid?.enumerateCharts?.().map(ch => ch?.currentTimeframe),
});
```

Run once with default (fix ON), once with `window.__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE = true` + reload. On PO FAIL layout, expect **`subdivisions: 1`** or **`playbackMode: 'candle'`** while fix ON.

---

## 6. Proposed one-knob fix scope (next lane — not implemented)

| Item | Scope |
|------|--------|
| **New switch (example)** | `__TALARIA_FIX_REPLAY_FINEST_CADENCE_CANDLE` or extend D-016 disable sibling — wire **candle PLAY** through finest sub-step (+ virtual `replayTimestamp`) same as tick. |
| **Host-coarse regression pin** | **H-S83b** (proposed): host **A** display **4h**, peer **B** **1m**, sync on, **tick + candle** rows; assert B `maxStep < 4h` with fix ON. |
| **Arm timing** | Re-call `refreshFinestReplayCadence()` on host TF change and on `play()` if `subdivisions === 1` but `enumerateMultichartCharts().length >= 2`. |
| **Freeze-safe** | No viewport seek on re-derive (already spec’d D-016); gate behind existing `__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE`. |

---

## 7. Step-forward parity (addendum)

### 7.1 Does step-forward use the finest-TF unified clock?

**No.** PLAY (tick) and step-forward diverge by design in current code.

| Path | Advance function | Finest-TF sub-step? | Step size |
|------|------------------|---------------------|-----------|
| **PLAY (tick)** | `_advanceReplayPlayheadOneStep()` when `_isFinestTfCadenceSubStepPlay()` | **Yes** — +1 raw bar; virtual ts in `animateTick` | ~1m per cycle when finest=1m |
| **PLAY (candle)** | `simpleStepForward()` → `calculateNextIndex()` | **No** | Coarse (4h on host 4h) |
| **Step-forward** | `stepForward()` → **`calculateNextIndex()` only** | **No** — `_isFinestTfCadenceSubStepPlay()` not consulted | Coarse interval / host TF bucket |

```5572:5586:chart v 1.4/chart/modules/replay-system.js
        const targetIndex = this.calculateNextIndex();
        // ...
        this.currentIndex = targetIndex;
        if (this.fullRawData[this.currentIndex]) {
            this.replayTimestamp = this.fullRawData[this.currentIndex].t;
            this.tickElapsedMs = 0;
        }
        this.updateChartData(this.autoScrollEnabled);
        this._syncMultichartAfterManualStep();
```

### 7.2 Multichart sync after manual step

`MultichartGrid.jsx` patches host step methods (~3807–3817, ~3573–3598):

1. Host `stepForward()` / `requestStepForward()` runs on **panel A engine only**.
2. `syncPanelsAfterHostStep` → `forceAllPanelsToTimestamp(host replayTimestamp)` → **`replayTick`** to every iframe (~3604–3614).
3. Optional `broadcastReplayFrameToIframes(detail)` with **static** frame (no tick animation).

**PLAY** streams **`replayFrame`** every animation tick with `animatedCandle` + sub-minute `replayTimestamp` (~6874–6890). **Step** sends a **single** timestamp snap — no sub-minute forming path.

### 7.3 Mixed TF + different tickers (PO addendum)

| Behavior | PLAY | Step-forward |
|----------|------|--------------|
| Host advance | Finest sub-step (tick) or coarse (candle) | Always **`calculateNextIndex()`** on host |
| Same-symbol 1m peer | Continuous mirror frames; sub-minute ts parity | One coarse host jump → `replayTick` snap |
| **Independent symbol** peer | `applyMultichartMirrorFrame` / `forceReplaySeek` / `peerPlayMustStayOnOwnMaster` (~1358–1383, ~2060–2097) — own master path | Static `replayTick` at **host** ts — may **not** advance independent pair’s visible bar the same way as PLAY stream |
| Focused vs main | Step always **host A** — focus does not reroute engine | Same |

**Answer Q6–Q7:** Step-forward uses a **separate coarse path** (`calculateNextIndex`), not the finest-TF PLAY clock. On mixed layouts it advances **host only** then **snaps** peers to host timestamp — finer peers may **no-op visually** or jump **one coarse bucket** while PLAY showed smooth sub-minute formation. Independent tickers widen the gap because PLAY mirror paths are **stream-aware**; step snap is **not**.

---

## 8. Separation from H-S25 follow-desync

| | **This cadence bug (S2.4 / H-S83)** | **H-S25 follow-desync (RC3-HS25#1)** |
|--|-------------------------------------|--------------------------------------|
| **What moves** | **`replayTimestamp` / playhead / forming candle time** — bars advance in **4h-sized time steps** on 1m panels | **`offsetX` / viewport** — time chrome can update while **visible candle window appears frozen** until blue ▶ |
| **Primary files** | `replay-system.js` cadence helpers; `_shouldStepByReplayInterval`; `calculateNextIndex` | `panel-cmd-bridge.js` `_panelPlayFollowContinuousOffsetX`, `maybePanelPlayViewportFollow`; `replay-system.js` `_replayUserOwnsViewport` |
| **Fix family** | D-016 finest-TF clock | T8 step 14 Fix A2 / H-S25 |
| **PO discriminant** | Sample `replayTimestamp` deltas on 1m panel — **`maxStep ≈ 4h`** | Sample `offsetX` vs `replayTimestamp` — ts advances, **offset pinned** |

Do **not** close H-S83 with H-S25 follow fixes or vice versa.

---

## 9. Ticket / scoreboard mapping

| Item | Mapping |
|------|---------|
| **H-S83** | STAGED — PO A/B FAIL b16; re-fix (this diagnostic) |
| **TAL-01563** | IN-TRACK — chunkiness / cadence family |
| **D-016** | Implementation **gap** (candle bypass + host-A-coarse not in H-S83 + step parity) — **not** evidence that D-016 was reverted on b16 |
| **S2.4** | Retest after H-S83b + candle wiring + step-forward unification |

---

## 10. Summary

1. Finest TF is computed as **global `min(TF)`** across host + iframes — **not** focused-panel keyed.
2. PO **4h cadence on all panels** matches **`calculateNextIndex()` coarse steps** when D-016 sub-step is **not active** — most likely **candle mode** and/or **host-A=4h layout not covered by H-S83**.
3. Fix switch is **ON** in b16; isolated H-S83 **PASS 3/3** proves the tick/sub-step path **can** work — PO FAIL is a **coverage gap**, not harness regression.
4. **Step-forward** does **not** share PLAY’s finest-TF clock — always coarse `calculateNextIndex()` + iframe timestamp snap.
5. **H-S25** remains a **separate** viewport-follow defect — do not merge with this cadence track.

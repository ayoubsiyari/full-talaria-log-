# REPLAY-10DAY-JUMP — 1m replay intermittently jumps forward 10+ days (read-only diagnostic)

**Task:** `REPLAY-10DAY-JUMP-diagnostic-lane2.md`  
**RC:** Tooling/diagnostic — no RC discharged  
**Build cited by PO:** `20260717b16` (blessed combined build)  
**Status:** **DIAGNOSTIC-ONLY** — no product code changes; no `__TALARIA_DEBUG_REPLAY_STEP_TRACE` probe landed (console recipe below)

---

## 1. Executive verdict

| Question | Answer |
|----------|--------|
| **Lead hypothesis (background-tab wall-clock catch-up)?** | **REJECT as primary cause of a single 10+ day step.** Replay advance is **timer-quantized** (`setInterval` / `setTimeout`), not rAF with accumulated `performance.now()` delta. No replay `visibilitychange` handler; no unclamped wall-clock → index math in the play loop. |
| **TAL-01612 / interval-basis (STAGED D-009b)?** | **PRIMARY — residual live-path gap, not harness regression.** `calculateNextIndex()` can advance **one step** by a full interval bucket (e.g. **1w ≈ 7–10 calendar days** on a 1m master) when `_resolveReplayStepTimeframe()` resolves coarser than raw bars. A3 fix (default ON) unified **sync broadcast** and **override**, but **step math still reads legacy `#replayTimeframe` / menu fallbacks** before chart TF — stale or saved interval can repro without PO noticing. |
| **b16 staged-fix FAIL?** | **INCOMPLETE / NEEDS-LIVE-TRIAGE**, not a blanket staged FAIL: harness **H-S54–H-S57 PASS** on current tree with fixes ON; PO symptom matches **uncontrolled interval-owner paths** H-S57 does not cover (Auto UI + stale hidden select, saved `1w`, TF change without slider refresh). |
| **H-S25 bar-boundary leap?** | **REJECT** for multi-day scale (~1 `candleSpacing` / one bar seam). |
| **Finest-TF cadence overshoot?** | **REJECT** for multi-day scale (virtual `replayTimestamp` only within current finest bar; index step still +1). |
| **Wholly new defect class?** | **NO** — same mechanism family as **TAL-01612** / D-009 (b); optional **fast-mode batch amplifier** at high speed when coarse interval is latent. |

**Practical implication:** S3.2 retest (“no weekly jumps”) must log **resolved step TF at jump time**, not just V9 slider label. If jump shows `resolved:'1w'` while UI shows Auto/1m → **STAGED-fix incomplete**; escalate A3 owner. Background-tab repro alone is unlikely to bisect this.

---

## 2. PO symptom (restated)

**Setup:** Chart left running on **1m replay** (display TF 1m; 1m master data).

**Observed:** Replay time **occasionally jumps forward 10 days or more in one step**. Intermittent; trigger unclear (tab defocus, continuous play, or prior TF/click).

---

## 3. Ranked hypotheses (evidence)

| Rank | Hypothesis | Verdict | Evidence |
|------|------------|---------|----------|
| **1** | **Interval-basis / TAL-01612 residual** | **CONFIRMED mechanism; live repro UNPROVEN in this pass** | `calculateNextIndex()` (~4018–4041): when `stepBars > 1`, time-anchors to `currentBucket + tfMs` → one step can skip **thousands of 1m bars**. `_resolveReplayStepTimeframe()` (~3830–3848): **override → `#replayTimeframe` → `#timeframeMenu` → chart TF**. Auto path sets `stepTimeframeOverride = null` but **still writes resolved TF into hidden select** (`legacy-index.html` ~60796–60855), so a **saved `1w`**, **stale hidden value**, or **menu selection** can drive coarse steps while V9 label reads Auto/1m. |
| **2** | **Fast-mode multi-step amplifier** | **SECONDARY** (same root) | `animateFastMode()` (~4697–4728): `candlesPerFrame` loop calls `_advanceReplayPlayheadOneStep()` each iteration. With **explicit/coarse interval**, each iteration runs `calculateNextIndex()` (candle mode always steps by interval — `_shouldStepByReplayInterval()` ~793–796). At speed >3600×, one timeout can advance **many interval buckets** in one callback — feels like one giant jump. On **pure 1m Auto** (`stepBars === 1`), max is ~24 raw bars/frame (~24 min), not 10 days. |
| **3** | **Background-tab / idle timer catch-up** | **REJECT (primary)** | Candle path: `setInterval` → one `simpleStepForward()` per tick (~3795–3823). Tick path: `setTimeout` chain (~4539–4583, ~4697+). **No** accumulated delta applied on resume. `chart.js` `visibilitychange` (~1073–1083) only triggers **resize/render**, not replay index. Throttled background timers → **slower** or **many small steps**, not one unclamped 10-day step. |
| **4** | **H-S25 follow-leap** | **REJECT** | Documented seam leap ≈ one bar spacing (pixels), not index/time multi-day skip. |
| **5** | **Finest-TF cadence** | **REJECT** | `animateTick()` D-016 block (~4621–4627): `replayTimestamp = baseT + tickElapsedMs` within current bar only. |

---

## 4. Mechanism trace (file:line)

### 4.1 Where a single large forward step is computed

```4018:4041:chart v 1.4/chart/modules/replay-system.js
    calculateNextIndex() {
        // ...
        const stepBars = this._resolveReplayStepRawBars();
        if (stepBars <= 1) {
            return Math.min(this.currentIndex + 1, this.fullRawData.length - 1);
        }
        const selectedTimeframe = this._resolveReplayStepTimeframe();
        const tfMs = selectedTimeframe ? this.timeframeToMs(selectedTimeframe) : null;
        if (tfMs && tfMs > this._getRawBarPeriodMs()) {
            const currentTimestamp = this.fullRawData[this.currentIndex].t;
            const currentBucket = this._replayBucketStart(currentTimestamp, tfMs);
            const targetTimestamp = currentBucket + tfMs;
            const targetIndex = this._firstRawIndexAtOrAfter(targetTimestamp, this.currentIndex + 1);
            return Math.min(Math.max(targetIndex, this.currentIndex + 1), this.fullRawData.length - 1);
        }
        return Math.min(this.currentIndex + stepBars, this.fullRawData.length - 1);
    }
```

**Jump sizes (1m master, `rawMs = 60000`):**

| Resolved step TF | `stepBars` | One `calculateNextIndex()` step (market time) |
|------------------|------------|-----------------------------------------------|
| `4h` | 240 | 4 hours |
| `1d` | 1,440 | 1 day |
| `1w` | 10,080 | **~7 calendar days** (PO “10+ days” if rounding / gap / 1w+1 step perception) |
| `1mo` | ~43,200 | **weeks+** |

### 4.2 Interval owner resolution (A3 fix vs step math)

```3830:3848:chart v 1.4/chart/modules/replay-system.js
    _resolveReplayStepTimeframe() {
        let selectedTimeframe = this.stepTimeframeOverride || null;
        // ...
        const hiddenSelect = this.timeframeSelect || document.getElementById('replayTimeframe');
        if (!selectedTimeframe && hiddenSelect && hiddenSelect.value) {
            selectedTimeframe = hiddenSelect.value;
        }
        if (!selectedTimeframe) {
            const selectedOption = document.querySelector('#timeframeMenu .timeframe-option.selected');
            if (selectedOption) {
                selectedTimeframe = selectedOption.getAttribute('data-value');
            }
        }
        if (selectedTimeframe === 'sync' || !selectedTimeframe) {
            selectedTimeframe = this.chart?.currentTimeframe || null;
        }
        return selectedTimeframe || null;
    }
```

A3 **`__TALARIA_FIX_REPLAY_INTERVAL_CADENCE`** (default ON, ~539–565, ~583–594):

- `applyReplayIntervalFromUi()` → `setStepTimeframe(null)` for Auto.
- `getReplayStepTimeframeForSync()` → `_resolveReplayStepTimeframe()` for multichart `replaySetStepTf` (`MultichartGrid.jsx` ~3197–3209).
- **Gap:** step math uses the **same** resolver, so hidden select / menu can still dominate when override is null. H-S57 proves **explicit 4h** owners agree; it does **not** prove Auto + saved `1w` + 1m chart chart-TF path.

### 4.3 Play loops — no wall-clock catch-up

| Path | Entry | Advance per callback | Wall-clock delta? |
|------|-------|----------------------|-------------------|
| Candle-by-candle | `startCandleByCandle()` ~3795 | `simpleStepForward()` → `calculateNextIndex()` | **No** — fixed `getCandleStepIntervalMs()` ~3871–3873 |
| Tick smooth | `scheduleNextTick()` ~4539 | +1 tick progress; `completeTickAnimation()` → `_advanceReplayPlayheadOneStep()` ~5378–5381 | **No** |
| Tick fast (≥~60×) | `animateFastMode()` ~4697 | Up to `candlesPerFrame` × `_advanceReplayPlayheadOneStep()` | **No** — `Date.now()` only for prefetch throttle ~4709 |

**Visibility:** `replay-system.js` has **zero** `document.hidden` / `visibilitychange` handlers. `chart.js` ~1073–1083 refreshes viewport on visible — **does not pause or catch up replay**.

### 4.4 Candle mode always steps by interval

```792:817:chart v 1.4/chart/modules/replay-system.js
    _shouldStepByReplayInterval() {
        if (this.getPlaybackMode() === 'candle') return true;
        if (this._isFinestTfCadenceSubStepPlay()) return false;
        return this._hasExplicitReplayStepInterval();
    }
    _advanceReplayPlayheadOneStep() {
        if (this._shouldStepByReplayInterval()) {
            const targetIndex = this.calculateNextIndex();
            // ...
        } else if (this.currentIndex < this.fullRawData.length - 1) {
            this.currentIndex++;
        }
```

In **candle mode**, every step uses `calculateNextIndex()` — any coarse resolved interval applies even without `stepTimeframeOverride`.

---

## 5. Harness / staged-fix check (b16 tree, this workspace)

```text
node "chart v 1.4/chart/multichart-prod/harness/run.mjs" --only=H-S54,H-S55,H-S56,H-S57 --runs=1
→ H-S54 PASS, H-S55 PASS, H-S56 PASS, H-S57 PASS (fixes ON; switch-OFF RED attribution on H-S54/H-S57)
```

**Interpretation:** Controlled A3 acceptance passes. **Does not disprove** PO live jump — scenarios use **explicit, aligned** interval setup, not stale hidden select / saved `replayUpdateInterval` / TF-change races.

---

## 6. Deterministic repro recipes

### 6.A Interval-basis (primary — bisect TAL-01612 on b16)

1. Deploy blessed build; confirm **same `BUILD_ID`** on host + iframes.
2. Open live multichart; **1m** on replay host; enter replay; set speed moderate (1×–10×).
3. **Before play**, in host console:

```javascript
const rs = window.chart?.replaySystem;
({
  override: rs?.stepTimeframeOverride,
  hidden: document.getElementById('replayTimeframe')?.value,
  resolved: rs?._resolveReplayStepTimeframe?.(),
  sync: rs?.getReplayStepTimeframeForSync?.(),
  stepBars: rs?._resolveReplayStepRawBars?.(),
  saved: localStorage.getItem('replayUpdateInterval') || sessionStorage.getItem('replayUpdateInterval'),
  uiLabel: document.getElementById('intervalValueDisplay')?.textContent,
});
```

4. **Force stale owner (dev repro):** set interval slider to **1W**, play one step, then set slider to **Auto** without triggering `setByIndex` (or inject `document.getElementById('replayTimeframe').value = '1w'` while override is null). Press **PLAY** or step forward once.
5. **Pass signal:** `replayTimestamp` / time label jumps **~7+ days** in **one** step; console shows `resolved: '1w'` (or `1d`/`4h`) while UI may show **Auto** / **1m**.
6. **Kill-switch attribution:**

```javascript
window.__TALARIA_FIX_REPLAY_INTERVAL_CADENCE = false; // reload, repeat → legacy divergent owners (H-S57 switch-OFF)
```

### 6.B Saved interval persistence

1. Set replay interval to **1W**; confirm `userStorage` / `replayUpdateInterval` persists (legacy slider ~60796).
2. Switch chart display to **1m**; enter replay — check whether slider shows **1W** or **Auto**. If **1W** still saved, play → weekly steps (expected per Auto/interval rules, easy to miss in UI).
3. Clear saved key → `auto`; re-enter replay → confirm `resolved === '1m'` and single-bar steps.

### 6.C Background-tab (lead hypothesis — expect **FAIL to repro** single 10-day step)

1. 1m replay, **Auto** interval, confirm `stepBars === 1` (probe §6.A).
2. **PLAY** at 60× tick or candle; background tab **5+ min** (or sleep machine).
3. Refocus; watch **one** step delta (log `currentIndex` / `replayTimestamp` before/after first post-focus callback).
4. **Pass signal for rejecting H1:** each callback advances **≤ `candlesPerFrame` raw bars** (tick fast) or **1 index** (candle / smooth tick) — no single 10-day timestamp delta.
5. Optional long background at **3600×+** with **latent 1d/1w interval** (§6.A) — may see **large** jump on first visible frame due to **fast-mode batching** (H2), not timer catch-up.

### 6.D On-jump capture (no code probe)

Wrap once in console before play:

```javascript
(function () {
  const rs = window.chart?.replaySystem;
  if (!rs || rs.__jumpWatch) return;
  rs.__jumpWatch = true;
  let prev = rs.replayTimestamp;
  const orig = rs.simpleStepForward.bind(rs);
  rs.simpleStepForward = function () {
    const before = prev;
    orig();
    const after = rs.replayTimestamp;
    const deltaMin = (after - before) / 60000;
    if (deltaMin > 120) {
      console.warn('[REPLAY-JUMP]', {
        deltaMin,
        hidden: document.hidden,
        resolved: rs._resolveReplayStepTimeframe?.(),
        override: rs.stepTimeframeOverride,
        stepBars: rs._resolveReplayStepRawBars?.(),
        mode: rs.getPlaybackMode?.(),
        fast: rs.fastMode,
      });
    }
    prev = after;
  };
})();
```

---

## 7. Proposed fix scope (next lane — switch-gated, not implemented here)

| Switch / change | Purpose |
|-----------------|--------|
| `window.__TALARIA_DEBUG_REPLAY_STEP_TRACE` (default OFF) | Log any advance with market-time delta > N× raw bar; include `document.hidden`, resolved TF, `stepBars`, path (`simpleStepForward` / `animateFastMode` / `goToReplayTimestamp`). Both I8 `replay-system.js` trees. |
| Extend **`__TALARIA_FIX_REPLAY_INTERVAL_CADENCE`** (or new fix flag) | When Auto (`stepTimeframeOverride == null`), **skip hidden select / menu** — single owner = chart TF only; clear hidden select on Auto. |
| `__TALARIA_FIX_REPLAY_CLAMP_STEP` (proposed) | Cap `calculateNextIndex()` / fast-mode loop max market-time advance per callback (e.g. ≤ 1 display bar when display TF ≤ step TF). |
| `visibilitychange` in `replay-system.js` (proposed) | Pause `isPlaying` while `document.hidden` OR reset `_lastTickWall` without applying backlog (defense-in-depth; low priority given H1 reject). |
| Live retest | **S3.2** + on-jump probe; if FAIL → re-open **TAL-01612** as **STAGED incomplete**, assign A3. |

---

## 8. Ticket / scoreboard mapping

| Item | Mapping |
|------|---------|
| **TAL-01612** | Same defect family — **D-009 (b)** STAGED; PO symptom aligns with **residual owner drift**, not harness RED. |
| **S3.2** (POST-BLESS plan) | Primary closure test; must capture resolved TF at jump. |
| **H-S54–H-S57** | PASS — staged routing/cadence **in scoped scenarios**; does not close live intermittent path. |
| **New clock-catch-up ticket** | **Not recommended** unless §6.C repros single-step 10-day jump with `resolved:'1m'` and `stepBars:1`. |

---

## 9. Summary for manager

1. **Lead hypothesis (background-tab catch-up): rejected** for a single 10+ day step — architecture is timer-stepped, not delta-accumulated; no replay visibility handling.
2. **Primary mechanism: interval-basis (`calculateNextIndex` + `_resolveReplayStepTimeframe`)** — can produce **one-step multi-day jumps** when step TF resolves to **1w / 1d / 4h** while PO believes they are on **1m Auto**.
3. **b16 / TAL-01612:** A3 fixes **work in harness** but **do not fully close** stale hidden-select / saved-interval live paths → treat as **STAGED incomplete pending PO bisect**, not a new defect class.
4. **No product changes** in this diagnostic; optional **`__TALARIA_DEBUG_REPLAY_STEP_TRACE`** and clamp/visibility fixes deferred to next implementation lane.

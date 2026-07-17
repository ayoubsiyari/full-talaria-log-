# S2 — Multichart replay time-axis vs chart-content desync (read-only diagnostic)

**Task:** `S2-replay-axis-chart-desync-diagnostic-lane2.md`  
**RC:** Tooling/diagnostic — no RC discharged  
**Build cited by PO:** `20260717b16` (blessed combined build, S2 retest)  
**Status:** **DIAGNOSTIC-ONLY** — no product code changes

---

## 1. Executive verdict

| Question | Answer |
|----------|--------|
| **Known-open H-S25?** | **YES — primary bucket.** Same defect family as **RC3-HS25#1** / **H-S25** (IN-TRACK, NEEDS-REFIX, post-b1 item #1). PO symptom is the **live presentation** of the panel replay **viewport-follow failure**, not a separate new class. |
| **STAGED S2 regression?** | **NO** — not D-015 “panel frozen / won’t advance,” not H-S83 cadence drift, not H-S82 snap-back. Playhead/data **does** advance; **horizontal viewport follow** (`offsetX`) does not keep pace until follow is re-enabled. |
| **Wholly new?** | **NO** — mechanism, switches, and fix plan already exist (T8 step 14 Fix A2; PER-BUG-REGISTRY **RC3-HS25#1**). |

**Practical implication for S2 closure:** Other S2 rows (01609/10/00, H-S18/20/28/79/82/83) can still close if their **specific** criteria pass, but **S2.1 “all panels advance” must not be read as timestamp-only** — add “viewport tracks playhead without manual ▶” or accept this as a **known-open** carve-out tied to H-S25.

---

## 2. PO symptom (restated)

**Setup:** 2×2 multichart, EUR/USD **5m** on all panels, replay **PLAY**.

**Observed (one or more panels):**

- Time axis / temporal chrome appears to **move forward** (new times visible).
- **Candles / plot content stay visually fixed** on screen (viewport does not scroll with playhead).
- Blue **▶ replay-follow** control (bottom-right) is visible; clicking it **re-syncs** axis + chart (`enableAutoScroll` / `jumpToLatest`).

**Screenshot note:** Blue **“05:00”** markers on the **price** axis are live-price / session markers, not the time-axis scroll itself. The **▶** control is the documented “last candle off-screen → follow disengaged” affordance.

---

## 3. Repro recipe (tester / PO)

1. Deploy blessed build; confirm **same `BUILD_ID` on host + every iframe**.
2. Open live React multichart (not harness); **2×2**; load **same symbol** on A–D; set **5m** on all panels.
3. Enter replay; pick a start point; press **PLAY**.
4. Watch **panel B** (and C/D) vs **host A**:
   - Does `replayTimestamp` / forming candle **advance**? (should yes)
   - Does **`offsetX` / visible window** scroll so the playhead stays in view? (PO: **no** until ▶)
5. While desynced, confirm blue **▶** is shown (`updateAutoScrollIndicator` — playhead off-screen).
6. Click **▶** → expect immediate resync (host parity).

**Console probes (optional, one desynced iframe):**

```javascript
const ch = /* panel chart instance */;
({
  tf: ch.currentTimeframe,
  offsetX: ch.offsetX,
  replayTs: ch.replaySystem?.replayTimestamp,
  autoScroll: ch.replaySystem?.autoScrollEnabled,
  userPan: ch.replaySystem?.userHasPanned,
  followRenders: ch._mcPlayFollowRenders,
  appliedEase: ch._mcPlayFollowAppliedOffsetX,
});
```

---

## 4. Mechanism trace (file:line)

### 4.1 Intended follow path during PLAY

Host drives play; iframe panels receive `replayFrame` / coalesced seek → mirror updates **data** → follow adjusts **viewport**.

| Step | Site | What happens |
|------|------|----------------|
| 1 | `panel-cmd-bridge.js` `applyReplayFrame` → `scheduleCoalescedSeek` (~585–910, ~1966+) | Host playhead forwarded to peers |
| 2 | `forceSamePairParentDataMirror` (~1353–1562) | Same-pair panels mirror host `data` / replay state; on PLAY sets `rs.autoScrollEnabled = willFollowPlayhead` (~1380–1382) |
| 3 | Same function ~1467–1526 | **Fix A:** `_panelPlayFollowContinuousOffsetX` applies eased `offsetX` on same-TF path; device-pixel coalesce may **re-pin `offsetX` without repaint** (~1511–1518) |
| 4 | `maybePanelPlayViewportFollow` (~1864–1962) | Secondary follow pass: `syncReplayViewportToPlayhead({ forceRecenter:true, resetPriceScale:false })` + eased override |
| 5 | `replay-system.js` `syncReplayViewportToPlayhead` (~3020–3070) | Sets `chart.offsetX` from `getReplayAutoScrollState`; **skipped** if `_replayUserOwnsViewport` unless `forceRecenter` |

### 4.2 Why axis/time can “move” while candles look fixed

Two coupled effects:

**A — Follow disengaged (by design until ▶):**

```2935:2951:chart v 1.4/chart/modules/replay-system.js
    _replayUserOwnsViewport(chartInstance = this.chart) {
        if (!this.isActive || !chartInstance) return false;
        if (this.userHasPanned || !this.autoScrollEnabled) return true;
        // ...
        return Math.abs((chartInstance.offsetX || 0) - st.offsetX) > spacing * 0.2;
    }
```

When `userHasPanned`, `autoScrollEnabled === false`, or drift **> 0.2× candleSpacing**, follow stops. Mirror still applies **new bars / forming candle** (`applyMultichartMirrorFrame`, ~6628+), so **replay time advances** but **`offsetX` is preserved** (`forceSamePairParentDataMirror` ~1537–1538, ~1547–1553).

**B — H-S25 / coalesce “stuck then jump” (Fix A incomplete at seams):**

Documented in-bridge (~1484–1517, ~1800–1817): bar-quantized follow **froze within a bar** then **leaped one `candleSpacing`** at seams; Fix A + D-041 eased follow + pixel coalesce reduced but **did not eliminate** seam leaps (H-S25 harness: `maxStepDeviceDelta == 7.002px == candleSpacing`, 0/3 FAIL-REAL-BUG).

Coalesce early-return (**no render**, offset pinned):

```1920:1928:chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js
                    if (Number.isFinite(applied)
                        && Math.round(target * dpr) === Math.round(applied * dpr)) {
                        ch.offsetX = applied;
                        return;
                    }
```

On **5m** panels, many play frames can fall in the **same device-pixel column** → long stretches with **no horizontal scroll paint** while mirror updates data — matches PO “candles fixed” feel even when follow is “on.”

### 4.3 What the blue ▶ button does that auto-follow did not

```5868:5896:chart v 1.4/chart/modules/replay-system.js
    enableAutoScroll() {
        this.autoScrollEnabled = true;
        this.userHasPanned = false;
        this._viewportLockForPlayback = null;
        // ...
        if (chart && typeof chart.jumpToLatest === 'function') {
            chart.jumpToLatest();
        }
        if (this.isActive) {
            this.updateChartData(true);
        }
```

Clears disengage flags and **forces** viewport to playhead — exactly PO recovery.

Button visibility contract:

```6184:6200:chart v 1.4/chart/modules/replay-system.js
        const lastCandleHidden = !this.isLastCandleVisible();
        const showFollow = !hidePicking && lastCandleHidden && chartSurfaceOk;
        // ...
        btn.classList.add('replay-follow--attention');
```

Desynced panel ⇒ playhead off-screen ⇒ **▶ shown** (matches screenshot).

### 4.4 Kill-switch map (discriminators)

| Switch | Default | OFF / ON behavior | PO relevance |
|--------|---------|-------------------|--------------|
| `__TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW` | unset (follow **ON**) | **ON = frozen viewport, playhead marches off-screen** (~1784–1785) | Exact RED label for PO symptom class |
| `__TALARIA_MC_DISABLE_SAMETF_PANEL_PLAY_EASED_FOLLOW` | unset (Fix A **ON**) | OFF → bar-quantized leaps, `_mcPlayFollowRenders→0` | **H-S25** discriminator |
| `__TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD` | unset (coalesce **ON**) | OFF → per-frame follow render (heavy, smoother) | Tests coalesce-induced freeze |
| `__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` | unset (D-016 **ON**) | Cadence path | **Not** H-S25 beneficiary (T8 step 14 A/B flat) |

---

## 5. Classification vs H-S25 / S2 rows

### 5.1 H-S25 (known-open) — **MATCH**

| H-S25 harness signal | PO live signal |
|----------------------|----------------|
| Same-TF iframe follow; `offsetX` bar-quantized / seam leap | Viewport does not track playhead smoothly |
| `maxStepDeviceDelta == candleSpacing` | User perceives **freeze** (especially on **5m** + coalesce) |
| `_mcPlayFollowRenders > 0` | Partial motion may occur; still ends off-screen → ▶ |
| IN-TRACK; fix held post-b1 | Same queue — **Fix A2 seam continuity** (T8 step 14 §Fix PLAN) |

H-S25 is **not** “panel won’t advance” (D-015) — PO reports **advance without viewport follow**, which is the **documented follow-path failure mode**, not a new freeze class.

### 5.2 STAGED S2 rows — **NOT regressed (different failure mode)**

| Row / ticket | Staged fix symptom | This PO symptom |
|--------------|-------------------|-----------------|
| **TAL-01609/10**, **H-S18/20** | Panel **does not advance** / stuck PLAY | Data **advances**; viewport **doesn’t** |
| **TAL-01600/03**, **H-S83** | Cadence / finest-TF **sync between panels** | Single-panel **viewport vs plot** desync |
| **H-S28/79** | F5 / boot **playhead restore** | During live **PLAY**, not refresh |
| **H-S82** | Pan-release **snap-back** after manual pan | Follow disengage may involve pan flags, but root is **follow engine**, not D-017 anchor hold |

**Conclusion:** Failing this observation **does not invalidate** a PASS on “panels advance on PLAY” unless the tester also checked **viewport follow**. Recommend tightening S2.1 acceptance (see §7).

### 5.3 New defect? — **NO**

Registry row **RC3-HS25#1** already captures the family. T8 step 14 authored **Fix A2** (seam continuity in `_panelPlayFollowContinuousOffsetX` + post-mirror apply). No new PER-BUG row required unless PO reproduces on **host A** with follow engaged (would escalate scope).

---

## 6. Proposed fix scope (actionable, not implemented)

**Owner:** T8 / Lane 2 — **post-bless item #1** (already queued ahead of #4/#5 per T8 step 15).

| Item | Scope |
|------|--------|
| **Fix A2 (H-S25 seam)** | `panel-cmd-bridge.js` `_panelPlayFollowContinuousOffsetX` + `forceSamePairParentDataMirror` post-mirror apply (~1501–1526, ~1834–1861) — monotonic offset across bar seams |
| **Switch** | Extend `__TALARIA_MC_DISABLE_SAMETF_PANEL_PLAY_EASED_FOLLOW` (preferred) or add `__TALARIA_MC_DISABLE_SAMETF_PANEL_PLAY_SEAM_CONTINUITY` |
| **Proof** | H-S25 3/3 PASS (`changedFraction>0.6`, `maxStepDeviceDelta≤2.5`); switch-OFF RED; PO 5m 2×2 live: no ▶ during uninterrupted PLAY |
| **I8** | Mirror `homepage/public/chart/multichart-prod/panel-cmd-bridge.js` |

**Optional hardening (if PO repro shows `_replayUserOwnsViewport` false positive):**

- Audit what sets `userHasPanned` / `autoScrollEnabled=false` on iframe panels during multichart PLAY (`panel-cmd-bridge.js` ~3306–3344, ~1126).
- Do **not** disable cost guard globally — use A/B per panel.

---

## 7. S2 retest / closure guidance

| Action | Recommendation |
|--------|----------------|
| **Do not re-file** as new ticket if H-S25 row is open | Link PO report to **RC3-HS25#1** / **H-S25** |
| **S2 STAGED flips** | Other rows may still → CLOSED-VERIFIED if their **specific** steps pass |
| **This observation** | Track as **known-open H-S25 live confirm** on b16 — **blocks “perfect replay UX”**, not the D-015 freeze closure family |
| **Tighten S2.1** | PASS requires: PLAY → **visible window follows playhead** on B/C/D without manual ▶ (host A parity) |

---

## 8. What I did NOT do

- No code, harness, or registry edits.
- No live repro on b16 in this session (read-only code + prior harness reports).
- No full gate re-run.

---

## 9. References

- `docs/tickets-overhaul/worker-prompts/S2-replay-axis-chart-desync-diagnostic-lane2.md`
- `docs/tickets-overhaul/worker-reports/T8-step14-eased-follow-seam-diagnostic-report.md`
- `docs/tickets-overhaul/worker-reports/T8-step15-replay-interaction-diagnostic-bundle-report.md`
- `docs/tickets-overhaul/PER-BUG-REGISTRY.csv` — **RC3-HS25#1**
- `docs/tickets-overhaul/PLAN2-SCOREBOARD.csv` — **H-S25** IN-TRACK
- `docs/tickets-overhaul/POST-BLESS-RETEST-CLOSURE-PLAN.md` — Session S2

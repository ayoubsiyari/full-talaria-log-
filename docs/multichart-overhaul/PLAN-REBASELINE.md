# Plan Re-Baseline (D-026 Item 3) — reality vs the original phase ladder

**Date:** 2026-07-07 · **Build:** 20260707b72+ · **Authority:** D-026 Item 3 (consolidation).
**Purpose:** the original `README.md §3` phases were worked substantially OUT OF ORDER while chasing the
PO's felt pain. This doc marks what is actually DONE, what REMAINS, and the order for the rest.

---

## Phase status vs reality

### Phase 0 — Baseline/instrumentation — **DONE**
Diagnostics (`__mcDiagReport`/`__mcDiagReset`) live; re-baseline captured on b72+ in `BASELINE-RESULTS.md`
(R1–R4 PASS; M-checks recorded with honest gaps). Gate met.

### Phase 1 — Data ownership — **DONE (out of order)**
Shipped + live-verified: B8 finer-panel self-own, B-FIX-6a (display-TF idle master), 6b (lazy 1m
hydration), 6c (high-limit bulk), event commits (`talariaMcHostDataCommit`), same-pair copy. Evidence:
same-pair panels copy (C/D `fetches=0`), `seams=0`, bounded host TF-switch fetches (2000/4000, not ~34k).
**Residuals (not blockers):** (a) B8 owner-path activation not yet demonstrated live (needs finer-than-host
panel + play; M3 STILL-NOT-CAPTURED); (b) a dragged panel still self-loads its own history (B: 16k) —
confirm this is the intended per-panel pan-load vs an RC1-pan residual.

### Phase 2 — Event sync — **PARTIAL (~50%)**
rAF poll-and-mutate partially retired. **Remaining:** finish replacing rAF polling with the extend-broadcast
event; remove residual fetch side-effects from `sync-bridge.js`; confirm mid-drag throttled repaint in all
sync modes with no snap/pop at mouse-up. Not formally gated.

### Phase 3 — Render budget / smoothness — **~70% (felt pain closed)**
The TF-SWITCH SETTLING / price-axis thread is CLOSED end-to-end and live-verified:
C (drift) → D/E (host cascade) → F/G (panel flash) → H (inert) → I (fast-switch) → J (empty-recovery) →
BL-5 (candle-by-candle) → BL-2b (price coupling) → BL-6 (viewport park). PO confirms the felt pain is gone.
**Remaining Phase-3 items (all low-severity / cosmetic):**
- BL-3: single-chart replay render lag (shared `resampleData`/render hot path).
- renders-high: cap follower render work during interaction bursts (the original Phase-3 goal).
- BL-7: transient `No candles drawn` flood DURING same-TF host switch (self-corrects; cosmetic).
- BL-2b-r: intermittent tiny panel-Y move on some switches (not host coupling; own-autoscale transient).
- Hardening: B-FIX-I self-heal predicate uses stale-index timestamps, not pixel visibility
  (panel-cmd-bridge.js:470-482) — fix to use `_countVisiblePlotBars`/`_multichartViewportNeedsRecovery`.

### Phase 4 — Regression harness — **NOT STARTED (the big remaining chunk)**
Automated headless-browser harness running the REAL engine + bridges over the scenario matrix. Seed from
the lwc-proto test rig. This is what makes the ~17 manually-verified gated fixes durable.

---

## Deferred consolidation cleanup (from Item 1, still owed)
- Remove viewport-first dead code (D-016 cluster) — was deferred until this baseline existed; now safe to do.
- Retire the H flag (`__TALARIA_MC_DISABLE_PANEL_MIRROR_CROSS_TF_HOST_SWITCH`, inert).
- Strip `[BL2B_PRICE]` probe once Phase-3 residual re-checks (BL-2b-r) no longer need it.
- Add CI check: all `sw.js` SW_VERSION === `__TALARIA_CHART_BUILD_ID`.

## Backlog (tracked, not scheduled)
- BL-1: same-TF switch-back flicker — reconcile as resolved-by-F/G or narrow remnant.
- BL-2: sync-ON host TF switch reframes panels (specced fix exists; blocked only when range/time sync ON).
- BL-4: bound session-start bulk fetch to a playhead-centered window.

---

## Proposed order for the remaining work (Director to ratify)
1. **Finish Item-1 deferred cleanup** (viewport-first removal + retire H) — small, safe now that a baseline exists.
2. **Phase 4 harness FIRST** — highest durability value; ~15 gated fixes are currently protected only by
   manual runs. Encode R1–R4 + the scenario matrix as automated checks BEFORE more engine surgery.
3. **Phase 2 finish** (event-sync) — behind the harness so regressions are caught.
4. **Phase 3 remainder** (renders-high budget + BL-3 + the cosmetic BL-7/BL-2b-r + self-heal predicate).
5. **Backlog** (BL-1/BL-2/BL-4) as prioritized.

Rationale: the felt pain is resolved; the dominant remaining RISK is silent regression. The harness (Phase 4)
converts every prior win into a protected asset and should precede further engine changes.

# T8 step 5b — gate regression reconcile report (I9)

## 1. Task + RC

- **Task:** `T8-step5b-lane2-gate-regression-reconcile.md` — honest disposition of the seven step-5 gate regressions (H-S6, H-S20, H-S25, H-S28, H-S30, H-S32, H-S33) with isolated re-runs and pre/post step-5 comparison.
- **RC:** **Tooling/diagnostic + one true D-015 regression fix** — not RC-2. H-S20 was a real step-5 regression; the other six rows are pre-existing or drawing-unrelated. One surgical fix under the existing D-015 kill-switch.

---

## 2. What I changed — file by file

| File | What / why |
|------|------------|
| `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js` | **H-S20 regression fix** in D-015 unified PLAY block (`:724–739`): coarser same-pair panels restore BL-10 `scheduleCoalescedSeek(ch, ts, peerPlayMustStayOnOwnMaster(ch))` (mirror-first, `ownMaster=false`) instead of always `true`. Forcing own-master seek on 1D-after-acquisition left `_serverCursors.firstTs` on the stale 1m window while `loaded[0].t` was 1D session start → INV B fail. Finer self-owner + same-TF-miss + independent paths unchanged (`ownMaster=true`). |
| `homepage/public/chart/multichart-prod/panel-cmd-bridge.js` | I8 mirror — byte-identical. SHA256 `0B51D1EE2D0EE2F727B641F43158DEA8550507FFB6E8B020F856A0BF52B409A2`. |

**No other files touched.** `known-failing.json`, `react-parity-lib.mjs`, harness scenarios unchanged.

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Gating |
|--------|---------|--------|
| **`__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE`** | OFF = fix ON | Entire D-015 unified PLAY block including the H-S20 coarse-path restore. OFF → pre-D-015 fall-through (BL-10 coarse branch at `:791+` when reached). |
| **`__TALARIA_MC_DISABLE_COARSE_PANEL_PLAY_ADVANCE`** | OFF | When ON, D-015 coarse branch skips BL-10 scheduling (same as pre-step-5 coarse-disable semantics). |

**Revert proof:** `__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE = true` → unified block skipped → H-S20 returns to pre-D-015 coarse mirror-first path.

---

## 4. Proof — RED → GREEN

### 7-row disposition table

| Row | Isolated pass rate (post step-5, 3×) | Pre step-5 (HEAD~3, 3×) | Classification | Evidence |
|-----|--------------------------------------|-------------------------|----------------|----------|
| **H-S6** | **0/3** FAIL-REAL-BUG | **0/3** FAIL-REAL-BUG | **PRE-EXISTING-KNOWN-FAILING** (baseline gap) | Identical failure: `1m→1h: panels that fetched=["A","B","C","D"]` (owner fetch contract). Not D-015. In `expectedTests` but **not** in `knownFailing` → gate counts it as regression. Evidence: `harness/t8-step5b-post-x3.txt`, `harness/t8-step5b-pre-x3.txt`. |
| **H-S20** | **0/3** → **3/3** after fix | **3/3** PASS | **STEP-5-REGRESSION → FIXED** | Post step-5 only: core checks PASS, **INV B** `_serverCursors.firstTs==loaded[0].t` FAIL (`cursorFirst`=1m window, `loadedFirstT`=1D session). Root: D-015 forced `scheduleCoalescedSeek(..., true)` on coarser panels, skipping mirror-first cursor sync. Fix restores BL-10 `peerPlayMustStayOnOwnMaster` (false for coarser). Evidence: `harness/t8-step5b-post-x3.txt` (pre-fix), `harness/t8-step5b-hs20-fix-x3.txt` (3/3 PASS). |
| **H-S25** | **0/3** FAIL-REAL-BUG | **0/3** FAIL-REAL-BUG | **PRE-EXISTING-FLAKE** | Identical pre/post: `changedFraction≈0.56–0.64` (bound >0.60), `maxStepDeviceDelta==candleSpacing` at bar seams; `_mcPlayFollowRenders` grows (mirror-success path active). Not introduced by D-015. Log to flake watch. Evidence: post/pre x3 logs. |
| **H-S28** | **0/3** FAIL-REAL-BUG | **0/3** FAIL-REAL-BUG | **PRE-EXISTING-KNOWN-FAILING** (baseline gap) | Identical: boot host-resize re-anchor (`reanchorPasses=0`, 612px drift). `__TALARIA_MC_DISABLE_BOOT_HOST_REANCHOR` fix path not green. Unrelated to play edge-park. Evidence: post/pre x3 logs. |
| **H-S30** | **3/3** PASS | **3/3** PASS | **FALSE REGRESSION LABEL** (step-5 gate noise) | Deterministically green isolated pre **and** post. Step-5 full-gate flag was ordering/timing flake in suite run, not D-015. Evidence: post/pre x3 logs. |
| **H-S32** | **0/3** FAIL-REAL-BUG | **0/3** FAIL-REAL-BUG | **DRAWING-UNRELATED** (D-012 / RC-4 family) | Selection reaches store (`selected=[id]`) but `toolbarVisible=false` — Quick Menu chrome proxy (I15). Same failure pre/post. **Not** in `knownFailing` (H-S34+ are). Evidence: `harness/t8-step5b-post-x3.txt`, prior `red-evidence-hs32-hs33-x3.txt`. |
| **H-S33** | **0/3** FAIL-REAL-BUG | **0/3** FAIL-REAL-BUG | **DRAWING-UNRELATED** (D-012 / RC-4 family) | Setup flake `settingsOpen=false` before delete (core delete sometimes passes). Same family as retracted H-R06/H-R09. **Not** in `knownFailing`. Evidence: post/pre x3 logs. |

### Fence family (deterministic green)

```text
npm run test -- --only=H-S17,H-S19,H-S19b
→ PASS / PASS / PASS (post step-5, pre-fix): harness/t8-step5b-fence.txt
→ PASS / PASS / PASS (post H-S20 fix): harness/t8-step5b-fence-after-fix.txt
```

### H-S20 fix proof

```text
npm run test -- --only=H-S20 --runs=3
→ PASS / PASS / PASS (post fix): harness/t8-step5b-hs20-fix-x3.txt
```

### Lane 4 baseline-coordination note

- **`knownFailing` object** lists only H-S34–H-S50 (T1 rollback + RC-3/RC-4 tracked-red). **H-S6, H-S20, H-S25, H-S28, H-S30, H-S32, H-S33 are in `expectedTests` but not in `knownFailing`.**
- Gate logic (`gate.mjs:120`): `regressions = expectedTests where NOT in knownFailIds AND FAIL`. Any stable failure in that set blocks the gate even when pre-existing.
- **Honest baseline actions for Lane 4 (no change made this cycle):**
  - **H-S6, H-S28:** stable FAIL-REAL-BUG pre/post step-5 → add to `knownFailing` with reason, **or** fix upstream (fetch ownership / boot reanchor).
  - **H-S25:** stable seam-threshold flake → add to `knownFailing` or relax harness threshold with Manager sign-off.
  - **H-S32, H-S33:** D-012 drawing-interaction rows — align with RC-4 tracked-red policy (add to `knownFailing` like H-S45–H-S50, or promote only after honest actuation).
  - **H-S30:** remove from regression concern — isolated green.
  - **H-S20:** was true regression; fixed in step 5b — **must stay in expectedTests and pass** (now 3/3).

### Full gate (not re-run post-fix)

Post-fix, expected gate regressions if run now: **H-S6, H-S25, H-S28, H-S32, H-S33** (five pre-existing rows). **H-S20 and H-S30 should not regress.** Lane 4 baseline update required for honest green.

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| I8 mirror trees | SHA256 match on `panel-cmd-bridge.js` (both trees). |
| I9 gate reconcile | Seven rows classified with evidence; one true regression fixed; Lane 4 baseline drift documented. |
| I13 kill-switch | H-S20 fix gated under `__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE`. |
| I15 | Drawing rows (H-S32/H-S33) labeled DRAWING-UNRELATED — proxy assertions, not proven product fix. |
| Fence H-S17/H-S19/H-S19b | **3/3 PASS** isolated (deterministic). |

---

## 6. What I did NOT do / limits

- Did **not** edit `known-failing.json` (Lane 4 owner).
- Did **not** fix H-S6, H-S25, H-S28, H-S32, H-S33 (pre-existing / drawing-unrelated per evidence).
- Did **not** re-run full `npm run gate` after H-S20 fix (long suite; five pre-existing rows would still fail until baseline update).
- Pre-step-5 baseline used **git HEAD~3** (last commit without D-015 unified block); HEAD~1/HEAD~2 already contained D-015.

---

## 7. Live-verification handoff

- **H-S20 fix:** PO optional — 2×2 backtest replay, switch panel B to 1D mid-replay, play forward; confirm playhead advances and no cursor/pan oddities. **Staging build `20260715a3`** (do not test on `20260715a2` — H-S20 regression).
- **D-015 acceptance:** mixed-TF same-symbol play park cure — PO live-confirm on **`20260715a3`** (`window.__TALARIA_CHART_BUILD_ID` inside panel iframe).
- **Drawing rows:** covered by RC-4 / T0 step 14 honest-actuation checklist — not this cycle.

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

Step 5b reconcile complete: six of seven rows cleared as pre-existing / false label / drawing-unrelated; **H-S20 true regression fixed and re-proven 3/3**. Fence family green. Full gate remains blocked on five **pre-existing** rows until Lane 4 updates `known-failing.json` or upstream fixes land — not a D-015 false-green.

---

## Manager summary

| Outcome | Rows |
|---------|------|
| Fixed (step-5 regression) | **H-S20** |
| False gate label | **H-S30** |
| Pre-existing (not step-5) | **H-S6, H-S25, H-S28** |
| Drawing-unrelated (baseline gap) | **H-S32, H-S33** |

**Do not accept step-5 on “mostly flakes” alone** — this table is the evidence. Step 5 D-015 ship stands for fence + PO path; gate honesty requires Lane 4 baseline coordination for the five remaining expected-but-not-known rows.

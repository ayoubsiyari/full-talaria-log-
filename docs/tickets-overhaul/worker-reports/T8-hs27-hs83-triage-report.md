# T8 — H-S27 / H-S83 manager-gate regression triage

## 1. Task + RC

- **Task:** `T8-hs27-hs83-gate-regression-triage-lane2` — read-only classification of manager-gate regressions on combined build `20260716b10`.
- **RC:** Tooling/diagnostic — no product RC. Unblocks criterion 5 of assembly gate v2 (`T0-lane4-combined-build-assembly-gate-v2-report.md`).

**Build under test:** `20260716b10` (includes P1 `6dc552a8`, H-R06 `f46e6d9d`, H-R07 `52894a8d`, I13 `817a81a1`, H-R03 `ecaa8a9c`, harness `ba07584c`).

---

## 2. What I changed — file by file

**No files touched** (read-only triage per prompt). Evidence artifacts written to harness working tree only:

| File | Purpose |
|------|---------|
| `chart v 1.4/chart/multichart-prod/harness/v2-b10-gate-manager.txt` | Pre-existing full `npm run gate` capture (criterion 5 source) |
| `chart v 1.4/chart/multichart-prod/harness/hs27-b10-isolated-x10.txt` | Isolated H-S27 ×10 on b10 (this triage) |
| `chart v 1.4/chart/multichart-prod/harness/hs83-b10-isolated-x10.txt` | Isolated H-S83 ×10 on b10 (this triage) |

---

## 3. Kill-switch (I3 + I13)

| Scenario | Switch | Default | Revert effect |
|----------|--------|---------|---------------|
| **H-S27** | `__TALARIA_MC_DISABLE_FINER_OWNER_PLAY_VIEWPORT_FOLLOW` | unset = fix ON | Finer-self-owner `:685` branch drops viewport follow → frozen offsetX while replayTs advances |
| **H-S83** | `__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` | unset = fix ON | 4h-focused play reverts to coarse panel jumps on 1m peers |

N/A for triage — no switch edits. Both switches pre-date `ecaa8a9c` and `817a81a1`.

---

## 4. Proof — classification evidence

### Commands

```bash
cd "chart v 1.4/chart/multichart-prod/harness"
# Full gate (pre-captured)
npm run gate   # → v2-b10-gate-manager.txt, exit 1

# Isolated (this triage, build stamp 20260716b10 from serve.mjs)
node run.mjs --only=H-S27 --runs=10   # → hs27-b10-isolated-x10.txt
node run.mjs --only=H-S83 --runs=10   # → hs83-b10-isolated-x10.txt
```

### H-S27 — finer-self-owner play viewport follow (A7 §6co, D-048)

**Scenario identity (`scenarios.mjs`):** Same-pair 4-panel 2×2. Host-only NATIVE 4h commit **before** replay (sync OFF, no fan-out). Peers stay 1m finer-self-owners (`panel-cmd-bridge.js` `:685` cell). **Synthetic** play loop: `hostReplaySeek` + `broadcastCmd('replayFrame')` × ~150 frames (not production `rs.play` tick).

| Surface | Pass rate | Verdict | Failing sub-check(s) |
|---------|-----------|---------|----------------------|
| **Full gate** (`v2-b10-gate-manager.txt`) | 0/1 | FAIL | `non-vacuous: peer replayTs strictly increased` (flat `1781092800000→1781092800000`); `CORE: peer viewport TRACKED` (`netOffsetDelta=0.30` vs `expectedTravel=45.00`) |
| **Isolated ×10** (`hs27-b10-isolated-x10.txt`) | **5/10 PASS** | **FAIL-FLAKE** | Same pair on FAIL runs: replayTs flat + netOffsetDelta ≈ 0–0.30. PASS runs: replayTs `→1781101800000` (+150×1m), netOffsetDelta ≈ 44.7–45.0 |

**Run pattern (isolated):** `PASS,FAIL,PASS,PASS,FAIL,PASS,FAIL,FAIL,PASS,FAIL`

**I15 actuation / measurement:**

| Aspect | H-S27 |
|--------|-------|
| **Actuation** | **Synthetic** — programmatic `hostReplaySeek` + `broadcastCmd('replayFrame')` per 1m step; host `setTimeframe('4h')` in-process. No real mouse on replay controls. |
| **Measurement** | **Real engine counters** — `replaySystem.replayTimestamp`, `chart.offsetX`, `_mcPlayFollowRenders` sampled in panel iframes via `page.evaluate`. Not DOM proxies. |
| **Anomaly on FAIL runs** | `followRenders` still grows (Δ≈93–129) and `changedFraction` passes (~0.43–0.54) **while `replayTs` stays flat** — discriminating checks disagree within the same run. Indicates **race/timing flake in the synthetic seek loop**, not a stable “frozen viewport + advancing candles” RED. |

**Session-order note:** In full gate, H-S27 runs immediately after **H-S26** (host 4h switch *during* play, `ts0=1784160600000`). H-S27 uses a different `ts0=1781092800000`. Isolated flakes **without** prior scenarios (5/10), so full-suite load **amplifies** but does not solely cause failure.

**Verdict: FLAKE (tracked instability)** — **not** a combined-build regression from b10 content. Core fix path is healthy on ~50% of isolated runs; failure mode matches historical H-S27 gate flake (`T8-step7-replay-refresh-persistence-FIX-report.md`: “briefly green → regressed (flaky)”).

**Not caused by `ecaa8a9c` / `817a81a1`:** H-R03 dedupe and I13 focus gate touch `drawing-tools-manager.js` / `MultichartGrid.jsx` selection+focus only. H-S27 probes `panel-cmd-bridge.js` replay seek + viewport follow — disjoint code paths.

**Owning lane (if ever REAL):** T8 / Lane 2 — `panel-cmd-bridge.js` finer-self-owner follow (`:685`).

---

### H-S83 — finest-TF cadence (D-016 / T8 step 13)

**Scenario identity (`scenarios.mjs`):** Same-pair 4-panel. Enter replay → panel C/D set 4h → **real click** focus panel C → arm finest cadence → **production tick play** (`startHostProductionTickPlay`, `rs.play`) 6s sample → switch-OFF A/B leg.

| Surface | Pass rate | Verdict | Failing sub-check(s) |
|---------|-----------|---------|----------------------|
| **Full gate** (`v2-b10-gate-manager.txt`) | 0/1 | FAIL | `cadence: no 4h jump on 1m panel B` (`maxStep=48003333`); `cadence: finest sub-steps` (`maxStep=48003333`). **Switch-OFF leg PASS** (`maxStep=28500000`). |
| **Isolated ×10** (`hs83-b10-isolated-x10.txt`) | **10/10 PASS** | **PASS** | All core + A/B legs green; typical `maxStep` ≈ 19k–43k ms (≪ 4h) |

**I15 actuation / measurement:**

| Aspect | H-S83 |
|--------|-------|
| **Actuation** | **Mixed** — real `focusPanelByClick` on panel C; production `rs.play` tick mode (host-driven, not synthetic seek loop). Setup uses `panelCmd` + in-process `replaySystem` API. |
| **Measurement** | **Real** — sampled `replayTimestamp` deltas on panel B across play window; `_mcPlayFollowRenders` coalesce bound. End-state timestamps, not toolbar/DOM proxies. |
| **Full-suite failure shape** | Core ON-path cadence legs fail with **~48M ms maxStep spike** while `totalDelta=98333` and switch-OFF still sees coarse jumps — consistent with **leftover replay/session state** after ~80 prior scenarios (H-S82 immediately precedes with `ts0=1784160300000`, same neighborhood as gate H-S83 `ts0`). |
| **Vacuous A/B?** | **No — this cycle.** Phase-0 history (`T3-remig-phase0-freeze-plus-regate-report.md`) documented switch-OFF `maxStep=0` vacuous under full-suite. **b10 full gate switch-OFF PASS** (`maxStep=28500000`). Current blocker is **ON-path cadence pollution in shared session**, not vacuous A/B. |

**Verdict: FLAKE (full-suite session-order only)** — **not** a combined-build regression. Isolated 10/10 proves finest-TF cadence fix is intact on b10.

**Not caused by `ecaa8a9c` / `817a81a1`:** Same disjoint-path reasoning — replay cadence in `replay-system.js` / `panel-cmd-bridge.js` / `MultichartGrid.jsx` finest-cadence hooks; no drawing ctrl-select or focus peer-deselect involvement.

**Owning lane (if ever REAL):** T8 / Lane 2 — `replay-system.js` + `MultichartGrid.jsx` finest-TF cadence (`__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE`).

---

## 5. Invariants checked

| Inv | Status |
|-----|--------|
| I15 | Called out actuation honesty per scenario; no proxy greens claimed |
| I13 | N/A — read-only |
| Scope | No product/harness/known-failing edits |

---

## 6. What I did NOT do / limits

- Did not re-run full `npm run gate` (used existing `v2-b10-gate-manager.txt`).
- Did not bisect which prior scenario poisons H-S83 in full suite (H-S82 / replay-family suspected; Lane 4 scope).
- Did not run H-S27 switch-OFF A/B on b10 (not required for flake classification).
- Did not prove PO live cadence feel — harness-only triage.

---

## 7. Live-verification handoff

- **H-S27:** PO not gated on this harness row for b10 bless. If promoted, verify finer-than-host-NATIVE play: 2×2, host 4h native, peers 1m — panels track while candles run (TAL-01600/01603c family).
- **H-S83:** Parity checklist / manifest §4.1 — TAL-01603b+c retest on blessed build: 4h-focused play, 1m panel smooth sub-advance.

---

## 8. Status

**DIAGNOSTIC-ONLY** — flake-vs-real classification complete; no code changes.

### Recommended baseline actions (Lane 4)

| Scenario | Verdict | Recommended action |
|----------|---------|-------------------|
| **H-S27** | **FAIL-FLAKE** (~50% isolated + full-suite) | **Re-add to `knownFailing`** with reason: `tracked flake — synthetic replayFrame seek loop; replayTs stall ~50% isolated (followRenders still grow); not b10 regression`. Do **not** treat as combined-build engine regression. Optional: run H-S27 last in gate order or fresh-boot page per scenario. |
| **H-S83** | **FLAKE (full-suite only)** | **Re-add to `knownFailing`** with reason: `tracked flake — core cadence legs fail only under full-suite session order (maxStep spike); isolated 10/10 PASS on b10; switch-OFF A/B non-vacuous this cycle`. Gate can exit clean once both rows tracked. **Do not** dispatch engine fix on b10 for this failure mode. |

### Summary table

| ID | Isolated ×10 | Full gate | Classification | b10 regression? |
|----|--------------|-----------|----------------|-----------------|
| H-S27 | 5/10 PASS | FAIL | **FAIL-FLAKE** | **No** |
| H-S83 | 10/10 PASS | FAIL (ON-path cadence) | **FLAKE (session-order)** | **No** |

**Path to bless:** Lane 4 re-baselines H-S27 + H-S83 as tracked flakes → `npm run gate` exit 0 → proceed with H-R07 baseline removal / H-S34 promotion per assembly v2 checklist.

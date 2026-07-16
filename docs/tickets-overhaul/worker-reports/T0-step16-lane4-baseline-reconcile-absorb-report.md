# T0 step 16 — baseline reconcile + absorb Lane 2 edits + scenario-id cleanup

**Date:** 2026-07-15  
**Lane:** 4 (sole `known-failing.json` / scenario-id owner)

---

## Step 0 — prior T0 step 14 (honest actuation harness)

**Delivered and intact.** T0 step 14 rebuilt `react-parity-lib.mjs` with real `page.mouse` / `page.keyboard` actuation at iframe-translated coordinates; honest RED baseline on build `20260712b105` (12 tracked-red, only **H-R12A** green); `gate:react` PASS with 0 regressions. This step did **not** modify react-parity files or discard that work. `reactParity` section unchanged: 13 expected, 12 knownFailing.

---

## 1. Task + RC

**Task:** `T0-step16-lane4-baseline-reconcile-absorb.md` — absorb Lane 2 `known-failing.json` churn after T8 replay work, re-run H-S27/H-S30 isolated, fix H-S73 reason + H-S82 id collision, defer H-S81, restore honest manager `gate` PASS.

**RC:** Tooling/diagnostic — RC-7 harness discipline (D-012 honest-gate lesson); RC-3/T8 policy-table pin fidelity for H-S73 vs TAL-01579.

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | Reconciled Lane 2 absorb: updated H-S27/H-S30/H-S73 reasons; **promoted H-S42** (full-gate green); final **81 expectedTests**, **34 knownFailing** (was 36 at step 15). |
| `homepage/public/chart/multichart-prod/harness/known-failing.json` | I8 mirror (byte-identical). SHA256: `E8AC557560DBBCC029D8409C8B3918401FE98957C7E2B64CF8C3302E21FBD2C7` |
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` | H-S73 comment block: pan-snapback pin **H-S79 → H-S82** (H-S79 = refresh playhead). Added reserved-id comments for **H-S81** (deferred), **H-S82** (TAL-01579 snap-back), **H-S83** (finest-TF cadence). SHA256: `193D84DC547F1F4002F36193D04A93B9A06806A29827ECEFB70289F1250078EB` |
| `homepage/public/chart/multichart-prod/harness/scenarios.mjs` | I8 mirror (byte-identical). |
| `harness/step16-hs27-hs30-x3.txt` | Isolated 3× H-S27/H-S30 evidence. |
| `harness/step16-gate-final.txt` | First full gate (stale H-S27/H-S42). |
| `harness/step16-gate-pass.txt` | Second gate (H-S27 regression after promote attempt). |
| `harness/step16-gate-pass2.txt` | **Final reconciled gate PASS.** |

**No product code touched.** `react-parity-lib.mjs`, `panel-cmd-bridge.js`, `chart.js` — read-only.

---

## 3. Kill-switch (I3 + I13)

N/A — baseline/registry/comment-only changes.

---

## 4. Proof — RED → GREEN

### Commands

```powershell
cd "chart v 1.4/chart/multichart-prod/harness"
npm run test -- --only=H-S27,H-S30 --runs=3
npm run gate   # ×3 (reconcile H-S27 flake vs stale-baseline)
```

### Isolated H-S27 / H-S30 (3×)

| Id | Runs | Verdict | Disposition |
|----|------|---------|-------------|
| **H-S27** | FAIL, PASS, PASS | **FAIL-FLAKE** (1/3) | **Keep tracked** — replayTs/offset freeze recurs under full-gate ordering |
| **H-S30** | FAIL, FAIL, FAIL | **FAIL-REAL-BUG** (0/3) | **Keep tracked** — peer B `phase2=2` self-fetches; clears step 5b false-green label |

Evidence: `step16-hs27-hs30-x3.txt`

### Lane 2 absorb reconciliation

| Lane 2 edit | Step 16 disposition |
|-------------|---------------------|
| Removed **H-S28** (Track B boot reanchor fix) | **Absorbed** — H-S28 not in `knownFailing`; full gate PASS |
| Removed **H-S27** (briefly green) | **Rejected** — flake proven; restored tracked after regression on promote attempt |
| Added **H-S79** to `expectedTests` | **Absorbed** — refresh playhead persistence green |
| Added **H-S80** (T8 step 9) | **Absorbed** — TF label sync green |
| Step 9 gate flagged H-S27/H-S30 stale | H-S30 stays tracked; H-S27 stays tracked (flake) |

### H-S42 surprise promotion

Full gate run 1 and 2: **H-S42 PASS** while listed in `knownFailing` → promoted (removed from baseline). Not a step-16 target row but required for honest gate.

### Final gate

```
[gate] PASS: no new regressions; 34 known-failing tracked.
Regressions (not in baseline but failed): (none)
```

Evidence: `step16-gate-pass2.txt`

**H-S27 flake note:** Gate run 1 had H-S27 PASS → stale baseline. Removing H-S27 caused run 2 **regression**. Restored H-S27 to `knownFailing`; run 3 H-S27 FAIL (known-failing) → PASS. This is the expected flake contract — do not silently drop H-S27.

**Fence (unchanged):** H-S17, H-S19, H-S19b, H-S20, H-S28, H-S79, H-S80 all PASS in final gate.

### Per-row disposition (mandatory)

| Row | Isolated | Full gate | Action | Reason |
|-----|----------|-----------|--------|--------|
| **H-S27** | 1/3 FAIL-FLAKE | run1 PASS / run2 FAIL / run3 FAIL | **Tracked** | A7 §6co finer-self-owner viewport freeze |
| **H-S30** | 0/3 FAIL-REAL-BUG | FAIL (known-failing) | **Tracked** | §6cs host step-forward-spam peer self-fetch |
| **H-S73** | (prior T8 step 11) | FAIL (known-failing) | **Tracked** | B-FIX-C prepend compensation — **NOT** TAL-01579 |

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| **I8** | Both harness trees mirrored; SHA256 reported above |
| **I9** | Final `npm run gate` PASS; 0 regressions; 34 tracked-red |
| **I15** | No proxy greens claimed; baseline-only step |
| **Lane 4 boundary** | Sole editor of `known-failing.json`; Lane 2 deltas absorbed with evidence |
| **D-010** | Status labeled to gate evidence, not intent |

---

## 6. What I did NOT do / limits

- **H-S81** (mixed-coarse tick-play fetch+render budget fence, T8 step 10) — **deferred** per prompt; noted as pending Lane-4/T2 item only (comment in `scenarioList()`).
- **H-S82 / H-S83** — id reservations + comment fix only; **not implemented** in `scenarios.mjs`.
- Did **not** edit `T8-FINEST-TF-CADENCE-DESIGN.md` (still says H-S82 for cadence in §6 — manager CLEANUP 3 assigns cadence to **H-S83**; Lane 4 registered H-S83 in harness comments).
- Did **not** touch product engine, React, or `panel-cmd-bridge.js`.
- **H-S27** remains gate-fragile: a future full gate where H-S27 PASS while tracked will fail with stale-baseline until removed; re-add on regression.

### Id map delta

| Id | Status | Assignment |
|----|--------|------------|
| H-S79 | **In `scenarioList()`** | PLAN2-FOUND#5 refresh playhead persistence (Lane 2 step 7) |
| H-S80 | **In `scenarioList()`** | PLAN2-FOUND#6 panel TF label sync (Lane 2 step 9) |
| H-S81 | **Reserved, deferred** | Coarse tick-play fetch+render budget fence |
| H-S82 | **Reserved** | TAL-01579 pan-release snap-back RED (was wrongly labeled H-S79 in H-S73 comment) |
| H-S83 | **Reserved** | Finest-TF cadence RED (T8 step 13) |

**Collision scan:** `scenarioList()` — 81 ids, **0 duplicates**.

---

## 7. Live-verification handoff

N/A — baseline/registry/harness-comment step only. PO live confirm not required for gate acceptance.

---

## 8. Status

**DONE (proven)** — final manager `gate` PASS with honest baseline: **81 expectedTests**, **34 knownFailing**, **0 regressions**. Lane 2 absorb complete; H-S73 reason corrected; H-S82/H-S83 ids reserved; T0 step 14 honest harness preserved.

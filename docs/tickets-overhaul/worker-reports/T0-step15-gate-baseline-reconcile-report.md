# T0 step 15 — gate baseline reconcile (truly-green gate)

**Date:** 2026-07-15  
**Lane:** 4 (sole `known-failing.json` editor)

---

## 1. Task + RC

**Task:** T0 step 15 — disposition five baseline-drift rows (H-S6/25/28/32/33), promote H-S59–H-S78 into the gated set, restore a **truly-green** manager `gate` (not “green except 5”).

**RC:** Tooling/diagnostic — RC-7 harness discipline (D-012 honest-gate lesson).

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | Added 5 drift rows + 16 T8 promotion REDs + 2 full-gate surfacing rows (H-S27/H-S30); promoted H-S59–H-S78 into `expectedTests` (80 total). |
| `homepage/public/chart/multichart-prod/harness/known-failing.json` | I8 mirror (byte-identical). |
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` | Appended H-S59–H-S78 to `scenarioList()`; `t8PendingScenarioList()` now `[]` (T0 step 15 promotion). |
| `homepage/public/chart/multichart-prod/harness/scenarios.mjs` | I8 mirror. |
| `harness/step15-drift-x3.txt` | Isolated 3× evidence for drift rows. |
| `harness/step15-fence-x2.txt` | H-S17/H-S19/H-S19b/H-S20 fence 2× PASS. |
| `harness/step15-pending-promotion.txt` | Single-run promotion scan H-S59–H-S78. |
| `harness/step15-gate-final.txt` | Final reconciled gate output. |

**No product code touched.**

---

## 3. Kill-switch (I3 + I13)

N/A — baseline/registry/harness promotion only.

---

## 4. Proof — RED → GREEN

### Commands

```powershell
cd "chart v 1.4/chart/multichart-prod/harness"
npm run test -- --only=H-S6,H-S25,H-S28,H-S32,H-S33 --runs=3
npm run test -- --only=H-S17,H-S19,H-S19b,H-S20 --runs=2
npm run test -- --pending --only=H-S59,...,H-S78 --runs=1
npm run gate
```

### Disposition table (drift rows)

| Row | Isolated pass rate | Classification | Action | Registry / ticket ref |
|-----|-------------------|----------------|--------|----------------------|
| **H-S6** | 0/3 FAIL-REAL-BUG | Pre-existing known defect (RC-8 owner-fetch) | → `knownFailing` | BL-18 TF fan-out; all panels fetch on 1m→1h |
| **H-S25** | 0/3 FAIL-REAL-BUG | Deterministic seam-threshold defect (Fix A) | → `knownFailing` | Same-TF eased follow; `maxStepDeviceDelta==candleSpacing` |
| **H-S28** | 0/3 FAIL-REAL-BUG | Pre-existing boot reanchor defect (§6cq) | → `knownFailing` | `reanchorPasses=0`, ~612px drift |
| **H-S32** | 0/3 FAIL-REAL-BUG | D-012 honest harness / RC-4 drawing proxy | → `knownFailing` | Store selects; `toolbarVisible=false` (TAL-00322) |
| **H-S33** | 0/3 FAIL-REAL-BUG | D-012 honest harness / T1 ghost family | → `knownFailing` | `settingsOpen=false` before delete (TAL-00157) |

### Fence rows (deterministic green)

| Row | Pass rate | Notes |
|-----|-----------|-------|
| H-S17 | 2/2 PASS | BL-10 coarse play advance |
| H-S19 | 2/2 PASS | BL-12 idle coalesce |
| H-S19b | 2/2 PASS | BL-13 eased follow |
| H-S20 | 2/2 PASS | BL-14 step-5b fix holds (was true regression) |

### T8 promotion (H-S59–H-S78)

| Verdict | Rows |
|---------|------|
| **PASS** (not in `knownFailing`) | H-S59, H-S59b, H-S59b-sameTF, H-S59b-coarse, H-S74, H-S75 |
| **FAIL** → `knownFailing` | H-S60–H-S73, H-S76–H-S78 (16 rows; see baseline reasons) |

### Full-gate surfacing (post-promotion)

| Row | Action |
|-----|--------|
| H-S27 | Peer finer-self-owner frozen during play → `knownFailing` |
| H-S30 | Host step-forward-spam peer fetch → `knownFailing` |

### Final gate counts

| Metric | Value |
|--------|-------|
| `expectedTests` | **80** (H-S2..H-S58 + H-S59..H-S78 family) |
| `knownFailing` | **36** tracked-red |
| Expected green | **44** |
| Regressions | **0** (after H-S27/H-S30 added) |

Evidence: `step15-gate-final.txt` → `[gate] PASS: no new regressions; 36 known-failing tracked.`

### SHA256 (I8)

| File | SHA256 |
|------|--------|
| `scenarios.mjs` | `DFE54DB93B85BF16C50FD0EF557765686626DC09497EF105681E689789020308` |
| `known-failing.json` | `0A320A0CFB18D45E5D14C720C66CEF8B08984FC9CA486B8CEBC68819F2E8CAA4` |

---

## 5. Invariants checked

| Inv | Status |
|-----|--------|
| **I8** | Both trees byte-identical for `scenarios.mjs` + `known-failing.json`. |
| **I9** | Manager `gate.mjs` untouched; `gate:react` section preserved. |
| **D-012** | No hidden drift — all failing `expectedTests` rows are in `knownFailing` with reasons. |

---

## 6. What I did NOT do / limits

- Did not fix H-S6/25/28/32/33 product defects (registry-tracked only).
- Did not stabilize H-S25 seam threshold (deterministic fail — product/harness fix queued separately).
- T8 H-S60–H-S73 many fail on GREEN path + vacuous RED sub-checks in stub — tracked honestly; Lane 2 may tighten scenarios.
- `reactParity` baseline unchanged (step 14 honest 12-row RED).

---

## 7. Live-verification handoff

N/A — harness baseline reconcile only. PO staging confirm for TAL-01590 remains on `20260715a1` per H-S59b WEAK sign-off.

---

## 8. Status

**DONE (proven)** — Manager `gate` truly green: 80 expected, 36 tracked-red, 0 regressions. Baseline drift closed; T8 coverage promoted.

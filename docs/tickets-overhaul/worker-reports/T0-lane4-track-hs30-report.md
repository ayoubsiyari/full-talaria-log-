# T0 Lane 4 — track H-S30 flake (clear criterion 5)

## 1. Task + RC

- **Task:** `T0-lane4-track-hs30-flake-clear-criterion5` — re-add H-S30 to `knownFailing`; clear manager gate criterion 5 (no unexpected regressions); register peer-B backfill post-bless follow-up.
- **RC:** Tooling/baseline only — no product RC. Follows Worker 2 triage (`T8-hs30-triage-report.md`).

**Build:** `20260716b10`

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | Re-added **H-S30** to host `knownFailing` (H-S27/H-S83 unchanged from prior rebaseline). |
| `homepage/public/chart/multichart-prod/harness/known-failing.json` | **I8 mirror** — byte-identical copy. |

**Evidence:** `track-hs30-gate-manager.txt`

No product edits. **Does NOT bless.**

---

## 3. Kill-switch (I3 + I13)

Referenced (unchanged): `__TALARIA_MC_DISABLE_STEP_SPAM_REFETCH_GUARD` — switch-OFF A/B **non-vacuous** (OFF 3/3 FAIL host `phase2=1`; ON host `phase2=0` all isolated runs per triage).

---

## 4. Proof — RED → GREEN

### `knownFailing` entry (H-S30)

```json
"H-S30": "tracked flake (T8-hs30-triage): host step-spam guard HEALTHY — switch-OFF A/B non-vacuous (OFF 3/3 FAIL host phase2=1, ON host phase2=0 all isolated runs); flake is peer-B independent 1h backfill during phase-2 (~60% isolated fail, 4/10 PASS); suite index 27/83 early-mid; NOT attributable to ecaa8a9c, 817a81a1, or order-manager b11/b12 (chart.js/replay-system path); post-bless T8 candidate if peer-B backfill is real unnecessary fetch — NOT fix-counted"
```

**Attribution:** Disjoint from `ecaa8a9c`, `817a81a1`, order-manager b11/b12 (triage §4).

### Manager gate

```bash
cd "chart v 1.4/chart/multichart-prod/harness"
npm run gate   # → track-hs30-gate-manager.txt (~28 min)
```

| Check | Result |
|-------|--------|
| **Unexpected regressions** | **`(none)`** ✓ — clears prior H-S30 block from rebaseline run |
| **H-S27** | `GATE H-S27 PASS (known-failing)` |
| **H-S30** | `GATE H-S30 PASS (known-failing)` |
| **H-S83** | `GATE H-S83 PASS (known-failing)` |
| **Known-failing still red** | 28 stable REDs (H-S6…H-S78 block; excludes H-S27/30/83 this cycle) |
| **Exit** | **1** — `[gate] FAIL: baseline stale; remove fixed test(s) from known-failing.json: H-S27, H-S30, H-S83` |

**Criterion 5 (unexpected regressions):** **CLEAR** — the rebaseline-run failure mode (`regression(s): H-S30`) is resolved; H-S30 is now tracked, not unexpected.

**Full `[gate] PASS`:** **Not this cycle** — I9 ratchet: all three replay flakes **passed** while listed in `knownFailing`. Per `gate.mjs`, tracked rows must **FAIL** in-run for exit 0, or be removed when green. This is the same oscillation pattern documented in `T0-lane4-gatereact-isolation-fix-plus-bless-report.md` (remove when green / re-add when red).

### `gate:react`

Out of scope — still fails on H-R04/H-R05 transport (not masked).

---

## 5. Invariants checked

| Invariant | How |
|-----------|-----|
| **I8** | Both `known-failing.json` trees byte-identical |
| **I9** | Did not mask other rows; reported ratchet stale baseline honestly |
| **I15** | H-S30 **NOT fix-counted**; host guard healthy; peer-B flake flagged for post-bless follow-up |

---

## 6. What I did NOT do / limits

- **Did not bless** any build.
- **Did not** remove H-S27/H-S30/H-S83 despite green gate run (would defeat tracked-flake purpose; Manager must choose ratchet vs keep-reason-and-re-add cycle).
- **Did not** run `gate:react` or mask H-R04/H-R05.

### I15 — peer-B post-bless follow-up (registered, not closed)

The ~**60% isolated fail** on `peer B(file27) fetches == 0` during phase-2 is **high for pure harness noise**. Post-bless **T8 candidate**: if peer-B independent 1h backfill during host step-spam is **real unnecessary product behavior**, re-actuate production-faithfully and tighten the assertion — do not silently promote or fix-count until then. Host step-spam guard remains the **non-vacuous** primary leg (`__TALARIA_MC_DISABLE_STEP_SPAM_REFETCH_GUARD`).

---

## 7. Live-verification handoff

N/A — baseline-only. H-S30 gate noise is **tracked flake**, not a combined-build regression warranting b10 engine work.

---

## 8. Status

**PARTIAL — criterion 5 unexpected regressions CLEAR; full gate exit 0 oscillates with flake greens**

- **H-S30 tracked:** DONE — entry in both I8 trees; **NOT fix-counted**.
- **Unexpected regressions:** **0** (`track-hs30-gate-manager.txt`).
- **Full manager gate PASS:** BLOCKED this cycle by I9 ratchet (H-S27/H-S30/H-S83 all green while tracked). Re-run on a flake-red cycle yields `[gate] PASS`, or Manager accepts criterion-5 = 0 regressions only.

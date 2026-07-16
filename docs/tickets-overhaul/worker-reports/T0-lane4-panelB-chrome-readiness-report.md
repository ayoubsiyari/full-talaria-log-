# T0 Lane 4 — panel-B parent-chrome readiness → deterministic bless

## 1. Task + RC

- **Task:** `T0-lane4-panelB-chrome-readiness-deterministic-bless` — replace timeout-based panel-B chrome waits with state-driven readiness; 3/3 consecutive `gate:react`; bless `20260716b10`.
- **RC:** Tooling/harness — no product RC. **STEP 2 STOPPED** — isolated flakes prove a real panel-B readiness race (Lane 1 scope).

**Build:** `20260716b10`

---

## 2. What I changed — file by file

**No harness files changed this session.** Session isolation from prior task (`REACT_PARITY_ISOLATE_SESSION=1`, fresh browser/scenario) remains in tree unchanged.

Evidence-only artifacts:

| File | Purpose |
|------|---------|
| `pbcr-hr01-x10.txt` | STEP 1 isolated H-R01 ×10 |
| `pbcr-hr04-x10.txt` | STEP 1 isolated H-R04 ×10 |
| `pbcr-hr05-x10.txt` | STEP 1 isolated H-R05 ×10 |
| `pbcr-hr12-x10.txt` | STEP 1 isolated H-R12 ×10 |

---

## 3. Kill-switch (I3 + I13)

N/A — no changes this session.

---

## 4. Proof — RED → GREEN

### STEP 1 — Strict isolation ×10 (`REACT_PARITY_ISOLATE_SESSION=1`, `20260716b10`)

```bash
cd "chart v 1.4/chart/multichart-prod/harness"
$env:REACT_PARITY_ISOLATE_SESSION='1'
node react-run.mjs --only=H-R01 --runs=10
node react-run.mjs --only=H-R04 --runs=10
node react-run.mjs --only=H-R05 --runs=10
node react-run.mjs --only=H-R12 --runs=10
```

| Row | Pass rate | Verdict | Failing surface |
|-----|-----------|---------|-----------------|
| **H-R01** | **10/10** | **PASS** | — |
| **H-R04** | **1/10** (`FAIL,FAIL,FAIL,PASS,FAIL×6`) | **FAIL-FLAKE** | Panel B only: `settings open after real dbl-click` — `open=false` (host 10/10) |
| **H-R05** | **7/10** (`FAIL,PASS,FAIL,FAIL,PASS×6`) | **FAIL-FLAKE** | Panel B only: `settings open before Esc` — dbl-click never opens parent settings modal |
| **H-R12** | **10/10** | **PASS** | — |

**Prompt gate:** Not all four rows 10/10 PASS isolated → **STOP STEP 2**. H-R04/H-R05 flakes occur **with fresh browser per run** (not suite-order only) → readiness race is **real** on iframe panel-B → parent settings chrome routing. Per guardrails: hand to **Lane 1** parallel diagnostic — do not mask with longer sleeps or harness-only retries.

**I15 actuation:** Failures use **real mouse** dbl-click at drawing hit coords in panel-B iframe; measurement is **real parent settings modal** (`hasStyleSection`, not quick-bar shell).

### STEP 2 — Readiness barriers

**NOT IMPLEMENTED** — blocked by STEP 1 verdict. Timeout/retry ladders (`awaitParentChromeAfterPanelSelect`, panel-B dbl-click retry in H-R04) remain from prior session-isolation pass; replacing them would violate prompt STOP until Lane 1 names/fixes the product race.

### STEP 3 — Deterministic bless

**NOT RUN** — bless blocked on STEP 1.

---

## 5. Invariants checked

| Invariant | How |
|-----------|-----|
| **I15** | STEP 1 used real actuation + real settings end-state; no proxy green claimed. |
| **Prompt guardrail** | STOP STEP 2 on isolated flake — honored. |
| **No engine edits** | None. |

---

## 6. What I did NOT do / limits

- **Did not** implement state-driven `waitForPanelBParentChromeReady` — STEP 2 STOP.
- **Did not** run 3× consecutive `gate:react` or bless.
- **Did not** re-run discriminators / manager gate (unchanged from D-023 + session-isolation reports).
- **H-R04/H-R05** need Lane 1 product-side chrome routing fix or honest diagnostic before harness readiness barriers can be trusted.

---

## 7. Live-verification handoff

PO blocked on **`20260716b10`** until panel-B iframe dbl-click → parent settings routing is stable. Manual check: panel B — place rectangle, single-click select, double-click → parent settings modal with Style section. Repeat until flake-free.

---

## 8. Status

**BLOCKED (STEP 1 isolation)** — H-R01/H-R12 **10/10 PASS** isolated; **H-R04 1/10**, **H-R05 7/10** **FAIL-FLAKE** isolated on panel-B parent settings. Real readiness race → **STEP 2 STOP** → **no bless**. Escalate H-R04/H-R05 panel-B settings routing to Lane 1.

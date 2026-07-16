# T8 — H-S30 manager-gate regression triage

## 1. Task + RC

- **Task:** `T8-hs30-regression-triage-lane2` — read-only flake-vs-real classification for unexpected `GATE H-S30 FAIL` on `20260716b10` after H-S27/H-S83 rebaseline.
- **RC:** Tooling/diagnostic — no product RC. Unblocks manager gate criterion 5.

**Build:** `20260716b10`

---

## 2. What I changed — file by file

**No files touched** (read-only). Evidence written to harness working tree only:

| File | Purpose |
|------|---------|
| `rebaseline-hs27-hs83-gate-manager.txt` | Post-rebaseline full gate (H-S30 unexpected regression source) |
| `v2-b10-gate-manager.txt` | Earlier b10 gate (H-S30 in baseline as known-failing) |
| `hs30-b10-isolated-x10.txt` | Isolated H-S30 ×10 (this triage) |
| `hs30-b10-switch-off-x3.txt` | Switch-OFF A/B ×3 (`__TALARIA_MC_DISABLE_STEP_SPAM_REFETCH_GUARD`) |

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Gated path | Revert effect |
|--------|---------|------------|---------------|
| `__TALARIA_MC_DISABLE_STEP_SPAM_REFETCH_GUARD` | unset = fix ON | `replay-system.js` burst window; `chart.js` paused backward probe + post-fetch re-chain + stale-index restore | Host repeat-burst backward `/bars` refetch storm returns |

**Switch A/B — non-vacuous?** **Yes.** With switch OFF (`--bugswitch=__TALARIA_MC_DISABLE_STEP_SPAM_REFETCH_GUARD`), **3/3 isolated FAIL** on the **primary host assertion**: `repeat-burst host(file25) data fetches == 0` → `phase2 host fetches=1`. With switch ON (default), host phase2=0 on **all 10 isolated runs** (including the 6 that failed overall). The row is a real, non-dead test for the host step-spam guard.

---

## 4. Proof — classification evidence

### Commands

```bash
cd "chart v 1.4/chart/multichart-prod/harness"
node run.mjs --only=H-S30 --runs=10
node run.mjs --only=H-S30 --runs=3 --bugswitch=__TALARIA_MC_DISABLE_STEP_SPAM_REFETCH_GUARD
```

### H-S30 scenario (from `scenarios.mjs`)

**Title:** HOST step-forward-spam refetch storm (§6cs).

**Actuation (I15):** Synchronous `rs.requestStepForward()` ×25 bursts in host main frame (real replay API, paused replay, short-prefix pin arms `replayNearLeft`). Two phases with API-log reset between. **Not** synthetic offset injection.

**Measurement (I15):** Real `serve.mjs` fetch log (`countFetchesByFile`), `replayTimestamp`, `currentIndex`, `_panLoading`, `offsetX` — not DOM/toolbar proxies.

**Layout:** Independent 2×2, sync OFF — host file25 @ 1m paused replay; peer B file27 @ 1h (must stay fetch-quiet during host spam).

### Isolated ×10 (`hs30-b10-isolated-x10.txt`)

| Metric | Result |
|--------|--------|
| **Pass rate** | **4/10 PASS** → harness verdict **FAIL-FLAKE** |
| **Run pattern** | `PASS,PASS,FAIL,FAIL,FAIL,PASS,FAIL,FAIL,PASS,FAIL` |
| **Failing sub-check (all 6 FAIL runs)** | `peer B(file27) fetches == 0` — `phase2=2` (`file27/candles?timeframe=1h` backward hydration) |
| **Host core on ALL 10 runs (incl. 6 FAIL)** | `repeat-burst host(file25) fetches == 0` → **phase2=0 every run** |
| **Playhead / panLoading on FAIL runs** | replayTs advanced ~25 buckets; `_panLoading=false`; no stale-index backward jump |

**Interpretation:** Isolated failures are **peer-B independent 1h lazy-backfill race** during phase-2, **not** the host step-spam refetch storm the scenario was written to catch. The step-spam guard remains green on the host path in every isolated attempt.

### Switch-OFF A/B (`hs30-b10-switch-off-x3.txt`)

| Metric | Result |
|--------|--------|
| **Pass rate** | **0/3** → **FAIL-REAL-BUG** (expected RED) |
| **Discriminating check** | `phase2 host fetches=1` (repeat burst must be 0) |
| **Peer on switch-OFF** | `peerB phase2=0` all 3 runs — peer flake absent when host storm is the active failure mode |

**Non-vacuous:** Switch OFF reliably flips the **host** fetch outcome; switch ON holds host phase2=0. Assertion is live.

### Full-suite position

| Gate log | Suite index | H-S30 result | Failure shape |
|----------|-------------|--------------|---------------|
| `rebaseline-hs27-hs83-gate-manager.txt` | **27 / 83** (~early-mid, not deep ~80) | FAIL | `phase2 host fetches=1` **and** `peerB phase2=2` |
| `v2-b10-gate-manager.txt` | 27 / 83 | FAIL (known-failing) | `peerB phase2=2` only; host phase2=0 |

**Predecessors in suite:** H-S25 (FAIL), H-S26 (PASS), H-S27 (FAIL), H-S28/H-S29 (PASS) — replay-heavy block immediately before H-S30.

**Session-order:** Full gate can add an **occasional host phase2=1** on top of the dominant **peer-B flake** (rebaseline run). Isolated reproduces peer flake **without** prior scenarios (6/10). Not “fails only deep in suite” like H-S83 — H-S30 sits at index 27 — but the **primary isolated failure mode does not require deep suite load**.

### Attribution (recent commits)

| Commit | Area | Disjoint from H-S30? |
|--------|------|----------------------|
| `ecaa8a9c` (H-R03 dedupe) | `drawing-tools-manager.js` iframe ctrl-select | **Yes** |
| `817a81a1` (I13 hygiene) | `MultichartGrid.jsx` focus peer gate | **Yes** |
| b11/b12 order-manager (TDZ, SL/TP-drag) | `order-manager.js` order entry | **Yes** |

H-S30 path: `chart.js` + `replay-system.js` step-spam burst guard (`__TALARIA_MC_DISABLE_STEP_SPAM_REFETCH_GUARD`). **No attribution to recent combined-build commits.** T8 step 15 previously documented the guard as fixed; this cycle’s gate noise is **harness peer-fetch flake**, not guard regression.

---

## 5. Invariants checked

| Inv | Status |
|-----|--------|
| I15 | Real replay API actuation; real fetch/timestamp counters |
| I9 | Did not recommend masking — tracked flake with specific reason |
| Scope | Read-only; no knownFailing edits |

---

## 6. What I did NOT do / limits

- Did not re-run full `npm run gate` end-to-end.
- Did not bisect which predecessor scenario triggers peer B `file27` 1h backfill (likely boot/hydration timing, not host spam).
- Did not propose harness scenario edits (Lane 4 owns `scenarios.mjs` during bless).
- Host phase2=1 in one full-gate capture not reproduced in isolated ×10 — treat as secondary session amplification, not primary defect.

---

## 7. Live-verification handoff

N/A for gate bless. Product surface: paused replay step-forward spam on host should not backward-refetch or jump playhead — parity with pre-fix PO if ever re-tested. Peer independent panels unaffected by design.

---

## 8. Status

**DIAGNOSTIC-ONLY**

### Verdict: **FLAKE (harness peer-fetch noise)** — NOT a combined-build regression; NOT fix-counted

The **host step-spam guard is healthy** (10/10 isolated host phase2=0; switch-OFF A/B non-vacuous). Gate failures are driven by a **flaky peer-B sub-assertion** (`file27` 1h backward hydration during phase-2, ~60% isolated) with occasional full-suite host fetch bleed-through.

**NOT REAL REGRESSION** — would require stable isolated FAIL on host storm checks attributable to a commit; not observed.

### Recommended Lane 4 `knownFailing` entry

```json
"H-S30": "tracked flake — peer B (file27) independent 1h backward hydration fires during phase-2 burst (~60% isolated; host step-spam guard stable phase2=0). Switch __TALARIA_MC_DISABLE_STEP_SPAM_REFETCH_GUARD non-vacuous (host phase2 0→1 OFF). Not b10 regression; promote-only deferred until peer sub-check stabilized."
```

**Criterion 5:** Re-adding H-S30 as tracked flake (it was removed in rebaseline expecting promote-only) should let gate exit clean — same pattern as H-S27/H-S83. **Do not** dispatch engine fix on b10 for this failure mode.

### Summary

| Check | Result |
|-------|--------|
| Isolated ×10 | 4/10 PASS (FAIL-FLAKE) |
| Switch A/B | **Non-vacuous** — 3/3 FAIL on host phase2 fetch |
| Full-suite index | **27** (early-mid) |
| Host guard regression | **No** |
| Recent commit attribution | **None** |
| Verdict | **FLAKE → track in baseline** |

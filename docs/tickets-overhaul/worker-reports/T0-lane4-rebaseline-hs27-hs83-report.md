# T0 Lane 4 — re-baseline H-S27 / H-S83 tracked flakes

## 1. Task + RC

- **Task:** `T0-lane4-rebaseline-hs27-hs83-tracked-flakes` — restore H-S27/H-S83 to `knownFailing` with triage-specific reasons so manager gate criterion 5 exits clean on `20260716b10`.
- **RC:** Tooling/baseline only — no product RC. Discharges gate noise from Worker 2 triage (`T8-hs27-hs83-triage-report.md`).

**Build:** `20260716b10`

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | Re-added **H-S27** and **H-S83** to host `knownFailing` with triage-specific reasons (see §4). |
| `homepage/public/chart/multichart-prod/harness/known-failing.json` | **I8 mirror** — byte-identical copy. |

**Evidence artifacts:** `rebaseline-hs27-hs83-gate-manager.txt`, `rebaseline-hs27-hs83-gate-react.txt`

No other files touched. **Does NOT bless** any build.

---

## 3. Kill-switch (I3 + I13)

N/A — baseline-only task. Referenced product switches (unchanged):

| Row | Switch |
|-----|--------|
| H-S27 | `__TALARIA_MC_DISABLE_FINER_OWNER_PLAY_VIEWPORT_FOLLOW` |
| H-S83 | `__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` |

---

## 4. Proof — RED → GREEN

### `knownFailing` entries added

```json
"H-S27": "tracked flake (T8-hs27-hs83-triage): synthetic replayFrame seek-loop timing race in panel-cmd-bridge finer-self-owner path; isolated 5/10 PASS on 20260716b10 while replayTs flat but followRenders grow; NOT attributable to ecaa8a9c (H-R03 dedupe) or 817a81a1 (I13 hygiene); synthetic harness actuation — not trusted row until production-faithful re-actuation (post-bless T8 follow-up); NOT fix-counted",

"H-S83": "tracked flake (T8-hs27-hs83-triage): finest-TF cadence (D-016) fails under full-suite session-order pollution (~80 scenarios in; shares ts0 with H-S82); isolated 10/10 PASS on 20260716b10; switch-OFF A/B non-vacuous this cycle; NOT attributable to ecaa8a9c or 817a81a1; NOT a b10 regression; NOT fix-counted"
```

**Attribution check (per triage):** Both rows exercise `panel-cmd-bridge.js` replay/cadence paths — **disjoint** from `ecaa8a9c` (`drawing-tools-manager.js` ctrl-dedupe) and `817a81a1` (`MultichartGrid.jsx` focus hygiene).

### Manager gate

```bash
cd "chart v 1.4/chart/multichart-prod/harness"
npm run gate   # → rebaseline-hs27-hs83-gate-manager.txt
```

| Row | Gate line | Verdict |
|-----|-----------|---------|
| **H-S27** | `GATE H-S27 PASS (known-failing)` | Tracked flake — **not counted as fixed** |
| **H-S83** | `GATE H-S83 PASS (known-failing)` | Tracked flake — **not counted as fixed** |
| **H-S30** | `GATE H-S30 FAIL` | **Unexpected regression** (not in baseline; **not masked** per I15) |

```
[gate] FAIL: regression(s): H-S30
exit_code: 1
```

**Criterion 5:** **NOT clean** — H-S27/H-S83 rebaseline works (both show as known-failing PASS), but **H-S30 unexpected regression** blocks full gate exit. Per prompt: did not add H-S30 to baseline without separate authorization.

### `gate:react`

```bash
npm run gate:react   # → rebaseline-hs27-hs83-gate-react.txt
```

```
[react-gate] FAIL: regression(s): H-R04, H-R05
```

Out of scope for this task (panel-B settings transport; see `T0-lane4-chrome-dom-ready-wait-plus-bless-report.md`). **Not masked.**

---

## 5. Invariants checked

| Invariant | How |
|-----------|-----|
| **I8** | `known-failing.json` mirrored to homepage tree |
| **I9** | Did not silently bury H-S30 — reported as unexpected regression |
| **I15** | H-S27/H-S83 flagged as tracked flakes, **not fix-counted**; H-S27 noted as synthetic-harness RED (untrusted until production-faithful re-actuation) |

---

## 6. What I did NOT do / limits

- **Did not bless** `20260716b10` or any build.
- **Did not** add H-S30 to `knownFailing` (unexpected regression; separate triage/route required per T8 step 15).
- **Did not** mask H-R04/H-R05 `gate:react` failures.
- Manager gate **~24 min** full suite; H-S27 passed this cycle (flake may still fail other cycles when not tracked — now tracked).

---

## 7. Live-verification handoff

N/A — baseline-only. PO impact: H-S27/H-S83 failures in manager gate are **expected tracked flakes**, not combined-build regressions. H-S30 failure this cycle needs separate T8/replay triage if it persists.

---

## 8. Status

**PARTIAL — rebaseline landed; full gate NOT clean**

- **H-S27/H-S83 rebaseline:** DONE — entries in `knownFailing` (both I8 trees); manager gate shows both as `PASS (known-failing)`.
- **Criterion 5 clean exit:** **BLOCKED** on unexpected **H-S30** regression (`rebaseline-hs27-hs83-gate-manager.txt`).
- **Neither H-S27 nor H-S83 is fix-counted** — tracked flakes only.

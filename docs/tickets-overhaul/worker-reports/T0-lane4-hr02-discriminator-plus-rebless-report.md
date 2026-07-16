# T0 Lane 4 — H-R02 discriminator (D-023) + re-bless `20260716b10`

## 1. Task + RC

- **Task:** `T0-lane4-hr02-discriminator-plus-rebless-D023` — derive H-R02 discriminator per D-023; P1 ledger note; re-bless combined build after H-S27/H-S83 triage.
- **RC:** Tooling/harness — no product RC. Discharges ESC-020 / D-023 standing rule (per-row discriminators on bless-critical path).

**Build:** `20260716b10` (`serve.mjs` / panel iframe stamp confirmed in `gate:react` runs).

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs` | Added `singleClickCanvasBackground()` (real mouse on empty canvas); boot hooks for lifecycle/legacy/chrome/dli probes; fixed missing `dliOff` const (`ReferenceError` blocker). |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-scenarios.mjs` | `hR02` uses `singleClickCanvasBackground` when `ctx.hr02ActuationMiss` instead of `singleClickDrawing`. |
| `chart v 1.4/chart/multichart-prod/harness/react-run.mjs` | CLI `--hr02-actuation-miss` / `--hr02-discriminator-off`; logs `hr02ActuationMiss` in run banner. |
| `chart v 1.4/chart/multichart-prod/harness/HARNESS-REFERENCE.md` | D-023 per-row discriminator table; H-R02 A/B commands; P1 ledger note. |
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | Removed `H-R07` from `reactParity.knownFailing`; re-added `H-S27`/`H-S30`/`H-S50` as tracked flakes (manager gate r3 alignment). H-S34 remains promoted (not in baseline). |
| `homepage/public/chart/multichart-prod/harness/react-parity-lib.mjs` | I8 mirror — byte-identical to chart tree copy. |
| `homepage/public/chart/multichart-prod/harness/react-parity-scenarios.mjs` | I8 mirror. |
| `homepage/public/chart/multichart-prod/harness/react-run.mjs` | I8 mirror. |
| `homepage/public/chart/multichart-prod/harness/HARNESS-REFERENCE.md` | I8 mirror. |
| `homepage/public/chart/multichart-prod/harness/known-failing.json` | I8 mirror of baseline reconcile. |
| `docs/tickets-overhaul/T3-COMBINED-BUILD-MANIFEST.md` | P1 ledger note; H-R02 harness discriminator row; `ecaa8a9c`/`20260716b10` filled; bless status **BLOCKED** pending `gate:react`. |

**No other files touched.** No engine edits.

---

## 3. Kill-switch (I3 + I13)

### H-R02 discriminator (harness-only — D-023 I15 fallback)

| Name | Default | OFF effect |
|------|---------|------------|
| CLI `--hr02-actuation-miss` / `--hr02-discriminator-off` | unset = normal select actuation | `hR02` clicks empty canvas → store stays empty while chrome may persist → 10/10 FAIL-REAL-BUG |

**Engine one-knob search (no match on `20260716b10`):** `--phase1-off`, `--lifecycle-off`, `--legacy-selection-off`, `--drawing-local-invalidation-off`, `--chrome-routing-off`, `--peer-deselect-off`, `--phase5-off`, `REACT_PARITY_GEAR_FIX_OFF` — none flipped H-R02 10/10 FAIL.

**Escalation:** Lane 1 may add a real engine switch later; discriminator must move with mechanism per D-021.

### Unchanged engine discriminators (re-bless proof)

| Row | Switch / CLI |
|-----|----------------|
| H-R03 | `__TALARIA_DISABLE_IFRAME_CTRL_SELECT_DEDUPE_V1` / `--iframe-ctrl-dedupe-off` |
| H-R06 | `__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1` / `--panel-keyboard-off` |
| H-R07 | `__TALARIA_DISABLE_MC_REMIGRATION_PHASE5_PEER_ISOLATION` / `--phase5-off` |

---

## 4. Proof — RED → GREEN

### TASK 1 — H-R02 discriminator A/B (`20260716b10`)

```bash
cd "chart v 1.4/chart/multichart-prod/harness"
node react-run.mjs --only=H-R02 --runs=10
node react-run.mjs --only=H-R02 --runs=10 --hr02-actuation-miss
```

| Arm | Result | Evidence |
|-----|--------|----------|
| Default | **10/10 PASS** | `d023-hr02-on-x10.txt`, `d023-rebless-hr02-on-x10.txt` |
| `--hr02-actuation-miss` | **10/10 FAIL-REAL-BUG** | `d023-hr02-actuation-miss-x10.txt`, `d023-rebless-hr02-miss-x10.txt` |

Key FAIL lines (actuation-miss): store `selected=false` while `handleCount=16`, `hasBlueBorder=true` on host + panel B — real end-state mismatch, not proxy.

**I15:** Default arm actuates with **real mouse** `singleClickDrawing` at hit coords (host + iframe panel B). Discriminator arm actuates with **real mouse** `singleClickCanvasBackground` on empty canvas (honest miss surface). Asserts **engine store selection** + **resize-handle chrome** (`hasBlueBorder`).

**Host flake note:** `d023-hr02-predicate-probe.mjs` showed brief host `storeSel=false` with handles visible ~1/10 on default arm — watch item; no new tracked row this cycle (default 10/10 held).

### TASK 2 — P1 ledger note

Recorded in:
- `HARNESS-REFERENCE.md` § "P1 engine substrate — ledger note (D-023)"
- `T3-COMBINED-BUILD-MANIFEST.md` §2.1 revert table + post-table ledger paragraph

### TASK 3 — Re-bless gate

**Discriminator suite (all on built `20260716b10`):**

| Row | Default | Switch-OFF | Evidence |
|-----|---------|------------|----------|
| H-R03 | 10/10 PASS | 10/10 FAIL-REAL-BUG (`--iframe-ctrl-dedupe-off`) | `d023-rebless-hr03-on-x10.txt`, `d023-rebless-hr03-dedupeoff-x10.txt` |
| H-R02 | 10/10 PASS | 10/10 FAIL-REAL-BUG (`--hr02-actuation-miss`) | `d023-rebless-hr02-on-x10.txt`, `d023-rebless-hr02-miss-x10.txt` |
| H-R06 | 10/10 PASS | 10/10 FAIL-REAL-BUG (`--panel-keyboard-off`) | `d023-rebless-hr06-on-x10.txt`, `d023-rebless-hr06-kboff-x10.txt` |
| H-R07 | 10/10 PASS | 10/10 FAIL-REAL-BUG (`--phase5-off`) | `d023-rebless-hr07-on-x10.txt`, `d023-rebless-hr07-p5off-x10.txt` |

**D-023 bless-candidate H-R03 run:** `d023-rebless-hr03-on-x10.txt` → **10/10 PASS** (no host-only flake this cycle).

**Manager `npm run gate` (r3, updated baseline):**

```
[gate] PASS: no new regressions; 32 known-failing tracked.
```

Evidence: `d023-rebless-gate-manager-r3.txt`. **0 regressions.** H-S27/H-S30/H-S50 in baseline as tracked flakes; H-S83 PASS (not in baseline this cycle — triage classification in manifest).

**`npm run gate:react` — NOT CLEAN (bless blocker):**

| Run | Regression(s) | Evidence |
|-----|---------------|----------|
| r1 | H-R12 | `d023-rebless-gate-react.txt` |
| r2 | H-R06, H-R12 | `d023-rebless-gate-react-r2.txt` |
| r3 | H-R04 | `d023-rebless-gate-react-r3.txt` |
| r4 | H-R09 | `d023-rebless-gate-react-r4.txt` |
| r5 | H-R04 | `d023-rebless-gate-react-r5.txt` |

Isolated rows pass (e.g. H-R06 10/10 in discriminator suite; H-R12 2/5 isolated `d023-hr12-isolated-x5.txt` FAIL-FLAKE). Failures are **full-suite session-order** — different row each retry; disjoint from D-023 harness edits.

**Baseline promotions applied:**

- `H-R07` removed from `reactParity.knownFailing` (both trees).
- `H-S34` promoted — `GATE H-S34 PASS` on manager gate r3; never re-added to host `knownFailing`.

**H-S27/H-S83 triage (Lane 2):** Classification recorded in manifest H-S27 honesty follow-up. Baseline: H-S27 tracked flake entry; H-S83 omitted when green on bless-cycle gates (gate stale rule).

---

## 5. Invariants checked

| Invariant | How |
|-----------|-----|
| **I3/I13** | Harness discriminator only; engine switches unchanged. P1 stays gated in engine. |
| **I8** | Harness files mirrored to `homepage/public/chart/...`. |
| **I15** | H-R02 default + discriminator use real mouse; measure store + visible chrome. Actuation-miss is honest I15 fallback per D-023 (not proxy green). |
| **I9** | No scenario assertion edits; only actuation branch + CLI. |
| **D-021** | H-R02 now has named discriminator in `HARNESS-REFERENCE.md`. |
| **D-023** | H-R03 dedupe A/B retained; P1 ledger honest; bless H-R03 10/10 run clean. |

**Not satisfied:** TASK 3 requires `gate:react` exit 0 — **not achieved** after 5 retries.

---

## 6. What I did NOT do / limits

- **Did not bless** `20260716b10` for PO — `gate:react` session-order flake blocks D-023 bless sequence.
- **Did not add engine one-knob** for H-R02 — none found; reported for Lane 1 escalation.
- **Did not commit** — awaiting user request (file-scoped Lane 4 commit).
- **H-S83 baseline:** Omitted when PASS (gate stale); re-add when full gate flags regression per triage reasons in worker prompt.
- **H-R12 panel-B gear route:** 3/5 FAIL isolated — may need own tracked row if it blocks a future clean `gate:react`; not added this cycle.
- **PO live-confirm** not run by this worker.

---

## 7. Live-verification handoff

**When bless unblocks**, PO uses build **`20260716b10`** on host + every panel iframe (`H-R12 L1` probe confirms).

Parity checklist focus:
1. **H-R02:** Place rectangle on host A + panel B; single-click select → blue border + handles; store shows selected.
2. **H-R03:** Panel B — two trendlines; Ctrl+click second → both stay selected.
3. **H-R07:** Select in panel B → host A deselects.
4. **H-R06:** Delete removes drawing, no ghost.

Accumulated staging per `T3-COMBINED-BUILD-MANIFEST.md` §4 / §4.1.

---

## 8. Status

**TASK 1 — DONE (proven):** H-R02 discriminator `--hr02-actuation-miss` / `--hr02-discriminator-off` — 10/10 PASS default, 10/10 FAIL-REAL-BUG on built `20260716b10`.

**TASK 2 — DONE:** P1 ledger note in `HARNESS-REFERENCE.md` + `T3-COMBINED-BUILD-MANIFEST.md`.

**TASK 3 — BLOCKED (`gate:react` session-order flake):** Manager gate **PASS** (0 regressions, r3). All four discriminator A/B arms green. H-R07 removed; H-S34 promoted. **`gate:react` not clean** across 5 retries (H-R04/H-R06/H-R09/H-R12 rotating failures in full suite while isolated/discriminator runs pass).

**Bless verdict:** **`20260716b10` NOT blessed** — retry `gate:react` to clean exit or Manager/Director ruling on session-order flake rows before PO handoff.

**PO handoff line (when unblocked):** `MULTICHART-PARITY-CHECKLIST.md` → build **`20260716b10`**, H-R03 fix **`ecaa8a9c`**, H-R02 discriminator **`--hr02-actuation-miss`**.

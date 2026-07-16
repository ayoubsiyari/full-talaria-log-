# T3 Phase 0 — FROZEN authoritative RED matrix (D-018 #2)

**Frozen:** 2026-07-16 (Lane 4 `T3-remig-phase0-freeze-plus-regate`)  
**Re-validated:** 2026-07-16 (Lane 4 `T3-remig-harness-hitcoord-fix-plus-revalidate`)  
**Build:** `20260715b2` (react parity gate)  
**Posture:** fallback-B default — migration switches OFF unless `--migration-on` / per-phase master OFF  
**Evidence:** isolated per-row revalidation (`hitcoord-matrix-revalidate-isolated.txt`), Phase 1 A/B (`hitcoord-hr02-hr03-p1on-x10-v3.txt`, `hitcoord-hr02-hr03-p1off-x10-v3.txt`), react gate (`hitcoord-gate-react-final.txt`)

---

## Material matrix change (Manager escalation)

D-018 ratified **11** honest REDs on build `20260715b2`. Post hit-coord harness fix, isolated fresh-boot revalidation shows **8 rows were click-miss artifacts** (not engine bugs). Authoritative honest-RED count is now **2** (H-R06, H-R07). Full-suite session order still produces intermittent flakes on H-R04/H-R09 — document as harness/session, not re-promoted engine REDs.

| Outcome | Rows |
|---------|------|
| **Flipped GREEN (click-miss artifact)** | H-R01, H-R02, H-R03, H-R04, H-R05, H-R08, H-R13, H-R14 |
| **Honest RED (engine)** | H-R06 (Delete), H-R07 (cross-panel select) |
| **Dropped green (unchanged)** | H-R12, H-R12A, H-S80 |

---

## Re-validated per-row verdicts (isolated `--runs=1`, fresh boot each)

| Row | Verdict | Notes |
|-----|---------|-------|
| **H-R01** | **GENUINELY-GREEN** | Real click selects + V9 bar (host + panel B) |
| **H-R02** | **GENUINELY-GREEN** | Store + chrome aligned after hitcoord fix |
| **H-R03** | **GENUINELY-GREEN** | Ctrl+click multi-select 10/10 Phase 1 ON |
| **H-R04** | **GENUINELY-GREEN** (isolated) | Full-suite panel-B flake observed once |
| **H-R05** | **GENUINELY-GREEN** | Esc chain after settings open |
| **H-R06** | **HONEST-RED** | Delete does not remove from store |
| **H-R07** | **HONEST-RED** | Cross-panel select store empty |
| **H-R08** | **GENUINELY-GREEN** | Marquee + store multi-select |
| **H-R09** | **GENUINELY-GREEN** (isolated) | Host store leg flake in one full-suite run |
| **H-R12** | **GENUINELY-GREEN** (unchanged) | Panel-B gear → settings |
| **H-R13** | **GENUINELY-GREEN** | Panel-B dbl-click settings |
| **H-R14** | **GENUINELY-GREEN** | Panel-B Ctrl+drag marquee |

---

## Phase 1 dispatch gate (updated)

**Phase 1 cleared to GREEN / Phase 2 may start** for H-R02 + H-R03 store legs:

| Measurement | Command | Result |
|-------------|---------|--------|
| Phase 1 ON | `react-run --only=H-R02,H-R03 --runs=10` | **H-R02 10/10 PASS, H-R03 10/10 PASS** (`hitcoord-hr02-hr03-p1on-x10-v3.txt`) |
| Phase 1 OFF A/B | `react-run --only=H-R02,H-R03 --runs=10 --phase1-off` | H-R02 10/10 PASS; **H-R03 10/10 FAIL-REAL-BUG** (panel-B ctrl leg — proves Phase 1 substrate required) |

---

## Baseline snapshot (post hitcoord revalidation)

| Surface | expected | knownFailing | Notes |
|---------|----------|--------------|-------|
| Host `gate` | 83 | 33 | Not re-run this task (pending manager pass) |
| `gate:react` | 14 (incl. H-S80) | **2** | H-R06, H-R07 — down from 11 |

SHA256 post hitcoord fix:
- `react-parity-lib.mjs` `D8FBDDD63BD75332AB2CF25C9810A88527A0B2FE7F5BB6FAE49E3CFC301A625F`
- `known-failing.json` (2-row react baseline) — see worker report for current hash

Prior freeze SHA256: `known-failing.json` `7B7CEFB…`; `react-parity-lib.mjs` `4CCA8752…`

---

## Row → phase map (binding — updated scope)

| Phase | Discharges | Rows still in scope |
|-------|------------|---------------------|
| **P1** | H-R02, H-R03 store legs | **DONE (proven)** — H-R01 store leg unblocked |
| **P2** | H-R01 V9 bar only | Ready (H-R01 green) |
| **P3** | H-R04, H-R13 | **Shrunk** — rows green post hitcoord |
| **P4** | H-R05, H-R06 | H-R05 green; **H-R06 remains RED** |
| **P5** | H-R07 + H-S35, H-S44 | **H-R07 remains RED** |
| **P6** | H-R08, H-R14 | **Shrunk** — rows green post hitcoord |

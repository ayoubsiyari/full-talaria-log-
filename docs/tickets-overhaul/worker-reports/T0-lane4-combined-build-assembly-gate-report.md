# T0 Lane 4 — Combined-build assembly + verification gate report

**Task:** `T0-lane4-combined-build-assembly-gate.md`  
**Date:** 2026-07-16  
**Engine commits confirmed:** `6dc552a8` (P1), `f46e6d9d` (H-R06), `52894a8d` (H-R07), `ba07584c` (harness reconcile)  
**Combined build id:** **`20260716b6`** (supersedes divergent `20260716b2` / `20260716b5`)  
**Verdict:** **STOP — NOT PARITY-CHECKLIST READY** (H-R03 panel-B regression blocks bless)

---

## 1. STEP 0 — Reconcile + single build id

| Check | Result |
|-------|--------|
| `react-parity-lib.mjs` has `focusReactPanelSoft` | ✅ |
| D-021 hooks: `--phase1-off`, `--panel-keyboard-off`, `--peer-deselect-off`, `--phase5-off` | ✅ |
| Single build id across dist-v9 / serve / SW / embed / legacy / live | ✅ **`20260716b6`** |
| `CHART_ENGINE_BUILD` both trees | ✅ **`20260716b6`** (`chart.js` chart + homepage) |

Bump command: `BUILD_ID=20260716b6 node chart\ v\ 1.4/talaria-design/scripts/bump-dist-v9-cache.mjs --both`

---

## 2. STEP 1 — D-021 Phase-1 A/B discriminator (MANDATORY)

Surface: built-dist-v9 `build=20260716b6`

| Run | Command | H-R02 | H-R03 | Gate |
|-----|---------|-------|-------|------|
| P1 ON | `--only=H-R02,H-R03 --runs=10` | **10/10 PASS** | **0/10 PASS** (panelB `first=true second=false` every run; host 10/10) | **FAIL** |
| P1 OFF | `--only=H-R02,H-R03 --runs=10 --phase1-off` | **10/10 PASS** | **0/10 PASS** (same panelB pattern) | **FAIL** |

**Evidence:** `combined-b6-ab-p1on-x10.txt`, `combined-b6-ab-p1off-x10.txt`

**Discriminator assessment:** Host ctrl-select discriminates (P1 ON host 10/10; P1 OFF expected RED on substrate). **Panel B fails 10/10 with P1 ON** — mandatory green bar not met. Harness has not lost host discriminating power; **combined engine bundle regressed panel-B multi-select** relative to pre-H-R06 proof on `20260715b2` (`hitcoord-hr02-hr03-p1on-x10-v3.txt` 10/10).

---

## 3. STEP 2 — Isolated fresh-boot confirm (flake vs regression)

| Row | Isolated `--runs=10` | Verdict | Notes |
|-----|----------------------|---------|-------|
| H-R03 | `--only=H-R03` | **FAIL-REAL-BUG** | 10/10 panelB `second=false`; host 10/10 — **not session-order flake** |
| H-R03 | `--phase5-off` | **FAIL-REAL-BUG** | P5 master off does not restore panelB |
| H-R03 | `--peer-deselect-off` | **FAIL-REAL-BUG** | Child peer switch off does not restore |
| H-R03 | `--panel-keyboard-off` | **FAIL-REAL-BUG** | P4 keyboard off does not restore |
| H-R04 | `--only=H-R04` | **FAIL-FLAKE** | 3/10 PASS (`FAIL×7, PASS×3`); panelB settings-open only |
| H-R05 | `--only=H-R05` | **FAIL-FLAKE** | 1/10 PASS; panelB settings fail to open before Esc (H-R04 family) |
| H-R06 | `--only=H-R06` | **PASS** | 10/10 |
| H-R07 | `--only=H-R07` | **PASS** | 10/10 |

**H-R03 / H-R04 call:** H-R03 is **genuine regression** (deterministic 10/10 isolated). H-R04 panelB is **flake** (3/10 green isolated), secondary to H-R03 block.

**Escalation:** Per task guardrail — regression from P1/H-R06/H-R07 bundle on panel-B ctrl-select. Aligns with Lane 2 H-R07 report note (`d021-gate-react-clean.txt` H-R03 panelB RED pre-baseline). **Director escalation required** before baseline removal or PO unfreeze.

---

## 4. STEP 3 — Baseline + promotions (NOT APPLIED)

| Action | Status | Reason |
|--------|--------|--------|
| Remove H-R06 from react `knownFailing` | Already done in `ba07584c` | H-R06 10/10 on b6 |
| Remove H-R07 from react `knownFailing` | **HELD** | H-R03 regression blocks paired bless |
| Promote H-S34 | **HELD** | Tied to H-R07 baseline update |
| Keep H-S35 / H-S44 tracked | ✅ unchanged | Chrome-proxy gap |

**Full gate:** `npm run gate:react` on b6 — evidence `combined-b6-gate-react.txt` — **exit 1**. Regressions: **H-R03** (FAIL-REAL-BUG), **H-R05** (FAIL-FLAKE in shared session; isolated 1/10 panelB). Gate correctly flags **H-R07 newly fixed** (remove from baseline when unblocked).

---

## 5. STEP 4 — 12-row matrix on combined build `20260716b6`

| Row | Isolated verdict (authoritative) | Matrix green? |
|-----|----------------------------------|---------------|
| H-R01 | PASS (snapshot) | ✅ |
| H-R02 | 10/10 PASS | ✅ |
| H-R03 | **10/10 FAIL-REAL-BUG** (panelB) | ❌ |
| H-R04 | FAIL-FLAKE (3/10 panelB) | ❌ |
| H-R05 | FAIL-FLAKE (1/10 panelB settings) | ❌ |
| H-R06 | 10/10 PASS | ✅ |
| H-R07 | 10/10 PASS | ✅ |
| H-R08 | PASS (snapshot) | ✅ |
| H-R09 | PASS (snapshot) | ✅ |
| H-R12 | PASS (snapshot) | ✅ |
| H-R12A | PASS (snapshot) | ✅ |
| H-R13 | PASS (snapshot) | ✅ |
| H-R14 | PASS (snapshot) | ✅ |

**Open HR-PARITY rows:** H-R03 (engine regression), H-R04 (flake — defer behind H-R03).  
**PARITY-CHECKLIST READY:** **NO**

---

## 6. Unfreeze bundle contents (build `20260716b6`)

Accumulated in dist bundle (non-exhaustive): P1 engine substrate (`6dc552a8`), H-R06 Delete keyboard bridge (`f46e6d9d`), H-R07 peer-isolation debounce (`f46e6d9d` MultichartGrid + `52894a8d` manager), prior staging (cadence b1, order-entry, TF-label, replay-persistence per manifest). Smoke: H-R06/H-R07 GREEN; H-R03 panelB RED vs `20260715b2` baseline.

---

## 7. Evidence index

| File | Content |
|------|---------|
| `combined-b6-ab-p1on-x10.txt` | P1 ON discriminator |
| `combined-b6-ab-p1off-x10.txt` | P1 OFF discriminator |
| `combined-b6-hr03-isolated-x10.txt` | H-R03 isolated regression proof |
| `combined-b6-hr03-phase5off-x10.txt` | A/B P5 off |
| `combined-b6-hr03-peeroff-x10.txt` | A/B peer-deselect off |
| `combined-b6-hr03-kboff-x10.txt` | A/B panel-keyboard off |
| `combined-b6-hr06-x10.txt` | H-R06 10/10 |
| `combined-b6-hr07-x10.txt` | H-R07 10/10 |
| `combined-b6-hr04-x10.txt` | H-R04 flake profile |
| `combined-b6-hr05-x10.txt` | H-R05 flake profile |
| `combined-b6-matrix-snapshot.txt` | Rows 01/05/08/09/12/12A/13/14 ×1 |
| `combined-b6-gate-react.txt` | Full `gate:react` |

---

## 8. Recommended next actions (Director)

1. **Lane 1 / engine:** Bisect panel-B ctrl-select regression between `20260715b2` (GREEN) and `f46e6d9d` dist (`MultichartGrid` P4+P5 hunks bundled with H-R06 build).  
2. **Lane 4:** Hold `known-failing` H-R07 + H-S34 until H-R03 panelB 10/10 on combined build.  
3. **Re-run assembly gate** after engine fix — same STEP 1→3 sequence on new build id.

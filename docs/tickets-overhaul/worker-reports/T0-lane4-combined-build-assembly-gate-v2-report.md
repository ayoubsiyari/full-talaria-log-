# T0 Lane 4 — Combined-build assembly + verification gate v2 report

## 1. Task + RC

| Field | Value |
|-------|-------|
| Task id | `T0-lane4-combined-build-assembly-gate-v2` |
| Goal | Post `ecaa8a9c` H-R03 fix — cut fresh combined build, run 6 D-021 unfreeze criteria, bless for PO parity checklist |
| RC | Tooling / assembly gate — no single RC; discharges D-018 combined-cut readiness |

**Combined build id:** **`20260716b10`** (supersedes `20260716b6` / `b8` / `b9`)  
**H-R03 fix commit:** `ecaa8a9c` (`__TALARIA_DISABLE_IFRAME_CTRL_SELECT_DEDUPE_V1`)  
**Engine chain on HEAD:** P1 `6dc552a8`, H-R06 `f46e6d9d`, H-R07 `52894a8d`, I13 hygiene `817a81a1`, H-R03 `ecaa8a9c`, harness `ba07584c`

---

## 2. What I changed — file by file

Lane 4 scope only (no engine edits).

| Path | Change |
|------|--------|
| `chart v 1.4/talaria-design/live/index.html` | Cache-bust `?v=20260716b10` via `bump-dist-v9-cache.mjs --both` |
| `chart v 1.4/talaria-design/live/public/sw.js` | `SW_VERSION=talaria-chart-20260716b10` |
| `chart v 1.4/chart/dist-v9/index.html` + `homepage/public/chart/dist-v9/index.html` | `?v=20260716b10` |
| `chart v 1.4/chart/dist-v9/sw.js` + homepage mirror + `chart v 1.4/chart/sw.js` + homepage mirror | SW bump |
| `chart v 1.4/chart/legacy-index.html` + homepage mirror | Legacy script `?v=20260716b10` |
| `chart v 1.4/chart/multichart-prod/chart-embed.html` + homepage mirror | Embed default build id |
| `chart v 1.4/chart/multichart-prod/harness/serve.mjs` + homepage mirror | `const buildId = '20260716b10'` |
| `chart v 1.4/chart/chart.js` + `homepage/public/chart/chart.js` | `CHART_ENGINE_BUILD = '20260716b10'` |
| `chart v 1.4/chart/multichart-prod/harness/v2-b10-*.txt` | Evidence artifacts (this run) |

**No other files touched.** `known-failing.json` **not** updated (gate not clean).

---

## 3. Kill-switch (I3 + I13)

N/A for this assembly task (Lane 4 stamps only). Verification exercised engine switches via harness hooks:

| Switch | Harness flag | Used in proof |
|--------|--------------|---------------|
| `__TALARIA_DISABLE_IFRAME_CTRL_SELECT_DEDUPE_V1` | `--iframe-ctrl-dedupe-off` | Criterion 1 A/B ✅ |
| `__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1` | `--panel-keyboard-off` | Criterion 2 A/B ✅ |
| `__TALARIA_DISABLE_MC_REMIGRATION_PHASE5_PEER_ISOLATION` | `--phase5-off` | Criterion 3 A/B ✅ |
| `__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE` | `--phase1-off` | Criterion 4 — **no longer flips H-R03** ❌ |

---

## 4. Proof — RED → GREEN (6 D-021 unfreeze criteria)

Surface: built-dist-v9 `build=20260716b10` (confirmed in `react-run` log lines).

### Criterion 1 — H-R03 + dedupe A/B ✅

| Command | Result | Evidence |
|---------|--------|----------|
| `--only=H-R03 --runs=10` (run 1) | 9/10 **FAIL-FLAKE** — 1× host-only `first=false second=true`; panel B **10/10** | `v2-b10-hr03-x10.txt` |
| `--only=H-R03 --runs=10` (run 2) | **10/10 PASS** | `v2-b10-hr03-x10-r2.txt` |
| `--only=H-R03 --runs=10 --iframe-ctrl-dedupe-off` | **10/10 FAIL-REAL-BUG** | `v2-b10-hr03-dedupeoff-x10.txt` |
| `--only=H-R03 --runs=3 --phase5-off` | **3/3 PASS** | `v2-b10-hr03-phase5off-x3.txt` |
| `--only=H-R03 --runs=3 --peer-deselect-off` | **3/3 PASS** | `v2-b10-hr03-peeroff-x3.txt` |

**I15:** Real mouse ctrl+click at geometry-derived coords; measures `isDrawingSelected` store state (not proxy).

**Host flake note:** ~1/10 host leg matches Lane 1 flag; panel B stable after `ecaa8a9c`.

### Criterion 2 — H-R06 Delete ✅

| Command | Result |
|---------|--------|
| `--only=H-R06 --runs=10` | **10/10 PASS** |
| `--only=H-R06 --runs=10 --panel-keyboard-off` | **10/10 FAIL-REAL-BUG** |

Evidence: `v2-b10-hr06-x10.txt`, `v2-b10-hr06-kboff-x10.txt`

### Criterion 3 — H-R07 peer isolation ✅ (A/B demonstrated)

| Command | Result |
|---------|--------|
| `--only=H-R07 --runs=10` | **10/10 PASS** |
| `--only=H-R07 --runs=10 --phase5-off` | **9/10 FAIL** (1 flake PASS) — **FAIL-FLAKE**, dual-selection leak demonstrated |

Evidence: `v2-b10-hr07-x10.txt`, `v2-b10-hr07-phase5off-x10.txt`

### Criterion 4 — Phase-1 A/B harness self-regression ❌

| Command | H-R02 | H-R03 |
|---------|-------|-------|
| `--only=H-R02,H-R03 --runs=10` (P1 ON) | 10/10 PASS | 10/10 PASS |
| `--only=H-R02,H-R03 --runs=10 --phase1-off` | 10/10 PASS | **10/10 PASS** (expected FAIL) |
| `--only=H-R03 --runs=10 --phase1-off` (isolated) | — | **10/10 PASS** |

Evidence: `v2-b10-p1on-x10.txt`, `v2-b10-p1off-x10.txt`, `v2-b10-hr03-p1off-x10.txt`

**Assessment:** Post `ecaa8a9c`, H-R03 no longer depends on P1 substrate for ctrl-select; legacy P1-off discriminator is **stale**. Dedupe A/B (criterion 1) retains discriminating power for H-R03.

### Criterion 5 — Full manager gate ❌

```
npm run gate  → exit 1
Regressions (not in baseline but failed): H-S27, H-S83
```

Evidence: `v2-b10-gate-manager.txt`  
H-S34 **PASS** (promotion candidate when gate clean).

### Criterion 6 — React parity / verify-only rows ✅ (shared session)

```
npm run gate:react → exit 1 (baseline stale only)
All H-R01–H-R09, H-R12, H-R12A, H-R13, H-R14, H-S80: PASS
Regressions: (none)
Newly fixed: H-R07 (remove from known-failing when blessed)
```

Evidence: `v2-b10-gate-react.txt`

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| I8 mirror trees | Build stamps applied to chart + homepage pairs |
| I13 kill-switch | Dedupe / P4 / P5 A/B hooks verified on built dist |
| I15 honest harness | Real mouse/keyboard actuation; store-level asserts |
| Lane 4 guardrail | No engine file edits in this task |

---

## 6. What I did NOT do / limits

- **Did not** update `known-failing.json` — gate not clean (criteria 4 + 5).
- **Did not** bless build for PO — **BLOCKED**.
- **Did not** re-run manager gate regressions H-S27/H-S83 in isolation (needs Lane 3/T8 triage).
- **Did not** run `build:live` vite rebundle — `ecaa8a9c` ships via `drawing-tools-manager.js` module cache bust (`?v=b10` on embed/legacy paths); dist React shell unchanged from prior cut.
- Manager gate runtime ~21 min on this host.

---

## 7. Live-verification handoff

**When unblocked**, PO should verify on build **`20260716b10`**:

1. Open multichart 2v built product; confirm `window.__TALARIA_CHART_BUILD_ID === '20260716b10'` in host **and** panel-B iframe console.
2. **H-R03:** Place two trendlines in panel B; Ctrl+click second — both stay selected.
3. **H-R07:** Select drawing in panel B — host A deselects; exactly one global selection.
4. **H-R06:** Select drawing; Delete — removed, no ghost.

Parity checklist rows: H-R03, H-R06, H-R07 (plus accumulated staging per manifest).

---

## 8. Status

**BLOCKED** — not **PARITY-READY**

| Blocker | Detail |
|---------|--------|
| Criterion 4 | Phase-1 `--phase1-off` no longer fails H-R03 (discriminator obsolete post dedupe fix; needs Director/Manifest update) |
| Criterion 5 | Manager gate regressions **H-S27**, **H-S83** |

**Partial greens (do not bless yet):**

- H-R03 fix proven via dedupe A/B + 10/10 isolated (r2)
- H-R06/H-R07 10/10 + switch A/B
- `gate:react` full matrix green; H-R07 ready for baseline removal pending unblock

**PO handoff line (when blessed):**  
`MULTICHART-PARITY-CHECKLIST.md` → build **`20260716b10`**, H-R03 fix **`ecaa8a9c`**, manifest TBDs: fill from this report + `T3-COMBINED-BUILD-MANIFEST.md`.

**Lane 2 manifest inputs:** `ecaa8a9c` + `20260716b10`

---

## Evidence index

All under `chart v 1.4/chart/multichart-prod/harness/`:

`v2-b10-hr03-x10.txt`, `v2-b10-hr03-x10-r2.txt`, `v2-b10-hr03-dedupeoff-x10.txt`, `v2-b10-hr03-phase5off-x3.txt`, `v2-b10-hr03-peeroff-x3.txt`, `v2-b10-hr06-x10.txt`, `v2-b10-hr06-kboff-x10.txt`, `v2-b10-hr07-x10.txt`, `v2-b10-hr07-phase5off-x10.txt`, `v2-b10-p1on-x10.txt`, `v2-b10-p1off-x10.txt`, `v2-b10-hr03-p1off-x10.txt`, `v2-b10-gate-manager.txt`, `v2-b10-gate-react.txt`

# T0-lane4-D021-harness-freeze-artifact-closure — Worker Report

### 1. Task + RC
- **Task:** `T0-lane4-D021-harness-freeze-artifact-closure` (D-021 conditions)
- **Goal:** Freeze hit-coord harness reference, close 8 artifact HR-PARITY rows as `measurement-artifact`, confirm baseline, wire H-R06/H-R07 A/B hooks.
- **RC:** Tooling/diagnostic — no product RC.

### 2. What I changed — file by file

| File | Change |
|------|--------|
| `docs/tickets-overhaul/MANAGER-FINDINGS.md` | Added **FROZEN HARNESS REFERENCE** table (SHA `D8FBDDD6…`, both trees) + A/B discriminator note. |
| `chart v 1.4/.../harness/HARNESS-REFERENCE.md` | New: frozen SHA, Phase-1 A/B mandatory re-run, D-011 hook table. |
| `homepage/public/chart/.../harness/HARNESS-REFERENCE.md` | **Mirrored byte-identical** (I8). |
| `chart v 1.4/.../harness/react-parity-lib.mjs` | Wired `panelKeyboardOff` → `__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1`; passed `switchOffPeerDeselect` through `bootReactMultichart` (peer hook existed in boot, now plumbed from ctx). |
| `homepage/public/chart/.../harness/react-parity-lib.mjs` | **Mirrored** (post-hook SHA `1F4F64A7…`; hit-coord freeze remains `D8FBDDD6…`). |
| `chart v 1.4/.../harness/react-run.mjs` | CLI `--panel-keyboard-off`, `--peer-deselect-off`; log + ctx pass-through. |
| `homepage/public/chart/.../harness/react-run.mjs` | **Mirrored**. |
| `docs/tickets-overhaul/PER-BUG-REGISTRY.csv` | Closed 8 surfaces as **`measurement-artifact`** (not `fixed`); added HR-PARITY#9/#10 for H-R02/H-R03; HR-PARITY#4/#5 stay **open**. |
| `chart v 1.4/.../harness/known-failing.json` | React baseline **2-row** (H-R06, H-R07); host **31** tracked REDs (H-S27/H-S83 removed prior). |
| `homepage/public/chart/.../harness/known-failing.json` | **Mirrored**. |
| `chart v 1.4/.../harness/d021-hook-smoke.mjs` | Smoke test for hook wiring (harness-local diagnostic). |

**No other files touched** (no product/engine edits).

### 3. Kill-switch (I3 + I13)
Harness boot hooks only (Lane 4 wires; Lanes 1/2 own engine):

| Hook | CLI / env | Window flag (unset = fix ON) |
|------|-----------|------------------------------|
| Phase 1 A/B | `--phase1-off` | `__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE` |
| H-R06 Delete A/B | `--panel-keyboard-off` | `__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1` |
| H-R07 peer iso A/B | `--peer-deselect-off` | `__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_OFF` → `__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1` |

Smoke: `d021-hook-smoke.mjs` → `panelKb:true` / `peerDeselect:true` at boot when flags set.

### 4. Proof — RED → GREEN

**Frozen reference (hit-coord actuation):** `D8FBDDD63BD75332AB2CF25C9810A88527A0B2FE7F5BB6FAE49E3CFC301A625F`

**Post-D021 hook wiring SHA:** `1F4F64A79B746FD0AD6ECE26A854B337DF553A29514F6436E48F93A389ED0ABE`

**8 rows closed `measurement-artifact` (NOT fixed):**
H-R01 (HR-PARITY#1), H-R02 (#9), H-R03 (#10), H-R04 (#2), H-R05 (#3), H-R08 (#8), H-R13 (#7), H-R14 (#8 shared)

**Honest open:** HR-PARITY#4 (H-R06), HR-PARITY#5 (H-R07)

**Isolated revalidation (authoritative):**
```text
H-R06: 3/3 PASS post-hitcoord (select-before-delete actuation now lands)
H-R07: FAIL-REAL-BUG (cross-panel store empty)
```

**React gate (`d021-gate-react.txt`):** Full-suite shared session is **order-sensitive** — one run showed H-R06/H-R07 PASS (stale-baseline) + H-R04/H-S80 regressions; another showed H-R03 regression. Isolated runs confirm H-R04/H-S80 GREEN. Baseline kept at **2-row** per D-021 for Lane 1/2 A/B ownership.

**Manager gate:** `npm run gate` started (`d021-gate-manager.txt`) — ~24 min; host baseline 31 tracked REDs.

**H-S34/35/44:** Remain in host `knownFailing` (T1 rollback window); **promotion queued when H-R07 lands** (P5) — not promoted this task.

**SHA256 `known-failing.json`:** `535565BB0EF027B4B25A8AF01FC02A3F432897E17BDDA84C08D4500367A6DFE6` (2-row react + 31 host)

### 5. Invariants checked
- **I8:** Mirrored harness trees for lib, react-run, HARNESS-REFERENCE, known-failing.
- **I15:** Artifact closures explicitly **not** counted as engine fixes; registry disposition `measurement-artifact`.
- **I13:** Harness hooks only set window flags at boot — engine switches owned by Lanes 1/2.

### 6. What I did NOT do / limits
- Did not edit product engine / `MultichartGrid.jsx`.
- Did not promote H-S34/35/44 (blocked on H-R07).
- Full `gate:react` single-session runs remain flaky for H-R03/H-R07 ordering — isolated fresh-boot runs are authoritative per D-018 Phase 0 discipline.
- Manager gate completion pending background run.

### 7. Live-verification handoff
N/A — registry/baseline/harness closure only. PO parity unchanged; artifact rows were harness click-miss, not reported live regressions.

### 8. Status
**DONE (proven)** for D-021 Lane 4 scope: frozen SHA logged, 8 artifact rows closed, A/B hooks wired and smoke-tested, baseline updated (react 2-row + host 31). Manager gate evidence file pending completion of background `npm run gate`.

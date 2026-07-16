# T0 (Lane 4) — Combined-build assembly + verification gate (H-R06 + H-R07 landed)

Both re-migration engine rows are in (H-R06 Delete, H-R07 peer-isolation). You own the harness + registry + the D-021 measurement-integrity conditions. Assemble the combined build and prove it honestly. **Do this AFTER Lane 1 + Lane 2 have committed their engine files** (confirm both commits exist first).

## STEP 0 — reconcile + single build id
- Confirm the working-tree `react-parity-lib.mjs` contains BOTH Worker 1's `focusReactPanelSoft` actuation fix AND the D-021 hooks (`--panel-keyboard-off`, `--peer-deselect-off`, `--phase5-off`). Reconcile into one version.
- Cut **ONE coherent combined build id** (supersedes the divergent `20260716b2` / `20260716b5`) across dist-v9/serve/SW/embed/live + `CHART_ENGINE_BUILD`, both trees. Record it.

## STEP 1 — D-021 discriminator (MANDATORY before trusting greens)
The harness actuation changed (`focusReactPanelSoft`), so per D-021 re-run the Phase-1 A/B discriminator on the reconciled harness:
- `react-run --only=H-R02,H-R03 --runs=10` → **10/10 PASS**.
- `react-run --only=H-R02,H-R03 --runs=10 --phase1-off` → **H-R03 10/10 FAIL-REAL-BUG**.
If H-R03 does NOT flip 10/10 FAIL with the substrate off, the harness has lost its discriminating power — STOP and report.

## STEP 2 — isolated fresh-boot confirm (rule flake vs regression)
The full-suite gate showed **H-R03 FAIL + H-R04 flake**. Run each **isolated, fresh-boot, --runs=10** on the combined build:
- H-R02, H-R03, H-R04, H-R05, H-R06, H-R07 (+ the rest of the 12-row matrix).
- **If H-R03 / H-R04 are 10/10 green isolated** → confirmed session-order flake; document and proceed.
- **If H-R03 (or any) is genuinely FAIL isolated** → this is a regression from P1/H-R06/H-R07 → **STOP and report for Director escalation** (do not bless the build).

## STEP 3 — baseline + promotions
- Remove **H-R06 + H-R07** from `known-failing.json` (both trees) — now genuinely fixed (distinct from the 8 measurement-artifact closures).
- Promote **H-S34** (peer-isolation placement, Worker 2 confirmed PASS). Keep **H-S35 / H-S44** tracked (chrome-proxy gap, defer to chrome routing).
- Full `npm run gate` + `gate:react` on the combined build → clean exit, 0 regressions. Record evidence.

## STEP 4 — combined-build parity readiness
- Confirm the combined build carries the accumulated staging work per D-021 unfreeze criteria (cadence b1, order-entry incl A6-1, settings/Esc/Delete, TF-label, refresh-persistence) — list what's in the bundle + smoke rows for previously PO-confirmed items.
- Confirm the full **12-row matrix green on the combined build** (build id asserted inside panel B), no open HR-PARITY rows.

## Guardrails
Harness + registry + build-id files only (you own these). No product engine edits. Both trees I8. File-scoped commit.

## Report
`docs/tickets-overhaul/worker-reports/T0-lane4-combined-build-assembly-gate-report.md` — combined build id, discriminator result, isolated H-R03/H-R04/etc verdicts (flake vs regression), known-failing removals, H-S34 promotion, full-gate evidence, 12-row matrix status, unfreeze-criteria checklist. State clearly whether the combined build is **PARITY-CHECKLIST READY** for PO.

# RE-MIGRATION Phase 1 IMPLEMENTATION (Lane 1) — engine selection substrate

Step 0 (H-S18) is fixed and the gate is unblocked. Prereqs met: chart.js clean (Lane 2 snap-back `9462cef3`), Phase 0 frozen (10-row authoritative set; H-R07/H-R12 dropped), H-S18 poison removed. **Implement Phase 1 now** per your accepted PREP (`T3-remig-phase1-lane1-PREP-report.md`).

## Implement
- **Master slice switch** `__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE` (D-018 #2, required — one-knob revert) wrapping the **iframe-only** flip of `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` + `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2`.
- Touch zones (per PREP, both trees / I8): `tool-lifecycle-store.js` `isEnabled()` ~21–27; `drawing-tools-manager.js` `_isToolLifecycleV2Enabled()` ~3575–3580; `chart.js` `_isLegacySelectionRetireV2Enabled()` ~2349–2357.
- **chart.js discipline:** edit ONLY ~2349–2357 (+ consumer guards only if strictly needed). **Do NOT touch** Lane 2's snap-back regions 2456–2526 / 17296–17357.
- **Single-chart / host A behavior MUST stay unchanged** — iframe-embed scope only.

## Prove (honest, per D-018 #1/#6, I15)
- On built `dist-v9`: **H-R02, H-R03 → 10/10**; H-R01 store-leg green (V9 quick-bar may stay RED → Phase 2, per D-010 — not a Phase-1 failure).
- **Master-switch A/B:** set `__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE = true` → the rows restore to RED (proves the one-knob revert). Coordinate the `phase1Off` boot hook with Lane 4.
- **0 regressions** on `gate:react` AND the now-clean manager gate (coordinate with Lane 4's re-gate for the authoritative baseline — if the manager gate isn't clean yet, report your `gate:react` result and hold the regression claim).
- Every report line = **DONE (dev only) — NEEDS-LIVE**; no "proven", no GREEN-SYNTHETIC.

## Guardrails
- File-scoped commit only (the 3 engine files + mirrors), never `git add -A`. No `known-failing.json`/`scenarios.mjs` (Lane 4), no order-entry, no replay-system.
- Do not begin Phase 2 (React ownership/routing) — that's Lane 2 on Phase-1-GREEN.

## Report — WORKER-REPORT-STANDARD.md
Deliverable: `docs/tickets-overhaul/worker-reports/T3-remig-phase1-lane1-IMPL-report.md` — files + master switch, H-R02/H-R03 10/10 with actuation/measurement, A/B revert result, regression status (gate:react + manager gate if available), commit hash + SHA256. State whether Phase 1 is GREEN and Phase 2 may start.

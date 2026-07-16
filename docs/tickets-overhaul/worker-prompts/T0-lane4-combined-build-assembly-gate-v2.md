# T0 (Lane 4) — Combined-build assembly + verification gate v2 (post H-R03 fix)

The H-R03 fix landed (`ecaa8a9c`, `drawing-tools-manager.js`, switch `__TALARIA_DISABLE_IFRAME_CTRL_SELECT_DEDUPE_V1`). `20260716b6` is superseded. Cut a fresh combined build and run the full verification gate that lifts the freeze.

## STEP 1 — Cut fresh combined build
- New build id **> b9** (e.g. `20260716b10`) stamped in `serve.mjs`, `live/index.html`, SW, `chart-embed.html`, dist mirrors, and `CHART_ENGINE_BUILD` on both `chart.js` mirrors.
- Must include every landed re-migration + hygiene commit: P1 `6dc552a8`, H-R06 `f46e6d9d`, H-R07 `52894a8d`, I13 hygiene `817a81a1`, H-R03 fix `ecaa8a9c`, plus the frozen harness `ba07584c` — and all accumulated staging work already on main (cadence b1, order-entry, settings/Esc/Delete, TF-label).
- Confirm `window.__TALARIA_CHART_BUILD_ID` resolves to the new id in host + panel iframe.

## STEP 2 — Assembly gate (the 6 D-021 unfreeze criteria)
On the built dist (not source):
1. **H-R03** `--only=H-R03 --runs=10` → **10/10 PASS**; `--iframe-ctrl-dedupe-off --runs=10` → **10/10 FAIL** (A/B discriminator, D-021 condition #1). `--phase5-off`/`--peer-deselect-off` → still PASS.
2. **H-R06 Delete** 10/10 PASS + switch-OFF FAIL.
3. **H-R07 cross-panel select** 10/10 PASS + `--phase5-off` FAIL.
4. **Phase-1 A/B** (H-R02/H-R03) still 10/10 ON / FAIL `--phase1-off` — harness self-regression test (frozen SHA reference).
5. **Full manager gate** → 0 regressions vs current baseline.
6. Re-confirm no verify-only phase (P2/P3/P6) rows regressed on the combined build.

Note the ~1/10 **host-only** harness flake Lane 1 flagged — if it appears, isolate to confirm it's the host leg (panel B stable), not a real combined-build regression.

## STEP 3 — Baseline promotions (only if gate clean)
- Remove **H-R07** from `known-failing.json` (both trees) — now green.
- Promote **H-S34** per prior plan.
- Re-run gate once more to confirm 0 regressions with updated baseline.

## STEP 4 — Handoff
- Report the blessed BUILD_ID for the PO parity-checklist (`MULTICHART-PARITY-CHECKLIST.md`).
- Provide the H-R03 fix commit hash + build id to Lane 2 to fill the manifest TBDs.

## Guardrails
- Lane 4 owns harness + `known-failing.json` + build stamps. Do NOT edit engine files. File-scoped commit for the build cut + evidence + report.
- If the gate is NOT clean → STOP, report as blocker with evidence (do NOT bless the build).

## Report — WORKER-REPORT-STANDARD.md
`docs/tickets-overhaul/worker-reports/T0-lane4-combined-build-assembly-gate-v2-report.md` — new build id, all 6 criteria results with evidence files, baseline deltas, PO handoff line, commit hash. State clearly: PARITY-READY or BLOCKED.

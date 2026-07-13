# WORKER PROMPT — T1 step 6 (Lane 1): consolidated multichart selection regression — DIAGNOSTIC FIRST

> Hand to the Lane 1 (lifecycle) worker. **Diagnose all three regressions in the REAL React multichart before any fix.** The harness (`multichart-manager.js`) is NOT the production surface — it has hidden every one of these. Do not declare anything fixed on harness evidence alone.

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T1 step 6**, Lane 1.

## SYMPTOMS (PO live, build `20260712b8`, multichart panels)
Single chart is fine. In multichart panels, after T1 step 4/5:
- **R1 — Ctrl-select broken:** Ctrl-click multi-select no longer works correctly.
- **R2 — no selection border:** the blue selection/preview border is not shown while a tool is selected.
- **R3 — settings flash:** clicking a tool makes the settings menu **flash open then immediately close** (open/close race within one interaction).

## READ FIRST (binding)
- `docs/tickets-overhaul/worker-reports/T1-step4-lifecycle-migration-report.md` and `T1-step5-multichart-select-settings-fix-report.md` — your recent changes (`skipV9Dismiss`, `toolDeselected`→close, cross-panel cleanup)
- `docs/tickets-overhaul/worker-reports/T3-step3-row2-ctrlselect-fix-report.md` — Lane 2's `_suppressNextIframeCtrlSelectToggle` (interacts with R1)
- `docs/tickets-overhaul/INVARIANTS.md` — binding; **I5**, **I7**, **I9**

## PART 1 — DIAGNOSTIC (mandatory, before any fix)
Reproduce **R1, R2, R3 in the production React multichart** (`MultichartGrid.jsx` / real `chart-embed`), not just the harness. For each:
1. Name the exact mechanism + file:line (which step-4/5 change or its interaction with Lane 2's Row-2 suppression causes it).
2. R3 specifically: identify the two events racing (the open path vs the close/cleanup path firing in the same interaction) and why `skipV9Dismiss` didn't prevent it.
3. R2: identify where the selection-border chrome is dropped in panel context (ownership routing bypassing the per-tool `select()` chrome?).
4. R1: determine whether the Row-2 suppression window + step-4/5 selection routing conflict.

**Deliver the diagnostic as an escalation-ready section** — the Manager is escalating the approach (ESC-006) and needs the mechanism map.

## PART 2 — FIX (only after diagnosis is solid)
- One coherent gated fix (reuse `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` unless a sub-switch is justified) that resolves R1+R2+R3 together **without** re-breaking single chart, H-S34/H-S35 (cross-panel clear), or H-S43 (Ctrl double-toggle).
- **Real-product verification required:** in addition to harness scenarios, provide a reproduction/verification path that exercises the React `MultichartGrid` selection flow (or a clear manual PO script if automation isn't feasible). State explicitly which parts are harness-verified vs manual-only.

## BINDING CONSTRAINTS
- **RC-1 only.** I11: no mirror-frame work. L2: production trees only.
- **I8:** both engine trees byte-identical (SHA256 both). Do NOT clobber Lane 2's `_suppressNextIframeCtrlSelectToggle`/`isMultichartIframeEmbed`.
- **Build id:** do NOT bump — report the diff, Manager coordinates.
- Existing gate (H-S32–37/43/44 green; H-S38–42 tracked-red) must stay intact (I9).

## DELIVER (report as `.md`: `docs/tickets-overhaul/worker-reports/T1-step6-multichart-selection-regression-report.md`)
1. **Diagnostic section:** mechanism + file:line for R1, R2, R3 (real-product, not harness).
2. Fix diff + kill-switch; state matrix (single chart unchanged; panel R1/R2/R3 fixed).
3. Harness evidence (new scenarios if feasible) + explicit statement of what is harness-verified vs manual-only.
4. SHA256 both trees; `node --check` clean; build-id diff left for Manager.

## STOP CONDITIONS
If the diagnosis shows R1/R2/R3 can't be fixed without reworking the step-4/5 ownership model, STOP after Part 1 and report — the Manager may (via Director ESC-006) choose to default the kill-switch OFF and consolidate the T1 multichart migration rather than patch further.

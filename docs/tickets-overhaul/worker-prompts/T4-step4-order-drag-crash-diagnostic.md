# WORKER PROMPT — T4 step 4 (Lane 3): order/axis-drag crash diagnostic

> Hand to the Lane 3 worker. **Diagnostic first — no fix until the mechanism is confirmed and regression-vs-pre-existing is decided.** Dispatch only after the PO confirms the crash reproduces in default `20260712b2` (no kill-switches).

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T4 step 4 (diagnostic)**, Lane 3.

## SYMPTOM (PO live report, build `20260712b2`)
During entry-line / axis drag the console throws:
```
Uncaught TypeError: Cannot read properties of null (reading 'document')
  at uc (d3.min.js)
  at ig (d3.min.js)
  at forwardEvent (chart.js)
  at priceAxisZone.addEventListener.passive
  at timeAxisZone.addEventListener.passive
```
Effect: order line is "hard to drag" / drag stalls. PO also saw legacy `Auto-detected order type: market + limit` — but that was with `__TALARIA_DISABLE_ORDER_AGGREGATES_V2 = true` (T4 disabled), so treat the type-mutation as the known legacy path, NOT the subject of this task.

## READ FIRST (binding)
- `docs/tickets-overhaul/README.md`, `ROOT-CAUSES.md`, `INVARIANTS.md` (binding), `TRACKS.md`
- `docs/tickets-overhaul/worker-reports/T4-lane3-order-entry-model-report.md`, `T4-step2-display-parsing-report.md`

## TASK — DIAGNOSTIC ONLY
1. **Locate the throw:** `forwardEvent` in `chart.js` forwarding a pointer/drag event into d3 where `uc`/`ig` read `.document` on a null target (`priceAxisZone` / `timeAxisZone` passive listeners). Identify what is null and why during drag.
2. **Regression-vs-pre-existing:** determine whether this crash exists on a **pre-overhaul build** (e.g. `20260707b105`) as well as `20260712b2`. If it reproduces on b105, it is **pre-existing** — map it to an RC and the registry (likely RC-2 invalidation or a drag/axis-forwarding defect), do NOT attribute to T1/T4.
3. **Confirm scope:** verify T4 (`order-manager.js`) and T1 (`drawing-tools-manager.js`/store) did **not** introduce or move the throwing `chart.js` code path (diff/blame the `forwardEvent`/axis-zone region across builds).
4. **RED repro:** produce a deterministic reproduction (harness scenario if possible in `multichart-prod/harness/`, else a scripted manual repro with exact steps + build id).

## BINDING CONSTRAINTS
- **No fix in this step.** Deliver mechanism + regression verdict + RED repro; the fix is a separate gated task after review.
- If the crash traces to mirror-frame / iframe-forwarding policy, note it (may be DEFER-T8) — but confirm first, don't assume.
- L2: production trees only. No engine edits beyond diagnostic instrumentation (revert any before finishing).

## DELIVER (report as `.md`: `docs/tickets-overhaul/worker-reports/T4-step4-order-drag-crash-diagnostic-report.md`)
1. Exact throw site (file:line) + what is null and the trigger condition.
2. Regression verdict: reproduces on b105? on b2? attributable to T1/T4? (with diff/blame evidence).
3. RED repro (scenario or manual steps + build id).
4. Recommended RC + registry mapping + proposed fix direction (for the follow-on gated task) — NOT implemented.

## STOP CONDITIONS
Can't reproduce in default state → report (may have been kill-switch-induced). Mechanism belongs to another RC/lane → report and hand back.

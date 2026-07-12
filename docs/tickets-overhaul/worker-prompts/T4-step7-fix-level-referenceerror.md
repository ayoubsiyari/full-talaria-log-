# WORKER PROMPT — T4 step 7 (Lane 3): fix `ReferenceError: level is not defined` in entry-drag handler

> Hand to the Lane 3 (order-entry) worker. **Priority — this is a live regression from step 5/6 that crashes the entry-drag handler.** No new features; fix the ReferenceError and close the test-coverage gap that let it through.

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T4 step 7 (regression fix)**, Lane 3.

## SYMPTOM (PO live, build `20260712b4`)
Dragging an order entry throws:
```
Uncaught ReferenceError: level is not defined
  at <anonymous> (order-manager.js:~18983)
  at Dt.call (d3.min.js)  ... (d3 drag event chain)
```
The drag handler crashes the moment the user drags, so the order-type label never updates. This is a regression introduced by **T4 step 5 (reclassification)** and/or **T4 step 6 (live label refresh)** — both edited the main/split entry drag blocks in `order-manager.js`.

## READ FIRST (binding)
- `docs/tickets-overhaul/worker-reports/T4-step5-order-type-reclassify-report.md` and `T4-step6-ordertype-label-live-refresh-report.md` — your own step 5/6 diffs (main + split drag call sites)
- `docs/tickets-overhaul/INVARIANTS.md` — binding; **I2** (RED first), **I8**, **P1**

## TASK
1. **Locate** the `level` identifier referenced but not defined near `order-manager.js:~18983` in the entry-drag handler (likely inside the split-entry drag block, or a call added in step 5/6 that assumed a `level`/`multiEntryLevels[i]` variable in scope). Fix it so the handler runs without throwing — using the correct in-scope value (the dragged leg's level object / index), not by inventing a placeholder.
2. **This is not gated behind a new kill-switch** — it's a straight defect fix restoring the step 5/6 behavior. Ensure that with the existing switches ON (default) the drag handler runs clean, and with `__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2` / `__TALARIA_DISABLE_ORDERTYPE_LIVE_LABEL_FIX` set, it also does not throw (legacy path).
3. **Close the coverage gap (mandatory):** add a repro that **executes the actual drag handler** (not just helper methods) — e.g. a jsdom/std-mocked invocation of the main + split entry drag callbacks that would have thrown `ReferenceError: level is not defined`. It must be **RED before your fix** (reproduces the throw) and **GREEN after**. A helper-only test is not acceptable for this step.

## BINDING CONSTRAINTS
- **RC-5 only.** Don't change the reclassification semantics (step 5) or the throttle decoupling design (step 6) — only fix the undefined reference and any adjacent scope bug it reveals.
- **I8:** both `order-manager.js` trees byte-identical (SHA256 both).
- **Build id:** do NOT bump — report the diff, Manager bumps (D-003).
- **I9:** multichart gate stays green. **L2:** production trees only.

## DELIVER (report as `.md`: `docs/tickets-overhaul/worker-reports/T4-step7-fix-level-referenceerror-report.md`)
1. Exact throw site (file:line) + what `level` should have been + the fix.
2. Which step (5 or 6) introduced it.
3. **Drag-handler-executing** RED→GREEN evidence (show it threw before, runs after) + confirmation the helper-only tests still pass.
4. State matrix (I5): single + multi-entry, both switches on and off (prove no throw in any).
5. SHA256 both trees; `node --check` clean; build-id diff left for Manager.
6. PO live spot-check: drag entry through all zones — no console error, label tracks continuously.

## STOP CONDITIONS
If the undefined reference reveals a deeper scope problem across both drag blocks that can't be fixed without reworking step 5/6 design → report before doing so.

# WORKER PROMPT — T0 step 4 (Lane 4): T5 anchoring RED scenarios

> Hand to the Lane 4 (harness/verification) worker. Scenario authoring only — no engine fixes. Preps the RC-3 acceptance contract before Lane 1 reaches T5.

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T0 step 4**, Lane 4. You own harness scenario-ID allocation (Manager-confirmed standing rule). Build the **RC-3 anchoring** family as tracked-RED so T5 has its acceptance contract ready.

## READ FIRST (binding)
- `docs/tickets-overhaul/README.md`, `ROOT-CAUSES.md` (**RC-3**), `INVARIANTS.md` (binding; **I6** anchors = timestamp+price), `TRACKS.md` (**T5**)
- `docs/tickets-overhaul/PER-BUG-REGISTRY.csv` — anchoring/drift rows; known offender: anchored VWAP / volume tools (`drawing-tools-advanced-volume.js`)
- Existing harness: `chart v 1.4/chart/multichart-prod/harness/` (H-S32–H-S39 as templates)

## MECHANISM (RC-3)
Index-anchored or pixel-anchored tools drift when the bar-index basis shifts. Repro pattern: place a tool anchored to a candle, then change the index basis, and assert the tool stays on the same timestamp+price.

## TASK — add tracked-RED scenarios (use next free IDs; check `known-failing.json` first)
Author these three (or the strongest deterministic subset):
1. **Prepend history (drag-to-load):** draw a tool → load older candles (prepend) → assert the tool is unmoved (same timestamp+price).
2. **Timeframe switch:** draw a tool → switch TF → assert unmoved.
3. **Replay advance:** draw a tool → advance replay → assert unmoved.

Assertion shape: capture the tool's anchor timestamp+price and its rendered position before the basis change; after the change assert the timestamp+price anchor is identical and the rendered position maps to the same candle.

## BINDING CONSTRAINTS
- **RED-first, tracked.** Deterministically RED on the current canonical build (confirm the id in the report). Register in `known-failing.json` as tracked-RED with a one-line reason each.
- **Scenario-ID allocation:** use the next free H-S IDs after the current max; do not reuse IDs another lane added.
- **I9:** do not alter existing scenario assertions or the passing set.
- **L2:** production `multichart-prod/` only. **No engine edits** — harness/scenarios/helpers only.
- Both harness trees byte-identical.

## DELIVER (report as `.md`: `docs/tickets-overhaul/worker-reports/T0-step4-t5-anchoring-scenarios-report.md`)
1. New scenario IDs + what each asserts + registry tickets covered.
2. RED evidence (×3 runs) on the named build.
3. `known-failing.json` diff + full gate output (no regressions).
4. Confirm: I9 intact, no engine edits, legacy tree untouched, harness trees consistent, SHA256 of touched files.

## STOP CONDITIONS
If a scenario can't be reproduced deterministically (needs live market prepend timing, etc.), report the dead end + the manual repro needed rather than forcing a flaky scenario.

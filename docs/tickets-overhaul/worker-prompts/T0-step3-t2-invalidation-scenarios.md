# WORKER PROMPT — T0 step 3 (Lane 4): T2 "stuck-until-click" RED scenarios

> Hand to the Lane 4 (harness/verification) worker. Scenario authoring only — no engine fixes. This preps the RC-2 acceptance contract before Lane 1 reaches T2.

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T0 step 3**, Lane 4. You built H-S32/H-S33 (T1) and H-S34/H-S35 (T1 families). Now build the **RC-2 "stuck-until-click" / repaint-without-click** family (38 tickets) as tracked-RED, so T2 has its acceptance contract ready.

## READ FIRST (binding)
- `docs/tickets-overhaul/README.md`, `ROOT-CAUSES.md` (**RC-2**), `INVARIANTS.md` (binding), `TRACKS.md` (**T2**)
- `docs/tickets-overhaul/PER-BUG-REGISTRY.csv` — filter "stuck until click" / repaint-on-command rows
- Existing harness: `chart v 1.4/chart/multichart-prod/harness/` (H-S32–H-S35 as templates), `interactive-helpers.mjs`

## MECHANISM (RC-2)
A render-relevant state mutation does not trigger `scheduleRender()`, so the change only appears after the user clicks/pans (the click forces a repaint). Repro pattern: perform a state change that should repaint → assert the canvas repaints **without** any subsequent user interaction.

## TASK — add tracked-RED scenarios (pick the strongest real-ticket repros)
Candidates (choose 2–3 with clean deterministic repro):
- A drawing/indicator change that doesn't repaint until the next click.
- A command/action (e.g. toggle, setting change) whose visual effect lags until interaction.
- Multichart panel repaint-on-command rows (TAL-01484 / 01490) **only if** they survive the PO retest — otherwise skip and note.

Assertion shape: capture a canvas signature (or repaint counter via the existing helpers) before the mutation, apply the mutation, assert the signature changes with **no** interposed pointer/click event.

## BINDING CONSTRAINTS
- **RED-first, tracked.** New scenarios must be deterministically RED on the current canonical build (confirm the id in the report). Register in `known-failing.json` as tracked-RED with a one-line reason.
- **I9:** do NOT alter existing scenario assertions or the passing set. Add new IDs (H-S36, H-S37…).
- **L2:** production `multichart-prod/` only; never legacy `multichart/`.
- **No engine edits.** Harness + scenarios + helpers only. (The `__TALARIA_ASSERT_INVALIDATION` debug mode is Lane 1's T2 job — do not build it here.)
- Both harness trees byte-identical.

## DELIVER (report as `.md`: `docs/tickets-overhaul/worker-reports/T0-step3-t2-invalidation-scenarios-report.md`)
1. New scenario IDs + what each asserts + registry tickets covered.
2. RED evidence (×3 runs) on the named build.
3. `known-failing.json` diff.
4. Confirm: I9 intact (existing scenarios still pass), no engine edits, legacy tree untouched, harness trees consistent, SHA256 of touched files.

## STOP CONDITIONS
If a candidate can't be reproduced deterministically (needs real market data timing, etc.), report the dead end + the manual repro needed rather than forcing a flaky scenario.

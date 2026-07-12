# WORKER PROMPT — T0 step 2 (Lane 4): T1 acceptance-suite RED scenarios

> Hand to the Lane 4 (harness/verification) worker. This builds the RED coverage the T1 step-4 acceptance contract needs. Scenarios only — no engine fixes.

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T0 step 2**, Lane 4 (now the verification/harness lane). T1 step 3 shipped H-S32 (first-click) + H-S33 (ghost-after-delete). TRACKS T1 exit requires **four** family suites; the remaining two — **selection-desync (43 tickets)** and **stale-quick-menu (24 tickets)** — do not yet have harness coverage. Build them RED now so they gate T1 step 4.

## READ FIRST (binding)
- `docs/tickets-overhaul/README.md`, `ROOT-CAUSES.md` (RC-1), `INVARIANTS.md` (binding), `TRACKS.md` (T0, T1)
- `docs/tickets-overhaul/worker-reports/T1-step3-lifecycle-impl-report.md` — store API + events
- `docs/tickets-overhaul/PER-BUG-REGISTRY.csv` — selection-desync + stale-quick-menu rows
- Existing harness: `chart v 1.4/chart/multichart-prod/harness/` (H-S32/H-S33 as templates), `interactive-helpers.mjs`

## TASK — add RED scenarios (pick the strongest real-ticket repro per family)

### Suite C — selection-desync
Scenario(s) reproducing: select tool A, then tool B → A's chrome (toolbar/settings/labels/quick-menu highlight) stays "selected" while B is active; or multichart panel selection not clearing on the other panel. Assert single-source-of-truth selection (exactly one selected across all surfaces).

### Suite D — stale-quick-menu
Scenario(s) reproducing: V9 quick menu / floating toolbar retains `tlBarSelected` (or shows options for a drawing that is deleted / deselected). Assert quick-menu state matches the live selection.

## BINDING CONSTRAINTS
- **RED-first, tracked.** New scenarios must be **RED on `20260712b1`** with the T1 fix's kill-switch NOT specially handled — i.e. they must expose remaining desync that step 4 will close. If a scenario is already GREEN on `20260712b1` (steps 1–3 already closed it), record that — it becomes a regression-lock, not step-4 acceptance.
- **I9:** do NOT alter existing scenario assertions or the 31 passing scenarios. Add new IDs (e.g. H-S34, H-S35…), register in `known-failing.json` as tracked-RED with a one-line reason.
- **L2:** production `multichart-prod/` only; never legacy `multichart/`.
- **No engine edits.** Harness + scenarios + helpers only.

## DELIVER (report as `.md`: `docs/tickets-overhaul/worker-reports/T0-step2-t1-family-suites-report.md`)
1. New scenario IDs + what each asserts + which registry tickets they cover.
2. RED evidence on `20260712b1` (or GREEN-already note per scenario).
3. `known-failing.json` diff (tracked-RED entries).
4. Confirm: I9 intact (31 existing still pass), no engine files edited, legacy tree untouched, both harness trees consistent.

## STOP CONDITIONS
If a family can't be reproduced deterministically in the harness, report the dead end + the exact manual repro needed rather than guessing.

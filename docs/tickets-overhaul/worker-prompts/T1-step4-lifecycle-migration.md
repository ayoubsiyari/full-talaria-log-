# WORKER PROMPT — T1 step 4 (Lane 1): lifecycle migration steps 4–7

> Hand to the Lane 1 (drawing-tools lifecycle) worker. **Director ruling D-003 authorizes this.** Conditional-parallel: PO is live-confirming `20260712b1` in parallel — **if the live check fails, STOP and report.**

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T1 step 4**, Lane 1. Step 3 shipped the `ToolLifecycleStore` (steps 1–3: quick menu / labels / settings+context menu) in `20260712b1`. This step migrates the remaining owners onto the store.

## READ FIRST (binding)
- `docs/tickets-overhaul/DIRECTOR-DECISIONS.md` — **D-001 and D-003** (your authorization + constraints)
- `docs/tickets-overhaul/worker-reports/T1-step3-lifecycle-impl-report.md` — store API, events, subscribers already wired
- `docs/tickets-overhaul/worker-reports/T1-lane1-lifecycle-diagnostic-report.md` — ownership table (legacy readers)
- `docs/tickets-overhaul/ROOT-CAUSES.md` (RC-1), `INVARIANTS.md` (binding), `TRACKS.md` (T1)

## SCOPE — migration steps 4/5/6/7 (per D-001 order)
- **Step 4:** object tree → subscribes to store (no independent selection state).
- **Step 5:** manager selection/hover/edit flags → store (store becomes single source of truth).
- **Step 6:** **retire legacy `Chart.selectedDrawing` / `Chart.drawings` index stack.** — see constraint below.
- **Step 7:** per-tool classes subscribe to the store for chrome; **geometry only** stays in the tool class. Do NOT rewrite tool geometry.

## BINDING CONSTRAINTS (D-003)
- **Step 6 is its own gated commit with its own kill-switch** — separable from 4/5/7 and independently revertible. Suggested `window.__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2` (default ON = retired/new path). The diagnostic showed legacy readers scattered across `chart.js` (Escape/Delete, context menu, redraw paths); migrate every reader, prove none left, keep it revertible on its own.
- Steps 4/5/7 remain behind `window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` (the step-3 switch) unless a slice needs its own — if so, name it and A/B it.
- **RC-2 / RC-3 stay out** (T2 / T5). **I11:** no mirror-frame guard work.
- **Build id:** canonical base is now **`20260712b2`** (T4 step 2 already bumped past b1). **Do NOT run `bump-dist-v9-cache.mjs` yourself** — you are the last-landing slice; finish your code, report your diff, and the Manager coordinates the single final bump to `20260712b3`. This prevents the shared-entrypoint collision D-003 warned about.
- Both engine trees byte-identical (I8).

## ACCEPTANCE (RED-first)
- Lane 4 is delivering **selection-desync (H-S34?)** and **stale-quick-menu (H-S35?)** RED suites — these are your acceptance contract. They must be **GREEN** after step 4, **RED** again with the kill-switch. Coordinate on the exact scenario IDs.
- Existing gate (31 incl. H-S32/H-S33) stays GREEN (I9).
- Kill-switch A/B proof **per gated slice** (steps 4/5/7 switch; step 6 switch separately).

## DELIVER (report as `.md`: `docs/tickets-overhaul/worker-reports/T1-step4-lifecycle-migration-report.md`)
1. Per step: what migrated, file:line, which legacy readers removed (step 6: enumerate every retired `Chart.selectedDrawing`/`Chart.drawings` reader).
2. RED→GREEN→RED-again evidence for the family suites; kill-switch names per slice (step 6 separate).
3. State matrix (I5) covering single/multi × select/hover/edit/delete.
4. Full gate output (no regressions, no new known-failing).
5. SHA256 both trees for every touched file; build id (post-bump) + `node --check` clean.
6. Registry rows for selection-desync (43) + stale-quick-menu (24) dispositioned.

## STOP CONDITIONS
- PO live check on the first build fails → STOP (D-003 pauses step 4).
- A step-6 legacy reader can't be migrated without touching RC-2/RC-3 or 30+ tool geometry → report, do not improvise.
- Any mechanism turning out mirror-frame policy → defer to T8, do not fix here.

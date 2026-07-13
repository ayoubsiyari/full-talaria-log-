# WORKER PROMPT — T2 step 1 (Lane 1): invalidation assertion mode + first "stuck-until-click" fixes

> Hand to the Lane 1 worker. RC-2. This closes the "stuck until the user clicks / repaint-without-click" family. RED scenarios already exist from T0 step 3.

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T2 step 1**, Lane 1.
READ FIRST: `docs/tickets-overhaul/ROOT-CAUSES.md` (RC-2), `INVARIANTS.md` (binding), `TRACKS.md` (T2), and `worker-reports/T0-step3-t2-invalidation-scenarios-report.md` (the RED scenarios you must turn GREEN — H-S36/H-S37 family).

## RC-2 (mechanism, not symptom)
State mutations that change render-relevant data do **not** schedule a repaint, so the chart looks frozen until an unrelated event (a click, a mousemove) happens to trigger a render. The fix is **structural**: every render-relevant setter ends in an invalidation (I7), routed through `scheduleRender` — not per-symptom band-aids.

## PART 1 — Assertion mode (diagnostic instrument)
1. Add `window.__TALARIA_ASSERT_INVALIDATION` debug mode: wrap render-relevant setters so that a mutation not followed by a scheduled render within N ms (name the unit — ms, per I12) logs a loud warning with the setter + stack.
2. Run the existing harness + a scripted interaction tour under the assertion; produce the list of mutation-without-repaint hits (file:line, setter, trigger).

## PART 2 — Fix the hits (each gated)
- Route each hit through `scheduleRender` (or document which later event legitimately repaints — I7).
- **I3:** group by mechanism; each coherent batch behind its own `window.__TALARIA_*` kill-switch (default ON). No drive-by refactors.
- RED-first: the T0-step3 scenarios (H-S36/H-S37 family) must be RED before, GREEN after, RED again with the kill-switch.

## BINDING CONSTRAINTS
- RC-2 only. **I4:** fix in the shared render/invalidation layer, NOT inside individual tool files. If the shared path doesn't cover a case, report — don't patch a tool.
- **I11:** no mirror-frame work (replay frame-application path is frozen → T8). If a hit lands there, STOP and report as DEFER-T8.
- **I5 state matrix:** single chart / multichart panel / replay playing-paused-off — mark which cells each fix changes; untouched cells verified untouched.
- Both engine trees byte-identical; SHA256 both sides. Do NOT bump build id — Manager coordinates.
- Preserve the green gate (I9): H-S32/33/36/37/43 stay green; do not disturb the fallback-window reds (H-S34/35/44).

## DELIVER (report `.md`: `worker-reports/T2-step1-invalidation-assertion-sweep-report.md`)
1. Assertion-mode implementation + the full hit list (file:line, setter, trigger).
2. Per-mechanism fix diffs + kill-switch names + RED/GREEN/RED evidence on the T0-step3 scenarios.
3. I5 state matrix; any DEFER-T8 items; registry rows touched (RC-2 "stuck-until-click" family).
4. SHA256 both trees; `node --check` clean; build-id diff for Manager.

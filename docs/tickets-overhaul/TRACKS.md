# Tracks — phased work plan with lane assignment

Dependency map:

```
T0 (registry + harness scaffolding)  ──┬─→ T1 (lifecycle controller) ─→ T2 (invalidation sweep) ─→ T5 (anchoring) ─→ T6 (indicators adopt)
                                       ├─→ T3 (multichart parity)  [independent until Phase C]
                                       └─→ T4 (order-entry model)  [fully independent]
T7 (backlog sweep + closure) runs last, consumes everything.
```

Lanes: Lane 1 = T1→T2→T5→T6 (sequential, same code area). Lane 2 = T3. Lane 3 = T4. Lane 4 = T0, then becomes the verification/harness lane supporting the others.

---

## T0 — Per-bug registry + interactive harness scaffolding (Lane 4, starts immediately)

**Problem:** tickets are multi-bug threads; the harness has zero interactive coverage (`chart-regression-cases.js` is empty).
**Deliverables:**
1. **Per-bug registry**: split every thread in `TICKET-REGISTRY.csv` into one row per distinct bug (ref like `TAL-00752#3`), with: symptom family, RC guess, status, tester quote. Source bodies are in `support tickets history/tickets_normalized.json`. The long threads (TAL-00157, 00322, 00323, 00752, 00117, 00228, 00245) are done by hand-reading; the rest can be one-bug-per-short-thread by default. Arabic bodies must be translated in the registry row.
2. **Harness scaffolding** for interactive flows, extending `chart v 1.4/chart/multichart-prod/harness/`: page-object helpers for *place tool / select / open settings / delete / assert canvas repaint / assert menu state*. Prove the plumbing with two RED scenarios from real tickets: **first-click-fails** (TAL-00322 family) and **ghost-after-delete** (TAL-00157 family).
**Exit:** registry published; 2 RED scenarios running deterministically in CI.

## T1 — Shared tool lifecycle controller (RC-1) (Lane 1)

**Problem:** selection/menu/settings/label state duplicated per tool; 100+ bugs across 30 tools from the same desync.
**Approach (design-first, one escalation checkpoint):**
1. Diagnostic: map today's selection state owners (who stores "selected tool"? tool classes, quick-menu, settings dialog, label renderer, objects tree). Deliver the ownership table.
2. Design doc (Director approves before impl): single selection/lifecycle store + events (`toolSelected`, `toolEdited`, `toolDeleted`, `toolHidden`); Quick Menu, settings dialog, price/time labels, objects tree become subscribers. Migration order: menus/labels first (highest ticket density), tool classes after.
3. Implement behind `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2`. RED-first per symptom family: first-click (30 tickets), ghost-after-delete (19), selection-desync (43), stale quick-menu (24).
**Exit:** the four family suites GREEN; spot-check 10 named tickets from the registry manually; no per-tool patches were needed (I4 holds).

## T2 — Invalidation contract sweep (RC-2) (Lane 1, after T1)

1. Add `__TALARIA_ASSERT_INVALIDATION` debug mode: wrap render-relevant setters; log mutation-without-repaint within N ms.
2. Run the harness + a scripted interaction tour under the assertion; fix every hit by routing through `scheduleRender` (each batch gated).
**Exit:** assertion-clean tour; "stuck until click" family suite GREEN (38 tickets).

## T3 — Multichart interaction parity (RC-4) (Lane 2, parallel with T1)

**Problem:** the July-4 batch (TAL-01480…01502): panels lack Quick Menu, Ctrl-select, correct drawing target, isolated indicator state, and repaint-without-click.
**Approach:**
1. Write the **interaction-parity contract** (mirrors the data-ownership contract that closed the data overhaul): for each surface — selection, quick menu, settings, keyboard shortcuts, focus, indicator enable-state — name the owner (panel-local vs host-forwarded) and the transport. Director approves the table.
2. RED-first harness scenarios per contract row, reusing the existing panel harness topology. Priority rows from tickets: repaint-on-command (01484/01490), drawing-targets-focused-panel (01495), Ctrl-select-in-panel (01498), quick-menu-in-panel (01499), indicator-state-isolation (01500/01501).
3. One gated fix per row.
**Constraint:** the data-overhaul gate (I9) stays green; anything touching sync/replay buses escalates first.
**Exit:** contract rows GREEN; the July-4 batch dispositioned with tester confirmation.

## T4 — Order-entry state model (RC-5) (Lane 3, parallel)

**Problem:** TAL-00752's 20 bugs: delta-mutated aggregates (average, risk split, PNL sign, type mutation on move, parsing zeroing lots).
**Approach:**
1. Extract the multi-entry state into pure functions: `aggregates = f(entries[])` recomputed on every mutation. Property tests over random add/move/delete sequences (Node-side, no browser needed): average always within entry range, risk always sums to configured total, deleting the last extra entry restores single-entry state, order type never mutates on move.
2. Separate display-threshold bugs (SL/TP <10 not rendered; trailing-zero parsing) as individually gated fixes.
3. Replay-interaction rows (entry fills on wrong candle, TP line flicker per candle) are RED-first harness scenarios — they touch the replay bus, so state-matrix discipline applies.
**Exit:** property suite green in CI; TAL-00752 registry rows individually dispositioned.

## T5 — Anchoring unification (RC-3) (Lane 1, after T2)

1. Inventory all anchor representations (timestamp+price vs bar-index vs pixel) across drawing modules; the known offender is anchored VWAP / volume tools (`drawing-tools-advanced-volume.js:834-866`).
2. Migrate index-anchored tools to timestamp+price through the shared resolve path (`drawing-tools-base.js` binary-search resolver), gated per tool family.
3. RED scenarios: draw → prepend history (drag-to-load) → assert tool unmoved; draw → TF switch → assert; draw → replay advance → assert. Copy/paste offset bug (TAL-00253) rides this track.
**Exit:** no index anchors remain (I6 enforceable); prepend/TF/replay suites GREEN.

## T6 — Indicator lifecycle adoption (RC-6) (Lane 1, after T1 lands; can overlap T5)

1. Route indicator settings/visibility UI through the T1 lifecycle store (kills the duplicated stale-dialog class).
2. Apply T2's invalidation assertion to indicator setters.
3. Perf follow-up (separate, Director-gated): incremental tail recompute during replay instead of full recompute per frame (`chart-indicators-full.js:7814`); only after correctness suites are green.
**Exit:** indicator symptom rows in registry dispositioned; replay indicator staleness scenarios GREEN.

## T7 — Backlog sweep + closure (all lanes converge)

1. Triage all 126 unresolved tickets against landed root fixes: expected outcome is most close by retest, not by new work. Anything still red gets a targeted task citing its RC.
2. Tester re-verification sweep on one named build; registry updated to terminal states; `user_replied` queue drained.
3. Final report: per-RC before/after ticket counts, kill-switch inventory, state matrix, remaining deferred items with Director rulings.

---

## Worker prompt template (Manager uses this verbatim)

```
ROLE: worker on Talaria tickets-overhaul, task <T#> step <n>.
READ FIRST: docs/tickets-overhaul/README.md, ROOT-CAUSES.md (your RC section), INVARIANTS.md (binding), TRACKS.md (your task).
TASK: <one mechanism, one deliverable>
RC: <RC-#> | SYMPTOM FAMILY: <family> | REGISTRY ROWS: <refs>
KILL-SWITCH: window.__TALARIA_<NAME> (default ON = fix active)
RED FIRST: <scenario spec or repro script> — must be RED before your change, GREEN after, RED again with kill-switch.
DELIVER: diff, RED/GREEN evidence, state matrix (cells per I5), both trees byte-identical, registry rows updated.
STOP CONDITIONS: premise wrong, invariant conflict, mechanism belongs to another RC → report, do not improvise.
```

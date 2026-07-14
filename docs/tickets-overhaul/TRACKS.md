# Tracks — phased work plan with lane assignment

Dependency map:

```
T0 (registry + harness scaffolding)  ──┬─→ T1 (lifecycle controller) ─→ T2 (invalidation sweep) ─→ T5 (anchoring) ─→ T6 (indicators adopt)
                                       ├─→ T3 (multichart parity, retest-first) ─→ T8 (Phase-5 mirror-policy + plan-1 debt)
                                       └─→ T4 (order-entry model)  [fully independent]
T7 (backlog sweep + closure) runs last, consumes everything.
```

Lanes: Lane 1 = T1→T2→T5→T6 (sequential, same code area). Lane 2 = T3→T8 (sequential — both live in the panel/replay bridge area; running them in parallel would collide in `panel-cmd-bridge.js` / `sync-bridge.js`). Lane 3 = T4. Lane 4 = T0, then becomes the verification/harness lane supporting the others.

**Standing rule for Lane 2 (from the plan-1 journey report):** the guard tail is closed; it must not grow. If a T3 diagnostic traces a defect to mirror-frame application policy (which parts of data/X/Y a panel adopts), that row is **deferred into T8** and fixed by the policy table — not by adding guard #21. The Manager enforces this at dispatch.

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
**Intake additions (2026-07-13, `DAILY-INTAKE.md`):** step-8/recovery acceptance also covers TAL-01569 (Ctrl-select stuck during drag — R1/R2 residual family), TAL-01584 (crosshair snaps to tool's previous position — TAL-00157#11 resurfaced), TAL-01570 (crosshair jumps to chart center on tool arm), TAL-01568 (brush first-move fails — first-click family, per-tool subscriber slice). All four retest first on the fallback-B/step-8 build before new work.

## T2 — Invalidation contract sweep (RC-2) (Lane 1, after T1)

1. Add `__TALARIA_ASSERT_INVALIDATION` debug mode: wrap render-relevant setters; log mutation-without-repaint within N ms.
2. Run the harness + a scripted interaction tour under the assertion; fix every hit by routing through `scheduleRender` (each batch gated).
3. **Axis label & gesture correctness sub-task (intake amendment A1, 2026-07-13):** (i) time-axis tick/label stability on click and crosshair move (TAL-01565/01583); (ii) custom-interval (e.g. 3m) tick basis parity with native TFs (TAL-01572); (iii) price-axis drag gesture isolated from chart pan (TAL-01566); (iv) last-gridline interval correctness (TAL-01565). RED-first per symptom, one gated fix each.
**Exit:** assertion-clean tour; "stuck until click" family suite GREEN (38 tickets); A1 axis rows GREEN with tester confirmation.

## T3 — Multichart interaction parity (RC-4) (Lane 2, parallel with T1)

**Problem:** the July-4 batch (TAL-01480…01502): panels lack Quick Menu, Ctrl-select, correct drawing target, isolated indicator state, and repaint-without-click.
**Approach:**
0. **Retest-first triage (mandatory step, before any diagnostic or fix).** Plan 1 closed on build `20260707b105` *after* this batch was filed; several of these tickets are likely already fixed as side effects of the data/viewport/boot work (strongest candidates: TAL-01480 re-render on same symbol, TAL-01502 first-boot price mismatch — both smell like the b102–b105 boot-commit fixes; TAL-01484/01490 repaint-on-command *may* be covered by the boot/settle work). Tester retests every multichart ticket in the registry **on b105 or later, with build id confirmed on every frame** (plan-1 lesson: stale tabs burned more time than any real bug). Only tickets that reproduce enter steps 1–3.
1. Write the **interaction-parity contract** (mirrors the data-ownership contract that closed plan 1): for each surface — selection, quick menu, settings, keyboard shortcuts, focus, indicator enable-state — name the owner (panel-local vs host-forwarded) and the transport. Director approves the table.
2. RED-first harness scenarios per surviving contract row, reusing the existing 29-scenario panel harness topology. Likely-surviving rows (interaction-layer, untouched by plan 1): drawing-targets-focused-panel (01495), Ctrl-select-in-panel (01498), quick-menu-in-panel (01499), indicator-state-isolation (01500/01501), drag-stops-at-frame-box (01491).
3. One gated fix per row.
**Constraints:** the plan-1 gate (29 scenarios) stays green (I9). Anything whose mechanism is mirror-frame application policy is deferred to T8 per the Lane-2 standing rule — T3 fixes interaction surfaces only, it does not add replay-frame guards.
**Intake amendments (2026-07-13, `DAILY-INTAKE.md`):** contract gains **row 13** (layout persistence across refresh — TAL-01571), **row 14** (tile clip/visibility geometry — TAL-01574), and **row 15** (symbol-sync enable converges all panels to the focused ticker — TAL-01586, spec PO-confirmed 2026-07-13); target owners need Director approval like rows 1–12. **Row 11 reopened** by TAL-01587 (drag dies when cursor leaves layout bounds): the D-004 retest-close path is void; live drag-trace mandatory; hypothesis shifts from plot-rect geometry to pointer-capture/`mouseleave` handling on the host tile. Plan-1 hygiene regression TAL-01564 (reload prompt returns after click/cancel) queues in this lane as a small standalone RED-first fix — not part of T8.
**Exit:** every multichart registry row dispositioned as retest-closed / fixed-in-T3 / deferred-to-T8; contract rows GREEN; tester confirmation on a named build.

## T4 — Order-entry state model (RC-5) (Lane 3, parallel)

**Problem:** TAL-00752's 20 bugs: delta-mutated aggregates (average, risk split, PNL sign, type mutation on move, parsing zeroing lots).
**Approach:**
1. Extract the multi-entry state into pure functions: `aggregates = f(entries[])` recomputed on every mutation. Property tests over random add/move/delete sequences (Node-side, no browser needed): average always within entry range, risk always sums to configured total, deleting the last extra entry restores single-entry state, order type never mutates on move.
2. Separate display-threshold bugs (SL/TP <10 not rendered; trailing-zero parsing) as individually gated fixes.
3. Replay-interaction rows (entry fills on wrong candle, TP line flicker per candle) are RED-first harness scenarios — they touch the replay bus, so state-matrix discipline applies.
4. **Replay mode + interval cadence diagnostic (intake amendment A3, 2026-07-13; scope finalized after PO clarification):** two sibling defects in replay mode/cadence selection — (a) tick-by-tick mode silently reverts to candle-by-candle when replay starts (TAL-01582); (b) candle-by-candle with an interval selected (e.g. 4h interval on 4h TF) plays and steps-forward erratically (TAL-01581). Timeboxed diagnostic: find the mode/interval-selection owner, the override site for (a), and the cadence computation for (b); report mechanisms before any fix. Lane 3 picks this up when its T4 queue clears.
**Exit:** property suite green in CI; TAL-00752 registry rows individually dispositioned; A3 mechanism reported (fix scoped separately once known).

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

## T8 — Phase-5 mirror-policy consolidation + plan-1 deferred debt (RC-8) (Lane 2, after T3)

> **D-013 (2026-07-14) — T8 PULLED FORWARD, starts now.** PO priority directive: synced-multichart replay is the worst felt UX issue; D-012's interaction freeze idles the Lane 2 work that was ahead of T8, and T8's data/X/Y policy path is untouched by that freeze. Order: (1) coverage-hardening RED scenarios first (§3, kill-switches + BL-16 — no product risk, no `react-parity-lib.mjs` collision); (2) policy-table design in parallel, with the **A5 diagnostic (TAL-01590 independent-symbol replay freeze) as its first mandatory input** — the independent-symbol × playing cells are specified from that trace; (3) migration only after the Director approves the table. T8 outranks TAL-01564 and T3 rows 13–16 inside Lane 2. Zero-behavior-change constraint and the 29-scenario gate unchanged; PO live-confirm of synced-replay feel (staging build while the deploy freeze holds) is part of the exit.

**Problem:** plan 1 closed its defect list but deferred its structural root: ~20 scattered guards compensate for the over-fused replay mirror frame (data + X + Y in one broadcast). The plan-1 journey report's own recommendation is to do this next, in a quiet period, under the green gate — that quiet period is now, and T3's retest-triage will have just confirmed the terrain is stable.
**Approach (design-first, Director approves before impl):**
1. **Policy-table design doc:** enumerate the full matrix (TF relation: same/coarser/finer/independent × replay: playing/paused/off × sync: on/off per axis) and specify, per cell, adopt-data / adopt-X / adopt-Y. The existing guards *are* the spec — extract each guard's decision into its cell; conflicts or gaps escalate to the Director. The 29 GREEN scenarios are the acceptance contract: behavior must be identical before/after.
2. **Implement** the single frame-application policy function behind `__TALARIA_DISABLE_MIRROR_POLICY_V2`; migrate consumers guard-by-guard (each migration gated, gate re-run); retire superseded guards and their kill-switches only after their scenarios pass through the policy path.
3. **Plan-1 debt rides along** (from journey report §7, folded in per its recommendation §9.2):
   - Finer-owner marker refresh done properly per the D-047 spec (replace the `fromHostFanout` route-around).
   - Strip the `__TALARIA_BL2B_PRICE_PROBE` probe + `__talariaBl2b*` call sites from the engine.
   - RED scenarios for the ~17 kill-switches with no dedicated coverage + BL-16 (do this **first** within T8 — it hardens the acceptance contract before the refactor).
   - Delete or mark-unmaintained the legacy `multichart/` dev-shell tree.
   - PO explicitly confirms or re-raises the BL-2b residual Y-nudge; record terminal status.
4. **Intake evidence rows (2026-07-13):** TAL-01560/01562/01563/01573/01575/01577/01578/01579 are new live evidence for the policy table (gaps during replay, group-advance cadence, rescale re-render, replay-start viewport shift, coarse-TF seam, drag freeze, snap-back). They are **inputs to the policy design, not separate fixes** — each maps to a table cell; if a cell's correct policy makes one of these vanish, close it by retest; any that survive the consolidation get individually scoped then.
**Constraint:** zero behavior change is the goal — this is a consolidation, not a fix. Any cell whose policy-table value differs from shipped behavior is an escalation, not a silent correction. (The intake rows above may change cells — those go through the escalation path with their ticket as evidence.)
**Exit:** policy function live, superseded guards retired, gate GREEN (29 + new coverage scenarios), kill-switch inventory shrunk, all five debt items terminal.

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

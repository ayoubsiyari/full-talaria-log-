# Manager Findings — Tickets Overhaul (Plan 2)

Running log. Routine progress here; escalations go to `MANAGER-ESCALATIONS.md`.

---

## §1 — Kickoff, lane assignment, and first-wave dispatch

**Date:** 2026-07-12
**Baseline build:** `20260707b105` (plan-1 closed here; its 29-scenario gate is GREEN and must stay GREEN — I9).

### 1.1 Plan absorbed
Read in order: `README.md` → `TICKET-ANALYSIS.md` → `ROOT-CAUSES.md` → `INVARIANTS.md` → `TRACKS.md`. Mission: close the 812-ticket QA history (126 unresolved, 55 reopen loops) by discharging root causes RC-1…RC-8, not by per-ticket patching. Journal/dashboard cluster (133 tickets) is out of scope.

### 1.2 Lane → track → worker mapping
Four parallel lanes, chosen for code-path isolation (parallelism is bounded by isolation, not headcount):

| Lane | Worker | Track sequence | Code area | RC |
|---|---|---|---|---|
| **Lane 4** | Worker D-harness | **T0** → then verification/harness support | `multichart-prod/harness/`, registry | RC-7 |
| **Lane 1** | Worker Senior | **T1 → T2 → T5 → T6** | drawing-tools + shared lifecycle, `chart.js` | RC-1, RC-2, RC-3, RC-6 |
| **Lane 2** | Worker Panel | **T3 → T8** | `panel-cmd-bridge.js`, `sync-bridge.js`, `embed-bridge.js` | RC-4, RC-8 |
| **Lane 3** | Worker Orders | **T4** | `order-manager.js` (independent) | RC-5 |

### 1.3 First-wave dispatch (Phase A)
Per the Director's already-made priority order, Phase A activates Lane 4 (T0, everyone consumes it), Lane 1 (T1 diagnostic), and Lane 2's cheap first step (T3 retest-triage). Prompts authored:

- `worker-prompts/T0-lane4-registry-harness.md` — per-bug registry + interactive harness scaffolding + 2 RED proof scenarios.
- `worker-prompts/T1-lane1-lifecycle-diagnostic.md` — **diagnostic only** (ownership table); design-doc + implementation gated behind a Director approval checkpoint.
- `worker-prompts/T3-lane2-retest-triage.md` — retest-triage **preparation** (checklist + exact per-ticket repro steps for the tester to execute on b105+ with build-id confirmation). No fixes this step.
- `worker-prompts/T4-lane3-order-entry-model.md` — order-entry pure-function aggregate model + property tests (RED-first).

### 1.4 Manager sequencing decision (noted, low-risk, PO/Director may override)
The Director's Phase A text names Lane 4 + Lane 1 + Lane 2's cheap step, and phases Lane 3 (T4) into Phase B. I have **authored T4 as ready-to-start now** and recommend running it concurrently in Phase A, on this rationale:
- Lane 3 (`order-manager.js`) is fully code-path isolated — zero collision risk with Lanes 1/2/4 (I confirmed the track dependency map marks T4 "fully independent").
- T4 step 1 does not consume T0's registry output: TAL-00752's ~20 bugs are already enumerated verbatim in `ROOT-CAUSES.md` RC-5 and `TICKET-ANALYSIS.md`. Final per-row dispositioning will sync with the T0 registry when it lands.
- The 4-lane model exists precisely so 4 workers run in parallel; holding Worker Orders idle through Phase A wastes an allocated lane.

This is a sequencing optimization within the plan, not a scope or priority change. If the Director prefers strict phasing, hold the T4 prompt until Phase B — the other three lanes are unaffected. Flagged to the PO for the call; **not** escalated as it is low-risk.

**PO RULING (2026-07-12):** run all four lanes concurrently wherever there is no code-path conflict — do not leave workers idle. T4 starts in Phase A. Standing directive for the rest of the overhaul: keep all four lanes saturated; pre-stage the next task at every lane gate.

### 1.5 Checkpoints already anticipated
- **T1** has a mandatory Director-approval checkpoint after the diagnostic (design doc before implementation) — I will produce a `MANAGER-ESCALATIONS.md` entry when the ownership table returns.
- **T3** produces a tester action, not a code change: after the worker's checklist lands, the **PO/tester executes the retests** (build-id confirmed per frame, L1). Only reproducing tickets proceed to T3 steps 1–3.
- **T0's 2 RED scenarios** encode not-yet-fixed bugs; they enter `known-failing.json` as tracked-red so the gate stays green and the open bugs are documented until T1/T2 turn them green.

### 1.7 Anti-idle plan (per PO standing directive)
Goal: no lane idle. Gate points and their filler work:

| Lane | Natural gate (idle risk) | Filler to prevent idle |
|---|---|---|
| **Lane 4** | after T0 lands | proceed to draft the next RED family suites (invalidation, panel-parity) ahead of the fixers (README correction #8: scenarios before fixes). Dispatched when T0 report returns. |
| **Lane 1** | Director approval of the T1 design doc (after diagnostic) | unavoidable gate; mitigate by packaging the escalation tightly for fast ruling. No safe pre-impl filler (I4: no per-tool patching; impl waits for approved store design). |
| **Lane 2** | **PO retest window** (tester busy, worker would idle) | worker proceeds to **draft the T3 interaction-parity contract** (`worker-prompts/T3-step1-parity-contract.md`) — pure design, independent of which tickets survive retest. Then Director approves the contract table. |
| **Lane 3** | within-T4 sequential steps | queue the T4 display-threshold/parsing gated task and the replay-interaction RED scenarios as the next two T4 steps; dispatch on report return. |

Queued prompt authored ahead of need: `worker-prompts/T3-step1-parity-contract.md` (hand to Lane 2 the moment its retest checklist is delivered — do not wait for PO retest results).

### 1.6 Open items / awaiting
- Awaiting PO to hand first-wave prompts to workers and return their deliverable reports.
- No escalations yet.

---

## §2 — First-wave worker reports received (2026-07-12)

### 2.1 T1 step 1 (Lane 1) — **ACCEPTED** (diagnostic)
- Report: `worker-reports/T1-lane1-lifecycle-diagnostic-report.md`
- RC-1 **confirmed**. Ownership table complete with file:line evidence. First-click and ghost-after-delete mechanisms named precisely. No code edited.
- **Director ruling D-001:** design approved; T1 step 3 authorized (**migration steps 1–3 only**). ESC-001 resolved.
- **Dispatched:** `worker-prompts/T1-step3-lifecycle-impl.md` — Lane 1 unblocked. Exit: H-S32 + H-S33 GREEN with kill-switch proof.

### 2.6 T3 step 1 (Lane 2) — **ACCEPTED** (contract draft) → ESC-002
- Contract: `T3-INTERACTION-PARITY-CONTRACT.md` (12 surfaces, today→target, file:line evidence). Report: `worker-reports/T3-step1-parity-contract-report.md`.
- I11 respected: mirror-frame rows (TAL-01480/01488/01489/01496/01497) excluded as DEFER-T8. 7 contract rows map to the 10 LIKELY-SURVIVES retest tickets.
- **Escalation filed: ESC-002** — Director approves ownership split + drawing-sync-default + 2 open questions (Ctrl-select cause, pan-bounds geometry) before T3 step 2.
- Flagged: ROOT-CAUSES RC-4 line ref `order-manager.js:16626-16643` is stale; corrected evidence noted in ESC-002.
- **RESOLVED — D-002 (2026-07-12):** ownership split ratified; drawing-sync default ON confirmed; rows 2/11 isolation approved with a retained Director checkpoint before their fixes. **Dispatched** `worker-prompts/T3-step2-row2-row11-isolation.md` (retest-independent diagnostics — keeps Lane 2 busy). Full survivor scenario suite still gated on PO retest.

## Reports accepted — T1 first build + T3 rows 2/11 (2026-07-12)

- **ACCEPTED — T1 step 3 (Lane 1):** `worker-reports/T1-step3-lifecycle-impl-report.md`. All D-001 exit criteria met — H-S32/H-S33 GREEN ×3, kill-switch A/B RED ×3, gate 31/31 clean, both trees SHA-identical, steps 4–7 untouched, RC-2/RC-3 out, 16-cell state matrix. First-click via `toolSelected`, ghost-after-delete via `toolDeleted` (store-routed, not per-path). Build id → `20260712b1`. **Filed ESC-003** requesting T1 step 4 authorization (conditional on PO live-confirm). Lane 1 blocked until ruled.
- **ACCEPTED — T3 step 2 rows 2/11 (Lane 2):** `worker-reports/T3-step2-row2-row11-isolation-report.md`. Row 2 → both D-002 candidates ruled out; NEW mechanism `c-local-double-toggle` implicated (panel-local select-then-toggle-out). Row 11 → harness cannot reproduce (host/iframe plot rects identical 584×870); needs PO live drag-trace. **Filed ESC-004** (D-002 retained checkpoint). Lane 2 blocked until ruled.
- **Build-id coordination:** T4 bumped `b106`, T1 bumped `20260712b1`; disjoint files → tree carries both fixes under canonical `20260712b1`. Future bumps continue from there. All live testing (T1 live-confirm, T4 live spot-check, T3 retest) now targets `20260712b1`.
- **Anti-idle dispatch:** Lane 3 → T4 step 2 (display-threshold + parsing, `worker-prompts/T4-step2-display-parsing.md`); Lane 4 → T1 acceptance-suite build (selection-desync + stale-quick-menu RED scenarios, `worker-prompts/T0-step2-t1-family-suites.md`) — feeds the T1 step-4 acceptance contract.

## D-003 + D-004 ruled — Lanes 1 & 2 unblocked (2026-07-12)

- **D-003 (ESC-003 resolved):** T1 first build accepted; **step 4 authorized** conditional-parallel. Constraint: **step 6 (retire legacy `Chart.selectedDrawing`/`Chart.drawings`) is its own gated commit + kill-switch.** Build-id lineage ratified `20260712b1`; future bumps route through Manager. **Dispatched** `worker-prompts/T1-step4-lifecycle-migration.md` to Lane 1.
- **D-004 (ESC-004 resolved):** Row 2 fix authorized on the implicated `c-local-double-toggle` mechanism (panel-local select-vs-toggle per interaction; host cell untouched; probe RED promoted to gate). Row 11 = no fix; drag-trace folds into PO retest row (no repro = retest-close; repro = trace back first; host offset constant banned). **Dispatched** `worker-prompts/T3-step3-row2-ctrlselect-fix.md` to Lane 2.
- **All four lanes now running:** L1 = T1 step 4, L2 = T3 Row 2 fix, L3 = T4 step 2, L4 = T1 family suites. No lane idle.
- **PO in parallel:** live-confirm `20260712b1` (T1 first build — gates step 4), T4 live spot-check, T3 retest (survivor set + Row 11 drag-trace folded in).

## ACCEPTED — T4 step 2 (Lane 3) + build-id coordination (2026-07-12)

- **ACCEPTED — T4 step 2:** `worker-reports/T4-step2-display-parsing-report.md`. Two separately-gated RC-5 fixes: Fix A (sub-10 SL/TP render, `__TALARIA_DISABLE_SLTP_RENDER_FIX`) + Fix B (trailing-zero/partial-decimal parse no longer zeroes lot, `__TALARIA_DISABLE_SLTP_PARSE_FIX`). RED-first, GREEN, kill-switch RED (legacy, non-vacuous), both `order-manager.js` trees SHA-identical, aggregates/replay untouched, `node --check` clean. TAL-00752 display+parse families closed.
- **Canonical build id now `20260712b2`** (T4 step 2 bumped it; carries T1 steps 1–3 + T4 step 1 + T4 step 2). All live testing retargets `20260712b2`.
- **Build-id collision risk (D-003 enforcement):** Lane 1 (T1 step 4) was told to bump from `b1`; T4 already moved to `b2`, touching shared entrypoints (`dist-v9/index.html`, `sw.js`, service workers). **Ruling for lanes:** workers must NOT run `bump-dist-v9-cache.mjs` independently anymore. Lane 1 bumps from **`b2` → `b3`** as the last-landing slice; any lane that finishes code first reports its diff and the Manager coordinates a single final bump. Enforced at dispatch.
- **Manager re-verify (P1):** T4 step 2 report did not run the multichart `npm run gate`; low risk (order-entry vs panel scenarios) but PO/verify should run it once alongside the T4 live spot-check to confirm I9.

## ACCEPTED — T0 step 2 family suites (Lane 4) + next-wave staging (2026-07-12)

- **ACCEPTED — T0 step 2:** `worker-reports/T0-step2-t1-family-suites-report.md`. **H-S34 (selection-desync)** + **H-S35 (stale-quick-menu)** added as tracked-RED, deterministically FAIL ×3 on the build, gate = 31 green + 2 tracked-red + 0 regressions, SHA match, I9 intact, no engine edits. Scenarios mapped to registry (TAL-00157#5/#10, 01405, 01443, 00322#7, 01499). **These are the T1 step-4 acceptance contract** — Lane 1 must turn H-S34/H-S35 GREEN (RED again with kill-switch).
- **Anti-idle next wave:** Lane 4 → T2 "stuck-until-click" RED repro scenarios (`worker-prompts/T0-step3-t2-invalidation-scenarios.md`) — preps RC-2 ahead of Lane 1. Lane 3 → T4 step 3 replay-interaction rows (`worker-prompts/T4-step3-replay-interaction.md`) — RED-first, replay-bus state-matrix discipline, defer-to-T8 stop condition if it traces to mirror-frame policy.

## LIVE-CHECK FINDING — order-drag crash on b2 (2026-07-12)

- **PO live test on `20260712b2` surfaced an uncaught exception during entry-line drag:**
  `Uncaught TypeError: Cannot read properties of null (reading 'document')` — `uc (d3.min.js)` → `forwardEvent (chart.js)` → `priceAxisZone.addEventListener.passive` / `timeAxisZone.addEventListener.passive`. Symptom: order line "hard to drag" / stuck.
- **Triage:** the crash is in `chart.js` axis-event forwarding — **untouched by T1 and T4** (T1 = drawing-tools-manager/store; T4 = order-manager only). Strong candidate for a **pre-existing bug** (possibly in the 812), not a regression from this overhaul.
- **False alarm ruled out:** PO's "limit becomes market on drag" was the LEGACY auto-detect (`Auto-detected order type: market + limit` in console) firing because PO had set `__TALARIA_DISABLE_ORDER_AGGREGATES_V2 = true` — i.e. T4's fix disabled. In default state T4 should suppress this. Awaiting PO clean default-state read to confirm.
- **Action:** staging a Lane 3 diagnostic (`worker-prompts/T4-step4-order-drag-crash-diagnostic.md`), RED-first, to determine regression-vs-pre-existing and locate the null-document source. Dispatch gated on PO confirming the crash reproduces in default `b2` (no kill-switches).
- **RESOLVED — crash was kill-switch artifact.** PO reloaded to default `20260712b2` (no flags): drag is perfect, **no d3 `document`-null crash**. The crash only appeared with `__TALARIA_DISABLE_SLTP_*` set. **Diagnostic prompt `T4-step4-order-drag-crash-diagnostic.md` WITHDRAWN** — not a real b2 defect.

## SCOPE CROSSROAD — order-type auto-reclassification vs T4 freeze (2026-07-12)

- **PO ruling on intent:** order type SHOULD auto-reclassify by price vs market (below = Limit, above = Stop, at = Market) — standard broker behavior.
- **Conflict:** T4 step 1 (accepted) *froze* order type on drag (guarded off auto-detect) to close TAL-00752 "type mutates unexpectedly," and encoded property invariant #3 "order type never mutates on move." Both now contradict the PO's required behavior.
- **Re-interpretation:** the real TAL-00752 defect was *incorrect* reclassification (+ the aggregate/PNL math, which T4 step 1 fixed correctly), NOT reclassification existing. Fix direction = reinstate reclassification with correct limit/stop/market semantics, decoupled from the (kept) aggregate math.
- **Filed ESC-005** — needs Director ruling because it revises an accepted deliverable's behavior + invariant. Lane 3 holds on this until ruled (T4 step 3 replay-interaction continues meanwhile).
- **RESOLVED — D-005 (2026-07-12):** approved after Director re-read TAL-00752 #17 (*"it remains called a market order, even if it was a limit order"* — label failed to update). Reclassification reinstated as gated fix `__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2`; invariant #3 revised; new standing rule **P6** (product-behavior invariants quote source ticket) added to INVARIANTS. **Dispatched** `worker-prompts/T4-step5-order-type-reclassify.md` to Lane 3. **P6 applied retroactively going forward** — future acceptance reviews require one cited ticket line per product-behavior invariant.

## ACCEPTED — T4 step 5 order-type reclassify (Lane 3) + build bump b2→b3 (2026-07-12)

- **ACCEPTED — T4 step 5:** `worker-reports/T4-step5-order-type-reclassify-report.md`. Gated fix `__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2`, decoupled (RED-again with only reclassify off = 53 violations while aggregates on). Correct semantics (below=Limit/above=Stop/at=Market, sell mirrored, legs independent); at-market tolerance = 1 price tick (I12 ok). Invariant #3 revised + TAL-00752 #17 quote (P6 ok). RED→GREEN→RED-again; SHA match both trees; `node --check` clean; bump left for Manager.
- **Manager-coordinated build bump → `20260712b3`** (D-003 lineage). Only Lane 3 (`order-manager.js`) has landed since b2; T1 step 4 / T3 Row 2 / T4 step 3 / T0 step 3 not yet reported, so b3 = reclassification testable + all prior accepted work. PO live spot-check (drag buy entry Limit→Market→Stop) runs on b3.

## LIVE-CHECK — reclassification confirmed on b3 + label-refresh-during-drag follow-up (2026-07-12)

- **CONFIRMED working:** PO on `20260712b3` sees order type reclassify correctly (chart shows "STOP BUY", console `orderType: 'stop'`). D-005 reclassification is live and correct. (Earlier "nothing changed" was because the bump was pasted into the browser console, not the terminal — page stayed on cached b2.)
- **NEW follow-up bug:** label reclassification is **intermittent during continuous drag** — console shows `Skipping updatePreviewLines() - currently dragging`. The order type is recomputed correctly but the on-screen label/preview refresh is throttled/skipped mid-drag, so it only updates on pause/release ("sometimes works then stuck"). Mechanism = mutation-without-repaint during drag (RC-2-flavored, but order-entry-owned in `order-manager.js`).
- **Action:** dispatching Lane 3 follow-up `worker-prompts/T4-step6-ordertype-label-live-refresh.md` — decouple the cheap order-type label reclassify+repaint from the throttled `updatePreviewLines()` so the label updates on every drag move. RED-first, gated. Needs a build bump after landing.
- **ACCEPTED — T4 step 6 (2026-07-12):** `worker-reports/T4-step6-ordertype-label-live-refresh-report.md`. `_refreshOrderTypePreviewLabelLive()` rAF-coalesced lightweight invalidation on both main + split drag paths; heavy `updatePreviewLines()` throttle kept; own kill-switch `__TALARIA_DISABLE_ORDERTYPE_LIVE_LABEL_FIX`. RED/GREEN/RED-again, step-5 classifier still green, SHA match both trees, `node --check` clean, P6 quote present. **Manager bump → `20260712b4`** for PO continuous-drag spot-check (LIMIT→MARKET→STOP tracking continuously).

## REGRESSION — `ReferenceError: level is not defined` in entry-drag handler (2026-07-12)

- **PO on b4:** dragging an entry throws `Uncaught ReferenceError: level is not defined` at `order-manager.js` (~:18983) inside the anonymous drag handler (d3 `Dt.call` chain). Drag handler crashes → label can't update ("nothing resolved"). Chart still shows "MARKET BUY 0".
- **Root:** regression from T4 step 5 and/or step 6 — a `level` identifier referenced but not in scope in the split/main entry drag path.
- **Why tests missed it (COVERAGE GAP):** step 5/6 Node tests called helper methods (`classifyOrderTypeForPrice`, `_refreshOrderTypePreviewLabelLive`) directly and never executed the real drag handler where `level` is referenced. A runtime `ReferenceError` in the handler body was invisible to the suite. **Lesson (feeds P-discipline):** order-entry drag-handler changes need a repro that actually invokes the handler, not only helper unit tests.
- **Build-id check:** PO console appeared to show `?v=20260712b7`, not b4 — need PO to confirm the exact build id on-frame (possible stale service worker OR an un-coordinated bump; investigate).
- **Action:** dispatched priority fix `worker-prompts/T4-step7-fix-level-referenceerror.md` to Lane 3 — locate the undefined `level`, fix, and add a repro that executes the drag handler. Needs bump after landing.
- **ACCEPTED — T4 step 7 (2026-07-12):** `worker-reports/T4-step7-fix-level-referenceerror-report.md`. Root cause = step-5 `if (level) level.orderType = ...` referenced outside the `const level` block; fixed via outer-scope `draggedEntryLevel`. **Coverage gap closed:** new `order-entry-drag-handler-reference.test.mjs` stubs `d3.drag()` and invokes the real drag callback — RED before (ReferenceError ~:18903), GREEN after across switch matrix; helper + step-5 suites still green; SHA match both trees. **Manager bump → `20260712b5`** for PO re-test (no console error; label tracks LIMIT/MARKET/STOP continuously). NOTE: b4 console appeared to show `?v=b7` — instruct PO to unregister the service worker before re-testing to kill any stale SW.

## PO-CONFIRMED GREEN — order-type family on b5 (2026-07-12)

- **PO confirmed on `20260712b5` (service worker unregistered, build id verified on-frame): order-type behavior works perfectly** — reclassify + continuous label + no ReferenceError.
- **TAL-00752 order-type family DISCHARGED** across T4 steps 1/5/6/7 (aggregate math correct + reclassification correct + live label + crash fixed). Registry order-type rows → closed, citing D-005 + b5 PO confirmation (P5 satisfied: tester confirmation on named build).
- **Process lesson banked:** two of three retest cycles were lost to non-code causes (bump pasted in browser console; stale service worker). **Add to PO live-test guidance: (a) build bump runs in the IDE terminal, never the browser console; (b) unregister the service worker before any order-entry retest.** This is an L1 corollary — pair build-id confirmation with an SW unregister.
- **Remaining T4:** step 2 (display/parse) already accepted; step 3 (replay-interaction) still in Lane 3's queue. T4 otherwise near-complete.

## ACCEPTED — T0 step 3 (Lane 4) + scenario-file coordination (2026-07-12)

- **ACCEPTED — T0 step 3:** `worker-reports/T0-step3-t2-invalidation-scenarios-report.md`. **H-S38/H-S39** RC-2 "stuck-until-click" tracked-RED (style color + width commit must repaint by next frame, no click). RED 3/3 (`renders before=11 after=11`), gate = existing green + 4 known-failing tracked + 0 regressions, SHA match both trees, no engine edits.
- **Discovered:** `H-S36`/`H-S37` in the tree are **Lane 3's T4 step 3 replay-interaction** scenarios (TAL-00752#21 pending-fill-anchors-to-touch-candle; #3 TP-line-stable-across-redraw). They currently PASS the gate (not tracked red). **Awaiting Worker 3's formal T4 step 3 report** before accepting/closing those rows.
- **COORDINATION RISK (like the build-id one):** `scenarios.mjs` + `known-failing.json` are edited by multiple lanes (Lane 4 authors; Lane 1 needs H-S34/H-S35; Lane 2 promotes its Row-2 probe per D-004; Lane 3 added H-S36/H-S37). **Standing rule:** Lane 4 owns harness scenario-ID allocation; other lanes requesting a new scenario ID coordinate through the Manager to avoid ID/merge collisions. Worker 4 handled this correctly this time (used next free IDs, preserved existing).
- **Anti-idle:** Lane 4 → `worker-prompts/T0-step4-t5-anchoring-scenarios.md` (T5 anchoring RED scenarios: prepend-history / TF-switch / replay-advance → assert tool unmoved) — preps RC-3 for Lane 1's later T5.

## ACCEPTED — T0 step 4 (Lane 4) + Lane 4 shifts to verification duty (2026-07-12)

- **ACCEPTED — T0 step 4:** `worker-reports/T0-step4-t5-anchoring-scenarios-report.md`. **H-S40/41/42** RC-3 anchoring tracked-RED (TF-switch 1m→5m index-basis drift: anchored VWAP, fixed-range volume profile, anchored volume profile). RED 3/3, gate = 7 known-failing tracked + 0 regressions, SHA match, no engine edits, I9 intact. Registry: TAL-00322#11-17, 00323#2/9/10/13/15, 00271#9/10, 01293#1.
- **T5 scoping note (for Lane 1's future T5 fix):** harness RED reproduces **only on TF-switch**. Prepend-history and replay-advance did NOT yield a deterministic harness RED (anchored VWAP compensates index on prepend; replay-advance doesn't shift the window basis). So T5's harness acceptance is TF-switch-based; prepend/replay drift (from the original tickets) needs **live PO verification** when the T5 fix lands. Not a blocker; recorded so T5 isn't declared closed on TF-switch alone.
- **Harness scenario inventory now:** H-S32/33 (T1 first-click/ghost), H-S34/35 (T1 selection-desync/stale-menu), H-S36/37 (T4 replay-fill/TP-flicker), H-S38/39 (T2 invalidation), H-S40/41/42 (T5 anchoring). Lane 4 forward-prep is now **ahead of the fix lanes**.
- **Lane 4 → verification duty (per TRACKS role).** Rather than prep speculative T6 scenarios (T6 is far downstream, after T1+T5), Lane 4 holds for verification: it will independently verify T1 step 4's H-S34/H-S35 the moment that report lands, and build T3 contract-row scenarios once the PO retest defines survivors. Available for T6 prep on request.

## ACCEPTED (harness) — T1 step 4 + T3 Row 2 + T4 step 3; Manager-verified integrated gate GREEN (2026-07-12)

- **Manager independent verification (P1):** hashed all shared engine files — `drawing-tools-manager.js`, `order-manager.js`, `chart.js` all **byte-identical across both trees**. Row 2 markers (`_suppressNextIframeCtrlSelectToggle`/`isMultichartIframeEmbed` ×12) present; T1 step-6 switch (`__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2` ×5 in chart.js) present. Ran full `npm run gate`: **H-S32–37 + H-S43 PASS; H-S38–42 tracked-red; 0 regressions.** The earlier "not byte-identical" note in the T3 report was transient parallel-landing drift; final tree is consistent (I8 holds).
- **ACCEPTED — T1 step 4** (`T1-step4-lifecycle-migration-report.md`): steps 4–7 migrated; step 6 (legacy `Chart.selectedDrawing`/`Chart.drawings` retirement) behind its own switch per D-003; H-S34/H-S35 GREEN + kill-switch RED-again; four RC-1 family suites now green (first-click/ghost/selection-desync/stale-quick-menu). **CONDITIONAL on PO live-confirm** (large chart.js blast radius: single-chart select/hover/edit/delete, Escape/Delete, context-menu, object tree) — same discipline that caught the T4 ReferenceError. Not closed until live-confirmed.
- **ACCEPTED — T3 Row 2** (`T3-step3-row2-ctrlselect-fix-report.md`): panel-local Ctrl double-toggle suppressed (80ms window) gated behind `isMultichartIframeEmbed()`; host Ctrl-click untouched (D-004); probe now `not-reproduced`; H-S43 promoted to gate and PASS. TAL-01498 fixed (pending PO live-confirm in panel).
- **ACCEPTED — T4 step 3** (`T4-step3-replay-interaction-report.md`): TAL-00752#3 (TP-line flicker) fixed — `drawSLTPLines` reuses DOM via signature instead of remove/recreate; gated `__TALARIA_DISABLE_TP_REPLAY_FLICKER_FIX`; H-S37 RED→GREEN→RED-again. **TAL-00752#21 (fill-on-wrong-candle) = NO-REPRO** after probe correction (was reading visible slice, not replay master); no fix applied — **needs PO live check during replay** to close or capture a live trace.
- **Manager-coordinated build bump → `20260712b6`** (single bump captures T1 step 4 + T3 Row 2 + T4 step 3; `drawing-tools-manager.js`/`chart.js` changed since b5). PO live-confirms everything on b6.
- **Milestone:** T1 (the heaviest lane, ~60% of ticket volume) is functionally complete pending live-confirm — biggest single progress jump.

## T1 step 4 LIVE-CONFIRM FAILED (multichart) — reopened (2026-07-12)

- **PO on b6:** single chart selection works. **Multichart panels broken:** (A) tool **cannot be selected and settings menu won't open** on normal click — only **double-click** opens settings; (B) **Esc deselects the tool but does NOT close the settings menu/bar** (teardown gap).
- **T1 step 4 acceptance REVOKED** (was conditional on live-confirm per D-003). Not closed. Selection-desync/stale-quick-menu families NOT actually green live in panels.
- **Coverage gap (again):** H-S34/H-S35 tested only cross-panel selection *clearing*, not the intra-panel **select(single-click) → open settings → Esc-closes-settings** flow. New RED scenarios required that exercise this.
- **Suspected mechanism:** step-4 `toolSelected` cross-panel cleanup / `clearDrawingUiOnOtherPanels` added to `multichart-manager.js` likely clears the just-selected panel's own UI (breaking select+settings-open); and the `toolDeselected` path (Esc) doesn't drive `settingsPanel.hide()` in panel/iframe context (leaves settings bar open).
- **Action:** dispatched `worker-prompts/T1-step5-multichart-select-settings-fix.md` to Lane 1 — RED-first with panel select→settings→Esc scenarios; gated; no build bump (Manager coordinates). T1 progress rolled back to ~75%.
- **ACCEPTED (harness) — T1 step 5** (`T1-step5-multichart-select-settings-fix-report.md`): Symptom A fixed via `skipV9Dismiss:true` (cross-panel cleanup no longer clears the *selecting* panel's own settings/V9 surface); Symptom B fixed via `toolDeselected` → hide local settings/context/toolbar + post `multichart-close-drawing-settings` to parent. Patched the **production React `MultichartGrid.jsx`** + harness manager + `chart.js` + `drawing-tools-manager.js`. New **H-S44** (panel single-click select → settings open → Esc close) RED→GREEN→kill-switch-RED; full gate H-S32–37/43/44 PASS, H-S38–42 tracked-red, 0 regressions. **Manager P1 verify:** hashed both trees — `drawing-tools-manager.js` 5907BADA match, `chart.js` EA3ECA2B match; Row-2 markers preserved (not clobbered).
- **CONDITIONAL on PO live-confirm:** the original bug lived in production React `MultichartGrid.jsx`, which the harness does not exercise. **Manager bump → `20260712b7`**; PO re-tests the exact multichart select→settings→Esc flow. Not closed until live-confirmed.

## T1 step 5 LIVE-CONFIRM FAILED — 3 multichart selection regressions (2026-07-13, b8)

- **PO on b8:** the T1 lifecycle rework has destabilized multichart selection. Three live regressions:
  - **R1** — Ctrl-select no longer works correctly.
  - **R2** — no blue selection/preview border shown during selection.
  - **R3** — settings menu **flashes open then immediately closes** in a multichart panel (open/close race in the same interaction).
- **Pattern (root process problem):** every T1 step (4, 5) passes the harness but breaks the real React `MultichartGrid` because the harness (`multichart-manager.js`) is not the production surface. Incremental patching is whack-a-mole. **Changing approach:** (a) immediate kill-switch fallback for the PO (`__TALARIA_DISABLE_TOOL_LIFECYCLE_V2=true`); (b) consolidated Lane-1 diagnostic that must reproduce R1/R2/R3 in the **real React multichart** before any fix; (c) escalating the approach to the Director (ESC-006) — likely need a production-React parity check, not harness-only, before T1 closes.
- **T1 acceptance REVOKED again** — rolled back to ~70%. Awaiting PO kill-switch isolation result to finalize ESC-006.
- **UPDATE (b8):** PO kill-switch test = **no change** → confirms the live owner is outside the gated engine. Step-6 diagnostic returned and **confirms it: `MultichartGrid.jsx` (React parent) owns R1/R2/R3.** R3 = `openDrawingSettingsForPanel()` vs unconditional `closeDrawingSettingsOnAllPanels()` race. Worker stopped at Part-1 stop condition (needs React ownership rework). ESC-006 updated with the confirmed mechanism + refined decision (authorize step-7 fix in `MultichartGrid.jsx`, React-scoped switch, mandatory real-product PO acceptance). Step-7 fix prompt staged; dispatch on Director ruling.
- **D-006 (2026-07-13) — premise corrected.** My kill-switch inference was unsound: T1 steps 4/5 edited `MultichartGrid.jsx` (`:4756`, `:5822-5837`) **outside** the engine switch (I3 breach), so switch-off couldn't distinguish "React owns selection" from "our own un-gated edits regressed it." Director ordered a **gating audit + A/B revert** first, before any ownership hunt; fallback (b) pre-authorized (default multichart migration OFF for panels, single-chart stays ON); parity checklist is now a standing gate; **new I13** (kill-switch covers every touched file incl. React). Recorded D-006, resolved ESC-006, added I13, created `MULTICHART-PARITY-CHECKLIST.md`, **restructured step-7 prompt to lead with the audit**. Ready to dispatch to Lane 1.

## T1 step 7 — audit + gated re-land delivered; LIVE ACCEPTANCE PENDING (2026-07-13)

- **Report:** `worker-reports/T1-step7-multichart-react-ownership-fix-report.md`. Lane 1 did Part 1 (I13 gating audit ledger) + Part 2 (code-level A/B), chose **path 3A** (re-land the step-4/5 React edits behind new `__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2`) — matches D-006 expectation. Only `MultichartGrid.jsx` changed. Harness H-S32/33/34/35/43/44 all PASS; engine trees byte-identical; lint clean.
- **NOT ACCEPTED yet (correctly).** Worker's local Vite couldn't init the chart (`/chart/vendor/d3.min.js` dev-routing), so the real-product parity checklist is unrun. Per D-006, harness alone ≠ acceptance.
- **Build/deploy fact (Manager):** live serves a **Vite-built bundle** (`npm run build:live` → `vite build` → `sync-v9-to-homepage` → Docker image), NOT raw JSX. A cache-only bump will retest STALE compiled React → false negative. Acceptance requires a full `build:live` + Docker redeploy, then PO runs `MULTICHART-PARITY-CHECKLIST.md` with build id confirmed on host + every panel (L1).
- **Next:** PO rebuilds + redeploys, runs parity checklist. PASS → accept step 7, close the R1/R2/R3 regression, resume T1 closure. FAIL on any row → back to Lane 1 (or fallback (b)).

### WORKFLOW GAP found (2026-07-13) — why "nothing changed" on retest
- PO retested with only a **cache-bump** (`bump-dist-v9-cache`, see terminal 11 runs b3/b4). That stamps `?v=`/SW_VERSION but does **NOT recompile React**. `MultichartGrid.jsx` is compiled by Vite into `chart/dist-v9/assets/talaria-v9-live.js` (`vite.config.live.js` `base:/chart/dist-v9/`, `entryFileNames: assets/talaria-v9-live.js`). So every React fix (T1 step 4/5/7) needs `npm run build:live` (or a Docker image rebuild — `chart_assets` stage runs `build:live:chart`, ~15–20 min Terser). Raw JS module fixes (order-manager) worked on bump-only because they're served unminified — which masked this gap.
- **Correction issued to PO:** for any `MultichartGrid.jsx`/React fix, run `npm run build:live` in `talaria-design` (recompiles dist-v9 + syncs homepage/public) BEFORE bump/reload. This is now part of multichart acceptance.
- **Fast-test gap (for Lane 4 later):** `dev:live` (Vite HMR, instant) can't init the chart because `vite.config.live.js` proxy list omits `/chart/vendor/d3.min.js` (only `/chart/chart.js`, `/chart/modules`, etc. are proxied) → `d3 load failed`. Fixing that proxy/`USE_LOCAL_CHART` gap would give a sub-second React test loop instead of full rebuilds — directly serves D-006's parity-check tooling.

### T1 step 7 first live retest (post-rebuild) — PARTIAL (2026-07-13)
- After the correct `build:live` rebuild, PO reports: **R1 (Ctrl-select) FIXED.** Remaining: **R2** blue selection border still not showing (PO says "even on main chart, on Ctrl+drag"), and **settings opens only on double-click, not single-click** (first-click-open regression, distinct from the earlier flash).
- **Concern:** R2 reported on the MAIN/single chart → possible I5 breach (step 7 must be panel-gated). Requested isolation: PO sets `__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2=true` on main chart; if the border returns, step 7 leaked into single-chart and Lane 1 re-scopes; if not, border is pre-existing/separate. Also pending PO build-id confirm (`20260713b1`).
- **Next:** on isolation result, dispatch T1 step 8 to Lane 1 (R2 border + single-click settings open), RED-first on the real React product per I13/D-006. Fallback (b) still available if convergence stalls.

### D-007 (2026-07-13) — Director corrected the isolation plan
- Blue Ctrl+drag border is **engine-owned** (`chart.js` `drawCtrlMarqueeSelect` ~:18645, start predicate ~:31174), depends on state migrated by T1 steps 4–6 → single-switch (ownership-V2) test would false-negative. Directive: **three-switch matrix** (ownership-V2 / lifecycle-V2 / legacy-retire-V2) on main chart, each maps to a step-8 target; none ⇒ pre-existing → registry.
- Double-click-settings symptom: **PO must state the spec first** (P6) before any fix.
- Two permanent parity rows added (Ctrl+drag marquee; single→double click chain) — main chart AND panel every build. Done in `MULTICHART-PARITY-CHECKLIST.md` (rows 8–9).
- **Manager mechanism note:** switches are lazy `window.*` reads with no persistence → "reload each" wipes them; matrix run as **set-flag → Ctrl+drag without reload**, build id confirmed once. Recorded in D-007. Possible Lane 4 follow-up: localStorage flag shim.
- Recorded D-007; step 8 dispatches only after matrix result + PO spec.
- **PO SPEC stated (D-007 req 2, P6-compliant):** single-click = select + show quick menu (floating toolbar); **double-click = open full settings**; Esc = deselect + close. ⇒ The "settings opens on double-click" the PO reported is **spec-correct, not a bug**. Step-8 settings scope narrows to: *does single-click show the quick menu?* (and the Esc close chain). Blue-border still pending the three-switch matrix.

### D-007 matrix RESULT + T1 step 8 dispatched (2026-07-13)
- **Matrix result:** blue Ctrl+drag marquee border returns in **NONE** of the three switch states, nor all-three-off ⇒ **PRE-EXISTING engine defect, not a T1 regression** (per D-007 → registry, does not block T1). New symptom from PO: **Ctrl+drag intermittent — sometimes works, sometimes the shape jumps** (drag mis-read as move).
- **Registry:** `PLAN2-FOUND#1` (marquee border never draws), `PLAN2-FOUND#2` (intermittent Ctrl+drag shape-jump). Both RC-1, chart_core_ui, open.
- **Dispatched T1 step 8** (`worker-prompts/T1-step8-ctrl-drag-marquee-diagnostic-fix.md`): engine-owned Ctrl+drag marquee, diagnostic-first (S1 border-not-drawing + S2 shape-jump; one-or-two mechanisms), gated fix, real-product acceptance on parity rows 8–9. Also verifies single-click quick-menu vs the PO spec (fix only if broken). T1 step 7 (Ctrl-select fix) remains PO-confirmed good and is unaffected.

### T1 step 8 delivered — LIVE PENDING (2026-07-13)
- **Report:** `worker-reports/T1-step8-ctrl-drag-marquee-report.md`. Diagnostic: S1+S2 = **one** mechanism (fragmented Ctrl+drag ownership between chart marquee and drawing-manager hit/move). Fix in `chart.js` (both trees byte-identical, SHA `53f60ca1…`), gated by `__TALARIA_DISABLE_CTRL_MARQUEE_FIX`: document-level marquee drag continuation + SVG overlay sizing + relaxed geometric-hit rejection only when DOM target isn't `.drawing` (preserves H-S43). Harness H-S32/33/34/35/43/44 green; lint/`node --check` clean. Single-click quick-menu = spec-correct (H-S32/H-S44); double-click settings unchanged (correct).
- **Deploy note:** step 8 = **raw `chart.js`** (not React) → served directly, so a **cache-bump surfaces it** (no Vite/Docker rebuild needed, unlike step 7's `MultichartGrid.jsx`). Manager bump → **`20260713b2`**.
- **Next:** PO runs `build:live` (covers the cache-bump; also keeps step-7 React bundle current), confirms `20260713b2` on frame, runs parity rows 8–9 on main chart AND a panel + switch-off revert check. PASS → step 8 accepted, PLAN2-FOUND#1/#2 close, T1 back on track.

### DEPLOY PIPELINE CORRECTED (2026-07-13) — root cause of every "nothing changed"
- **The PO tests on a REMOTE SERVER**, not locally: terminal 5 shows `root@srv904606:/opt/talaria#` running `docker compose up --build`. **Local `npm run build:live` (Windows) never reaches that server** — this was the actual cause of the repeated "nothing changed", not the fixes.
- **Correct pipeline for ANY fix to reach the PO's browser:**
  1. Local: commit + push to `origin/main` (verified: step-8 `chart.js` is in commit `08832136`, pushed).
  2. Server (`/opt/talaria`): `git pull` → `GIT_COMMIT=<id> docker compose up --build -d`. The Docker `chart_assets` stage runs `build:live:chart` (compiles `MultichartGrid.jsx` → dist-v9 + serves `chart.js`); `GIT_COMMIT` → `BUILD_ID` so the frame shows a confirmable id.
  3. Browser: unregister SW + hard reload; confirm build id (L1).
- **Manager action:** stop issuing local build commands as the deploy step; the deploy is server-side git pull + docker build. Local build:live is only for a local dev check (which is separately blocked by the Vite d3 proxy gap).
- **Parity checklist precondition #1 updated** should reflect server rebuild, not local `build:live`, when the PO tests the server. (Follow-up: reconcile checklist wording.) — DONE.

### FALLBACK (b) INVOKED — stop the T1 multichart patch loop (2026-07-13)
- On confirmed build `20260713b2` (deploy verified — console showed `?v=20260713b2`), PO reports multichart still broken: **Ctrl+drag marquee doesn't work** and **multichart tool settings menu doesn't open**. PO explicit: *"when I told you it's not working it's not working… don't loop on test and report"* and *"it worked before the workers started."*
- Iterative T1 multichart patching (steps 4–8) has **not converged** and is exhausting the PO. Per **D-006 ruling 3 (fallback (b), pre-authorized, no new escalation)**: revert — **default the T1 multichart-panel migration OFF (single-chart stays ON), ship a stable build, re-migrate once later under the parity gate.**
- **Dispatched** `worker-prompts/T1-fallbackB-disable-multichart-migration.md` to Lane 1: context-gated defaults (single-chart migration ON, multichart-iframe panels → pre-worker behavior), migration code retained + re-enableable via existing `__TALARIA_*` flags for the future re-attempt. Manager coordinates one deploy bump.
- **Marquee (`PLAN2-FOUND#1`) is pre-existing** and explicitly OUT of this rollback — scheduled as its own dedicated fix later, not part of the loop.
- T1 headline: single-chart improvements kept; multichart returns to known-good; T1 re-migration deferred (becomes a future consolidated effort under the real-product parity gate). Informing Director as a fallback-(b) invocation (no ruling needed).

### Fallback (b) DELIVERED — deploying stable build (2026-07-13)
- **Report:** `worker-reports/T1-fallbackB-disable-multichart-migration-report.md`. Predicate-only, reversible, no migration code deleted. Context-gated: single chart = migration ON (unchanged); multichart iframe panels + React shell = pre-T1 behavior by default. Each piece re-enableable via existing `__TALARIA_*` flags for the future re-migration. Trees byte-identical (chart.js `de742bca…`, drawing-tools-manager `194f8989…`, tool-lifecycle-store `90df0c9b…`; MultichartGrid `340dacd0…`). `node --check`/lint clean.
- **Expected harness reds (rollback window):** H-S34, H-S35, H-S44 now FAIL because they assert the intentionally-disabled migrated multichart behavior. H-S32/33/36/37/43 pass. **Follow-up (non-blocking, Manager to assign Lane 4):** move H-S34/S35/S44 to `known-failing.json` with a "T1 fallback-(b) rollback window" note (not an assertion change → within fallback scope, no I9 escalation).
- **Deploy:** touches raw JS + `MultichartGrid.jsx` → full server rebuild required. Manager bump → **`20260713b3`**. Pipeline: local commit+push → server `git pull` → `GIT_COMMIT=20260713b3 docker compose up --build -d` → browser SW-clear + hard reload → confirm `20260713b3`.
- **Acceptance:** PO confirms multichart panels behave like before the workers (select, settings menu, no shape-jump on normal use); single chart unchanged. Marquee (`PLAN2-FOUND#1`) remains a separate pre-existing item, not part of this.

### Next wave dispatched — moving off T1 to the ready root causes (2026-07-13)
- With T1-multichart parked (single-chart kept; re-migration deferred to a future consolidated effort under the parity gate), advancing the plan per TRACKS lane map:
  - **Lane 1 → T2** (RC-2 invalidation / "stuck-until-click", ~38 tickets): dispatched `worker-prompts/T2-step1-invalidation-assertion-sweep.md`. Assertion mode + per-mechanism gated fixes; RED scenarios from T0 step 3 (H-S36/37).
  - **Lane 3 → T4 close:** finish the remaining replay fill spot-check; T4 otherwise done.
  - **Lane 2 → T3 retest triage** on stable `b3` (retest-first per TRACKS; migration-dependent fixes re-scoped after the rollback).
  - **Lane 4 → fast-test tooling:** fix Vite `/chart/vendor/d3.min.js` proxy gap (sub-second React test loop vs 20-min rebuilds) + reclassify H-S34/35/44 to known-failing for the fallback window.
- T1 deferred re-migration recorded as a future track item (re-enable via retained `__TALARIA_*` flags under the real-product parity gate).

### b3 fallback ACCEPTED (stable) — remaining item = marquee border (2026-07-13)
- PO on `20260713b3`: multichart stable. **Settings double-click = spec-correct** (PO re-confirmed TV-style: single=select+quick menu, double=settings) → NOT a bug, closed. **Ctrl+drag selects fine.** Only remaining live gap: **blue marquee preview border does not draw during Ctrl+drag** = pre-existing `PLAN2-FOUND#1`; step-8's fix never landed live.
- **Decision:** do NOT re-attempt the marquee fix blindly (that caused the rebuild loop). **Lane 4 first fixes the Vite dev-proxy** (`/chart/vendor/d3.min.js`) so the engine/React can be tested locally in seconds; THEN the marquee gets a clean dedicated fix verified fast before any server deploy. Marquee stays non-blocking; big buckets proceed meanwhile.
- **Dispatched Lane 4** `worker-prompts/T0-step5-vite-devproxy-fast-test.md` (fast-test enabler) + it also reclassifies H-S34/35/44 to known-failing for the fallback window. Lane 1 proceeds on T2.

### T2 step 1 + T0 step 5 ACCEPTED (Manager-verified gate) (2026-07-13)
- **Manager independently ran `npm run gate` (P1):** `[gate] PASS: no new regressions; 6 known-failing tracked` (exit 0, elapsed ~571s). H-S38/H-S39 now PASS (T2 fix); tracked reds = H-S34/35/44 (fallback window) + H-S40/41/42 (T5 anchoring, not yet fixed). Both Lane 1 + Lane 4 edits to `known-failing.json` converged (identical SHA `98CF39EB…`) — no collision.
- **T2 step 1 (Lane 1):** RC-2 drawing-save invalidation. `saveDrawings()` fingerprints state → schedules render on change; kill-switch `__TALARIA_DISABLE_DRAWING_SAVE_INVALIDATION_V2`. RED/GREEN/RED proven on H-S38/39. Trees byte-identical (`7716A3BA…`). Accepted. (T2 may need a step-2 broader assertion tour for remaining RC-2 hits.)
- **T0 step 5 (Lane 4):** `dev:live` now boots the chart locally (`chartTruthy/d3Truthy:true`, 0 console errors) via `/chart/vendor|fonts|pwa` dev-serving; production build untouched. **Fast-test recipe:** `USE_LOCAL_CHART=1 npm run dev:live` → set `__TALARIA_*` flags in console → interact, no rebuild. Accepted.
- **Unblocks the marquee fix** (`PLAN2-FOUND#1`): now locally verifiable in seconds. Dispatching to Lane 1 next.

### T1 step 9 — marquee border FIXED + visually verified (2026-07-13)
- **Report:** `worker-reports/T1-step9-marquee-border-fix-report.md`. Root cause step 8 missed: the live Ctrl+drag stream is **pointer-event dominant** (13 `pointermove`, 1 `mousemove`) and `drawCtrlMarqueeSelect()` was never reached during renders → overlay never created. Fix (gated `__TALARIA_DISABLE_CTRL_MARQUEE_FIX`): listen to pointer events + sync the overlay directly from the tracker.
- **Fast-loop VISUAL proof (the discipline we needed):** blue overlay draws during Ctrl+drag — main chart 396×215, panel iframe 287×270; release selects 2/2 enclosed tools on host A and panel B; kill-switch ON → overlay gone. Both `chart.js` trees byte-identical (`AA6FD125…`). Worker gate PASS.
- **Manager re-running `npm run gate`** on the step-9 tree (P1) — result pending; batching deploy.
- **Ready to deploy:** T2 step 1 (`drawing-tools-manager.js`) + step 9 (`chart.js`) both harness-verified → one server rebuild, **Manager bump `20260713b4`**, PO confirms marquee live.

### Marquee CONFIRMED live; settings-flash re-surfaced (fallback trade-off) (2026-07-13)
- PO: **Ctrl+drag marquee works perfectly live** (step 9 accepted live). New live complaint: **multichart settings menu flashes open→closed (~1s); single chart fine.**
- **Cause:** this is **R3** (diagnosed in step 6/7). Step 7 fixed it via ownership-V2, but **fallback (b) defaulted ownership-V2 OFF in panels → R3 returned.** Trade-off of the rollback.
- **Now fixable cleanly:** with fast-test loop (T0 step 5) + marquee fixed independently (step 9) + deploy pipeline understood, we can re-apply step-7's R3 fix and verify live — this is the D-006 "re-migrate under the parity gate" path, done incrementally.
- **Dispatched T1 step 10** (`worker-prompts/T1-step10-multichart-settings-flash-remigration.md`) to Lane 1: re-apply ONLY the R3 settings-flash fix, verify in running chart (settings stays open in panel) + parity rows 4/5/9. Batch into the next deploy.

### T1 step 10 delivered — harness-clean; live acceptance = PO server test (2026-07-13)
- **Report:** `worker-reports/T1-step10-multichart-settings-flash-remigration-report.md`. New gated switch `__TALARIA_DISABLE_MULTICHART_SETTINGS_FLASH_FIX_V2` (default ON) in `MultichartGrid.jsx` only; re-applies step-7 R3 slice (open preserves source panel; explicit Esc/close routes through `closeDrawingSettingsForPanel()`). Broader ownership-V2 stays default-OFF (fallback posture intact). Gate PASS (only tracked reds); trees byte-identical.
- **FAST-LOOP GAP found:** `dev:live` boots the single chart but does NOT mount the React MultichartGrid (`__multichartGrid=false`, 0 iframes, `MultichartGrid.jsx` dynamic import fails). So React-**multichart** fixes still can't be fast-verified locally; T0 step 5 only covers single-chart boot. Worker honestly did NOT claim live acceptance. → **Live acceptance for step 10 = PO server test** (real product, per I13/D-006).
- **Follow-up queued (Lane 4, T0 step 6):** make the React MultichartGrid mountable under `dev:live` (panels + layout control) so future React-multichart fixes get seconds-fast local verification — closes the remaining half of the parity-check tooling.
- **Deploy batch → `20260713b5`:** marquee (step 9, `chart.js`) + T2 step 1 (`drawing-tools-manager.js`) + settings-flash (step 10, `MultichartGrid.jsx`). One server rebuild; PO confirms marquee + settings-stays-open live.

### b5 live — mostly GREEN; one small gap: quick-bar gear (2026-07-13)
- PO on `20260713b5` (screenshots): **settings menu opens + STAYS open in panel (step 10 confirmed live), Ctrl works, marquee works, rectangle selects with blue border.** Big multichart recovery confirmed.
- **Remaining:** the **quick settings/floating toolbar gear button does not open settings** in a panel (double-click does). Small routing gap — the quick-bar gear must trigger the same panel settings-open path (`editDrawing()` → `requestMultichartParentDrawingSettings()` → `openDrawingSettingsForPanel()`) that double-click now uses.
- **Dispatched T1 step 11** (`worker-prompts/T1-step11-quickbar-settings-button.md`) to Lane 1. Verification: fast loop once Lane 4 T0 step 6 mounts the grid, else PO server test.

### T1 step 11 delivered — code-complete, UNVERIFIED (2026-07-13)
- **Report:** `worker-reports/T1-step11-quickbar-settings-button-report.md`. Fix in `TalariaV8bLive.jsx` (V9 quick-bar owner, not engine): new gated `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` (default ON) → quick-bar gear (line/shape, text, VWAP, volume-profile) routes through `dm.editDrawing()` in multichart context, matching double-click; single chart unchanged. Gate green (tracked reds unchanged); `TalariaV8bLive.jsx` SHA `758e0915…`.
- **NOT verified:** harness doesn't cover the React quick-bar and `dev:live` still can't mount the grid → no live proof. Worker gave a PO server-test script.
- **Sequencing decision:** wait for **Lane 4 T0 step 6** (grid mount) to verify step 11 in the fast loop, THEN one deploy `20260713b6` (step 11 gear). Avoids deploying unverified. PO stays on b5 (good except the gear) meanwhile.

### T0 step 6 ACCEPTED — local multichart testing now works (2026-07-13)
- **Report:** `worker-reports/T0-step6-devlive-mount-multichart-grid-report.md`. `dev:live` now mounts the React `MultichartGrid` via a DEV LAYOUT overlay (1/2/2x2) + `?devMultichart=`/localStorage bootstrap. Probe: `__multichartGrid:true`, 2 & 2x2 iframes mounted, panel B rectangle placed + settings dialog opened. **All dev-only, guarded by `import.meta.env.DEV`** (stripped in prod); `npm run build` passed; gate exit 0. Touched `TalariaV8bLive.jsx` + `MultichartGrid.jsx` (dev-gated) — coexists with step 10/11 edits; build compiled clean.
- **Milestone:** React multichart panel fixes are now locally verifiable in seconds. Recipe in report (`?devMultichart=2v`, DEV LAYOUT overlay).
- **Next:** verify **T1 step 11 gear** in this fast loop (set the panel layout, click quick-bar gear → settings opens/stays). If green → deploy `20260713b6` (step 11) for PO live confirm. Then pivot Lane 1 to T2 broad sweep + T5.

### T1 step 11 VERIFIED in fast loop — deploying b6 (2026-07-13)
- **Report updated:** panel B route proof on `dev:live` (`?devMultichart=2v`): default ON → gear opens Rectangle settings in parent, stays open, Esc closes; kill-switch `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2=true` → gear inert. First multichart React fix verified locally before deploy (the tooling paying off). Switch coverage tightened: `TalariaV8bLive.jsx` + `drawing-tools-manager.js` (both trees) iframe `#tb-settings` gear honors the switch.
- **Manager re-running full `npm run gate`** (drawing-tools-manager.js now has T2 + step 11 engine edits) — result pending.
- **Deploy → `20260713b6`:** full multichart set (step 9 marquee, T2 step 1, step 10 settings-flash, step 11 gear; T0 step 6 dev-only stripped in prod). One server rebuild; PO confirms gear live = multichart done.

### b6 live — gear works on host tile A, NOT iframe panel B (2026-07-13)
- PO on b6 (screenshot): panel A (host tile) gear opens Trend Line settings; **panel B (iframe) gear does nothing.** Double-click works on panel B (step 10). So iframe→parent transport is fine; only the **iframe engine floating-toolbar gear** (`#tb-settings`) doesn't reach the parent open route. Step 11 verified panel B in fast loop, so either panel-B iframe is **stale** (L1 check requested) or a prod-vs-devloop embed difference.
- **First:** PO confirms both panels on b6 (rule out stale iframe). If confirmed and B still fails → dispatch **T1 step 12** (`worker-prompts/T1-step12-panelB-iframe-gear-route.md`): fix the engine iframe gear to route via `editDrawing()`→parent; reproduce+verify in fast loop (T0 step 6 iframe panel). Prompt staged.
- **Manager gate (T2+step11 tree):** PASS (exit 0, no new regressions, 6 tracked reds).
- **CONFIRMED real gap:** PO retested on fresh b6, both panels reloaded — panel B iframe gear still fails. Not stale. → **T1 step 12 dispatched** to Lane 1 (`worker-prompts/T1-step12-panelB-iframe-gear-route.md`): fix engine iframe `#tb-settings` gear to route via `editDrawing()`→parent; reproduce + verify in fast loop (T0 step 6 iframe panel) before deploy. Step 11 only covered the host-tile V9 quick-bar; the iframe runs the engine toolbar, which still doesn't reach the parent open route.

### 2.2 T3 step 0 (Lane 2) — **ACCEPTED** (checklist prep)
- Report: `worker-reports/T3-lane2-retest-triage-report.md`
- Checklist: `T3-RETEST-CHECKLIST.md` — **24 tickets** enumerated with repro scripts, hypothesis tags, L1 build-id procedure.
- Tags: 5 `LIKELY-FIXED-b105`, 10 `LIKELY-SURVIVES`, 5 `DEFER-T8`, plus 4 other (clarify/out-of-scope). No engine files edited.
- **PO action:** execute retests on **b105+** (build id on every frame). Hand Lane 2 worker `worker-prompts/T3-step1-parity-contract.md` immediately (anti-idle).

### 2.3 T4 step 1 (Lane 3) — **ACCEPTED** (pending gate confirmation)
- Report: `worker-reports/T4-lane3-order-entry-model-report.md`
- `computeOrderEntryAggregates` pure model behind `__TALARIA_DISABLE_ORDER_AGGREGATES_V2`. Build **b105 → b106**.
- **Manager independent re-run:** property tests RED (87 violations) / GREEN (0 violations) — matches worker report.
- **Gate:** **GREEN** — 31 scenarios (H-S2…H-S31 PASS; H-S32/H-S33 tracked known-failing); 0 regressions. Manager re-run confirmed (`exit 0`, ~9m).
- **Next:** dispatch T4 step 2 (display-threshold/parsing gated fixes) after gate confirms green.

### 2.4 T0 (Lane 4) — **ACCEPTED**
- Report: `T0-LANE4-REPORT.md`
- `PER-BUG-REGISTRY.csv`: **936 rows** (133 hand-read from 9 long threads + 803 auto-split). RC breakdown led by RC-1 (341).
- Harness: `interactive-helpers.mjs` + **H-S32** (first-click-fails) + **H-S33** (ghost-after-delete) — both RED ×3, tracked in `known-failing.json`. Gate **GREEN** 29→31, 0 regressions (per worker log `gate-t0-evidence.txt`). All 7 harness pairs byte-identical.
- **Feeds T1:** H-S32/H-S33 are the T1 implementation acceptance contract once ESC-001 is approved.
- **Lane 4 next:** draft RED family suites for stuck-until-click (RC-2) and multichart-parity (RC-4) — dispatch when PO ready to keep Lane 4 busy.

### 2.5 Awaiting
- **Worker 2 (Lane 1):** T1 step 3 implementation — hand `worker-prompts/T1-step3-lifecycle-impl.md`.
- **PO retest results** for `T3-RETEST-CHECKLIST.md` (24 rows on b105+).
- **Lane 2:** Worker 3 on `T3-step1-parity-contract.md`.
- **Lane 3:** T4 step 2 dispatch when PO confirms.
- **Lane 4:** next harness family suites when ready.

### DAILY-INTAKE 2026-07-13 — 28 tickets triaged by Director; plan amended (2026-07-13)
- **Director already folded the plan changes into `TRACKS.md` directly:** A1 → T2 §3 (axis label/gesture sub-task); A2 → T3 rows 13–14 + row 15 (symbol-sync) + Row 11 reopened + TAL-01564 SW-hygiene queued to Lane 2; A3 → T4 §4 (replay tick/candle mode + interval cadence diagnostic, TAL-01582/01581); T8 §4 → 8 IN-PLAN evidence rows into the policy table. No new lanes, no new tracks.
- **Director's #1 sequencing order for the Manager:** do NOT fan out 28 tasks. Land T1 recovery (fallback-B + steps 9–12 — done through step 12 dispatch), rebuild, then **burn down the instability-window retest list before dispatching anything new.** ~1/3 of the batch are photographs of the b6–b8 window and may already be gone.
- **Manager actions taken:**
  1. Created `INTAKE-RETEST-2026-07-13.md` — focused PO retest list (7 retest-first tickets: TAL-01569, 01584, 01570, 01568, 01578, 01579, 01587) on the current stable build, L1 build-id discipline. Only PERSISTS rows become tasks; GONE rows close by P5 confirmation.
  2. Added parity-checklist **observation row O1** for TAL-01567 (GAP-RENDER panning brightness/LOD) — evidence capture, not a task, per Director.
- **Dispatch freeze until retest returns:** no new intake-derived worker prompts (A1 waits on T1 recovery + Lane 1; A2 rows wait on Director-approved owners via Lane 2 contract; A3 waits on Lane 3 clearing T4). In-flight T1 step 12 (panel B iframe gear) continues.
- **UI-polish batch (not lane tasks this week):** TAL-01576 (add-layout menu flash), TAL-01580 (EU news flag asset). GAP-PERF TAL-01561 deferred to post-plan-2 render-budget phase.

### T1 step 12 (Lane 1) — in progress; timing-sensitivity flag raised (2026-07-14)
- **Worker 1 status:** patched path *can* recover the iframe toolbar and the `#tb-settings` gear becomes visible; earlier click-proof sampled too early in the rescue/re-render window, so it's re-running the proof with a longer wait after selection before reading/clicking the gear.
- **Manager caution (relayed to PO):** a fix that only proves green with an *inflated artificial wait* risks masking a race, not fixing it. Acceptance for step 12 requires BOTH: (a) the gear is present+clickable on **real user-interaction timing** (select → click gear as a user would, no artificial delay), deterministic across repeated runs; and (b) if any wait is truly needed, it's because the fix **deterministically completes the rescue/re-render before exposing the gear** (e.g. gated on a render/settle signal), not a fixed sleep that happens to be long enough. A fixed-sleep-only green is a RED (race) per the harness contract.
- **Not yet accepted / not deployed.** Awaiting the re-run proof + fast-loop verification (T0 step 6 iframe panel) before any b7 deploy and PO live confirm via the parity checklist.

### Worker model change → reporting standard enforced (2026-07-14)
- Workers moved GPT-5.5 → Composer 2.5; reports came back noticeably terser, raising the risk of silent gaps (untested paths, skipped invariants, unproven "green").
- **Created `WORKER-REPORT-STANDARD.md`** — mandatory 8-section report template (files-touched file-by-file, kill-switch coverage, RED→GREEN proof with determinism/pass-count, invariants checked, explicit "what I did NOT do", live-verification handoff, status). **Every worker prompt from now cites it; a report missing sections 2/4/6 is bounced, not accepted.** Manager will not infer success from a short "done".

### Full-capacity lane allocation — conflict-free (2026-07-14)
- **Ownership rule that prevents conflicts:** Lane 1 is the **sole editor** of drawing/lifecycle/engine-chrome + React quick-bar files (`drawing-tools-manager.js`, `drawing-tools-base.js`, engine, `TalariaV8bLive.jsx` quick-bar). No other lane edits those. Each other lane works a disjoint file set:
  - **Lane 1 (bottleneck):** T1 step 12 (in flight) → intake retest fixes (only PERSISTS rows) → T2 broad sweep + A1 axis → T5 → T6. Never idle; do NOT parallelize engine edits onto another lane (that caused the b6–b8 mess).
  - **Lane 2:** T3 parity contract (`T3-step1-parity-contract.md`, doc phase → no code conflict) + draft new rows 13/14/15; queue TAL-01564 SW-hygiene (self-contained `sw.js`/version-check — disjoint from Lane 1). Then T3 impl (sequence React shell edits after Lane 1's quick-bar work lands to avoid React-file overlap), then T8.
  - **Lane 3 (freest):** finish any open T4 step → **A3 replay-mode/cadence diagnostic dispatched** (`A3-lane3-replay-mode-cadence-diagnostic.md`). Fully isolated (replay/order-entry subsystem).
  - **Lane 4:** finish T0 step 6 → **RC-4 multichart-parity RED harness family dispatched** (`T0-step7-lane4-rc4-multichart-parity-family.md`). Harness files only — feeds T3 acceptance ahead of Lane 2 impl.
- **Result:** all 4 lanes have live, non-overlapping work; the only serialization is intentional (engine single-ownership + React-file sequencing between Lane 1 and Lane 2).

### T3 step 1 (Lane 2) — ACCEPTED; escalated for ratification (2026-07-14)
- Worker 2 delivered `T3-INTERACTION-PARITY-CONTRACT.md` (15 rows, was 12) + report per WORKER-REPORT-STANDARD. Docs-only, confirmed no engine/React edits, legacy `multichart/` untouched. Report quality good (first full-standard report from Composer 2.5 — the template is working).
- New rows 13 (layout persistence, TAL-01571), 14 (tile geometry, TAL-01574), 15 (symbol-sync converges, TAL-01586) each carry proposed owner + transport; row 11 updated with TAL-01587 reopen.
- **Correctly stopped at P4** (DIAGNOSTIC-ONLY, no fix scenarios) pending Director approval — same process as rows 1–12. **Filed ESC-007** (approve owner/transport + resolve 2 open Qs: row-13 storage-key vs extend blob; row-15 focused-panel vs host-A). Manager recs: extend existing blob (single persistence owner); focused-panel as source.
- **Lane 2 not idle:** proceeding to TAL-01564 SW-hygiene (standalone RED-first) while ESC-007 is pending. T3 step-2 RED scenarios for rows 13–15 wait on the ruling.

### A3 diagnostic (Lane 3) — ACCEPTED; escalated for fix authorization (2026-07-14)
- Report `worker-reports/A3-lane3-replay-mode-cadence-diagnostic-report.md`, per standard, diagnostic-only, mirror byte-identical, traced `20260712b8`. Root cause: replay **interval ownership split across three stale layers** (V9 slider writes dead `_replayIntervalRawCandles`; canonical `setStepTimeframe`/`stepTimeframeOverride` only used by multichart sync; hidden-select change handler is a no-op). Two separate mechanisms → two fix tasks.
- **Filed ESC-008:** authorize 2 gated fixes (`__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING`, `__TALARIA_FIX_REPLAY_INTERVAL_CADENCE`) + rule the TAL-01582 behavioral fork (allow tick+interval [rec] vs force candle + sync UI). Fix (b) is pure correctness (no fork) → lands first; fix (a) after ruling.
- **Lane 3 not idle:** dispatched **A3 step 2** (`worker-prompts/A3-step2-lane3-replay-mode-cadence-harness.md`) — RED-first replay-mode/cadence harness scenarios, ruling-independent, becomes the fix acceptance contract.

### D-008 (ESC-007) applied + T1 step 12 & T0 step 7 ACCEPTED (2026-07-14)
- **D-008:** all Manager recs accepted. Rows 13–15 ratified. Row 13 = **extend `chart_panel_state` blob** (structure-only; defensive hydrate — corrupt `layout` field falls back to single-chart silently; RED must include the corrupt-value cell). Row 15 = **focused panel** source, **false→true toggle edge only** (boot-ON / panel-added-while-ON out of scope; mid-load fallback worker-chosen + state-matrix'd; fan-out via existing `runCommand('loadFile')`). I13 binding on all three (React kill-switches + parity-checklist row each). Sequencing: RED scenarios now; fixes after TAL-01564, by evidence readiness (row 14 needs TAL-01574 layout reproduced first).
- **T1 step 12 — ACCEPTED (proven), NEEDS-LIVE-CONFIRM.** Real root fix (iframe `origShow` + rAF **settle-signal** `talaria:iframe-toolbar-gear-ready`, not a fixed sleep) → **10/10 deterministic** on real click timing; switch OFF RED; SHA256 match both engine trees; focused gate reds unchanged (H-S44 pre-existing). Gated files: `drawing-tools-manager.js` (both), `drawing-toolbar.js` (both), `TalariaV8bLive.jsx`. → **Manager bumps build `20260713b6`→`b7`; PO deploys + confirms live** (parity checklist: place+select on panel B iframe → immediate gear click → parent settings open+stay; Esc closes; switch OFF → inert). This is the last known multichart-panel gap — live-pass ≈ T1 multichart recovery complete.
- **T0 step 7 (Lane 4) — ACCEPTED.** RED-first RC-4 family **H-S45–H-S53** (6 real: TAL-01495/01498/01499/01500-01501/01491+01587/01484+01490; 3 stubs H-S51/52/53 = rows 13/14/15). RED ×3, gate GREEN (44 pass + 15 tracked-red = 59 registered), harness mirrors byte-identical. Feeds T3 acceptance directly; Lane 2 replaces the H-S51–53 stubs with real assertions when it writes rows 13–15.

### Next dispatch (keep all lanes busy, conflict-free) — 2026-07-14
- **Lane 1:** step 12 deploying → bridge task **A1 axis diagnostic** (read-only, no edits, no conflict) while b7 deploys/confirms; then T2 broad sweep + A1 fixes once T1 recovery live-confirms.
- **Lane 2:** finish TAL-01564 → **T3 step 2 RED scenarios rows 13–15** (D-008 authorized), replacing Lane 4's H-S51–53 stubs.
- **Lane 3:** continue A3 step 2 harness; A3 fixes gated on ESC-008 (still pending Director).
- **Lane 4:** T0 step 7 done → **automated production-React parity harness** (D-006 ruling 4 durable version; H-S47/H-S49 exposed the missing parent-shell/MultichartGrid mount).

### TAL-01564 & T2 step 2 diagnostic ACCEPTED (2026-07-14)
- **TAL-01564 — ACCEPTED (proven), NEEDS-LIVE-CONFIRM.** SW/version-reload hygiene: dismiss persisted in `sessionStorage` (`talaria_vr_dismissed_for`), `check()` serialized, dismiss cleared on version MATCH, 80ms settle before reload (kills the loop). Files: `talaria-version-reload.js` (both trees) + H-S22 extended; SW strategy untouched (security rule respected). Switch `__TALARIA_MC_DISABLE_VERSION_RELOAD_PROMPT` (default OFF=on). Gate GREEN. → **folds into the b7 deploy** with T1 step 12; PO confirms both on b7 (toast appears once → × → no re-nag same session; Reload → no immediate re-toast when versions match).
- **T2 step 2 (Lane 1) — ACCEPTED (diagnostic).** Four A1 defects mapped in `chart.js` (both trees), traced `20260712b1`, no edits. → **four gated fix tracks**: A `__TALARIA_..._AXIS_CLICK_TICK_INVALIDATION_FIX` (TAL-01565/01583 click label-shift, RC-2), B `..._AXIS_RIGHT_EDGE_TICK_ALIGN_FIX` (TAL-01565 half-hour tail, tick-math), C `..._CUSTOM_TF_TIME_ANCHOR_TICK_FIX` (TAL-01572 custom-TF drift, tick-math+UX), D `..._PRICE_LABEL_GESTURE_OWNERSHIP_FIX` (TAL-01566 drag leak, gesture ownership).
  - **Fix dispatch gated on T1 step 12 live-confirm** (D-006 discipline — no new stacked Lane-1 engine work until multichart recovery confirmed; A1 touches `chart.js`, disjoint from step-12 files, so no code conflict — this is sequencing discipline, not a merge conflict).
  - **Defect D needs a PO-stated spec (P6/D-007):** what should a vertical drag starting on the price label do — price-axis zoom, or nothing (never pan the chart body)? Fix D dispatches only with the PO's stated intent quoted. A/B/C are correctness fixes, no spec needed.
- **Lane 1 bridge (no idle):** T2 step-2 diagnostic done → next read-only bridge **T5 step 1 anchor inventory** (`worker-prompts/T5-step1-lane1-anchor-inventory-diagnostic.md`) — front-loads the T5 anchoring diagnostic while b7 deploys/confirms; T5 is Lane 1's post-T2 track.

### b7 live-confirm FAIL — T1 step 12 regression: duplicate toolbar + wrong gear (2026-07-14)
- PO on b7 (evidence `evidence/b7-double-toolbar-gear.png`): **two toolbars render at once** — top = old engine floating toolbar (its gear DOES open settings), bottom = current V9 quick-bar (its gear does NOTHING). Step 12's `_invokeIframeToolbarOrigShow`/`v9PreserveIframeEngineToolbarOnHide` **surfaced the old engine toolbar** (whose `#tb-settings` works) instead of wiring the current V9 quick-bar gear → duplicate bar + wrong gear works. Step 12's fast-loop 10/10 missed this because it asserted the gear-opens-settings outcome, not "exactly one toolbar / which toolbar."
- **Step 12 NOT live-accepted.** Redirected **Lane 1 to T1 step 13** (`worker-prompts/T1-step13-lane1-duplicate-toolbar-gear-fix.md`): exactly one toolbar (current V9), its gear opens parent settings without surfacing the old bar; single-chart unchanged (I5); same switch; 10× deterministic in fast loop; **parity checklist gains a "exactly one toolbar" assertion** so this can't regress silently again. T5 inventory bridge deferred (step 13 is higher priority — it's the live-blocking recovery item).
- **Open L1 question for PO:** confirm the build id was b7-with-step-12, and whether the double toolbar appears on single chart / host tile / iframe panel (scopes the I5 check).
- **TAL-01564** live-confirm still valid independently (different subsystem) — PO can confirm the reload-prompt fix separately.

### T1 step 13 — ACCEPTED (proven), NEEDS-LIVE-CONFIRM on b8 (2026-07-14)
- Root cause confirmed: step 12's `v9ShouldSkipLegacyDrawingToolbarShow()` returned false when fix ON → hooked `tb.show` still called `origShow` → legacy engine bar painted alongside the V9 quick-bar (and leaked into **single chart** — a step-12 I5 breach, now fixed). Step 13 reverts the origShow surfacing, suppresses the legacy toolbar whenever V9 owns UI, and routes the V9 gear via `grid.openDrawingSettingsForPanel(panelId,…)` (correct panel, not cross-frame `dm.editDrawing`).
- Proof: **20/20** deterministic (10 iframe + 10 single) on real click timing, settle-signal gated (`talaria:v9-quickbar-gear-ready`, no fixed sleep); switch OFF RED; I5 single-chart clean; SHA256 match both engine trees; H-S22 (TAL-01564) still PASS; H-S44 pre-existing red unchanged. Files: `drawing-tools-manager.js` (both), `drawing-toolbar.js` (both), `TalariaV8bLive.jsx`, same switch `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2`.
- **→ Manager bumps b7→`20260712b8`; PO deploys + confirms live** using parity rows incl. new **9b (exactly one toolbar)**: single chart AND panel B iframe → select drawing → one V9 bar → its gear opens+stays → Esc closes; plus TAL-01564 reload check. Live-pass = T1 multichart recovery complete.
- **Lane 1 → resumes T5 step 1 anchor inventory** bridge (deferred during step 13) while b8 deploys/confirms.

### b? multichart retest — panel B still shows OLD toolbar (2026-07-14)
- PO on multichart 2-panel (evidence `evidence/multichart-panelB-old-toolbar.png`): selecting a shape → panel A (host) shows the current V9 bar, **panel B (iframe) shows the OLD engine toolbar**. PO directive: **delete the old toolbar completely** + make the current bar's gear open settings exactly like the old gear.
- **BLOCKING L1 QUESTION before any new fix:** confirm the build id **on panel B's frame** (not just host). Step 13 (b8) targets this exact symptom (iframe legacy-toolbar suppression). If panel B is still on **b7/older**, this is the pre-step-13 symptom → **deploy b8 + retest** before writing step 14. Do NOT dispatch another fix against an unconfirmed/stale build (this L1 gap has cost multiple cycles).
- If b8 (step 13) is confirmed on panel B and the old bar persists live → step-13's dev:live fast-loop proof did not reproduce the real server iframe panel (recurring D-006 blind spot; report even noted build:live/Docker path not run). That escalates: stop accepting dev:live-only proofs for iframe-panel multichart; gate on real-product (build:live) verification and Lane 4's T0-step8 React-parity harness. Step 14 prompt to be written only after the build id is confirmed.

### CONFIRMED: b11 on host AND panel B, old toolbar persists → step 14 + ESC-009 (2026-07-14)
- PO confirmed `window.__TALARIA_CHART_BUILD_ID='20260712b11'` on host and panel B (cache cleared); panel B iframe **still shows the old engine toolbar**. So steps 11/12/13 all passed dev:live fast loop and all failed the real iframe panel. Not stale — a fast-loop fidelity failure.
- **Dispatched T1 step 14** (`worker-prompts/T1-step14-lane1-iframe-legacy-toolbar-kill-realproduct.md`): reliable in-iframe embed signal posted by the parent bridge (not parent globals, which aren't visible inside the real iframe) → delete `#drawing-toolbar` completely in panel iframes; wire V9 gear to settings; **acceptance = real built-product 10× proof + screenshot, NOT dev:live.** Same switch, I5 single-chart clean.
- **Filed ESC-009:** make real-product verification (build:live / T0-step8 React-parity harness) the acceptance gate for iframe-panel multichart fixes; dev:live green is necessary-not-sufficient. Recommend gating this family on T0-step8.
- Lane 1 → step 14 (drops the T5 bridge again; step 14 is live-blocking).

### D-010 (ESC-009) applied (2026-07-14)
- Recorded D-010; ESC-009 marked RESOLVED. Mechanism class confirmed: dev:live shares the parent JS context → parent-global fixes structurally can't cross a real iframe (explains all 3 burned cycles).
- **INVARIANTS I14 added:** parent↔iframe coordination = postMessage bridges only; parent globals/shared closures forbidden in panel-facing paths. Step 14's design is the sanctioned pattern; prior parent-global fixes re-checked when touched.
- **WORKER-REPORT-STANDARD §8 updated:** new status **DONE (dev only) — NEEDS-LIVE**; "DONE (proven)" for a parent↔iframe fix REQUIRES real built-product evidence (build id confirmed inside the panel iframe). **Manager bounces mislabeled reports** (2 of 3 lost cycles were mislabels).
- **Acceptance surface:** parent↔iframe fixes accept only on real built product (`build:live` + served), not dev:live. T0-step8 is the durable gate but **not** a hard serialization — step 14 accepts via manual real-built path now.
- **T0-step8 raised to Lane 4 top item** with hardened exit (real MultichartGrid, real separate-window iframes, build-id assert per panel, one regression scenario per burned fix: gear route / settings flash / marquee-in-panel). Prompt updated.

### T0 step 8 (Lane 4) — BOUNCED; rework dispatched as step 8b (2026-07-14)
- Report `T0-step8-react-parity-harness-report.md` built the harness on **dev:live** (`?devMultichart=2v`, same-JS-context mount) — the exact surface D-010 said cannot represent the parent↔iframe boundary. **Litmus failure: H-R12 (gear route) GREEN while that fix is confirmed broken live on b11** → the harness reproduces the blind spot instead of closing it. Also mislabeled "DONE (proven)" on dev-only evidence (bounced per report-standard §8 / D-010 ruling 4). RED click-rows are RED for the wrong reason (dev:live `dataLen=0` bar-load gap).
- **Dispatched T0 step 8b REWORK** (`worker-prompts/T0-step8b-lane4-real-iframe-parity-harness-REWORK.md`): drive the **real production embed in real `<iframe>` elements** (puppeteer multi-frame), assert build id **inside each panel iframe**, load real bar data. **Harness acceptance litmus: H-R12 must be RED on the current pre-step-14 build** and flip GREEN only after step 14 deploys — that transition proves boundary fidelity. Three burned-fix regression scenarios (gear route / settings-flash / marquee-in-panel) required. If real-iframe automation is infeasible, STOP and report — no dev:live fallback labeled green.

### T0 step 8b — ACCEPTED; is now the durable iframe-parity gate (2026-07-14)
- Faithful: real built `dist-v9` in real iframes (URL `dist-v9/index.html?mode=backtest&mcLayout=2v`), build id asserted **inside iframe B** (`b17`), real bars (`dataLen=2011`), I14 boundary verified (`__multichartGrid` invisible inside iframe). **Fidelity litmus met:** switch-OFF → `legacyVisible:true` inside panel B (harness goes RED when fix absent), H-R12 GREEN with step-14 code in tree. This is now the **durable gate (D-010 ruling 5)** for the iframe-panel fix family.
- **Harness validated step 14's mechanism:** H-R12 GREEN on b17 = the in-iframe-embed-signal approach works across a real iframe. (Step 14 still needs its own report + PO deploy/confirm on a real server build — b17 is local, PO is on b11.)
- **NEW confirmed defects surfaced by the faithful harness — same parent-global blind spot as the gear:**
  - **H-R13 settings-flash RED** on real iframe → step 10's fix doesn't hold across the real iframe panel.
  - **H-R14 marquee-in-panel RED** on real iframe → step 9's fix doesn't hold across the real iframe panel.
  - Both need re-fixing via the **I14 in-iframe-signal pattern** (like step 14). Queued as **Lane 1 step 15 (settings-flash iframe)** and **step 16 (marquee iframe)**, behind step 14; each accepted via this real-iframe harness (H-R13/H-R14 RED→GREEN) + PO real-build confirm. Prompts to be written when step 14 clears.
- Parity/click rows H-R01–09 still mostly RED on real iframe (hit-test fidelity) — tracked, not this task.

### T1 step 14 — ACCEPTED (proven on real built product) (2026-07-14)
- Correct I14 pattern: parent posts `setV9PanelEmbed` bridge cmd → iframe sets `__talariaV9PanelEmbed` + deletes legacy `#drawing-toolbar`; engine/React suppression keys off that flag (not parent globals). Files: `panel-cmd-bridge.js` (both), `MultichartGrid.jsx`, `drawing-toolbar.js` (both), `drawing-tools-manager.js` (both), `TalariaV8bLive.jsx`; switch `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2`.
- Proof: **10/10 on built `dist-v9`** real iframes, build id inside panel B (`b17`), screenshot `evidence/t1-step14-both-panels-v9-bar.png`; switch OFF → legacy returns (2/3, run-1 cold-boot flake); I5 host/single unchanged; SHA256 match. **Cross-corroborated** by 8b harness H-R12 GREEN. Correctly labeled DONE (proven) with real-built evidence.
- **Pre-deploy condition:** worker's full `npm run gate` was started but not confirmed complete — require gate-green confirmation before deploy (P1/I9).
- **Batching decision (fewer PO cycles):** 8b proved H-R13 (settings-flash) + H-R14 (marquee) also RED on real iframe. Rather than deploy step 14 alone then rebuild twice more, **queue steps 15 + 16 (same I14 flag pattern), verify all three GREEN on the 8b harness locally, then ONE combined deploy** (step 14+15+16), one PO confirm of all iframe behaviors. Step 14 alone is deploy-ready if PO wants immediate toolbar relief.
- **Dispatched Lane 1 steps 15 & 16** (`worker-prompts/T1-step15-lane1-iframe-settings-flash-I14.md`, `T1-step16-lane1-iframe-marquee-I14.md`) — each accepted via 8b harness RED→GREEN (H-R13/H-R14) + gate green.
- **Deploy id:** local build:live stamped `b17`; Manager coordinates a clean deploy id for the combined build (next after b11 PO baseline).

### T0 step 9 (Lane 4) — ACCEPTED; reveals broad panel-B interaction breakage → ESC-010 (2026-07-14)
- Faithful click/selection rows on real iframe (dist-v9 `b26`, real bars `dataLen=2011`). Verdicts on panel B: **GREEN** H-R02 (border), H-R03 (Ctrl-click); **RED** H-R01 (no parent V9 quick bar on panel-B select), H-R04 (dbl-click→settings), H-R05 (Esc leaves chrome selected), H-R06 (delete doesn't remove), H-R07 (peer isolation — both panels stay selected), H-R08 (panel-B marquee border inactive), H-R09 (panel-B chain broken). Registered **HR-PARITY#1–#8** in `PER-BUG-REGISTRY.csv`. Harness gate green (I9).
- **Interpretation:** these are not 7 independent bugs — H-R01 (parent V9 quick bar never appears for a panel-B selection) is likely the **root**; settings/Esc/delete/chain cascade from selection→parent-chrome routing being incomplete across the iframe boundary. This is RC-4 interaction parity (T3) intersecting the I14 boundary pattern (Lane 1). Firing off per-surface steps 17–22 would be symptom-patching — against the plan's core rule.
- **Filed ESC-010:** confirm the common root via one diagnostic, then decide per-surface (continue steps) vs **one consolidated panel-B interaction-parity fix** (T3-owned, I14 transport), with the HR-PARITY harness rows as the acceptance contract. Steps 15/16 (already dispatched, concrete H-R13/H-R14) continue meanwhile.
- **Lane 4 free** → dispatched CI wiring for `gate:react` (T0 step 10) to keep the real-iframe gate running automatically.

### D-011 (ESC-010) + D-009 (ESC-008) applied (2026-07-14)
- **CORRECTION:** prior "A3 fixes gated on ESC-008 (still pending)" note was STALE — ESC-008 was ruled D-009 earlier today. A3 replay fixes are authorized.
- **D-011 (ESC-010):** diagnostic-first + consolidated fix (b) pre-authorized. Dispatched **T3 step 4 (Lane 2)** `worker-prompts/T3-step4-lane2-panelB-interaction-root-diagnostic.md`:
  - **Step 0 mandatory:** fallback-posture A/B — b26 is fallback-B; re-run failing HR-PARITY rows with migration switches ON in-panel; failures that vanish = our own rollback (future re-migration scope, NOT defects now). Prevents "fixing our own revert."
  - Root confirm → consolidated fix, **scope-fenced to selection→parent-chrome routing**; T3/Lane 2 owns parent side, **Lane 1 supplies engine-side emit as a separate gated commit**. H-R07/H-R08 stay separate unless proven to collapse. Acceptance = HR-PARITY green on real-iframe harness + built-product parity checklist.
  - Steps 15/16 continue; per-surface beyond 16 held until this diagnostic returns.
- **D-009 (ESC-008):** dispatched **A3 step 3 (Lane 3)** `worker-prompts/A3-step3-lane3-replay-fixes.md` — Fix 1 cadence (`__TALARIA_FIX_REPLAY_INTERVAL_CADENCE`) FIRST, Fix 2 mode-routing (`__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING`) SECOND; fork ruled **(A)** tick persists + interval bounds step size + UI shows both. RED-first vs A3 step-2 scenarios; PO live confirm = Tick+4h → tick animation, 4h bounds. (Hand to Lane 3 when its A3 step-2 harness lands.)
- **Manager acceptance actions pending live:** combined 14/15/16 iframe deploy; A3 replay live confirm (Tick+4h); Defect-D price-label spec still needed for that A1 fix.

### A3 step 3 (Lane 3) — ACCEPTED (harness green); folded into combined deploy (2026-07-14)
- Both fixes on b33, disjoint switches: Fix 1 cadence `__TALARIA_FIX_REPLAY_INTERVAL_CADENCE` (V9 slider→`setStepTimeframe`, change handler wired, multichart broadcasts resolved interval, no double-step); Fix 2 mode-routing `__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING` (`_shouldUseTickAnimation` — tick persists with interval, ruling A). New harness H-S54–H-S57 all GREEN, switch-OFF RED (A/B proven); mirrors SHA256-identical.
- **Pre-deploy condition:** confirm full `npm run gate` green (report showed the 4 new scenarios, not the whole gate) — P1/I9.
- **Deploy plan:** replay files (`replay-system.js`) are disjoint from the iframe-toolbar files → **fold A3 into the combined build with T1 14/15/16**; one deploy, PO confirms iframe behaviors + replay (Tick+4h → tick animation w/ 4h bounds; candle+4h → consistent 240-bar buckets) in one pass. Two-switch separation already gives independent revert; commit-splitting is a deploy-time git step (not Manager-committed).
- **Lane 3 now free** (T4 + A3 essentially complete) → dispatched closure sweep `worker-prompts/T7-prep-lane3-orderentry-replay-closure-sweep.md` (verify every TAL-00752 + replay/A3 registry row is dispositioned against landed fixes — P5 prep feeding T7).

### Batch of 4 worker reports — all ACCEPTED; 3 cross-cutting findings (2026-07-14)
- **T1 step 15 (settings-flash):** H-R13 10/10 on built dist-v9 (`b44`), react-gate PASS, SHA match. **I13 caveat:** switch-OFF does not fully revert the postMessage settings-open path — tighten required (folded into Lane 1 step 17).
- **T1 step 16 (marquee):** H-R14 10/10, switch-OFF RED (clean revert), SHA match. ✅
- **T3 step 4 (panel-B root, Lane 2):** D-011 step-0 A/B done — **no row flips green with migration ON**, so remaining reds are real defects, not fallback-B rollback. **Root confirmed = H-R01** (panel-B selection didn't drive parent V9 chrome); consolidated routing fix `__TALARIA_DISABLE_MULTICHART_PANEL_SELECTION_CHROME_ROUTING_V3` (parent-side `MultichartGrid.jsx`+`TalariaV8bLive.jsx`; Lane-1 engine emit `notifyV9SelectionSync` pre-existing, not edited). H-R01/H-R04 RED→GREEN 10/10 on b44; switch reverts. **H-R05/06/07/08/09 proven INDEPENDENT** (Esc, Delete, peer-isolation, host-marquee). ✅
- **T0 step 10 (CI, Lane 4):** `gate:react` wired into `.github/workflows/multichart-harness.yml` as a separate job (I9 intact), pinned actions, no new deps. ✅ (no live CI-run URL — gh unavailable.)

**Cross-cutting findings requiring action:**
1. **known-failing.json BASELINE CONFLICT (deploy-critical):** parallel lanes diverged — step 10 CI baseline = 8 tracked-red (H-R01/04/14 still listed), but steps 15/16 + T3 step4 turned **H-R01/04/13/14 GREEN**. True post-combined state = **5 red (H-R05–H-R09)**. Stale baseline would let fixed rows silently regress → **Lane 4 reconciles before the gate is trusted.**
2. **T4 recalibrated DOWN:** closure sweep = **9/22 TAL-00752 closed, 2 needs-live-confirm, 11 still-open**. T4 ≈ 50%, not ~80%. 11 open rows grouped: parse/drag input (#8,#19), close/hit-target (#10,#20,#22), replay×order (#4,#5), preview color (#1,#13), preview-Y (#9), pending-limit SL (#11), cancel cleanup (#14), panel controls (#15).
3. **Panel-B remaining reds scoped as independent** → owners assigned below.

**Combined deploy (b44):** contains T1 14/15/16 + T3 routing V3. **Confirm A3 replay fixes (b33) are in b44** before deploy; reconcile baseline; full gate green → one deploy, PO confirms iframe + replay + order-entry batch (per T7-prep §7 live list).

### All 4 lanes re-dispatched (no idle) — 2026-07-14
- **Lane 1 → T1 step 17** (`worker-prompts/T1-step17-lane1-panelB-esc-delete-I14.md`): H-R05 Esc-deselect + H-R06 Delete over the bridge (I14) + **tighten step-15 switch to fully revert** (I13). Then A1 axis fixes + T5 (already diagnosed).
- **Lane 2 → T3 step 5** (`worker-prompts/T3-step5-lane2-peer-isolation-and-rows1315.md`): H-R07 peer isolation (contract row) + finish rows 13–15 RED scenarios (D-008).
- **Lane 3 → T4 step 8** (`worker-prompts/T4-step8-lane3-orderentry-remaining-families.md`): the 11 still-open TAL-00752 rows, grouped, RED-first.
- **Lane 4 → T0 step 11** (`worker-prompts/T0-step11-lane4-baseline-reconcile-ci.md`): reconcile known-failing baseline to the true combined state (H-R01/04/13/14 green; H-R05–09 red) + capture a real CI run.

### T1 step 17 (Lane 1) ACCEPTED with 2 required follow-ups + a process fix (2026-07-14)
- **Result:** H-R05 (Esc-deselect) + H-R06 (Delete) GREEN 10/10 on built dist-v9 (`b88`); `gate:react` PASS; switch-OFF reds H-R05/H-R06 (clean revert). Files touched: `drawing-tools-manager.js`, `keyboard-shortcuts.js`, `drawing-tools-ui.js`, `MultichartGrid.jsx`, `panel-cmd-bridge.js` — mirrored + SHA in both trees. ✅ behavior proven.
- **FOLLOW-UP 1 (blocks deploy): host gate not run.** Worker 1 ran only `gate:react`, NOT `npm run gate`. But the changed engine files (`drawing-tools-manager.js`, `keyboard-shortcuts.js`, `drawing-tools-ui.js` — esp. `deleteSelected()` now reads `selectedDrawings[]`, `deselectAll()` orphan-clear, Esc under blocked-settings) are **shared with single-chart**. I9 requires no host regression. → **Worker 1 must run `npm run gate` and confirm green before b88 ships.**
- **FOLLOW-UP 2 (I13 verifiability): H-R13 switch-OFF stays PASS.** Worker claims product settings-open path IS gated, but harness `readParentReactSettings` conflates V9 quick-bar shell text `"A"` with the settings modal, so switch-OFF revert of H-R13 is **unverifiable from the harness** — our recurring "harness can't see the product truth" blind spot. → hand to Lane 4 (harness owner) to disambiguate the probe so I13 revert is provable.
- **PROCESS FIX — single-owner baseline.** `known-failing.json` is now being edited by Lanes 1, 2, AND 4 in parallel → three divergent states this batch (step 10 said 8 red; T3 step4 said 5; step 17 says "H-R08 only"). This is a merge hazard and the source of the CI baseline conflict. **New rule (P-level): only Lane 4 (harness owner) edits `known-failing.json`. Other lanes report the row deltas they greened; Lane 4 reconciles.** Folded into T0 step 11 and future harness-touching prompts.

### T3 step 5 (Lane 2) ACCEPTED + DEPLOY HOLD for canonical combined build (2026-07-14)
- **Result:** H-R07 peer-isolation GREEN 10/10 (build b85), switch `__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1` OFF → RED. Rows 13–15 (H-S51 chart_panel_state persist per D-008, H-S52 geometry, H-S53 symbol converge) GREEN 10/10, switch-OFF RED for persist + converge. Both gates PASS. ✅
- **INTEGRATION HAZARD (deploy hold):** step 17 (Lane 1, b88) and step 5 (Lane 2, b85) BOTH edit `MultichartGrid.jsx`; plus `known-failing.json` touched by Lanes 1/2/4. Different build ids → cannot assume b88 contains step 5's peer-isolation + rows 13–15. **Do NOT deploy b88 blind.** Retracted the b88 green-light.
- **RESOLUTION:** Lane 4 (T0 step 11, already rebuilding) becomes the **integration owner**: rebuild on the fully-merged tree that must contain BOTH step 17 (Esc/Delete forwarders, `deleteSelectedDrawings`, `dismissActiveDrawingTool`) AND step 5 (`multichartPeerDeselect` V1) in `MultichartGrid.jsx`, plus T3-step4 routing V3, plus A3 replay. Run host `gate` + `gate:react` on that one build, reconcile baseline, report the single canonical build id. **User deploys that id — not b88.**

### T4 step 8 family 1 (Lane 3) ACCEPTED + integration freeze on multichart files (2026-07-14)
- **Result:** close/hit-target family #10 (✕ hit-pad + data-level ids), #20 (`_finalizeMultiEntryLevelRemove` keeps splitEntries/preview in sync), #22 (16px stacked-leg offsets). Switch `__TALARIA_DISABLE_ORDER_ENTRY_CLOSE_HITTARGET_FIX` (default ON). Property test GREEN + switch-OFF RED; H-S58 3/3 + switch-OFF RED. Build b53. ✅
- **Gate exit-1 was NOT a regression:** it was the H-S51/52/53 baseline divergence (Worker 3's older tree vs Worker 2's step-5 greens) — Lane 4 reconciles. Worker 3's own change added no regressions.
- **Family 1 folds into the canonical integration build** (order-manager files, disjoint from multichart). Worker 3's later families (#8/#19 parse-drag, etc.) land AFTER the snapshot → next deploy.
- **INTEGRATION FREEZE (until canonical build + deploy):** no lane edits the multichart/shared-React files (`MultichartGrid.jsx`, `TalariaV8bLive.jsx`, `drawing-tools-manager.js`, `keyboard-shortcuts.js`, `drawing-tools-ui.js`, `multichart-manager.js`, harness parity files) while Lane 4 snapshots. Order-entry (Lane 3) and read-only diagnostics are fine.
- **Anti-idle during freeze:** Workers 1 & 2 (both free) put on **read-only diagnostics** that produce no edits to frozen files → T5 anchoring diagnostic (Lane 1, RC-3) + T2 invalidation-contract diagnostic (Lane 2, RC-2). Implementation follows after deploy.

### T5 step 1 (Lane 1) diagnostic ACCEPTED → Phase 1 dispatched (freeze-safe) (2026-07-14)
- **Root (RC-3):** volume tools in `drawing-tools-advanced-volume.js` mutate `points[].x` from rounded bar index every render (anchored VWAP L525-534, fixed-range VP L1164-1178, anchored VP L2209-2212), undoing `_syncDrawingPointsFromTimestamps` (manager.js L11573-11624) → H-S40/41/42 RED. 8 divergences (D1-D8) tied to TAL-00322#11-17, TAL-00323#2/9/10/13/15, TAL-00157#4/#24, TAL-00271#9/10, TAL-01383.
- **Plan:** 6 phases, per-phase kill-switch (`__TALARIA_RC3_VOLUME_RENDER_RESOLVE` for Phase 1, etc.). Phase 5 (multichart parity, I14) = high-risk. H-S40/41/42 GREEN after Phase 1; proposed new H-S43-48.
- **Phase 1 dispatched as T5 step 2 (freeze-safe):** scoped to `drawing-tools-advanced-volume.js` only (+ read-only use of existing resolve helpers). **Forbidden to edit any frozen multichart file** incl. `drawing-tools-manager.js`; if Phase 1 needs manager.js, STOP + report (sequence after deploy). Gate-prove H-S40/41/42 GREEN + switch-OFF RED; report row-deltas to Lane 4 (do NOT edit known-failing.json).

### P0 REGRESSION — gear settings broken on BOTH panels (2026-07-14)
- **PO report:** the gear/settings button no longer opens the settings menu on **Panel A OR Panel B**. Panel A's gear previously WORKED → this is a regression introduced by recent combined changes.
- **Likely mechanism (to confirm via diagnostic):** T1 step 15 + step 17 gated the settings-open route (`postMultichartOpenDrawingSettings`, `openDrawingSettingsForPanel`) behind `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2`; step 17's I13 tighten touched these paths. Combined tree may have broken the gear→settings route for both surfaces.
- **Harness blind spot (validates ESC-009/D-010):** the H-R13 probe conflates the V9 quick-bar shell text with the settings modal, so the harness can show H-R13 GREEN while the gear is actually broken live. This is exactly why we require PO live-confirm — and why Lane 4's probe fix (T0 step 11) is urgent.
- **BLOCKS DEPLOY:** do NOT finalize the canonical deploy build until the gear route is fixed + verified on the real built product. Freeze stays.
- **Dispatched:** Lane 1 urgent `worker-prompts/T1-step18-lane1-gear-settings-regression.md` (reproduce on built product BOTH panels → root → fix → prove; coordinate H-R13 probe with Lane 4 so the harness can catch it). Awaiting PO build id + double-click isolation before worker begins repro.

### Daily intake absorbed — 2026-07-13 (28) + 2026-07-14 (5) (Director-triaged)
- Both batches already dispositioned by the Director in `DAILY-INTAKE.md`. No new lanes; everything rides existing tracks or is a small amendment. Manager sequencing (respecting D-012 critical path = Lane 4 harness rebuild + Lane 1 transport diagnostic — do NOT preempt):
  - **A5 / TAL-01590 (P1, independent-symbol replay FREEZE):** the standout. On the **data/replay path — NOT under D-012 freeze** → actionable now. Dispatched `worker-prompts/A5-lane2or3-independent-symbol-replay-freeze-diagnostic.md` (read-only diagnostic + one RED host scenario). Owner = next free plan-1-experienced lane (**Lane 2** after its T7 sweep, else Lane 3 after order-entry). Fix authorized only post-mechanism-report.
  - **A4 / TAL-01591 → T3 row 16 (interval-sync convergence):** Lane 2 drafts rows 15+16 together (same convergence mechanism, symbol|interval); Director approves owners. Folds into Lane 2's T3 contract work (post-freeze / when Lane 2 resumes T3).
  - **T3 row 14 scope clarified (TAL-01592 + TAL-01574):** acceptance now includes axis re-layout (price+time scale) on tile resize. Lane 2 T3 (post-freeze).
  - **TAL-01589 (visibility toggle stuck after Apply-default):** T1 lifecycle (visibility state) + T2 invalidation — cite in T1 visibility-migration acceptance; possible ghost-ref (ESC-001 finding 2) → stays T1.
  - **2026-07-13 rides:** T8 family (8 tickets), T1 step-8/lifecycle (TAL-01568/01570 + regressions TAL-01569/01584), T5 live-evidence (TAL-01585), T3 Row 11 reopen (TAL-01587), GAP-AXIS→T2 A1 (TAL-01565/01572/01566/01583), UI-polish batch (TAL-01576/01580). No dispatch now; ride owning tracks.
  - **TAL-01588 CLOSED** (PO fixed directly). **TAL-01564** reload-prompt hygiene = Lane 2 plan-1 queue (small, RED-first; not folded into T8).
- **Sequencing rule honored:** A5 is the only immediate new dispatch (P1, freeze-exempt). Everything else waits so Lane 4 (harness) + Lane 1 (transport) stay uninterrupted.

### T1 step 19 diagnostic + Lane 4 go-ahead (2026-07-14)
- **Lane 1 step 19 (DIAGNOSTIC-ONLY, prototypes staged on b105):** confirmed Esc+Delete+marquee are ONE transport family under `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2`.
  - **Esc/Delete root:** `isDrawingToolDismissKeyTarget` ignored `dm.selectedDrawing` (single-click path); iframe had no Delete capture. Prototype: widen dismiss-target + new `onDeleteDrawingKey` iframe capture. Staged, needs PO live-confirm.
  - **Objects Tree dup (PLAN2-FOUND#3):** dedupe keyed on panel-local `points.x` geometry (differs per tile) instead of stable `id`/`__syncId`. Prototype: id-first dedupe behind `__TALARIA_DISABLE_OBJECTS_TREE_MULTICHART_DEDUPE_V1`. Staged, needs PO live-confirm.
  - **Marquee:** no new patch — engine path (step-8/16) correct; failure is real-pointer delivery/measurement → resolved only by Lane 4 honest harness (real Ctrl+mouse at iframe coords) + PO confirm.
  - Built to **b105**; SHA256 for MultichartGrid.jsx / TalariaV8bLive.jsx / panel-cmd-bridge.js recorded. No harness/react-parity-lib edits (Lane 4 exclusive respected).
- **Lane 4 GO-AHEAD given for T0 step 14 build.** Instruction: build the honest harness on the CURRENT tree (which now includes Worker 1's b105 prototypes) so the honest baseline actually measures whether Esc/Delete/Objects-Tree now pass and reveals marquee's true state.
- **PO live-confirm available now on b105** (local or staging): settings (re-confirm) + Esc + Delete + Objects-Tree dedupe, per step-19 §7. Marquee waits for the honest harness.

### D-012 (resolves ESC-011) APPLIED — harness-first + I15 (2026-07-14)
- Applied D-012 + I15 across docs (report standard updated for I15; ESC-011 marked resolved). Retracted all "proven" multichart interaction rows.
- **Settings-open family already satisfies ruling #3:** T1 step 18 is the authorized consolidated fix, done the D-012 way (real mouse + honest probe), PO-confirmed 4/4 local. → needs a **staging** live-confirm (ruling #5), not re-work.
- **Dispatch per D-012:**
  - **Lane 4 → T0 step 14** (`worker-prompts/T0-step14-lane4-real-actuation-harness-BUILD.md`): implement the real cross-frame actuation harness from the step-13 spec; **exclusive owner of `react-parity-lib.mjs`**; remove all synthetic fallbacks; produce the honest RED baseline. Deliverable the Director expects.
  - **Lane 1 → T1 step 19** (`worker-prompts/T1-step19-lane1-esc-delete-marquee-transport-diagnostic.md`): diagnostic-first (read-only on the harness; may edit nothing that collides with Lane 4) — trace the Esc/Delete/marquee/objects-tree transport roots on the REAL product so fixes are ready when honest measurement exists. NOT allowed to touch `react-parity-lib.mjs` (Lane 4 exclusive).
- Freeze holds; multichart acceptance = PO live-confirm until honest harness exists.

### PO live-confirmed step 18 (trust restored) + new defect PLAN2-FOUND#3 (2026-07-14)
- **PO ran the local b97 spot-check: all 4 gear/settings rows PASS** (gear opens real settings on Panel A + Panel B, dbl-click stays open, one toolbar). The honest harness matched reality → **harness trust restored** for the settings path. Settings-open P0 is genuinely closed pending final deploy live-confirm.
- **New defect PLAN2-FOUND#3 (Objects Tree duplication):** in a 4-panel layout the right-panel Objects Tree lists the same shapes multiple times (repeated Brush 1/2/3 + Rectangle). Logged to registry. Mechanism guess: multichart drawing sync-bridge (peer mirror) adds each synced drawing to the shared Objects Tree once per panel rather than one deduped/panel-scoped entry (RC-4 peer sync; possible RC-2 list-invalidation overlap). **Owner: Lane 2** (multichart) — fold into the post-ESC-011 peer-sync/routing re-fix family; Lane 2 to include it in the current T7 multichart closure sweep disposition. Frozen territory → implementation after ruling.

### T1 step 18 (Lane 1) — settings-open ROOT fixed + HONESTLY verified (2026-07-14)
- **P0 resolved for the settings path.** Step-0 isolation confirmed BOTH gear + dbl-click broke on panels A AND B (only quick-bar shell appeared) — whole settings-open path, not just gear.
- **Root:** dismiss-guard race — `__v9DrawingSettingsOpenGuardUntil` set AFTER `__v9OpenDrawingSettings`, so peer-clear flash-closed settings; iframe bridge didn't pre-arm the parent guard or call the sync parent-open API; gear product path didn't resolve iframe selection / call the V9 hook.
- **Fix:** arm guard BEFORE open; iframe tries sync `__multichartOpenShapeSettings` then postMessage; gear calls `__v9OpenDrawingSettings` directly (`v9ResolveDrawingForGearClick`). Flash-fix + Esc/Delete preserved.
- **Proven with HONEST harness (real mouse gear click + `waitForParentDrawingSettingsOpen()` that REJECTS the quick-bar shell)** on b97: H-R12 (panel-B gear) 10/10, **H-R12A (panel-A gear, new) 10/10**, H-R13 (flash/dbl-click) 10/10, H-R05/H-R06 10/10. Switch-OFF: H-R12 reverts on B (expected). This is the first multichart interaction fix proven against a real-actuation + honest-assertion path — validates the ESC-011 approach.
- **Baseline action for Lane 4 (Worker 1 correctly did NOT edit it):** add H-R12A to expectedTests, drop H-R12 + H-R13 from `knownFailing`, re-run `gate:react`. **react-parity-lib.mjs is now FREE** (Worker 1 released it) → the collision block on Lane 4's real-actuation rebuild is cleared.
- **STILL untrusted / not done (do NOT call multichart done):**
  - **H-R05/H-R06 (Esc/Delete)** "pass" may still be on synthetic/proxy assertions (audit HIGH-risk) — need the honest real-actuation upgrade before trusted.
  - **H-R14 (marquee)** was NOT addressed in step 18 — still broken/untrusted.
  - **H-R04** (settings chain) not explicitly re-confirmed.
  - Minor I13: panel-A gear fix not gated by the multichart switch (switch-OFF still passes H-R12A) — host-side path; note, not blocking.
- **Deploy still frozen**; PO live-confirm of the settings fix recommended to close the trust loop (honest harness should now match the real product).

### T0 step 12 audit — the false-green disease is suite-wide (2026-07-14)
- Lane 4's honesty audit: even H-R01/H-R02/H-R03/H-R07 (I'd called "genuinely green") are **NOT trustworthy** — `selectDrawing`/`editDrawing` synthetic fallbacks, `toolbarVisible`/handle-count proxies, H-R04 only checks click dispatched. Host H-S32/H-S33 also proxy/synthetic.
- **No trustworthy automated multichart-interaction coverage exists right now.** PO live-confirm on the real product is the only reliable acceptance authority for multichart until the harness is rebuilt.
- Amended **ESC-011** (addendum + decision #5): recommend **harness-first** — Lane 4 rebuilds real cross-frame actuation (CDP `Input.dispatch*`) + real-state assertions, removing synthetic fallbacks; THEN Lane 1's fix proven against it + PO live-confirm.
- **react-parity-lib.mjs collision:** Lane 1 (step 18) and Lane 4 (rebuild) can't both edit it → sequenced. Lane 4 held on read-only real-actuation SPEC (T0 step 13) until ruling + file free.

### CRITICAL — multichart interaction fixes were FALSE-GREEN; ESC-011 filed (2026-07-14)
- **Lane 4 T0 step 11 (honest-probe reconcile) ACCEPTED as truth-telling** (not as acceptance). Fixed `readParentReactSettings` to stop counting the V9 quick-bar shell as "settings open". On the true combined build **b88** (verified to contain routing V3, peer V1, deleteSelectedDrawings, dismissActiveDrawingTool, A3, order-entry family 1):
  - **Genuinely GREEN:** H-R01 (select→chrome), H-R07 (peer isolation), H-R02, H-R03.
  - **Genuinely RED:** H-R04, H-R05 (Esc), H-R06 (Delete), H-R12 (gear→settings), H-R13 (dbl-click→settings), H-R14 (marquee), H-R08, H-R09.
- **The step 15/16/17 + T3-step4-settings "10/10 GREEN" proofs were false greens** — passed against a dishonest probe + synthetic in-iframe events. Corroborated by PO live test (gear broken both panels). This is the D-010/ESC-009 blind spot proven material.
- **b88 is NOT shippable.** Deploy stays frozen. Recommending live product stays on **fallback-B** (known-good) meanwhile.
- **Did NOT accept the 8-row baseline as "acceptable"** — it's an honest snapshot of brokenness. Gate "passing" with 6 supposed-fixes in known-failing ≠ acceptance.
- **Two fidelity gaps identified:** (1) probe — now fixed by Lane 4; (2) actuation — harness uses synthetic in-iframe events, not real mouse/keyboard → may still over-pass. ESC-011 requests real-event actuation.
- **Escalated as ESC-011** (P0 crossroads): re-verification mandate, shipping posture (fallback-B), consolidated settings-open-transport fix vs per-row, and real-event harness actuation. T1/T3 interaction status marked DOWN — only H-R01/H-R07 genuinely green.
- **Lane 1 P0 (T1 step 18)** re-dispatched to fix against the HONEST harness + real product (gear + dbl-click + re-verify Esc/Delete/marquee). Freeze holds.

### ESC-012 RESOLVED by D-014 → TAL-01590 fix dispatched (2026-07-15)
- **D-014:** policy table = T8 acceptance spec (3 cells carved out); independent×playing fix authorized as the **T8 priority**, may land ahead of the policy-v2 migration.
- **Dispatched Lane 2 `T8-step3-lane2-independent-symbol-play-advance-FIX.md`:** own-master play-advance (BL-10 analog) for independent-symbol panels, async catch-up demoted to data-missing fallback. Gated `__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE` (default fix ON). RED-first via **H-S59b** (extend `serve.mjs` to ≥2 distinct symbols + production-faithful tick-animation play; I15 asserts per-panel `replayTimestamp`/forming-bar advance, no panel frozen while peers move).
- **Lane 4 gate:** one written actuation sign-off required (review, not hand-off) before H-S59b is trusted — Lane 2 flags me when H-S59b is ready. Host harness only; no `react-parity-lib.mjs` collision.
- **Acceptance:** H-S59b RED→GREEN + kill-switch A/B + BL-10/11/12/13 family green + Lane 4 sign-off + **PO staging live-confirm** (deploy freeze unaffected).
- **Other cells routed per D-014:** BL-16/TAL-01578 → diagnostic-first (H-S78 pins); TAL-01579 → H-S73 pin then own diagnostic (behind the freeze fix in Lane 2 queue); TAL-01573 → RC-2/T2 cross-cut (registry row moves, table keeps pointer); TAL-01563 → documented-intentional, retest after the freeze fix.
- **Lane 2 sequence (D-014 ruling 5):** (i) H-S59b RED, (ii) fix→staging→PO confirm, (iii) H-S60–H-S78 coverage promotion in parallel, (iv) ratified-cell migration behind `__TALARIA_DISABLE_MIRROR_POLICY_V2`, (v) TAL-01579 diagnostic. TAL-01564 + T3 rows 13–16 stay behind these.

### T8 step 2 (Lane 2) policy-table + TAL-01590 root ACCEPTED → ESC-012 filed (2026-07-15)
- **Deliverable accepted:** `T8-MIRROR-POLICY-TABLE.md` — full adopt-data/X/Y matrix (TF relation × replay × sync), every cell cited to its shipping guard. This is D-013 step-2's design doc, A5 trace first.
- **TAL-01590 P1 root FOUND (policy gap):** no independent-symbol equivalent of BL-10 play-advance (`scheduleCoalescedSeek` gated on `isSameSymbolAsHost`). Independent panels rely on async mirror-frame catch-up; when fetch lags or the 3-strike breaker trips (`panel-cmd-bridge.js:1135–1143`) the panel **freezes at loaded edge 2.5s+** while host plays. Correct policy (own-master advance, BL-10 analog) **≠ shipped** → escalation, not silent fix.
- **Filed ESC-012:** requests (1) table approval → unblock step-3 migration behind `__TALARIA_DISABLE_MIRROR_POLICY_V2`; (2) authorize the independent×playing cell change (TAL-01590 fix, new switch `__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE`); (3) rulings on other escalation cells (BL-16 drag TAL-01578, snap-back TAL-01579) + two RC-2/cadence cross-cuts (TAL-01573, TAL-01563); (4) harness-fidelity flag — H-S59 doesn't reproduce the real freeze (`serve.mjs` one-symbol + synthetic seek); faithful RED `H-S59b` needs distinct-symbol panels + tick-animation actuation (overlaps Lane 4).
- **Intake rows mapped to cells:** TAL-01560/62/63/73/75/77/78/79 each land in a documented cell (see doc §3) — inputs to the table, closed by retest if the cell's policy explains them.
- **Lane 2 continues step 1 (coverage hardening H-S60–H-S78)** — no Director gate (encodes current behavior, product-safe). Migration (step 3) blocked on ESC-012 approval.

### D-013 absorbed — T8 pulled forward onto Lane 2, A5 folded in (2026-07-14)
- **PO priority directive (D-013):** synced-multichart replay is the worst felt UX; T8 lives on the data/X/Y replay-policy path (freeze-exempt), and D-012's interaction freeze idles the Lane 2 work that was ahead of T8. So **Lane 2 pivots from the T7-prep sweep to T8 NOW.**
- **A5/TAL-01590 is no longer a standalone dispatch** — D-013 folds it into T8 step 2 as the policy-table's **first mandatory input** (independent-symbol × playing cells specified from the freeze trace). Standalone A5 prompt superseded.
- **Dispatched Lane 2 (2 prompts, freeze-safe, no `react-parity-lib.mjs` collision):**
  - `T8-step1-lane2-coverage-hardening.md` — RED scenarios for the ~17 ungated replay/mirror kill-switches + BL-16 (plan's mandated "do this first"; edits `scenarios.mjs` only, gate stays green, I15 real-state asserts). No `known-failing.json` edits — reports rows to Lane 4.
  - `T8-step2-lane2-policy-table-design-A5-first.md` — READ-ONLY policy-table design (`T8-MIRROR-POLICY-TABLE.md`) with TAL-01590 trace FIRST, intake rows 60/62/63/73/75/77/78/79 mapped to cells, conflict/gap/freeze cells flagged as D-013-ruling-3 escalation candidates (ticket = evidence).
- **Priority inside Lane 2 (D-013 ruling 2):** T8 steps 1–2 + A5 ahead of TAL-01564 and T3 rows 13–16. Frozen T3 interaction rows stay frozen.
- **Deploy posture (D-013 ruling 3):** T8 builds ship to **staging** for PO synced-replay live-confirm while the D-012 freeze holds; lifting the freeze is a separate decision. Migration (step 3) only after Director approves the table.
- **Unchanged:** Lane 4 = honest-harness rebuild (D-012 critical path); Lane 1 = settings-transport diagnostic/fix; Lane 3 = A3 replay fixes (D-009). Nothing D-012-critical preempted.

### T2 step 3 (Lane 2) diagnostic ACCEPTED (2026-07-14)
- **Root gaps (RC-2):** peer drawing ADD (`sync-bridge.js` L1874-1879 — `redrawAll` only, no `chart.render()`), peer drawing REMOVE (`chart.js` ~L3755 `destroy()` w/o render), paused-replay step→peer (`replay-system.js` L6763-6768 iframe may not repaint), React SVG-only path (`TalariaV8bLive.jsx` L5766-5767 no canvas flush). Ties: TAL-01484/01490, H-S50. T2 step 1 already closed the single-chart save-invalidation hole (H-S38/39 green).
- **Fix plan T2-3a..d is POST-FREEZE** — all target frozen/iframe files (sync-bridge, replay-system, TalariaV8bLive) → I14 territory. New RED candidates proposed: H-S38-B/H-S39-B (panel-B style commit), peer-delete ghost, H-R50 (built-product replay step).
- **Lane 2 anti-idle (freeze-safe):** dispatched **T7-prep multichart closure sweep** (read-only registry disposition of the multichart/drawing ticket family vs T1/T3 landed fixes) — parallels Lane 3's order-entry sweep, feeds T7.

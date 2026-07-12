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

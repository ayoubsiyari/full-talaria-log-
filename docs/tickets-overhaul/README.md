# Tickets Overhaul — Director Plan

**Mission:** close the 812-ticket QA history by fixing the seven root causes behind it (`ROOT-CAUSES.md`), not by re-patching symptoms. Success is defined at the end of this file; nothing closes without meeting it.

This runs the same operating model that closed the multichart data overhaul (`docs/multichart-overhaul/`): Director rules on scope and escalations, the Manager triages, dispatches, and verifies, workers implement exactly one gated task each. The discipline that made it work is kept; the inefficiencies we learned about are corrected up front (see "Standing corrections" below).

## Documents

| File | Purpose |
|---|---|
| `TICKET-ANALYSIS.md` | The data: clusters, cross-cutting symptom patterns, reopen loops |
| `ROOT-CAUSES.md` | RC-1 … RC-7 with evidence and fix direction — the contract for all work |
| `TICKET-REGISTRY.csv` | All 812 tickets with cluster assignment, status, reopen flag |
| `INVARIANTS.md` | Non-negotiable rules injected into every worker prompt |
| `TRACKS.md` | The work, phased and parallelized, with team assignment |
| `MANAGER-FINDINGS.md` | Manager's running log (created by manager) |
| `MANAGER-ESCALATIONS.md` | Escalations to Director (created by manager) |
| `DIRECTOR-DECISIONS.md` | Director rulings ledger (created as rulings occur) |

## Operating model (proven, with corrections)

**Kept from the multichart overhaul:**
- RED-first: no fix without a failing, deterministic reproduction (harness scenario or scripted manual repro) that goes GREEN with the fix and RED with the kill-switch.
- One gated change per worker task, each behind a `window.__TALARIA_*` kill-switch, default ON, catalogued.
- Live-verified mechanism before design: a static code lead is a hypothesis until reproduced.
- State-matrix reporting for any fix touching shared state (which cells changed, which are untouched).
- Both engine trees (`chart v 1.4/chart/` and `homepage/public/chart/`) byte-identical after every change; build id bumped.
- Manager verifies worker output independently; workers never self-certify.

**Standing corrections (lessons from the multichart run — these are rules, not suggestions):**
1. **Fix-by-root-cause, not fix-by-ticket.** A worker task cites an RC and a symptom *family*; closing 1 task should close 10–40 tickets. Dispatching one worker per ticket is forbidden — that is the exact loop that produced this history.
2. **Scope freeze per track.** New defects found mid-track are logged to the registry and batched; they do not preempt the current task unless the Director rules them blocking. (This was D-048's lesson: reactive intake stretched a 95%-done task by a week.)
3. **Closure protocol from day one.** A ticket closes only when the tester confirms on a named build. `user_replied` is an SLA state with an owner, never a terminal state.
4. **Timebox diagnostics.** A diagnostic task returns in ≤1 worker-session with either a verified mechanism or a documented dead end + next probe. No open-ended investigation tasks.

## Team assembly

Same Manager, same worker pool, expanded to **4 parallel lanes** (the tracks are chosen to not share code paths — see `TRACKS.md` for the dependency map):

- **Lane 1 (heaviest):** RC-1 + RC-2 — shared tool lifecycle & invalidation contract. One senior worker sequence; this lane is long-lived and everything in the drawing/indicator clusters depends on it.
- **Lane 2:** RC-4 — multichart interaction parity. Independent of Lane 1 until the parity contract adopts the shared lifecycle (Phase C).
- **Lane 3:** RC-5 — order-entry state model. Fully independent module (`order-manager.js`).
- **Lane 4:** RC-7 — harness extension + per-bug registry extraction. Starts first; other lanes consume its scenarios.

RC-3 (anchoring) queues behind Lane 1 in the same lane; RC-6 (indicators) queues behind Lane 1's controller landing. Adding more workers beyond 4 lanes does **not** add speed — the tracks would start colliding in `chart.js` and the drawing-tools modules; parallelism is bounded by code-path isolation, not headcount.

## Priority order (Director ruling, already made)

1. **Phase A — Foundation (Lane 4 + Lane 1 start):** per-bug registry, interactive harness scenarios for the top symptom families, then the shared lifecycle controller (RC-1) and invalidation contract (RC-2). This is where 60%+ of all tickets live.
2. **Phase B — Parallel tracks (Lanes 2, 3):** multichart interaction parity (RC-4) and order-entry state model (RC-5).
3. **Phase C — Convergence:** anchoring unification (RC-3), indicator lifecycle adoption (RC-6), then the backlog sweep: remaining unresolved tickets triaged against the landed root fixes — most should already be fixed; what remains gets targeted work.
4. **Phase D — Closure:** tester re-verification sweep of all 126 unresolved tickets on one named build, closure protocol executed, final report.

Journal/dashboard cluster (133 tickets) is explicitly **out of scope** for this overhaul — different codebase (`journal-backend`, homepage React), different team assignment later. The Director will not allow scope mixing.

## Success criteria (Definition of Done)

1. All four symptom-family harness suites GREEN and in the ratchet gate (first-click, stale-observer/ghost, invalidation, panel-parity).
2. The 126 unresolved tickets dispositioned: tester-confirmed-fixed on a named build, or explicitly deferred by Director ruling with reason.
3. Zero new per-tool patches for RC-1/RC-2 symptom families after the controller lands (enforced in review by the Manager).
4. Kill-switch inventory updated; both trees byte-identical; final state-matrix published in MANAGER-FINDINGS.

## How to start (Manager's first message)

Feed the Manager this folder in order: `README.md` → `TICKET-ANALYSIS.md` → `ROOT-CAUSES.md` → `INVARIANTS.md` → `TRACKS.md`. The Manager's first deliverable is **T0 in TRACKS.md** (per-bug registry + harness scaffolding dispatch), reported in `MANAGER-FINDINGS.md` §1.

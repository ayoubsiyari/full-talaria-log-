# A3 step 2 (Lane 3) — RED-first harness scenarios for replay mode/cadence

**Cold-start (read first if you are new to this repo):** self-contained NEW task, not a resumption. Read `docs/tickets-overhaul/INVARIANTS.md`, `docs/tickets-overhaul/WORKER-REPORT-STANDARD.md`, and the A3 diagnostic you're building on: `docs/tickets-overhaul/worker-reports/A3-lane3-replay-mode-cadence-diagnostic-report.md` (it names every owner file:line). Match the existing harness style in `chart v 1.4/chart/multichart-prod/harness/` (esp. `interactive-helpers.mjs`, `scenarios.mjs`, `known-failing.json`); the harness is mirrored into `homepage/public/chart/multichart-prod/harness/` — all copies byte-identical.

**Type:** harness/tooling only — **no engine, React, or `legacy-index.html` behavior edits.** This authors the RED acceptance scenarios the two A3 fix tasks (pending ESC-008 ruling) will turn GREEN. It does NOT depend on that ruling.
**RC:** RC-5 adjacent (amendment A3).
**Reporting:** follow `WORKER-REPORT-STANDARD.md` in full.

## Scenarios to add (RED-first — must FAIL today, proving the defect)
Tag each with its ticket. Use the diagnostic's console predicates as the assertion basis (no live browser needed if you drive `ReplaySystem` directly in the harness).
1. **TAL-01582 — tick mode must survive an explicit interval:** set `playbackMode='tick'`, set an explicit interval (`setStepTimeframe('4h')`), assert the play-routing predicate keeps tick animation (`getPlaybackMode()==='tick'` and the resolved routing does NOT silently fall to the candle loop). RED today.
2. **TAL-01582 — UI/behavior agreement:** assert that whatever routing `play()` picks, the reported mode label matches the actual loop (no "Tick" label while candle loop runs). RED today.
3. **TAL-01581 — deterministic step bars:** candle mode, display TF 4h, interval 4h, 1m master → assert `stepForward()` advances a consistent bucket every step (no mixed 1-bar/240-bar jumps). RED today.
4. **TAL-01581 — single interval owner:** assert `_resolveReplayStepTimeframe()` and the value the multichart sync path broadcasts agree (one owner), rather than hidden-select vs `stepTimeframeOverride` diverging. RED today.

## Requirements
- All new scenarios **RED ×3** (consistently failing) and registered in `known-failing.json` with their ticket ids, so the existing gate stays green (I9).
- Do **not** modify the 29 plan-1 scenarios or any engine/React/legacy behavior. Harness files only; keep all mirrored copies byte-identical.
- Each scenario documents the exact setup, the assertion, and the expected GREEN state a fix must reach.

## Deliverable
`docs/tickets-overhaul/worker-reports/A3-step2-replay-harness-report.md` — each scenario, its RED evidence (3× fail), the ticket it maps to, and the `known-failing.json` diff. These become the acceptance contract for the A3 fix tasks once ESC-008 is ruled.

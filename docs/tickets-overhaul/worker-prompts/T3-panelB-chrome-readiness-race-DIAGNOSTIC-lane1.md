# T3 — panel-B parent-chrome readiness race DIAGNOSTIC (Lane 1, READ-ONLY)

The combined-build bless is stalling on rotating flakes in panel-B chrome rows (H-R01 chrome-on-select, H-R04 settings, H-R05 Esc, H-R12 gear route) — even after the harness switched to a fresh browser per scenario. Question to answer: **is panel-B's parent chrome (V9 toolbar / gear / settings) readiness after panel selection DETERMINISTIC, or is there a real timing race in the product routing?** This decides whether the residual is a harness-wait problem (Lane 4) or a real product race (Lane 1 fix).

## Read-only trace (no edits)
Trace the panel-B selection → parent-chrome-ready path on build `20260716b10`:
1. When panel B is selected/focused, what's the sequence that makes the parent V9 toolbar + gear appear and become interactive? (`MultichartGrid.jsx` selection routing → `postMessage` bridge → parent chrome mount/bind.)
2. Is there a point where the chrome is **visually present but not yet bound** (gear click / settings dbl-click / Esc would no-op or race)? Any `setTimeout`/rAF/async gap between "panel selected" and "chrome ready"?
3. Does readiness depend on ordering that can vary run-to-run (message round-trip latency, effect ordering, focus-cache seed)?
4. Is there an observable, deterministic "chrome ready" signal the harness could wait on (a state flag / DOM attribute / event), or does none exist today?

## Deliverable
- Verdict: **HARNESS-TIMING** (chrome readiness IS deterministic; harness just needs to wait on the right signal — name it) **or REAL-RACE** (product readiness is genuinely non-deterministic — name the exact race + owning file/lines + whether it's P2 routing / P3 settings / bridge).
- If REAL-RACE: propose the minimal gated fix (own switch) + which HR rows it makes deterministic. Do NOT implement — diagnostic only.
- Name a concrete ready-signal the harness (Lane 4) can await, if one exists or could be cheaply exposed.

## Guardrails
READ-ONLY. No product/harness/registry edits. Scope: `MultichartGrid.jsx`, `panel-cmd-bridge.js`, `multichart-manager.js`, parent-chrome mount path. Disjoint from Lane 4's harness edits.

## Report
`docs/tickets-overhaul/worker-reports/T3-panelB-chrome-readiness-race-diagnostic-report.md` — verdict + evidence, ready-signal name, and (if real) minimal fix proposal + owning lane.

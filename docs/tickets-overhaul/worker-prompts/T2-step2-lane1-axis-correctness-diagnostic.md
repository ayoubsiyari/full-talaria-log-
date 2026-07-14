# T2 step 2 (Lane 1) — A1 axis label/gesture correctness DIAGNOSTIC (read-only bridge task)

**Cold-start (read first if you are new to this repo):** self-contained NEW task, not a resumption. Read `docs/tickets-overhaul/INVARIANTS.md`, `docs/tickets-overhaul/WORKER-REPORT-STANDARD.md`, and the T2 amendment A1 in `docs/tickets-overhaul/TRACKS.md` (§T2) + `docs/tickets-overhaul/DAILY-INTAKE.md` (amendment A1). The chart engine is **mirrored** across `chart v 1.4/chart/...` and `homepage/public/chart/...` (byte-identical) — but this is **diagnostic only, no edits**.

**Type:** DIAGNOSTIC ONLY — **report mechanism, do not change behavior.** This is a bridge task while T1 step 12 deploys/live-confirms; it sets up the A1 fixes so Lane 1 has zero idle time and the fixes land fast once T1 recovery is confirmed.
**RC:** RC-2 (invalidation/render-contract in shared axis chrome — amendment A1).
**Reporting:** follow `WORKER-REPORT-STANDARD.md` (diagnostic → §2/§3 = proposed, §4 = how you proved the mechanism, §6 limits, §8 DIAGNOSTIC-ONLY).

## The four A1 defects to diagnose (quote each ticket, P6)
1. **TAL-01565 / TAL-01583** — clicking the chart shifts the time label / changes the day; last gridlines wrong at half-hour intervals. Find the time-axis tick/label builder (`_buildTimeTicks` and callers) and why a click mutates label state / gridline placement.
2. **TAL-01572** — custom TF (e.g. 3m): time labels move with the crosshair instead of staying fixed. Find where custom-interval tick generation uses a different basis than native TFs.
3. **TAL-01566** — dragging the price label pulls the chart down. Find where the price-axis drag gesture leaks into chart pan (gesture ownership / event routing).
4. **TAL-01565 (gridline half)** — last-gridline interval correctness at half-hour intervals.

## What to deliver (no fixes)
For **each** defect: owner file(s) + line(s), the mechanism in 1–2 sentences, a reproduction trace, and a proposed **gated** fix shape (which `window.__TALARIA_*` switch + every file it would gate — one switch per fix per I3). Flag which of the four share a mechanism (one fix) vs are independent (separate gated fixes). Note any that are actually render-invalidation (RC-2) vs pure tick-math.

## Constraints
- **No behavior changes**; if you add temporary trace logging, confirm it is not committed.
- Stay in axis/render chrome — do **not** edit the drawing-lifecycle files T1 step 12 just touched (`drawing-tools-manager.js`, `drawing-toolbar.js`, `TalariaV8bLive.jsx`) while that fix is mid-deploy.
- L1: state the build id you traced on.

## Deliverable
`docs/tickets-overhaul/worker-reports/T2-step2-axis-correctness-diagnostic-report.md`. Once T1 step 12 live-confirms, the A1 gated fixes dispatch from this diagnostic (RED-first per symptom).

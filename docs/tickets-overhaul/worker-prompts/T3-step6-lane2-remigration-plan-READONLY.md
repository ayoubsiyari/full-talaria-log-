# T3 step 6 (Lane 2) — RC-1/RC-4 multichart interaction RE-MIGRATION plan (READ-ONLY)

## Why this now
Multichart interaction is on **fallback-B** (pre-worker behavior) and the **deploy freeze** is gated on this family being genuinely green. The honest cross-frame harness now exists (Lane 4: reactParity 13 expected / **12 known-failing** — real REDs). This is the moment to design the consolidated re-migration off fallback-B. **Read-only / plan only — no product edits, freeze holds.**

## Context to read first
- Lane 4 T0 step 16/17 honest-RED audit (the 12 reactParity rows: what each actuates + measures).
- D-011 (consolidated panel-B interaction fix pre-authorized; scope fence = selection→parent-chrome routing) and D-012 + I15 (real actuation + real end-state; harness-first acceptance).
- I14 (postMessage bridges only for parent↔iframe).
- The fallback-B disable report (`T1-fallbackB-disable-multichart-migration-report.md`).

## Deliverable — `docs/tickets-overhaul/T3-REMIGRATION-PLAN.md`
1. **Row→root map:** for each of the 12 RED reactParity rows, name the underlying mechanism (selection routing, settings-open transport, Esc/Delete over bridge, marquee, Objects-Tree dedupe, peer-isolation, etc.) and group rows that share one root.
2. **Phased plan:** a small number of phases (like T5's 6-phase model), each = the root it discharges, files touched, kill-switch name (covering React — I13), the honest RED it must turn green (I15/I14), and which fallback-B path it retires.
3. **Sequencing + collision map:** which phases touch `MultichartGrid.jsx` / `TalariaV8bLive.jsx` / `panel-cmd-bridge.js` and how to serialize them so parallel lanes don't collide (the earlier deploy-hold hazard). Note the RC-3 Phase 5 (multichart parity) that was parked here — fold it in.
4. **Acceptance + unfreeze criteria:** exactly what green state (honest harness rows + PO live-confirm list) lets us leave fallback-B and lift the deploy freeze.
5. **Escalation summary:** a tight paragraph I can hand to the Director to authorize execution (this is a re-touch of the code that broke before, so it needs a ruling).

## Guardrails
- READ-ONLY. No edits to product, harness, or `known-failing.json`.
- Don't re-litigate D-011/D-012 — build on them.

## Report — WORKER-REPORT-STANDARD.md
The plan doc + the Director-escalation summary paragraph.

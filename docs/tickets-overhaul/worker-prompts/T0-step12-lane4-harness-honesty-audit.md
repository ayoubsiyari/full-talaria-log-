# T0 step 12 (Lane 4) — harness honesty audit (find other false-greens) — READ-ONLY

## Why this task
You just proved the react-parity `readParentReactSettings` probe was **false-green** (counted the V9 quick-bar shell as "settings open"), which masked broken settings/Esc/Delete/marquee fixes until PO live test caught them (ESC-011). That is almost certainly not the only weak assertion. Before we trust ANY "GREEN" again, audit the whole harness for the same class of defect.

## Cold-start context
- Repo: `full-talaria-log--main`. Harness: `chart v 1.4/chart/multichart-prod/harness/` — host scenarios (`scenarios.mjs`, gate = `npm run gate`, rows `H-S*`) and react-parity (`react-parity-scenarios.mjs`, `react-parity-lib.mjs`, gate = `npm run gate:react`, rows `H-R*`). Two mirrored trees (I8).
- This is **READ-ONLY** — produce a report, no code/harness edits (Lane 1 is editing `react-parity-lib.mjs` for the P0 step 18; do not touch it).

## Two false-green patterns to hunt
1. **Proxy assertions:** a scenario asserts a *proxy* for success (DOM text like `"A"`, element `childElementCount > 0`, a class present) instead of the *real* product state (the actual modal visible, the drawing actually gone, the value actually recomputed). List every assertion that checks a proxy.
2. **Synthetic actuation that bypasses the real path:** scenarios that dispatch synthetic events (`handleKeyDown(...)`, synthetic `dblclick`, in-iframe `ctrlDragMarquee`, direct `selectDrawing()` fallbacks) rather than real user input. These can pass even when the real gear/click/key path is broken. List every synthetic-actuation use and whether a real-input path exists.

## Deliverable
Write `docs/tickets-overhaul/worker-reports/T0-step12-harness-honesty-audit-report.md`:
- **Table of every scenario** (H-S* and H-R*) × {what it actuates: real vs synthetic} × {what it asserts: real state vs proxy} × **false-green risk: HIGH / MED / LOW** + one-line reason + file:line.
- **HIGH-risk list** ranked — the rows most likely giving false confidence right now. Call out any currently-"GREEN" row whose green you would NOT trust.
- **Remediation plan** per HIGH row: what real assertion / real actuation it needs (this feeds the pending real-event-actuation task and any per-scenario tightening).
- **Cross-check:** for the rows currently GREEN on b88 (H-R01, H-R02, H-R03, H-R07) — are those greens trustworthy under the honest probe, or do they also lean on proxies/synthetic input?

## Guardrails
- READ-ONLY. No edits, no baseline changes, no builds required (static read of scenario code is enough; you may re-run a row only to confirm a suspicion, not to change anything).
- Do NOT touch `react-parity-lib.mjs` (Lane 1 has it for step 18).

## Report
Use `WORKER-REPORT-STANDARD.md`; sections 2 + 3 = "N/A — audit". Substance = the risk table + HIGH-risk ranking + remediation plan.

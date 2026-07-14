# T0 step 8 (Lane 4) — automated production-React parity harness

> **RAISED TO LANE 4'S TOP ITEM by D-010 (2026-07-14).** Hardened exit (all mandatory): drives the **real `MultichartGrid`**, uses **real separate-window iframes** (NOT a same-context dev mount — the whole point is to represent the parent↔iframe boundary that `dev:live` cannot), asserts the **build id inside each panel iframe**, and includes **one regression scenario per burned fix**: (i) iframe panel gear→settings route, (ii) multichart settings-flash, (iii) marquee-in-panel. This harness is the durable gate for the iframe-panel fix family so it can never ship on fast-loop green again. Per D-010 it is NOT a hard serialization — near-term fixes accept via the manual real-built path meanwhile — but it is your first priority.

**Cold-start (read first if you are new to this repo):** self-contained NEW task, not a resumption. Read `docs/tickets-overhaul/INVARIANTS.md`, `docs/tickets-overhaul/WORKER-REPORT-STANDARD.md`, `docs/tickets-overhaul/MULTICHART-PARITY-CHECKLIST.md` (the manual gate you are automating), and D-006 ruling 4 in `docs/tickets-overhaul/DIRECTOR-DECISIONS.md` (which authorized this). Look at the existing harness (`chart v 1.4/chart/multichart-prod/harness/`) and the `dev:live` mount work from T0 step 6 (React `MultichartGrid` under `talaria-design`, `?devMultichart=2v`). Harness trees are mirrored into `homepage/public/chart/multichart-prod/harness/` — keep all copies byte-identical.

**Type:** harness/tooling only — no engine or React product edits.
**RC:** RC-4 tooling. Closes the proven blind spot: the existing harness runs `multichart-manager.js`, NOT the live React `MultichartGrid`, so twice a harness-green fix broke the real product (D-006). T0 step 7's H-S47/H-S49 confirmed the harness lacks the parent-shell/MultichartGrid path.

## Goal
Stand up an **automated** parity check that drives the **real React `MultichartGrid`** (the `dev:live` mount from T0 step 6), so the `MULTICHART-PARITY-CHECKLIST.md` rows can run in CI/fast-loop instead of only by hand. Prove it by making at least the already-fixed behaviors GREEN on the React surface and the known-broken ones RED.

## Scope
1. **Boot the React multichart** headless (puppeteer against `npm run dev:live -- ?devMultichart=2v`, host + iframe panels), with build-id assertion on every frame (L1).
2. **Automate the parity-checklist selection rows** as scenarios against that surface: single-click select, blue border, Ctrl-click, settings open/stays, Esc close, delete-repaint, peer isolation, Ctrl+drag marquee, single→double-click chain — **run on host tile AND an iframe panel**.
3. **Wire the T1 step 12 result in:** the iframe panel-B gear → parent settings scenario should be GREEN on the React surface (it passed the fast-loop 10× proof); prove the automated harness agrees.
4. **Register** new React-parity scenarios in `known-failing.json` with ticket ids; RED-first for anything not yet fixed. Existing gate stays green (I9).

## Requirements
- No engine/React product edits — automation + harness scaffolding only (a minimal dev-only test hook in the mount is OK if it is behind a dev flag and does not ship; call it out per I13).
- Keep all mirrored harness copies byte-identical.
- Deterministic: gate any timing on a render/settle signal, never a fixed sleep (same rule that T1 step 12 followed).

## Deliverable
`docs/tickets-overhaul/worker-reports/T0-step8-react-parity-harness-report.md` — how the React surface is booted, the scenarios added, RED/GREEN per row (incl. the step-12 gear row GREEN), the `known-failing.json` diff, and what still needs manual PO confirmation vs is now automated. This becomes the durable acceptance gate for all future T1/T3 multichart work.

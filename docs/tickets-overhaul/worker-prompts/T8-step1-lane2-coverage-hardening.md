# T8 step 1 (Lane 2) — coverage hardening (RED scenarios for ungated kill-switches + BL-16)

## Authorization + why now
D-013 (PO priority directive) pulls **T8 forward, starting now on Lane 2**. T8 is on the **data/X/Y replay-policy path — NOT under the D-012 interaction freeze**, so it proceeds. This step is the plan's mandated **first** T8 action: harden the acceptance contract BEFORE any refactor. Zero product risk (adds tests only).

## Cold-start context
- Repo: `full-talaria-log--main`. Two mirrored trees (I8). Host harness: `chart v 1.4/chart/multichart-prod/harness/` — `scenarios.mjs`, `serve.mjs`, `known-failing.json`, gate = `npm run gate` (plan-1 29-scenario multichart replay/sync gate).
- Read: `TRACKS.md` T8 section, `ROOT-CAUSES.md` RC-8, `INVARIANTS.md` (I8/I9/I15).
- **File-collision rule (D-012):** you may edit `scenarios.mjs` and host harness files; you may **NOT** touch `react-parity-lib.mjs` or react-parity scenario files (Lane 4 exclusive). No `known-failing.json` edits — Lane 4 owns it; report new rows for them to track.

## Task
The mirror/replay subsystem has **~17 kill-switches with no dedicated harness coverage**, plus **BL-16** (T8 §3 debt item, specced "do this first"). Add RED-first host scenarios so every one of those switches has a scenario that (a) passes with the switch in its default state and (b) demonstrably flips when toggled — so the acceptance contract actually pins current behavior before the T8 refactor.

1. Enumerate the ungated `__TALARIA_*` replay/mirror switches (grep the engine + `sync-bridge.js` / `multichart-manager.js` / `replay-system.js`). List each + what behavior it guards.
2. For each, add a host scenario that asserts its **real** current behavior (I15: real state, not a proxy). It must fail if that behavior regresses.
3. Add the BL-16 scenario per the T8 §3 spec.
4. Run `npm run gate` — must stay green (I9); the new scenarios encode current behavior (green now), not desired-future behavior.

## Guardrails
- I8: mirror every harness change byte-identical to `homepage/public/chart/...`; SHA256.
- I9: do not regress the 29-scenario gate.
- I15: assert real end-state (playhead advanced, data adopted, viewport unchanged), not proxies.
- Zero product-code edits — scenarios only.

## Report — WORKER-REPORT-STANDARD.md (8 sections)
The switch→scenario coverage table, the new scenario ids + what each asserts (actuation + measurement per I15), `npm run gate` result, SHA256 both trees, and the list of new rows for Lane 4 to add to the baseline.

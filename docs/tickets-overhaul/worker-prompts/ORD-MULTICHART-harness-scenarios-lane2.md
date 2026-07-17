# Lane 2 (Worker 2) — MORNING TASK: honest RED harness scenarios for multichart-order parity

## Precondition
Read the three multichart-order diagnostics that should be complete by the time you pick this up:
- `docs/tickets-overhaul/worker-reports/ORD-MULTICHART-PARITY-diagnostic-report.md` (Lane 3 — panel-B lockout + dual-replay PnL stall)
- `docs/tickets-overhaul/worker-reports/ORD-DUP-DURATION-diagnostic-report.md` (subagent — trades duplication + wrong duration on refresh)
- `docs/tickets-overhaul/A6-4-HOST-CANONICAL-ORDER-STORE-DESIGN.md` (subagent — unifying architecture + freeze-safe interims)

## Task (spec/doc — do NOT edit `react-parity-lib.mjs`; Lane 4 owns it)
Define the honest RED harness scenarios that will serve as discriminators for the multichart-order fixes, so no fix is accepted without a named switch-OFF RED (per D-023 discriminator rule + I15 honest actuation).

Produce `docs/tickets-overhaul/T3-MULTICHART-ORDER-PARITY-HARNESS-SPEC.md` covering:
1. One RED scenario per symptom, each with a named discriminator:
   - **ORD-MC-LOCK** — 2 panels/2 tickers, set order on each; assert panel B can still open a NEW order after (fails when the stuck guard/routing bug is present).
   - **ORD-MC-PNL** — dual replay running; assert panel B PnL updates tick-for-tick (fails when the subscriber is dropped).
   - **ORD-MC-DUP** — set orders, refresh; assert trades panel row count == expected (no duplication).
   - **ORD-MC-DUR** — set order, refresh; assert duration/time column matches main-panel single-chart behavior.
2. For each: the exact actuation (real cross-frame input at true coords), the honest end-state probe (what the user sees, not a proxy), and the kill-switch it toggles for the switch-OFF RED.
3. A parity oracle: same action on a single main-panel chart must pass identically — the spec states the expected main-panel baseline for each.
4. File-ownership note: which scenarios need `react-parity-lib.mjs` hooks (hand to Lane 4) vs. host-harness only.

No harness-lib edits, no product code. Deliverable is the spec doc + a short note to the Manager on which lane implements each scenario.

# Invariants — injected verbatim into every worker prompt

These are non-negotiable. A worker that cannot satisfy one must STOP and report the conflict; it must never route around an invariant to go green.

## Correctness invariants

- **I1 — Root-cause routing.** Every fix task names the RC (from `ROOT-CAUSES.md`) it discharges and the symptom family it closes. If during work the mechanism turns out to belong to a different RC, stop and report; do not fix "while you're there."
- **I2 — RED first.** Before any code change: a deterministic failing reproduction (harness scenario preferred; scripted manual repro with exact steps otherwise). The fix must turn it GREEN, and the kill-switch must turn it RED again. A fix without a RED is not a fix.
- **I3 — One gated change.** One task = one mechanism = one kill-switch (`window.__TALARIA_*`, default ON = fix active). No drive-by refactors, no combined fixes.
- **I4 — Shared-layer fixes only for shared-layer symptoms.** The symptom families "first click fails", "stuck until click", "ghost after delete", "selection/menu desync", "label mis-anchor" are RC-1/RC-2/RC-3 defects. Fixing them inside an individual tool file is **forbidden** — that is the loop we are closing. If the shared controller doesn't exist yet in your task's area, the task is mis-scoped: stop and report.
- **I5 — No behavior change outside the named cells.** Any fix touching shared state ships with a state matrix: enumerate the operating cells (single chart / multichart panel, replay playing / paused / off, sync on / off where relevant) and mark exactly which cells change. Untouched cells must be verified untouched.
- **I6 — Anchors are timestamp+price.** New or modified drawing/annotation code must anchor by timestamp+price resolved through the shared resolve path. Introducing new bar-index or pixel anchors is forbidden.
- **I7 — Every state mutation ends in an invalidation.** Any setter that changes render-relevant state either schedules a render or carries a comment explaining which subsequent event repaints. "It repaints when the user clicks" is a bug, not an explanation.
- **I8 — Both engine trees byte-identical** (`chart v 1.4/chart/**` and `homepage/public/chart/**`) after every landed change; build id bumped; stale-tab guidance unchanged.
- **I9 — Preserve the multichart overhaul's green gate.** The existing harness ratchet (`chart v 1.4/chart/multichart-prod/harness/`) must stay green. A task that needs to change an existing scenario's assertion escalates first.
- **I10 — Security rules stand.** Nothing in `.cursor/rules/security-and-supply-chain.mdc` may be weakened to make a test or build pass. No new dependencies without explicit Manager approval and registry verification.

## Process invariants

- **P1 — Workers never self-certify.** Deliverable = diff + RED/GREEN evidence + state matrix + updated docs. The Manager independently re-runs the verification before accepting.
- **P2 — Timebox.** Diagnostics return within one session with a verified mechanism or a documented dead end + proposed next probe. Implementation tasks that discover their premise is wrong stop immediately (do not force a fake green).
- **P3 — Registry discipline.** New defects found during work are appended to the per-bug registry with the RC guess and left there. They are not fixed opportunistically.
- **P4 — Escalation path.** Scope changes, invariant conflicts, and premise failures go to `MANAGER-ESCALATIONS.md` → Director. Nothing else does; routine progress goes to `MANAGER-FINDINGS.md`.
- **P5 — Closure.** A ticket is closed only by tester confirmation on a named build, recorded in the registry. The Manager owns chasing `user_replied` states weekly.

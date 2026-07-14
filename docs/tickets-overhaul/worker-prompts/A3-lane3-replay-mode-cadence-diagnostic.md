# A3 (Lane 3) — Replay mode + interval-cadence ownership diagnostic

**Cold-start (read first if you are new to this repo):** this is a self-contained NEW task — you are not resuming anyone's half-done work. Before starting, read `docs/tickets-overhaul/INVARIANTS.md` (the non-negotiable rules) and `docs/tickets-overhaul/WORKER-REPORT-STANDARD.md` (how to report). The codebase has **mirrored chart trees** (`chart v 1.4/chart/...`, `homepage/public/chart/...`, `talaria-design/...`) that must stay byte-identical — but this task is diagnostic (no edits), so you only need to know which tree you traced in. Ask nothing back; produce the report deliverable at the path below.

**Type:** diagnostic only — **report mechanism before any fix.** Do not change behavior in this task.
**RC:** RC-5 adjacent (order×replay was T4; this is replay *mode/cadence selection*, a plan-2 gap folded in as amendment A3).
**Reporting:** follow `docs/tickets-overhaul/WORKER-REPORT-STANDARD.md` in full — this is a diagnostic, so sections 2/3 = "N/A, no edits", but sections 4 (how you proved the mechanism), 6 (limits), and 8 (DIAGNOSTIC-ONLY) are mandatory and must be specific.

## The two sibling defects
- **(a) TAL-01582:** in replay, **tick-by-tick** mode silently reverts to **candle-by-candle** when replay starts. User selects tick-by-tick; on play it behaves as candle-by-candle.
- **(b) TAL-01581:** in **candle-by-candle** mode with an **interval** selected (e.g. interval 4h while on the 4h TF), play misbehaves intermittently, and **step-forward** likewise.

## What to find (no fixes)
1. **Mode-selection owner:** where is the replay mode (tick vs candle) stored, and where is it read when replay starts? Name the file(s), the state field, and the read site.
2. **The override site for (a):** find the exact line where replay start resets/ignores the selected mode. Is it a default re-init on play, a stale read, or a mode value not persisted from the UI control? Prove it (log/trace).
3. **The cadence computation for (b):** how is the per-step advance amount computed when an interval is selected in candle mode? Identify where the interval feeds the step size and why step-forward / play becomes erratic (off-by-one? interval vs TF mismatch? non-deterministic timer?).
4. **Kill-switch surface:** name the switch the eventual fix would live behind and every file it would need to gate (so the fix task can be scoped cleanly).

## Deliverable
`docs/tickets-overhaul/worker-reports/A3-lane3-replay-mode-cadence-diagnostic-report.md` with, for **each** defect: owner file(s) + line(s), the mechanism (root cause in one or two sentences), a reproduction trace, and a proposed fix shape (not implemented). Flag if (a) and (b) share a single owner or are two separate mechanisms — that decides whether the fix is one task or two.

## Constraints
- **No behavior changes.** If you must add temporary logging to trace, note it in the report and confirm it's removed/not committed.
- Isolated to the replay/order-entry subsystem — do **not** touch drawing/lifecycle/engine-chrome files (those are Lane 1's; editing them causes cross-lane conflict).
- L1: verify on a known build id; state which build you traced on.

# Manager D — charter: trade-record correctness (opened 2026-07-29 13:10)

Fourth manager, opened by PO decision after the ticket-backlog audit
(`AUDIT-TICKET-BACKLOG-20260729-1300.md`) found two P0 trade-loss mechanisms with zero work.

## Why you exist

Three managers have spent two days on lag, memory and CPU. That work is real and mostly landing.
It also meant the defects where **users lose their trades** were never started. You are the answer
to that, and you are P0 from your first minute.

You are not a helper for A, B or C. You own a workstream they will not touch.

## Your territory — exact, and the reason for each boundary

WRITABLE:
- `chart v 1.4/chart/modules/order-manager.js`
- `chart v 1.4/chart/modules/propfirm-tracker.js`
- `chart v 1.4/chart/modules/drawing-tools-fibonacci.js`
- `chart v 1.4/chart/modules/drawing-tools-fib-gann.js`
- `chart v 1.4/chart/modules/drawing-tools-ui.js`
- your own tests and journal

READ-ONLY, AND YOU MAY NOT WRITE THESE:
- `chart v 1.4/chart/chart.js` — A holds it for FIX 1 and the leak kill
- `chart v 1.4/chart/modules/replay-system.js` — A holds it for M26 and FIX 3
- anything under `multichart-prod/` — A
- `api_server.py`, Dockerfile, deploy scripts — B
- gates and harnesses — C

If your fix requires `chart.js` or `replay-system.js`, **stop and escalate to me.** Do not write it,
do not stage it, do not "just add two lines." A collision in those two files corrupts the train and
costs more than your fix is worth. This boundary is the entire reason you got M24 and M14 and not
M23.

## Your two jobs, in order

### JOB 1 — M24: trade registration / ledger integrity (P0)

Ten reports, one mechanism. Users execute trades that never reach the journal, counters freeze, and
order IDs duplicate or skip.

| Report | Symptom |
|---|---|
| Rayan #4/#5/#9 | Two trades share Order ID #4; sequence skips; after refresh one of the two trades vanished |
| Rayan #11 | Executed trade with entry+SL markers on chart never registered in history; refresh doesn't help |
| TAL-01908 | 60+ trades executed, only last 42 recorded |
| TAL-01911 | Backtest trades missing from journal beyond 3 |
| TAL-01919 | Entered trades not counted in the trades total |
| TAL-01924 | Backtest counter stuck at 21 then 32 with ~40 trades; P&L frozen |
| TAL-01926 | NEW BUILD: all-trades stat frozen at 27 after refresh; history decrements |
| TAL-01927 | Duplicate trade screenshot after place→play→refresh (write not idempotent) |

Note the shape: duplicate IDs, skipped IDs, a frozen counter and a vanishing-on-refresh trade are
very likely **one** defect in how trade records are keyed and persisted, not eight. Find the key.
My hypothesis, which I want you to try to refute rather than confirm: trade identity is derived
from a counter or insertion order rather than a stable unique id, so concurrent writes collide and
a rehydrate overwrites rather than merges. Refute it if the code says otherwise.

TAL-01926 is the most valuable single row because it is one of only two tickets confirmed on the
NEW build. Start there — it is signal, not archaeology.

### JOB 2 — M14: Fibonacci settings do not apply (P1)

Four independent reporters (TAL-01930, TAL-01888, TAL-01813, and inside the TAL-01758 thread).
Edited fib levels are accepted in the dialog, then the chart reverts. This is the
highest-confidence recurrence in the entire 124-ticket intake and it is small.

Take it as soon as M24 has a diagnosis, or in parallel if you have a spare worker — it shares no
files with M24.

## Rules that bind you from minute one

- **GATE-01** — before a gate is trusted, show it RED on the real defect. A test that has never
  failed on broken code proves nothing. Demonstrated failure first, passing second.
- **HARNESS-01** — your harness may not touch real user data. B destroyed real trades this way.
  You are working on the trade ledger, so this is your highest personal risk. Use a disposable
  session.
- **SAFE-01** — a guard that runs after the dangerous action has begun is not a guard.
- **Kill-switch on every fix.** Named, defaulting to guard-on, flippable without a page reload
  (FLAG-02), and testable when the property is absent, not only when it is `false` (FLAG-01).
- **BRIEF-02** — anything you did not personally observe is written as a hypothesis, with the cost
  of refuting it named. Do not inherit my hypothesis above as fact.
- **PAR-01** — parallel is the default for your subagents. Serial needs a reason. Read-only work
  and disjoint writable sets run at the same time.
- **ID-01** (new, from today's audit) — never reuse a live mechanism identifier as a commit scope.
  `m23` and `m24` were already burned on unrelated memory and CPU work, which is precisely how this
  backlog went invisible for two days. Scope your commits `m24-ledger` and `m14-fib`.

## Reporting

Append-only journal, timestamped, `docs/plan3/journal-D.md`. Heartbeat to me with: what you proved,
what you refuted, what you need. Do not report activity — report findings. "I read order-manager.js"
is not a finding. "Trade identity is the array index, here is the line" is.

## What I owe you

Fast answers on escalation, and a clean handoff of M23 (replay rollback trade-state) the moment A
releases `replay-system.js`. M23 is yours by subject matter; it is A's only by file lock.

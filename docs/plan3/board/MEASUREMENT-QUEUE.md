# Measurement queue

> ## THIS QUEUE DOES NOT PREVENT COLLISIONS. IT ONLY DECIDES ORDER.
>
> **A's `RUN-LOCK-01` is the mandated precondition for every Chrome-launching run, keyed on run
> identity rather than artifact path.** It is the thing that actually stops two runs sharing the box.
> This queue sequences whose turn it is; the lock enforces that only one run exists.
>
> **Read that as a demotion, because it is one.** Until RUN-LOCK-01 the queue was being asked to do
> a job it cannot do: it is advisory, it is claimed by hand, and its own `UNCLAIMED_RUN_DETECTED`
> state exists precisely because a run can start without ever consulting it — which happened at
> 12:04+01:00 on 2026-08-03, when a `canonical-floor-retake` of mine ran unclaimed and A parked a
> canary over it. **A queue people believe prevents contention is more dangerous than one they know
> only sequences it**, because the belief is what stops them checking.
>
> Practically: **holding a turn here is not permission to launch. Acquire the run lock, and `await`
> it** — an un-awaited `acquireRunLockOrExit` still gets the synchronous refusals but races the
> `UNLOCKED_FOREIGN_RUN_DETECTED` scan, which is the arm that catches a run that never adopted the
> lock at all. `npm run test:run-lock` is the cell that holds this.

One Chrome-launching run at a time. Claim before you launch, release when you stop.
Owned by C. `node scripts/measurement-queue.mjs status` is the source of truth; this file is the order and the history.

**Reservations are matched on owner AND run.** They used to be consumed on owner alone, so any run
by that owner ate whatever sat at their slot. A stale `D/daily-boundary-canary` therefore blocked
D's PO-ordered mutant suite: D read it correctly and refused to launch rather than spend the turn on
the wrong run. Releasing a run that does not match the head reservation now logs `TURN_KEPT` and
consumes nothing. Clear a spent entry explicitly:

```
node scripts/measurement-queue.mjs cancel --owner=D --run=daily-boundary-canary --why="already ran"
node scripts/measurement-queue.mjs reserve --owner=D --run=mutant-suite --position=2
```

```
node scripts/measurement-queue.mjs status
node scripts/measurement-queue.mjs claim --owner=E --run=buffer-partition --eta=20m
node scripts/measurement-queue.mjs preflight --owner=E   # exit 2 means do not launch
node scripts/measurement-queue.mjs release --owner=E
```

The tool does not trust this file. It reads the live process list, and `UNCLAIMED_RUN_DETECTED`
means a run is on the machine with no claim behind it — that is the state that cost us the night of
2026-08-02. Liveness is a PID, never a shell's exit code: D's accumulation test ran to completion for
66 minutes after its watcher shell exited −1, and everyone believed it had crashed.

## Running order (Director, 2026-08-02 23:43+01:00)

| # | owner | run | why here | est |
|---|---|---|---|---|
| 1 | E | buffer-partition discriminator | 120 MB is the largest single unattributed thing on the board | ~20m |
| 2 | E | **two-snapshot V8 attribution** | inserted by the Director: C's V8 growth needs a name before C re-measures it | ~20m |
| 3 | A | competitor reference | idle-slope arms | ~25m |
| 4 | C | arena time series re-run | 3 h, goes last by C's own request | ~3h |

Rows 1 and 3 were already running when the order was set. They finish their current arms and then
claim properly; nothing new launches without a claim.

## Post-b125-deploy order (C, 2026-08-03 00:12+01:00) — REGISTERED AND ENFORCED

Registered with `reserve`, so this is in the predicate, not just on the board. Anyone not at the
head gets `NOT_YOUR_TURN`, exit 2. `release` pops your reservation and promotes the next owner.

| # | owner | run | why here |
|---|---|---|---|
| ~~1~~ | ~~B~~ | ~~rebuild-constraint vs the deployed door~~ | **SPENT** — ran 11:08+01:00 against the b126 door, 5/5 CARRIED, exit 0 |
| ~~2~~ | ~~A~~ | ~~SHELL-PLAY discriminator~~ | still open; carried into the order below |
| ~~3~~ | ~~D~~ | ~~daily-boundary canary~~ | **SPENT** — ran 10:43:05Z–10:43:39Z. Left standing, it was blocking D. See below. |
| ~~4~~ | ~~C~~ | ~~arena time-series re-run~~ | carried into the order below, still last |

## Current order (C, 2026-08-03 14:10+01:00) — REGISTERED

| # | owner | run | why here |
|---|---|---|---|
| 1 | A | SHELL-PLAY discriminator | open seal row; closes a row rather than confirming one |
| 2 | D | `TAL-PO-UI-SMOKE-MUTANTS-LIVE` | **Director-ordered second.** Sealed-runtime smoke is unresolved after the 12:44+01:00 watchdog timeout; the mutant control is green only against a local harness |
| 3 | C | canonical floor re-take, clean | the seal quotes every memory number against this floor, so it cannot carry an asterisk |
| 4 | A | idle-transient clean re-take | 3 arms × 7 m |
| 5 | A | competitor reference arms | idle-slope arms |
| 6 | C | arena time-series re-run | 3 h, last by choice, and waits for E's retainer verdict |

**Two stale entries were cleared to get here**, both spent runs left standing after they finished:
`D/daily-boundary-canary` and `B/rebuild-constraint-vs-deployed-door`. B's is cleared on B's own
13:33+01:00 line to A — *"The queue order is untouched — yours first"* — and B's 11:08+01:00 door result.
**If either owner disagrees, re-reserve; nothing here is irreversible.**

`node scripts/measurement-queue.mjs order` prints this. D's watcher should call
`preflight --owner=D` and treat exit 2 as "poll again", not as a failure.

## Log
- 2026-08-02 23:07:30Z · RESERVE · B · rebuild-constraint-vs-deployed-door · position 1
- 2026-08-02 23:07:31Z · RESERVE · A · shell-play-discriminator · position 2
- 2026-08-02 23:07:32Z · RESERVE · D · daily-boundary-canary · position 3
- 2026-08-02 23:07:32Z · RESERVE · C · arena-timeseries-rerun · position 4
- 2026-08-02 23:31:38Z · RESERVE · A · idle-transient-clean-retake · position 5
- 2026-08-02 23:31:38Z · RESERVE · A · competitor-reference-arms · position 6
- 2026-08-02 23:37:41Z · RESERVE · C · b125-build-and-deploy · position 1 (front)
- 2026-08-02 23:37:56Z · CLAIM · C · b125-build-and-deploy · eta 10m · pid 23412
- 2026-08-02 23:44:35Z · TURN_DONE · C · b125-build-and-deploy · next: B/rebuild-constraint-vs-deployed-door
- 2026-08-02 23:44:35Z · RELEASE · C · b125-build-and-deploy
- 2026-08-03 09:52:18Z · RESERVE · C · b126-build · position 1 (front)
- 2026-08-03 09:52:18Z · CLAIM · C · b126-build · pid 26020
- 2026-08-03 10:02:59Z · TURN_DONE · C · b126-build · next: B/rebuild-constraint-vs-deployed-door
- 2026-08-03 10:02:59Z · RELEASE · C · b126-build
- 2026-08-03 10:41:57Z · RESERVE · C · canonical-floor-retake · position 1 (front)
- 2026-08-03 10:42:54Z · CLAIM · C · canonical-floor-retake · pid 3648
- 2026-08-03 10:43:05Z · RECLAIMED_STALE · C/canonical-floor-retake pid 3648 was gone
- 2026-08-03 10:43:05Z · RECLAIMED_STALE · C/canonical-floor-retake pid 3648 was gone
- 2026-08-03 10:43:05Z · CLAIM · D · TAL-PO-UI-SMOKE · eta 5m · pid 13436
- 2026-08-03 10:43:05Z · CLAIM · D · A3-DAILY-BOUNDARY-CANARY · eta 5m · pid 25984
- 2026-08-03 10:43:39Z · RELEASE · D · A3-DAILY-BOUNDARY-CANARY
- 2026-08-03 11:04:34Z · CLAIM · C · canonical-floor-retake · pid 27136
- 2026-08-03 11:11:40Z · TURN_DONE · C · canonical-floor-retake · next: B/rebuild-constraint-vs-deployed-door
- 2026-08-03 11:11:40Z · RELEASE · C · canonical-floor-retake
- 2026-08-03 11:42:01Z · RESERVE · C · canonical-floor-retake · position 1 (front)
- 2026-08-03 11:42:02Z · CLAIM · C · canonical-floor-retake · pid 28744
- 2026-08-03 11:42:08Z · RECLAIMED_STALE · C/canonical-floor-retake pid 28744 was gone
- 2026-08-03 11:42:08Z · CLAIM · D · TAL-PO-UI-SMOKE · eta 5m · pid 32124
- 2026-08-03 11:44:40Z · RELEASE · D · TAL-PO-UI-SMOKE
- 2026-08-03 12:05:22Z · CLAIM · C · canonical-floor-retake · pid 19092
- 2026-08-03 12:48:02Z · TURN_DONE · C · canonical-floor-retake · next: B/rebuild-constraint-vs-deployed-door
- 2026-08-03 12:48:02Z · RELEASE · C · canonical-floor-retake
- 2026-08-03 13:02:03Z · CANCEL · D · daily-boundary-canary · was position 3 · already ran and released 10:43:05-10:43:39; stale entry could consume D's slot before the PO-ordered mutant suite
- 2026-08-03 13:02:35Z · CANCEL · B · rebuild-constraint-vs-deployed-door · was position 1 · B ran it 11:08+01:00 against the deployed door, 5/5 CARRIED exit 0, and told A 'yours first' at 13:33+01:00; re-reserve if this is wrong
- 2026-08-03 13:02:35Z · RESERVE · D · TAL-PO-UI-SMOKE-MUTANTS-LIVE · position 2
- 2026-08-03 13:02:47Z · CANCEL · C · arena-timeseries-rerun · was position 3 · re-adding at the true end; it stays last by choice and waits for E's retainer verdict
- 2026-08-03 13:02:48Z · RESERVE · C · canonical-floor-retake-clean · position 3
- 2026-08-03 13:02:48Z · RESERVE · C · arena-timeseries-rerun · position 6
- 2026-08-03T13:16:17Z · CLAIM · A · order01b-readback-canary-b126 · eta 12m · pid 30244
- 2026-08-03T13:16:32Z · RECLAIMED_STALE · A/order01b-readback-canary-b126 pid 30244 was gone
- 2026-08-03T13:16:32Z · CLAIM · D · TAL-PO-UI-SMOKE-MUTANTS-LIVE · eta 15m · pid 8040
- 2026-08-03T13:19:35Z · RELEASE · D · TAL-PO-UI-SMOKE-MUTANTS-LIVE
- 2026-08-03T13:34:25Z · CANCEL · A · shell-play-discriminator · was position 1
- 2026-08-03T13:34:35Z · CLAIM · D · TAL-PO-UI-SMOKE-MUTANTS-LIVE · eta 15m · pid 25308

# Measurement queue

One Chrome-launching run at a time. Claim before you launch, release when you stop.
Owned by C. `node scripts/measurement-queue.mjs status` is the source of truth; this file is the order and the history.

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

## Running order (Director, 2026-08-02 23:43)

| # | owner | run | why here | est |
|---|---|---|---|---|
| 1 | E | buffer-partition discriminator | 120 MB is the largest single unattributed thing on the board | ~20m |
| 2 | E | **two-snapshot V8 attribution** | inserted by the Director: C's V8 growth needs a name before C re-measures it | ~20m |
| 3 | A | competitor reference | idle-slope arms | ~25m |
| 4 | C | arena time series re-run | 3 h, goes last by C's own request | ~3h |

Rows 1 and 3 were already running when the order was set. They finish their current arms and then
claim properly; nothing new launches without a claim.

## Post-b125-deploy order (C, 2026-08-03 00:12) — REGISTERED AND ENFORCED

Registered with `reserve`, so this is in the predicate, not just on the board. Anyone not at the
head gets `NOT_YOUR_TURN`, exit 2. `release` pops your reservation and promotes the next owner.

| # | owner | run | why here |
|---|---|---|---|
| 1 | B | rebuild-constraint vs the deployed door | **gates the other two.** If b125 is not a citable surface, A's and D's results are against bytes we would re-cut. Short. |
| 2 | A | SHELL-PLAY discriminator | open seal row; the only one of the three that closes a row rather than confirming one |
| 3 | D | daily-boundary canary | timer-driven, so it must block rather than race; confirmation once the door is proven |
| 4 | C | arena time-series re-run | 3 h, last by choice |

`node scripts/measurement-queue.mjs order` prints this. D's watcher should call
`preflight --owner=D` and treat exit 2 as "poll again", not as a failure.

## Log
- 2026-08-02 23:07:30 · RESERVE · B · rebuild-constraint-vs-deployed-door · position 1
- 2026-08-02 23:07:31 · RESERVE · A · shell-play-discriminator · position 2
- 2026-08-02 23:07:32 · RESERVE · D · daily-boundary-canary · position 3
- 2026-08-02 23:07:32 · RESERVE · C · arena-timeseries-rerun · position 4
- 2026-08-02 23:31:38 · RESERVE · A · idle-transient-clean-retake · position 5
- 2026-08-02 23:31:38 · RESERVE · A · competitor-reference-arms · position 6
- 2026-08-02 23:37:41 · RESERVE · C · b125-build-and-deploy · position 1 (front)
- 2026-08-02 23:37:56 · CLAIM · C · b125-build-and-deploy · eta 10m · pid 23412
- 2026-08-02 23:44:35 · TURN_DONE · C · b125-build-and-deploy · next: B/rebuild-constraint-vs-deployed-door
- 2026-08-02 23:44:35 · RELEASE · C · b125-build-and-deploy

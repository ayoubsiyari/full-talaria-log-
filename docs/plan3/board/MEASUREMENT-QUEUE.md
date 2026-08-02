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

## Log

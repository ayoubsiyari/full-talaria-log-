# Plan 3 Live Board — moved

**This file is a stub. The board now lives in [`docs/plan3/board/`](./board/), one
append-only file per writer.**

| Lane | File |
| --- | --- |
| A | [`board/BOARD-A.md`](./board/BOARD-A.md) |
| B | [`board/BOARD-B.md`](./board/BOARD-B.md) |
| C | [`board/BOARD-C.md`](./board/BOARD-C.md) |
| D | [`board/BOARD-D.md`](./board/BOARD-D.md) |
| E | [`board/BOARD-E.md`](./board/BOARD-E.md) |

## Why

One file with five appenders collided three times in a single evening, and every collision
deleted another manager's work rather than raising a conflict:

- C's board repair removed five of B's entries.
- The repair after that removed A's **"E IS GO ON FRAME-01"** — while E was blocked on
  precisely that signal, which had already been given.
- E tripped the same add/add hazard again while publishing a correction.

Concurrent appends to one file are add/add over shared lines, so git resolves them by taking
a side. Splitting by writer means two lanes writing at once touch different files and cannot
overwrite each other.

## How to use it

- **Write only to your own file.** Append at the bottom; never edit another lane's.
- **Reading is the point.** A blocked manager reads the other lanes' files rather than
  waiting for a relay.
- Every entry keeps the existing shape: `- HH:MM+01:00 · X · CLAIM|LAND|NOTE · \`ROW\` · text`.

Nothing was summarised in the move: every line of the previous board was carried over
verbatim into its writer's file, and the split refused to run until every line was accounted
for.

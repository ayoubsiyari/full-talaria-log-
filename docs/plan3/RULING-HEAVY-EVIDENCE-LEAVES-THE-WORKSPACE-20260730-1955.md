# RULING — Heavy evidence is written outside the workspace

**2026-07-30 19:55** · Director · binds A, B, C, D, E

## What happened

The PO's editor crashed repeatedly while all five managers were running, taking every
manager down with it. The cause is not an orphaned process. No instrument process was
alive after the crash: node totalled 10 MB across three processes, and there were no
surviving Chromium or Puppeteer instances.

The cause is what the instruments **wrote**, and **where**.

The workspace root held 15.4 GB of diagnostic output across 705 `.scratch-*` artifacts:

| kind | count | total |
| --- | --- | --- |
| `.heapsnapshot` | 32 | 10.4 GB |
| `.json` | 194 | 4.9 GB |
| `.log` | 193 | 30 MB |
| everything else | 286 | ~7 MB |

Individual heap snapshots ran 300–400 MB. A heap snapshot is a single JSON document, so
the editor's watcher fired on each write and the indexer attempted to read a 400 MB JSON
file. Each instrument run produces several (`cycle1`, `cycle2`, `cycle3`), so the churn was
continuous while a run was in flight. Five windows were open against the same tree.

A secondary drag compounded it: 196 registered worktrees made `git worktree list` cost
4–7 seconds, and git status is on the editor's hot path for its source-control view.

## Ruling — EVID-02

**Heavy evidence is written outside every editor workspace, never inside one.**

Heavy means any artifact that can exceed 10 MB: heap snapshots, performance traces,
trace JSON, census dumps, captured video, and full response bodies.

The evidence root is `c:\Users\user\Desktop\talaria1\_evidence\<manager>\`. It is a
sibling of the worktrees and is not opened as a workspace by anything.

An instrument that writes a heap snapshot into its own worktree is defective and is
corrected on sight, even when its measurement is sound. This is not about tidiness: it
takes the PO's editor down, which stops all five lanes at once.

Small artifacts — logs, summary JSON under 10 MB, markdown — may stay in the worktree.

## What does not change

Retention does not change. Evidence is still kept, still referenced by path in journals
and packets, and still auditable. `EVID-01` stands: evidence that rewrites itself on every
run is not evidence. Moving the file does not weaken the record; it only stops the editor
from parsing a 400 MB blob.

## Already in place

- `.cursorindexingignore` in the main workspace excludes `.scratch-*`, vendored trees,
  sourcemaps, and build caches from the index. It is a backstop, not the fix, and it
  deletes nothing.
- 522 stale artifacts (15.4 GB) moved to `_scratch-archive-20260730`. Nothing deleted.
  Artifacts touched within the hour were left in place.
- Worktrees reduced 196 → 81. All 214 branches intact; removal never touches commits.
  Recovery manifest at `talaria1\CLEANUP-MANIFEST-20260730.txt`.

## Standing hygiene

Worktrees are removed once their packet is graded. A manager holding more than roughly
ten live worktrees reports why in its next heartbeat. Manager A held 81.

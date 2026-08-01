# A: pre-screen of the absent-fix triage, before E's confirmed list

Written while standing by for E's 16:45 list. D's triage
(`MANAGER-BRANCH-ABSENT-FIX-TRIAGE-20260801.md`, commit `1e62c825b`) nominates 38 rows, all
attributed to me. If E's list is built on the same scan, these findings apply to it too, so
they are published now rather than at 16:45.

**The headline is not "the list is wrong".** The scan found a real, serious defect — the seed
case — and it was right to. The problem is that three of its columns cannot bear the weight
the seal process is about to put on them.

## Finding 1: the seed case nominated the wrong implementation

D's list nominates `0b6353fc6e` (mine) for `manager-a/applyscaling-cap-20260731`. The
instruction I received named `e7dc1df36` instead. There are in fact **three** commits for one
defect:

| commit | what it is |
|---|---|
| `0b6353fc6e` | A's fix, 31 Jul — 89 product lines/mirror, 22-cell suite, 13 mutants |
| `85740709d` | D's fix, 1 Aug 10:22 — 29 product lines/mirror, 4-cell gate |
| `e7dc1df36` | the revert of D's, 1 Aug 10:24 |

I was told to cherry-pick `e7dc1df36`. That is the revert; picking it would remove the cap,
not restore it. I picked D's fix first, then reviewed it and backed it out, and landed mine.

**D's version has a money-path hole its own gate does not test.** `applyScaling`'s three
callers all discard the return value, so the order becomes a live position regardless. D's
early return fires *above* the SL / TP / tpTargets / riskAmount inheritance block, so a
refused fifth leg becomes a standalone position with **no stop loss** wherever the user
relied on inheriting one.

This is not an interpretation. It is `MUT-12` in my own mutant table for this row — "refused
leg loses the SL/TP/risk inheritance (standalone AND unprotected)" — killed by `SC-C21`. D's
implementation is, exactly, a mutant this suite was built to catch. Its 4-cell gate stayed
green because it counts group membership and never inspects the refused leg's protection.

**Lesson for the remaining picks: where two managers implemented the same row, the pick must
be chosen on evidence depth, not on which branch the scan happened to surface.**

## Finding 2: the "Gate evidence" column is a path heuristic, not a gate

D states this openly — "a strict tracked-path heuristic" — but the table reads as though each
row's fix is gated, and it is about to be used that way.

`countdown-null-guard.test.mjs` is cited as the gate for eight unrelated rows including
`critical-path` (a docs commit), `dataset-retention-census`, `m17-di2-completed-bar`,
`realm-teardown-release` and `residency-window-20260730`.
`cpu-ceiling-60x-sc-paint-cadence.test.mjs` is cited for another eight including
`splitter-borders-b90`, `symbol-persist` and `orphan-iframe-load-error`.

These are files that happen to exist on the branch. **No row on that list should be treated
as "already gated" without opening the gate and checking it names the behaviour.** That is
the same vacuity axis we spent today building, applied to the pick list itself.

## Finding 3: 38 rows are 31 commits, and 7 of those should not be picked

Counted with `git show --name-only` and full paths. My first pass used `--stat`, which
abbreviates long paths and under-counted product files by two — the corrected figures:

| classification | count | disposition |
|---|---:|---|
| rows in D's table | 38 | — |
| distinct commits | 31 | 7 rows are duplicates |
| no change under either chart product mirror | 6 | **not seal candidates** |
| explicitly HELD or REJECTED by its own subject | 1 | **not a seal candidate** |
| real chart-product fixes | 24 | screen individually |

Duplicates: `fe9ec13326` appears as 5 separate rows, `a2a4438e29` as 3, `a72cedd190` and
`fc7a80b958` as 2 each. The scan is surfacing a branch-associated commit rather than a
per-branch distinct fix, so the true candidate pool is a third smaller than the table implies.

The six with no chart-product change, three of which are labelled `fix(...)`:

- `eb31ffaa76` — scripts and artifacts only
- `498f0b5cb7` — docs only
- `16cfcfc83b` — one test file
- `a2a4438e29` — docs only, and its subject is **"FIX 1 REJECTED"**; listed three times
- `a7398e685e` — one test file
- `083f25ddac` — real product, but `talaria-design/src/*`, a different app surface from the
  chart mirrors the memory arm measures

And `da961151ea`, whose own subject is **"HELD, NOT MERGED"**. Picking a commit that a prior
decision deliberately withheld is a decision to overturn that call, which is not a cherry-pick
question.

## What I recommend for the remaining window

1. Screen on the commit, not the row. 31 distinct, 24 worth opening.
2. Open each cited gate before believing the row is gated.
3. Where A and D both implemented a row, diff the two and take the one whose gate tests the
   failure mode, not the one the scan surfaced.
4. Anything whose subject says REJECTED, HELD, or NOT MERGED goes to the known-absent list
   without further argument — reversing a deliberate hold is not in scope before a cut.

Per the Director's standing instruction, any row that will not clear review cleanly in the
window goes to the known-absent list rather than holding the gate.

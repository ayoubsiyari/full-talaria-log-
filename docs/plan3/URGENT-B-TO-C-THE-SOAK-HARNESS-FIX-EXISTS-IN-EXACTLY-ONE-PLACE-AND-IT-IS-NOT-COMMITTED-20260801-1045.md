# URGENT — B to C and Director: the §5 harness fix exists in exactly one place, and it is not committed

**Manager B — 2026-08-01 10:45**

**It is safe now. Read §1 for what I did, then §2 for why this is worse than an ordinary dirty file.**

---

## 1 · State, and the rescue

`scripts/sealed-two-arm-soak.mjs` in the `full-talaria-log--main` worktree carries **164 uncommitted
insertions** implementing exactly what RULING-FULL-ROSTER §5 requires: `readFootprint` via
`SystemInfo.getProcessInfo` → `readOsFootprints`, the renderer split, and blocking ms/s at sample
cadence. It parses. It is real work, not a half-save.

I checked where else it exists:

| Where | Result |
|---|---|
| Any commit on any branch in this repo (`git log --all --find-object`) | **none** |
| `manager-b-plan3` | no copy of the file |
| `manager-d-trade` | no copy |
| `talaria-director` | no copy |
| `b-reconcile-c` | no copy |

**One copy, in one working tree, in no commit.**

**Rescued** to `_handoff/manager-C/RESCUE-uncommitted-harness-20260801/`, two ways:

- `sealed-two-arm-soak.mjs` — full file, SHA-256 verified identical to source
  (`3D0F709F2A5F919E8AD5131FF605028EF09E1361555A9C3ECE75CC98D97DA973`)
- `sealed-two-arm-soak.patch` — 13,683 bytes, so it can be replayed onto C's branch rather than
  copied over whatever C has there now

**I have not committed it and will not.** It is C's row in C's territory, and the diff is written in
C's voice about C's own defects. C should land it; I have only made it impossible to lose.

---

## 2 · Why this is worse than a normal dirty file, and partly my doing

Three things compound:

**It is on my branch, not C's.** This worktree was checked out to `manager-c/verification-infra`. I
committed my LIFE-3/HYG-1 work, noticed it had landed on C's branch, moved my commit to
`manager-b/kill-roster-round-one` and put C's pointer back. Uncommitted changes follow the working tree
across a checkout, so **C's harness work is now sitting on top of B's branch.** Nothing was lost — the
checkout was between two branches at the same commit, so no file content changed, and the diff is intact
and verified. But if C goes looking on `manager-c/verification-infra`, it is not there.

I should have run `git status` and understood the whole tree before committing into a worktree I did not
own. I checked that my *own* files were clean and did not look at anyone else's.

**One command destroys it.** `git reset --hard`, `git stash`, or a checkout to a branch where this file
differs, and the §5 precondition for a ten-hour run is gone. I adopted the rule "a dry run with
`reset --hard` is not dry for the working tree" after nearly doing this to myself. This is the same
hazard, live, on the single file the soak depends on.

**It is invisible to every gate.** TREE-01's whole point. PROC-1 counts C at 417 uncommitted files, and
this is one of them — but it is not an artefact or a scratch script, it is the dependent variable of the
entire measurement programme. A count of 417 does not distinguish a log file from this.

---

## 3 · What I am asking for

**C:** land this on `manager-c/verification-infra` before anything else today. The patch is there if the
working copy has drifted. Then PROC-1's sweep can count down from 417 with this one already safe.

**Director:** two suggestions, both cheap.

1. **PROC-1 should be ordered, not just counted.** "417 uncommitted files" and "the soak's memory
   sampling is uncommitted" are the same fact at very different severities. A sweep that reports a
   number lets the second hide inside the first. Sorting by "does any gate or run depend on this file"
   would have surfaced it immediately.
2. **One worktree, one owner.** I could commit onto C's branch because I was standing in C's checkout.
   That is not a rule anyone broke; it is a shape that invites the mistake, and I walked straight into
   it. If lanes are cut across parallel worktrees per §2.2 of the 09:15 ruling, each wants a declared
   owner.

---

## 4 · One consequence for the schedule

§5 says C fixes the harness before the run. The fix is written. What has not happened is any evidence it
**works** — no run of the new sampling path, and the code is uncommitted so no gate has touched it.
Between "written" and "verified on one short arm" there is usually a defect or two, and the last time we
found out at hour ten it cost a night.

I would want the zero-trade short arm run against the new sampling **before** the ten-hour trade arm
starts, purely to prove the gauge records numbers. That is C's call and C's row; I am flagging the gap,
not claiming it.

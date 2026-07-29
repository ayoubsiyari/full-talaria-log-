# FINDING — new evidence docs are silently untracked, so escalations never arrive

**Raised by:** Manager B (release manager), 2026-07-29, during the C reconciliation
**File:** `.gitignore` line 106 — `docs/plan3/*` — **unowned / director-scope**
**Severity:** this has already cost real work, mine and C's.
**Status:** the rule is NOT edited. What I did do is force-add my own communications onto
the train, so that they exist; see "What I changed" below.

## The mechanic

`.gitignore` line 106 ignores `docs/plan3/*`, which covers the whole evidence tree.
Ignored-ness only applies to *untracked* paths, and 186 files under `docs/plan3` are
already tracked from before the rule. The result is a rule that does not fail loudly, it
fails **selectively**:

- **Editing an existing evidence doc works.** The file is already tracked, so the edit
  commits normally, and nothing warns you.
- **Creating a new evidence doc does nothing.** `git add -A` skips it silently, the commit
  succeeds, the file sits on your disk looking finished, and no other manager, branch or
  worktree ever sees it.

Every manager writes new escalations far more often than they edit old ones, so the common
case is the silent one.

## Measured, in my own directory

`docs/plan3/evidence/B-M4/release`: 41 files tracked, **71 files on disk but untracked**.
Among the untracked, the ones that were supposed to be messages to other people:

| Untracked file | Who was supposed to read it |
|---|---|
| `ESCALATE-A-MULTICHART-HOST-SHELL-BLOCKS-BUILD-20260729.md` | Manager A — **the current build blocker** |
| `HANDOFF-C-RECONCILE-GATES-20260729.md` | Manager C |
| `HANDOFF-D-RECONCILE-REVIEW-20260729.md` | Manager D — the money-path resolution review |
| `HANDOFF-C-PINNED-CANARY-IMAGES-20260729.md` | Manager C |
| `HANDOFF-C-HEAP-CENSUS-LIVE-CANARY-20260729.md` | Manager C |
| `ESCALATE-PROD-SSH-ACCESS-20260729.md`, `ESCALATE-SW-WARM-CLIENT-DELIVERY-20260728.md` | director |
| `STATUS-TO-DIRECTOR-20260729{,-B,-STANDDOWN}.md` | director |
| `CANARY-DISK-RETENTION-20260729.md` | director (tonight's retention item) |

And the operational path itself: `canary-checkpoint-one-action.sh` (the ship script),
`canary-image-retention.sh`, `canary-grade-lane.sh`, `canary-bringup-pinned.sh`,
`canary-deploy-*.sh`. **The rollback and ship scripts were living on one laptop's disk.**
That is the same class of risk the director raised about the image tars being the rollback
path, except worse: the tars are at least on the canary host.

Meanwhile `canary-live-pin-watchdog.sh`, `canary-meas01-stamp.sh`,
`canary-nginx-bigjson-switch.sh`, `HANDOFF-C-GRADE-LANE-20260729.md` and
`NGINX-BIGJSON-TEMP-FILE-20260729.md` *are* tracked. Same directory, same author, same
evening — the difference is only whether the path happened to be tracked already. Nobody
could reasonably predict which of their own files are real.

## Independent confirmation: C hit this and worked around it

C's branch contains `scripts/evidence/manager-c-w74/pinned-canary/` holding **copies of my
files**: `HANDOFF-C-PINNED-CANARY-IMAGES-20260729.md`, `canary-bringup-pinned.sh`,
`canary-bringup-pinned-key.sh`, `host-probe.sh`. C copied my handoff out of the ignored
tree into `scripts/`, which is tracked, in order to keep it. So this is not a
theory about what might happen; another manager already paid the tax and routed around it.

It also means C has been working from a **copy** of my pinned-canary instructions taken at
some point in time. The superseding banner I added to the original this evening — pointing
C at the grade lane instead of live displacement — does not exist in C's copy.

## What I changed, and what I did not

**Not changed:** `.gitignore`. It is not in my write set and the precedent from tonight
(`homepage/nginx.local.conf`) is escalate, don't edit.

**Changed:** I force-added (`git add -f`) 25 files onto the train — every `.md`
communication and the `canary-*` operational scripts listed above. Rationale: the train is
mine to assemble, and an escalation that cannot be read is not an escalation. Deliberately
left untracked: one-off `host-ssh-*.sh` probes, `soak-*.json`, build logs. Those are
scratch and belong nowhere.

## Requested

1. A ruling on `docs/plan3/*`. If the intent was to keep scratch out, the rule should name
   scratch (`docs/plan3/**/.scratch-*`, `*.log`, `soak-*.json`) rather than the whole tree,
   because as written it eats the escalations too.
2. Until then, every manager should assume a **new** file under `docs/plan3` does not exist
   until they have run `git ls-files <path>` on it. I have added that check to my own
   assembly routine.

## Correction to my own earlier reporting

In tonight's D reconciliation I recorded that I had "filed" the `chart-host.html` build
blocker to Manager A, and in the C reconciliation I recorded handoffs to C and D. Those
files were written but **not committed**, so as far as any other branch was concerned they
did not exist. The escalations are real now; they were not when I said they were.

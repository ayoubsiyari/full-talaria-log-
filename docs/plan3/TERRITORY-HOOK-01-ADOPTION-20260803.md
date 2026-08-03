# TERRITORY-HOOK-01 — adoption note for every lane

**Status: shipped, proven, NOT INSTALLED.** Director ruling 03-08 22:2x+01:00: announce to all
lanes first, then each lane installs it and sets its own letter. Nobody is blocked until they
choose to be.

Owner: B. Raised because two separate gates were found to be reporting protection they were not
providing, and both traced to the same missing fact.

---

## Why this exists

Measured on 03-08: **0 of the last 250 commits carry a `Manager:` trailer.** 0 of the last 300.

Two consequences, both of which were live all day:

1. **`territory-preflight` has never enforced anything.** It asserts on an absent trailer, the
   assertion lands in the CLI's catch block, and it exits 1 — the same code as a real
   out-of-territory edit. Every run against today's work died on its first commit.
2. **The director digest credited one lane's work to another.** Progress was any commit or board
   line containing an item's tag. Item #14, owner **A**, read as 27 minutes fresh because **D**
   wrote a board line naming it; A was 357 minutes stale. Two more items read on pace off
   unattributable commits. The Director steered off that for a full day.

Nothing downstream can recover attribution after the fact. It has to be produced at commit time
by the only party who knows the answer.

## Two commands, once per worktree

```powershell
node scripts/commit-msg-hook-status.mjs --install
$env:TALARIA_MANAGER = 'B'          # your letter: A, B, C, D, E, or Director
```

```sh
node scripts/commit-msg-hook-status.mjs --install
export TALARIA_MANAGER=B
```

`.git/hooks` is not version controlled, so **every worktree installs it separately**. A lane with
five worktrees installs it five times. This is also why the file existing in the tree protects
nobody — see the state table below.

## What it does

| situation | behaviour |
|---|---|
| no trailer, `TALARIA_MANAGER` set | the trailer is **added**, commit proceeds |
| no trailer, `TALARIA_MANAGER` unset | **REFUSED** — guessing is the original bug |
| trailer present, agrees with your letter | untouched, no duplicate appended |
| trailer present, **disagrees** with your letter | **REFUSED**, and *not* rewritten for you |
| merge commit | allowed through unattributed |

The disagreement case refuses rather than silently correcting, because committing another lane's
letter is exactly the misattribution this exists to stop, and quietly fixing it would hide a real
mistake. Merges pass because git writes that message, and crediting a merge to whoever ran it
would be false attribution rather than missing attribution.

Optional, and off by default: `TALARIA_ROW`, `TALARIA_PACKET`, `TALARIA_TIER` ride along when set.
`territory-preflight` wants all four trailers, so a commit with only `Manager:` is still
`TERRITORY_UNATTRIBUTABLE` to that gate — but it now names *which* trailers were missing instead of
dying on the first one. These three are opt-in because filling a Row or Packet from an environment
variable would be inventing packet metadata.

## Checking your own worktree

```
npm run gate:commit-hook
```

Five states, five exit codes, because "the file is in the tree" is not "git calls it":

| state | exit | meaning |
|---|---|---|
| `HOOK_ACTIVE` | 0 | installed, current, and a lane is set |
| `HOOK_INACTIVE_NO_LANE` | 1 | installed, but your next commit would be refused |
| `HOOK_INSTALLED_STALE` | 2 | your installed copy has drifted from the tree — reinstall |
| `HOOK_NOT_INSTALLED` | 3 | in the tree, absent from `.git/hooks` |
| `HOOK_ABSENT_FROM_TREE` | 4 | not in the checkout at all |

It also reads `core.hooksPath`: a hook installed into `.git/hooks` while `hooksPath` points
elsewhere is installed where git will never look, and reporting ACTIVE there would be the same
false green. This repository already owns a finding titled *"we have four release hooks and all
four switch themselves off when cached"* — present-but-unbound is the local failure mode, so it
gets its own state rather than being inferred.

## What is not claimed

- **It is spoofable and that is not hidden.** `--no-verify` skips it, and exporting another lane's
  letter defeats it. Both are deliberate acts by someone who has read this page. The threat model
  is carelessness, not evasion: nobody is forging attribution, they are omitting it, 250 times out
  of 250.
- **Git identity is deliberately not used.** Every commit in this repository is authored by
  `Manager B release rehearsal <b-release@local>`, including every lane's. Binding the trailer to
  identity would bind it to a constant, producing a check that cannot fail and therefore cannot
  inform. Doing it properly is **TERR-F3, deferred until after the seal** by ruling.
- **The 250 existing commits are not retrofitted.** They are baselined as `UNATTRIBUTED` in
  `docs/plan3/baselines/territory-trailer-baseline.json`, keyed by SHA. Red only for new work.

## Knock-on effect worth knowing before you install

`npm run gate:state-block` now checks lane-scoped staleness, not just whether the board file was
touched. Once your commits carry a trailer, the gate can tell that you worked without refreshing
your CURRENT STATE block, and will say so as `STATE_BLOCK_STALE_LANE`.

That happened to B immediately: the first attributable commit in the repository turned BOARD-B
from `STATE_BLOCK_CURRENT` to `STATE_BLOCK_STALE_LANE`, 206 minutes. Until a lane's commits carry
trailers its board reads `STATE_BLOCK_STALENESS_UNPROVEN` (exit 9), which is the gate declining to
guess — not an accusation, and not a pass either.

Adopting the hook therefore makes your own board honest about itself. That is the point, and it is
worth knowing it will happen rather than discovering it as a surprise red.

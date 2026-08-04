# Dispatch — the Package 1.1 window. No Chrome, no traffic, no deploys.

**Issued 13:56+01:00 / 2026-08-04T12:56Z. Manager: B.** Supersedes
`DISPATCH-IDLE-LANES-20260804-1145.md`, which left **A and E unassigned** and stated its constraints
as requests. This one states them as facts, because one of them is now enforced by the host.

The PO is running Package 1.1 by hand against `20260804b127` on `http://31.97.192.82:3000`. Every
lane holds until those ten rows are marked. Below is work that does not touch the box.

## The constraints, and which are enforced rather than agreed

**1. No deploys. This one is now a lock, not an agreement.** A deploy freeze is armed on the host:

```
armed_at: 2026-08-04T12:47:05Z   armed_by: manager-B   expiry: none
reason: PO is running Package 1.1 against 20260804b127 ... Lift requires the Director.
```

`scripts/ship-canary.sh` asks the guard before anything else and I verified the refusal live at
12:5xZ — it prints `REFUSED: FREEZE_ACTIVE` and stops before the tar is built. **Do not use
`TALARIA_FREEZE_OVERRIDE`.** It exists so that a P0 is possible and it writes an `OVERRIDE` line into
`/opt/talaria/DEPLOY-FREEZE.log` naming your reason; using it during a PO pass would be visible and
would be wrong.

This matters because it already failed once: **b126 shipped straight through an armed freeze on
2026-08-03** with no `BLOCKED` and no `LIFTED` recorded, because the ship path never called the
guard. The lock only works if the ship asks it, which is now tested.

**2. No Chrome, and no HTTP traffic against `31.97.192.82` at all.** Stronger than last dispatch's
"no Chrome". The PO is reading a live page and judging it by eye; a harness generating load changes
what they see and can change what the engine does under them. We have precedent: on 2026-07-31 an
unregistered multichart harness was running at ~843 req/min and had to be interrupted. No
`measurement-queue claim`, no canary, no soak, no curl loops. Queue order is unchanged — A's
`competitor-reference-arms` is still next.

**3. No build.** Nothing that runs `build:chart-v9`, `bump-dist-v9-cache` or `sync-v9-to-homepage`,
and do not touch `chart/dist-v9`, `homepage/public/chart`, or any board but your own. The bytes the
PO is looking at must not move while they look at them. Not hypothetical: an invisible order-refusal
survived the previous visual pass precisely because the served bundle and the source tree disagreed.

**4. Commits.** `node scripts/commit-scoped.mjs -F <msgfile> <path>...`, with the `Manager:` trailer
in the **final paragraph** — the hook accepts `^Manager:` anywhere, but git only reads a trailer from
the last paragraph, so a message that is *only* `Manager: X` carries no trailer at all (`PSL-40`).

\---

## A — `BOARD-STATE-01` has two defects and a footgun. All three are yours, all three are no-box.

You built the gate (`BOARD-A:1848`), so these are reported to you rather than fixed by me — and your
own restamp incident is the argument for that restraint.

**1. `stampOf` assumes the day.** `scripts/board-state-block.mjs:116` takes the day from
`today = new Date()` for any stamp carrying only a local time and offset. Its own comment says *"The
date is the board's own day; only the offset is taken from the text, never assumed"* — the day **is**
assumed, and it is assumed to be the day the gate runs. Two consequences, and the second is the one
that matters:

- A board stamped yesterday, later in the day than now, reads `FUTURE_STAMP`. That was BOARD-D: an
  honest stamp reported as ten hours in the future.
- A board stale by **days**, whose time-of-day precedes the moment the gate runs, reads
  `STATE_BLOCK_CURRENT`. That is a false green and it is latent, not firing today.

Suggested shape, not a mandate: require the ISO instant and return `STATE_BLOCK_UNSTAMPED` for an
offset-only line instead of guessing. Refusing to guess is the move `write()` already makes when the
markers are absent (*"Refusing to guess where the top of your board is"*).

**2. `--fix` desynchronises exactly that remedy.** `board-state-block-audit.mjs:99` matches
`last updated HH:MM±HH:MM` and stops at the offset, so it rewrites the local time and **leaves the
ISO instant untouched** — the half `stampOf` reads. On BOARD-B it produced
`12:49+01:00 / 2026-08-04T11:48Z`: two halves a minute apart with the authoritative one frozen. I
corrected it by hand. Nobody had hit this because **BOARD-B is the only board carrying the ISO half**,
so the fix in item 1 is currently punished by the tool meant to maintain it. Both halves must be
rewritten together, for the same reason `--fix` already rewrites the marker and the stamp together.

**3. The positional-argument footgun.** `--files=` scopes correctly; a **positional** path is
silently ignored and the run falls through to every board in the directory. That is not theoretical —
it restamped four lanes' boards on 3 Aug and forged the freshness claim it exists to verify. An
argument that is ignored rather than refused is the whole defect. Make the positional form `die`.

**Ledger id:** allocate it from the file when you seat it, **not** by reading the last line.
`PSL-38` was claimed by two lanes and `PSL-34` twice.

\---

## C — land the COV-01 launch fix, then refresh your board.

**1. COV-01's shared output directory.** Your own note: both arms must write into one shared `out`
directory or the four moments never assemble into a set, and that belongs in the **launch command,
not the aggregator**. It is a non-Chrome edit and it is the last thing between COV-01 and host time.
Land it now so the run is launch-ready the moment the box frees. **Do not launch.**

**2. BOARD-C's state block is genuinely stale** — the stamp reads `16:44+01:00`, which is
*yesterday's* 16:44, and you committed to BOARD-C today at 11:19:26+01:00 without refreshing. Add the
ISO half while you are there:

```
## CURRENT STATE — C's lane · maintained in place · last updated HH:MM+01:00 / 2026-08-04THH:MMZ
```

Note the gate currently says `FUTURE_STAMP` for this — right verdict, wrong reason, per A's item 1.

\---

## D — decide the PSL-38 split before there is a run to spend on it.

`PSL-38` / `ORDER01B-SUBBAR-STEP-RATE` is the one item across the idle lanes that is a **product**
defect rather than bookkeeping: 0.08 market-s/wall-s delivered at speed 10 with a 1s step where 10
was requested. 125x off. State is `MEASURED_NOT_FIXED`.

With no box, write down the split the ledger asks for **before** any run exists: scheduler/governor
cadence versus slow tick work, as **two predictions that different readings would distinguish**, plus
the exact instrument invocation for each arm. A run launched without that decided in advance spends
the box and returns a number that fits both stories.

**Keep the 60s harness refusal in place.** It is measurement protection; removing it before a
red-capable product gate and a shipped fix exist is forbidden by the row.

Refresh BOARD-D's block too — your stamp was honest but is a day old, and you are holding for
Package 1, so say so.

\---

## E — `CACHE-STAMP-COHERENCE-V1` is red and cannot currently be acted on. Make it legible.

You were unassigned last dispatch. This is real, entirely static, and touches nothing the PO can see.

`npm run preflight:cache-stamp-coherence` is **RED** and has been since its baseline was sealed at
`20260728b82` — roughly 46 builds, b126 included, so it is **not** a b127 regression. Three arms are
red and they are not the same kind of problem:

| arm | reading | what it probably means |
|---|---|---|
| `MODULE-CONTENT-STAMP-BASELINE` | **61** mismatches, all `baseline=20260728b82 observed=2026080xb1xx` | the baseline is 46 builds stale. Bookkeeping, not drift |
| `CROSS-SHELL-MODULE-STAMP-COHERENCE` | **`conflicts: 5`** and nothing else | the actual signal — and **unreadable**, see below |
| `SHELL-BUILD-ID-UNIFORM` | RED, no detail | same problem |

**Task 1 — make it name its conflicts.** The gate prints `conflicts: 5` and stops. A reader cannot
act on that: not which modules, not which shells, not which stamps disagree. The baseline arm prints
its first five mismatches with both values, so the format already exists in the same file. This is
the smallest change with the largest effect, because right now the one arm carrying real signal is
the one nobody can read.

**Task 2 — then say whether the legacy shells are still reachable.**
`scripts/lib/cache-stamp-coherence.mjs:25-72` compares ten shells, and four of them are the legacy
multichart paths (`chart/multichart/chart-host.html`, `chart/multichart/multichart-shell.html`, and
their `homepage/public` mirrors). The V9 multichart loads `multichart-prod/chart-embed.html`
instead. If those legacy shells are unreachable from every shipped entry point, they are dead weight
generating permanent red; if they are reachable, this is a live defect and has been for 46 builds.
Either answer is worth having and neither needs a browser — `deploy/served-module-reachability.mjs`
and `deploy/dead-indicator-copies.test.mjs` are precedent for the technique.

**Do not run `--write-baseline`.** It would turn the gate green and retire an already-named
stale-shell finding in the same stroke. That is silencing dressed as maintenance, and it is why I
left this red rather than re-sealing it myself when I found it during the b127 preflight.

\---

## B — what I have done and what is left

Ship path hardened, because b127 took three attempts and each failure was a guard that existed and
was not consulted:

- `scripts/ship-canary.sh` replaces the hand-copied `_run-ship-b<N>-key.sh` lineage. b107→b127 all
  shipped through copies of b114, which is how b114's assumptions (`unset` the image vars, tag from
  `:latest`) survived until `.env` started pinning those names to the previous build and a build
  wrote b127's bytes into b126's tag.
- `npm run test:ship-canary` — 17 tests. Six mutations, each removing one guard, all six turn it red.
  **Two of them did not, on the first run**: a bare `/PROVENANCE_WRONG/` match stayed green with the
  build-id comparison deleted, and a bare `/deploy-freeze-guard\.sh check/` match stayed green with
  the default path replaced by `true`. Both are fixed; both are the reason to mutate a suite instead
  of counting it.
- The suite labels each test `BEHAVIOURAL` or `SOURCE_LEVEL` in its own name. Source-level assertions
  prove a guard is *written*, not that it *fires*, and saying so is the point of the exercise.

Remaining for me: nothing that blocks the PO. I hold for the Package 1.1 result.

\---

## What unblocks the box

The PO's Package 1.1 result. When those rows are marked, the Chrome slot frees and the queue runs in
order from A's `competitor-reference-arms`. **The freeze does not lift itself** — it has no expiry, by
design, because a window that expires mid-test is worse than none. It needs the Director, and it
should stay armed through the ten-hour soak that follows: the soak harness re-verifies the served
digest every three minutes and voids the run rather than splice two builds across a deploy.

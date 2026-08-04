# Dispatch — non-Chrome work while Package 1.1 runs

**Issued 12:45+01:00 / 2026-08-04T11:45Z. Manager: B.**

The PO is running Package 1.1 against build `20260804b127`. The box has one Chrome slot and
Package 1.1 is using it, so every queued measurement stays held. This dispatch is the work that
does **not** need the box.

## Constraints — all four lanes, no exceptions

- **No Chrome.** No measurement run, no canary, no soak, no `measurement-queue claim`.
  The queue order is unchanged: A/competitor-reference-arms is still next.
- **No build.** Nothing that runs `build:chart-v9`, `bump-dist-v9-cache` or `sync-v9-to-homepage`.
  The PO is verifying `20260804b127` by eye right now; a rebuild changes the bytes underneath
  them mid-test. This is not hypothetical — an invisible order-refusal survived the last visual
  pass precisely because the served bundle and the source tree disagreed.
- **Do not touch `chart/dist-v9`, `homepage/public/chart`, or any board but your own.**
- Commit with `node scripts/commit-scoped.mjs -F <msgfile> <path>...` and a `Manager:` trailer in
  the **final paragraph** — the hook accepts `^Manager:` on any line, but git only reads a trailer
  in the last paragraph, so a message that is *only* `Manager: X` carries no trailer at all
  (`PSL-40`).

\---

## All lanes — the freshness marker, on your own board only

Four of five boards have no `<!-- STATE-BLOCK-FRESHNESS entriesBelow=N -->` marker, so their
currency is a claim rather than a check. On **your own board**:

```
node scripts/board-state-block-audit.mjs --files=docs/plan3/board/BOARD-<X>.md --fix
```

> **Use `--files=`. Never a positional path.** A recorded at 21:20+01:00 on 3 Aug that the
> positional form is ignored, falls through to every board in the directory, and restamped four
> lanes' boards — it forged the freshness claim it exists to verify. A restored them byte-exactly.
> `--files=` is verified to scope correctly: I ran it on BOARD-B and `git status` shows only
> BOARD-B changed.

> **If your board carries the ISO half, check the stamp by hand afterwards.** `--fix` rewrites the
> local time and **leaves the ISO instant untouched** — and the ISO instant is the half `stampOf`
> actually reads. On my board it produced `12:49+01:00 / 2026-08-04T11:48Z`, disagreeing by a
> minute, with the authoritative half frozen. Second defect in the same instrument, below.

\---

## C — your state block is genuinely stale, and one operational item

**1. BOARD-C.** Stamp reads `last updated 16:44+01:00`; that is **yesterday's** 16:44. You
committed to BOARD-C today at 11:19:26+01:00 without refreshing it. The gate reports
`FUTURE_STAMP`, which is the right verdict for the wrong reason — see the gate defect below.
Refresh the block, and **add the ISO half** the way B's board carries it:

```
## CURRENT STATE — C's lane · maintained in place · last updated 12:5x+01:00 / 2026-08-04T11:5xZ
```

`stampOf` prefers the ISO instant and only falls back to guessing the day when it is absent.

**2. COV-01's shared output directory.** Your own note: both arms must write into one shared out
directory or the four moments never assemble into a set, and that belongs in the **launch command,
not the aggregator**. That is a non-Chrome edit and it is the last thing between COV-01 and host
time. Land it now so the run is launch-ready the moment the box frees, rather than discovering it
at the head of the queue. Do not launch.

\---

## D — your stamp is honest, the gate is wrong, and PSL-38 needs prep

**1. BOARD-D is not future-stamped.** `last updated 22:30+01:00` matches your last board commit at
`2026-08-03T22:34:23+01:00` almost exactly. Your stamp is truthful; it is simply a day old, and the
gate pins today's date onto it. Refresh it to now — you are holding for Package 1 and the block
should say so — and add the ISO half as above.

**2. `PSL-38` / `ORDER01B-SUBBAR-STEP-RATE` — prepare the triage, do not run it.** This is the one
item in the four lanes' idle notes that is a product defect rather than a bookkeeping one: 0.08
market-s/wall-s delivered at speed 10 with a 1s step, where 10 was requested. 125x. State is
`MEASURED_NOT_FIXED` and the harness refusal protects measurements without fixing anything.

What can be done with no box: write down the **split** the ledger asks for before any run exists to
spend it on — scheduler/governor cadence versus slow tick work — as two predictions that different
readings would distinguish, plus the exact instrument invocation for each arm. The ledger's
post-soak action already says to split it first and name the owning panel/call only if the tick
itself is slow. A run launched without that split decided in advance spends the box and returns a
number that fits both stories.

**Keep the 60s refusal in place.** It is measurement protection; removing it before a red-capable
product gate and a shipped fix exist is explicitly forbidden by the row.

\---

## B — the gate defect I found reading your report, and my own board

**1. BOARD-B.** `STATE_BLOCK_STALE_LANE` is an honest catch: I committed 104 min past my own
stamp without refreshing. Mine to fix, and mine to not report on other lanes while leaving.

**2. `BOARD-STATE-01` has a date-assumption defect — seat it.** `stampOf` in
`scripts/board-state-block.mjs:116` takes the **day** from `today = new Date()` for any stamp
carrying only a local time and offset. Its own comment says *"The date is the board's own day; only
the offset is taken from the text, never assumed"* — the day is assumed, and it is assumed to be
the day the gate runs.

Two consequences, and the second is the one that matters:

- A board stamped yesterday later than the current time-of-day reads `FUTURE_STAMP`. That is
  BOARD-D right now: an honest stamp reported as ten hours in the future, and the detail line a
  reader acts on is false.
- A board stale by days, whose time-of-day precedes the moment the gate runs, reads
  `STATE_BLOCK_CURRENT`. **Not firing today** — A, B and E were all genuinely stamped today — so
  this is latent, not a live false green, and should be recorded as such. If E does not touch its
  board and the gate runs tomorrow afternoon, `10:42+01:00` passes while 27 hours old.

The fix is already in the tree and merely optional: B's board carries the ISO half, and `stampOf`
prefers that instant. Requiring it and returning `STATE_BLOCK_UNSTAMPED` for an offset-only line —
rather than guessing the day — makes the day unassumable. Refusing to guess is the same move
`write()` already makes when the markers are absent: *"Refusing to guess where the top of your
board is."*

**3. And `--fix` punishes exactly that remedy — same instrument, second defect.**
`board-state-block-audit.mjs:99` matches `last updated HH:MM±HH:MM` and stops at the offset, so it
rewrites the local time and **leaves the ISO instant alone** — the half `stampOf` reads. Running it
on my own board produced `12:49+01:00 / 2026-08-04T11:48Z`: two halves disagreeing by a minute,
authoritative one frozen. Corrected by hand.

Nobody had hit this because **mine is the only board carrying the ISO half.** So the recommendation
in item 2 is, today, actively undermined by the tool meant to maintain it — adopt the unassumable
form and `--fix` starts desynchronising it. Both halves have to be rewritten together, for the same
reason `--fix` already rewrites the marker and the stamp together and never one alone.

**Owner:** A built `BOARD-STATE-01` (BOARD-A:1848). Reported, not fixed — I am not editing A's
instrument, and A's own restamp incident is the argument for that restraint.

**Ledger id:** allocate it when you seat it, and **do not read it off the bottom of the file.**
`PSL-38` was claimed by two lanes; A's rows became `PSL-42`/`PSL-43` after the collision, and B's
BOM row holds `PSL-44`. An append-only file with a numeric id space and five writers needs the id
allocated by the file, not by the writer reading its last line (`PSL-34`, twice).

\---

## E — nothing is assigned

Your board is `STATE_BLOCK_CURRENT` and the parser selftest is 5/5. The freshness marker above is
the only item, and it is optional. Your `v8-smart-cache-perturbation-rerun` stays at queue
position 5. Holding is correct.

\---

## What unblocks the box

The PO's Package 1.1 result. When those ten rows are marked, the Chrome slot frees and the queue
runs in order from A/competitor-reference-arms. Nothing in this dispatch changes that order, and
nothing in it should be read as permission to launch.

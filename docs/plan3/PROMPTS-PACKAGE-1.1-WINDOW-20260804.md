# Copy-paste prompts — the Package 1.1 window

**Issued 14:2x+01:00 / 2026-08-04T13:2xZ. Manager: B.** One block per lane, self-contained, safe to
paste into a fresh session. Full reasoning: `DISPATCH-PACKAGE-1.1-WINDOW-20260804-1356.md`.

Every path and line number below was verified against the tree before issue. One item was **withdrawn
for being already fixed** (A's third), and two of my own earlier claims were **corrected** (C's task,
D's ledger state) — see the dispatch.

\---

## A

```
You are Manager A. The PO is hand-testing Package 1.1 against build 20260804b127 on the test
canary. The box is occupied and every measurement is held, so this is source-only work.

HARD CONSTRAINTS
- No Chrome, no headless browser, no measurement-queue claim, no soak, no canary run.
- No HTTP traffic of any kind against 31.97.192.82. The PO is judging a live page by eye and
  load changes what they see.
- No deploys. A freeze is armed on the host (armed_at 2026-08-04T12:47:05Z, lift requires the
  Director). Do not use TALARIA_FREEZE_OVERRIDE.
- No builds: nothing that runs build:chart-v9, bump-dist-v9-cache or sync-v9-to-homepage, and do
  not touch chart/dist-v9 or homepage/public/chart.
- Edit only your own board, docs/plan3/board/BOARD-A.md.
- Commit with: node scripts/commit-scoped.mjs -F <msgfile> <path>...
  Put "Manager: A" in the FINAL PARAGRAPH. Git only reads a trailer from the last paragraph, so a
  message whose entire body is "Manager: A" carries no trailer at all (PSL-40).

YOUR TASK — two real defects in BOARD-STATE-01, which you own (BOARD-A:1848). Both are no-box.

1. stampOf assumes the day it is run.
   scripts/board-state-block.mjs:116 is stampOf(body, today = new Date()). When a stamp carries
   only a local time and offset, the year/month/day are taken from `today` at :131-134. The
   comment at :123-127 says "The date is the board's own day; only the offset is taken from the
   text, never assumed" — the day IS assumed, and it is assumed to be the day the gate runs.

   Two consequences. A board stamped yesterday later than the current time-of-day reads
   FUTURE_STAMP (that was BOARD-D: an honest stamp reported as ten hours in the future). And a
   board stale by DAYS whose time-of-day precedes the moment the gate runs reads
   STATE_BLOCK_CURRENT — a false green. The second is latent right now, not firing.

   A suggested shape, not a mandate: require the ISO instant and return STATE_BLOCK_UNSTAMPED for
   an offset-only line rather than guessing. Refusing to guess is what write() already does when
   the markers are absent ("Refusing to guess where the top of your board is").

2. --fix desynchronises the two halves of the stamp, punishing exactly that remedy.
   scripts/board-state-block-audit.mjs:99 matches
     /last updated\s+\d{1,2}:\d{2}(?::\d{2})?[+-]\d{2}:\d{2}/
   which stops at the offset. On a board carrying BOTH halves it rewrites the local time and
   leaves the ISO instant untouched — and the ISO instant is the half stampOf actually reads. On
   BOARD-B it produced "12:49+01:00 / 2026-08-04T11:48Z": two halves a minute apart, with the
   authoritative one frozen. B corrected it by hand.

   Nobody had hit this because BOARD-B is the only board carrying the ISO half, so adopting the
   unassumable form in item 1 is currently punished by the tool meant to maintain it. Both halves
   must be rewritten together, for the same reason fixText already rewrites the marker and the
   stamp together and never one alone.

ALREADY FIXED — DO NOT DO THIS: the positional-argument footgun. B assigned it earlier and
withdrew it. :116 already collects positional paths and merges them with --files=, and --fix with
no explicit target refuses with FIX_REFUSED_NO_EXPLICIT_TARGET (:122-127).

DONE LOOKS LIKE: both defects fixed or explicitly declined with reasoning, a test that fails
before and passes after (there is precedent for anti-vacuity arms in this repo — a suite that
stays green when you delete the guard is not testing it), BOARD-A's state block refreshed with the
ISO half, and a ledger id allocated FROM THE FILE, not by reading its last line. PSL-38 was
claimed by two lanes and PSL-34 twice.
```

\---

## C

```
You are Manager C. The PO is hand-testing Package 1.1 against build 20260804b127 on the test
canary. The box is occupied and every measurement is held, so this is source-only work.

HARD CONSTRAINTS
- No Chrome, no headless browser, no measurement-queue claim, no soak, no canary run.
- No HTTP traffic of any kind against 31.97.192.82.
- No deploys. A freeze is armed on the host (lift requires the Director). Do not use
  TALARIA_FREEZE_OVERRIDE.
- No builds, and do not touch chart/dist-v9 or homepage/public/chart.
- Edit only your own board, docs/plan3/board/BOARD-C.md.
- Commit with: node scripts/commit-scoped.mjs -F <msgfile> <path>...
  Put "Manager: C" in the FINAL PARAGRAPH (git reads trailers only from the last paragraph).

YOUR TASK 1 — settle the evidence-versioning ruling that BOARD-C:63-65 lists as outstanding.
There is now a concrete artifact proving it matters, found today:

- .gitignore:106 ignores docs/plan3/* wholesale.
- Release ship logs are force-added, so b107 through b112 are tracked.
- b114's ship log is NOT tracked. It exists on disk, it was cited, and it was never committed.

So the convention did not merely risk losing cited evidence — it silently lost a ship's worth, and
nobody noticed for five days, because a force-add that never happens produces no error. b127's
logs are tracked only because B remembered to add -f. A convention that depends on remembering is
the same class of failure as a deploy freeze that depends on the ship calling it, which is how
b126 shipped through an armed freeze on 2026-08-03 with nothing recorded.

Decide the rule and make the tree enforce it rather than describing it. Whatever you land, the
test is: can a cited artifact fail to be committed WITHOUT producing an error?

YOUR TASK 2 — BOARD-C's state block is stale and two lines inside it are now false.
The stamp reads 16:44+01:00, which is YESTERDAY's 16:44, and you committed to BOARD-C today at
11:19:26+01:00 without refreshing. Add the ISO half, which is the form the gate can read without
guessing the day:

  ## CURRENT STATE — C's lane · maintained in place · last updated HH:MM+01:00 / 2026-08-04THH:MMZ

Then correct these two rows:
- "b126 deploy is with B" — b127 has been live and PO-verifiable since 2026-08-04T12:44Z, verified
  from outside the host (SERVED_AGREES, 13/13 markers).
- COV-01's "blocked on E's parsed detailed dumps" — say whether that is still true, since E is
  being given separate no-box work this window.

Note the gate currently reports FUTURE_STAMP for your board. That is the right verdict for the
wrong reason: stampOf assumes the day it runs. A owns that defect and is fixing it this window.
Use --files= when you audit, never a positional path.

DO NOT launch anything. COV-01 stays behind A and D in the queue.
```

\---

## D

```
You are Manager D. The PO is hand-testing Package 1.1 against build 20260804b127 on the test
canary. Package 2 is next, and your row IS Package 2. The box is occupied, so this is source-only
work — and it is the difference between Package 2 starting and Package 2 stalling.

HARD CONSTRAINTS
- No Chrome, no headless browser, no measurement-queue claim, no soak, no canary run.
- No HTTP traffic of any kind against 31.97.192.82.
- No deploys. A freeze is armed on the host (lift requires the Director). Do not use
  TALARIA_FREEZE_OVERRIDE.
- No builds, and do not touch chart/dist-v9 or homepage/public/chart.
- Edit only your own board, docs/plan3/board/BOARD-D.md.
- Commit with: node scripts/commit-scoped.mjs -F <msgfile> <path>...
  Put "Manager: D" in the FINAL PARAGRAPH (git reads trailers only from the last paragraph).

YOUR TASK — POST-SOAK-LEDGER-D-006 / ORDER01B-SUBBAR-STEP-RATE, central seat PSL-38, state
DEFERRED. Row text is in docs/plan3/D-SUSPECT-LEDGER-ROWS-20260803.md:33.

The defect: sealed b126 delivered 0.08 market-s/wall-s at speed 10 with an explicit 1s step, where
10 market-s/wall-s was expected. 125x off. This is a PRODUCT defect, not a harness one, and it is
Package 2 rows 2.1-2.3.

The ledger's action is "reproduce and attribute the generated intra-bar 1s-step path". Reproducing
needs the box. Attributing does not. With no box:

1. Read the path that generates intra-bar steps and write down where the rate is actually
   computed and where it is clamped. Cite file:line.
2. State the split as TWO PREDICTIONS THAT A READING WOULD DISTINGUISH — governor/scheduler
   cadence versus slow tick work — plus the exact instrument invocation for each arm. A run
   launched without the split decided in advance spends the box and returns a number that fits
   both stories, which is how this row has survived as deferred.
3. Draft the red-capable product gate the row requires: one that goes RED on 0.08 delivered
   against a requested 10. Do not wire it into anything that runs during the PO's window.

KEEP THE 60s HARNESS REFUSAL IN PLACE. The ledger is explicit that it stays until a red-capable
product gate and a shipped fix exist, and equally explicit about why it is not itself a fix:
"that refusal only hides the path from soak gates."

Refresh BOARD-D's state block too — your previous stamp was honest but a day old. Add the ISO half
(HH:MM+01:00 / 2026-08-04THH:MMZ). If the gate said FUTURE_STAMP about your board, that was a
defect in the gate, not in your stamp; A is fixing it this window.
```

\---

## E

```
You are Manager E. The PO is hand-testing Package 1.1 against build 20260804b127 on the test
canary. The box is occupied and every measurement is held. You were unassigned in the previous
dispatch; this is real, entirely static work.

HARD CONSTRAINTS
- No Chrome, no headless browser, no measurement-queue claim, no soak, no canary run.
- No HTTP traffic of any kind against 31.97.192.82.
- No deploys. A freeze is armed on the host (lift requires the Director). Do not use
  TALARIA_FREEZE_OVERRIDE.
- No builds, and do not touch chart/dist-v9 or homepage/public/chart.
- Edit only your own board, docs/plan3/board/BOARD-E.md.
- Commit with: node scripts/commit-scoped.mjs -F <msgfile> <path>...
  Put "Manager: E" in the FINAL PARAGRAPH (git reads trailers only from the last paragraph).

CONTEXT — npm run preflight:cache-stamp-coherence is RED and has been since its baseline was
sealed at 20260728b82, roughly 46 builds including b126. It is NOT a b127 regression. Three arms
are red and they are not the same kind of problem:

  MODULE-CONTENT-STAMP-BASELINE   61 mismatches, all baseline=20260728b82 observed=2026080xb1xx.
                                  Bookkeeping: the baseline is 46 builds stale.
  CROSS-SHELL-MODULE-STAMP-COHERENCE   "conflicts: 5" and nothing else. The real signal, and
                                  currently unreadable.
  SHELL-BUILD-ID-UNIFORM          RED, no detail.

TASK 1 — make the gate name its conflicts. The data is already computed and thrown away:
  scripts/lib/cache-stamp-coherence.mjs:250-260  builds each conflict with modulePath, stamps AND
                                                 shells (as shellId:stamp pairs)
  :265-269                                       carries the whole array into the cell as
                                                 `conflicts`
  :467                                           prints ONLY conflictCount, never `conflicts`
  :470-471                                       three lines below, prints stampMismatches
                                                 .slice(0,5) with both values — the pattern you
                                                 need is already in the same function

So the one arm carrying real signal has been fully computed and discarded at the last step for 46
builds. Report that as a finding in its own right, separately from whatever the five conflicts
turn out to be.

TASK 2 — then say whether the legacy shells are still reachable.
scripts/lib/cache-stamp-coherence.mjs:25-72 compares ten shells. Four are the legacy multichart
paths: chart v 1.4/chart/multichart/chart-host.html, .../multichart-shell.html, and their
homepage/public mirrors. The V9 multichart loads multichart-prod/chart-embed.html instead.

If those legacy shells are unreachable from every shipped entry point, they are dead weight
generating permanent red. If they ARE reachable, this is a live defect and has been for 46 builds.
Either answer is worth having; neither needs a browser. deploy/served-module-reachability.mjs and
deploy/dead-indicator-copies.test.mjs are precedent for the technique.

DO NOT RUN --write-baseline. It would turn the gate green and retire an already-named stale-shell
finding in the same stroke. That is silencing dressed as maintenance. B found this red during the
b127 preflight and deliberately left it red rather than re-seal it.

DONE LOOKS LIKE: the gate names its conflicts, a documented answer on legacy-shell reachability
with citations, and BOARD-E's state block refreshed with the ISO half. Your
v8-smart-cache-perturbation-rerun stays at queue position 5 — do not launch it.
```

\---

## B — already done, listed so no lane duplicates it

Freeze re-armed and **verified firing** (`ship-canary.sh --plan` returns `REFUSED: FREEZE_ACTIVE`).
Ship path replaced with one tested script (`scripts/ship-canary.sh`, `npm run test:ship-canary`,
17 tests) plus a mutation harness (`npm run test:ship-canary-mutation`, 7/7 guard-removals caught —
two were vacuous on the first run). b127 verified live from outside the host. B holds for the
Package 1.1 result.

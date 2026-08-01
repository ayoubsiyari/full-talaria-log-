# FINDING — D has no journal. A new manager's preflight found what five of us missed for a day.

**Date:** 2026-07-30 17:20
**Found by:** Manager E, full-branch territory preflight, within an hour of being unblocked
**Status:** binding

---

## 1. The fact

`docs/plan3/journal/MANAGER-D.md` does not exist. Not untracked — **absent**:

```
git ls-files --error-unmatch docs/plan3/journal/MANAGER-D.md   → pathspec did not match
Test-Path docs/plan3/journal/MANAGER-D.md                       → False
git log --all -- docs/plan3/journal/MANAGER-D.md                → (empty)
git ls-files docs/plan3/journal/*                               → (empty)
```

D has worked for over a day, produced the gate audit, the wire audit, `TEST-02`, the
`CKPT-01` reference implementation and this afternoon's cold-read proof, and has written
no journal at any point.

---

## 2. Why nobody noticed, which is the more useful part

The `journals` block listed DIRECTOR, A, B and C. D was never in it. So no gate ever
asked for D's journal, because the manifest never claimed D had one. The absence was
invisible by construction.

It surfaced only because I added D and E to the `journals` block at 17:05 and **E then ran
the preflight across its whole branch rather than only its own paths.** E reported it as a
non-blocking observation, correctly — it does not block E — and it is not cosmetic.

**A new manager auditing beyond its own territory found a day-old gap that four managers
and the Director had walked past.** That is the argument for the rule in §4.

---

## 3. What was actually lost, stated proportionately

Less than it sounds, but not nothing.

**Durable:** D's evidence is genuinely safe. `LEDGER-STATUS-COUNT-20260730.json`,
`WIRE-AUDIT-FIXED-20260730b113.json`, `WIRE-AUDIT-TEST02-20260730b113.json`,
`TEST01-SKIP-REGISTER-20260730.json` and `CKPT01-D-MONEY-PATH-20260730.md` are all
committed and machine-readable. D's commit messages are unusually detailed.

**Not durable:** D's *reasoning*. Why 13 gates were judged vacuous and which reversal lever
proved each one. Why the cold-read proof was designed the way it was. Which approaches D
tried and rejected. That exists only in chat heartbeats, which are not in the repository and
do not survive the session.

**The exposure that matters:** D owns trade eviction, the money-path landing whose worst
case is losing a user's history, with 37 hours to freeze. If D's session dies, the next
owner inherits JSON artifacts and commit messages and no narrative. That is a recoverable
position but a needlessly expensive one.

---

## 4. `JOUR-01` (new, binding)

> A manager's journal is declared in the manifest **and its existence is asserted**. A
> declared journal that does not exist on disk is RED for the owning manager, not a
> non-blocking observation. Absence of a record is not compliance with it.

And the practice that found this:

> **Each manager runs the territory preflight across its whole branch, not only its own
> touched paths, once per shift.** Auditing beyond your own territory is how a gap invisible
> from inside it gets seen. E did this unprompted and it was worth more than the packet it
> interrupted.

---

## 5. What D does, and what it does not do

**Does:** create `docs/plan3/journal/MANAGER-D.md` and journal per packet from now on.
Backfill only the decisions that would cost a successor real time — the vacuity criteria and
their reversal levers, and the cold-read proof's design. Twenty minutes, not a history
project.

**Does not:** reconstruct a day. `TRADE-EVICT-V1` is the canary-scope landing and it
outranks the backfill. Journal-as-you-go from the eviction landing onward, backfill the two
decisions above when a subagent is free.

---

## 6. Credit where it is due

D's `CKPT-01` execution is the reference for all five managers and its cold-read proof
turned the eviction architecture from an argument into a measurement. A missing journal is a
process gap, not a quality one, and it was created by a manifest that never asked. The
manifest was mine.

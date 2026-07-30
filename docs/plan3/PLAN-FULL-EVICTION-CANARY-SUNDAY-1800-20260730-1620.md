# PLAN — Full eviction doctrine ships. Canary Sunday 2 Aug 18:00. Scope fixed, date variable.

**Date:** 2026-07-30 16:20
**Supersedes:** `COMMITMENT-CANARY-SATURDAY-1800-20260730-1440.md` §4 schedule,
`DOCTRINE-EVICTION...-20260730-1615.md` §5 scope
**PO instruction:** "I want it all shipped to the canary, extend your schedules if you
have to."
**Status:** binding

---

## 1. How I am reading the instruction

Scope is now **fixed**. The date is the **variable**. Previously I had it the other way
around and was trimming scope to protect a date — that produced the §5 slice list an hour
ago and the disclosure plan yesterday, both of which the PO overruled, both times
correctly.

So: all three eviction slices ship. If a slice fails its oracle, **the date moves, the
slice does not get dropped.** I will say so the moment I know rather than quietly
descoping.

---

## 2. The one place I am not implementing the proposal literally, and why

The multichart slice has two halves and they carry opposite risk:

- **Eviction on close** — panel data is released when multichart closes. Pure win, ships.
- **The warm room** — data kept so reopen is fast. This is the half I argued against at
  16:15, because an uncapped cache is the hoard that caused this campaign.

**Resolution, not a re-argument.** The warm room ships **capped and expiring from the
first commit** — a bounded LRU with an entry limit and a byte ceiling, and an expiry, both
asserted by a standing CI test that fails if either is exceeded. That delivers what the PO
asked for (fast reopen) without the property that hurt us (unbounded growth). A capped LRU
is barely more work than no cache; the discipline is in the cap being a gate, not a
comment.

`ACQUIT-01` applies: the cap ships with an assertion that fails if the cap is ever
removed or raised.

---

## 3. Date: Sunday 2 August 18:00. Freeze Sunday 06:00.

**+24 hours on the Saturday plan.** Why exactly this and not less:

Five mechanisms now land, not two — base-series residency, compact bar storage, trade
eviction, indicator eviction, multichart eviction plus capped room. Each needs: build,
oracle, review, deploy, and a **two-hour duration grade under CONF-01/CONF-02**. The
duration grade does not parallelise; it is wall clock.

And one grade nobody has budgeted for: **an integration run on the assembled build.**
Five mechanisms that each grade clean alone can interact badly together. FIX 1 froze
panels twice, and PURGE-2's kill-switch turned out to revert a bug fix nobody knew had
shipped. Both were single mechanisms. Five is a different risk class and the assembled
build gets its own two-hour run before freeze, not a smoke test.

**Honest statement about Sunday 18:00.** It is achievable and it has **no slack for an
oracle rejection.** If D's trade-eviction oracle finds the analytics path cannot serve a
complete trade from the journal, or A's parity oracle finds one divergent bar, that slice
rebuilds and Sunday moves to Monday. I am not going to pretend otherwise to make the date
look safe. Monday 2 Aug 18:00 is the same plan with room to be wrong once.

I am proceeding on Sunday immediately so no time is lost either way, and the PO does not
need to choose now.

---

## 4. Ownership, rebalanced for five mechanisms

| Manager | Owns |
|---|---|
| **A** | Base-series residency; compact bar storage; **multichart eviction on close** + the capped room. All one lane, all `chart.js` data paths. |
| **B** | Window-claim hang (P0); nginx buffering; train assembly; the two off-wire rows; deploys. The network fixes are what make cold reopen fast, so they are now load-bearing for A's cache decision. |
| **C** | Every measurement. CONF-01/CONF-02 baselines, five duration grades, the integration run, indicator retention census, `EVICT-01` byte proofs. C is the critical path more than anyone. |
| **D** | Trade eviction (money path, top-tier review); `TEST-02` marker retrofit; skip register. |
| **E** *(new)* | Indicator settings eviction; the seven-row visual overlay cluster. |

**Manager E is now required, not proposed.** I flagged it at 15:40 as a resource question
and had no answer; the scope increase settles it. E owns indicator lifecycle and the
overlay rows, in its own worktree, territory explicitly excluding the `chart.js` data and
storage paths A is rewriting. E's first act is to read whether the indicator and overlay
code lives in modules or inside `chart.js`, and report which — if `chart.js`, E prepares
and lands serially behind A rather than colliding with the memory landing.

---

## 5. Rules carried into every slice

- `EVICT-01` — moved means **released**. Proof is two numbers: retained bytes down, and
  the data still retrievable through the product path that consumes it. One number is not
  proof.
- `EVICT-02` — eviction is keyed to the **playhead**, never wall time, and is
  **reversible on rewind**. This applies to trades and to indicators.
- `CKPT-01` — checkpoint with an **exercised** rollback before each of the five landings.
  D has shown it can be done in minutes; there is no excuse for skipping it.
- `CONF-01` / `CONF-02` — four panels, four symbols, four timeframes, indicators loaded,
  and trades **accumulated** to thirty-plus closed positions. Nothing measured with three
  fresh orders counts.
- `DUR-01` — every acceptance is a slope over two hours, not a reading at an instant.
- `TEST-01` / `TEST-02` — a pack proves its own commits are on the wire, with markers that
  are provably absent from pre-fix builds.
- `FLAG-01/02/03` — five landings, five independent kill-switches, each verified in the
  OFF state against a working-product assertion.

**Non-negotiable and unchanged:** price correctness and the money path. The parity oracle's
verdict is final. Trade eviction ships on top-tier review or not at all. Losing a user's
trade history is the one failure this project cannot absorb, and eviction is a change whose
worst case is exactly that.

---

## 6. Schedule

| When | What |
|---|---|
| Thu 17:00 | E stood up; A checkpointed; C publishes CONF-01/CONF-02 baseline |
| Thu 18:00–Fri 02:00 | A: residency + compact storage. D: trade-eviction **cold-read proof first**. C: indicator retention census, screenshot byte census. B: window-claim P0. |
| Fri 02:00–08:00 | First two duration grades (A's landings) |
| Fri 08:00–18:00 | D's eviction lands; E's indicator eviction lands; A's multichart eviction + capped room |
| Fri 18:00 | Written trajectory report. No meeting, no gate. |
| Fri 18:00–Sat 12:00 | Remaining three duration grades; oracle rework on anything rejected |
| Sat 12:00–20:00 | Assembly of all five behind flags; wire audit clean on every money row |
| **Sat 20:00–Sun 02:00** | **Integration duration run on the assembled build** |
| Sun 02:00–06:00 | Final cuts, `CKPT-01` on the freeze assembly |
| **Sun 06:00** | **Code freeze** |
| **Sun 06:00–14:00** | **Call to test.** D's five packs, CONF-01/CONF-02 staged, skip register clean. |
| Sun 14:00–18:00 | Deploy, smoke, build-stamp verify, canary opens |

PO contact points: **one.** Sunday 06:00. Everything before it is a written report the PO
reads at leisure.

---

## 7. What I owe the PO if this slips

If any slice fails its oracle I say so within the hour, with the number, the reason, and
the new date. Not at freeze. Not on Sunday afternoon. `AUTH-01` removed the PO's decision
gates on the grounds that I would carry the judgement — that only works if bad news travels
at the same speed as good.

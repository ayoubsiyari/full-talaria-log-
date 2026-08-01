# RULING — Manager E's tier, and TOP allocation now that there are five lanes

**Date:** 2026-07-30 16:25
**Authority:** `RULING-RESTORE-MODEL-TIERS-20260729-1705.md` (`TIER-01`, `TIER-02`),
addendum 22:20
**Status:** binding

---

## 1. The question contains a trap the policy already flagged

"Which tier should Manager E be on" reads as a question about E's own model. The 22:20
addendum settled that it is the wrong lever:

> **Correction to the Director's own cost model.** I had treated the manager's own model
> as the lever. It is not. A manager loop is triage and journaling; the subagents are
> many, parallel, and run long tool loops. Concurrent TOP subagents are where the budget
> goes.

So the answer has two parts: what E's own loop runs on, and how E routes its subagents.
The second matters far more.

---

## 2. E's own loop: **MID**

E's loop is dispatch, triage, journaling and reading manager docs. That is MID work and
E gets the same treatment as A, B, C and D — none of whom run TOP as their own loop.

**Model: `gpt-5.5-medium-fast`.** In policy, and spreads load away from
`cursor-grok-4.5-medium-fast` where D currently sits. Grok 4.5 medium would be equally
compliant if the PO prefers consistency with D.

---

## 3. E's subagent routing, by the work E actually owns

| E's work | Tier | Why |
|---|---|---|
| **First task** — read whether indicator/overlay code lives in modules or `chart.js` | **LOW** | Inventory and grep. No judgement. Policy: "inventories, greps, running an existing gate, collecting evidence." |
| Seven visual overlay rows (indicator labels, daily-open lines, ORB/session labels, layout shell) | **MID** author, **MID** review | Bounded, well-specified, RED/GREEN oracle available. Visual only — no money, no price data, no ship gate. |
| Indicator settings eviction — the mechanism | **MID** author | Bounded with an `EVICT-01` byte proof and an `EVICT-02` playhead cell. This is the "most work" case the policy assigns to MID by default. |
| Indicator eviction — **kill-switch semantics review** | **TOP**, once | Policy names kill-switch semantics as TOP-required: "a switch that fails is how a bad fix stays live." One review, not a lane. |
| Escalation | **TOP** author only after a packet is **rejected twice**, and only the role that is failing | Standing rule. |

**E does not get TOP by default and should be told so explicitly.** New managers
over-escalate; C ran eight consecutive TOP packets on M6 and that is what triggered the
original ruling. The policy calls that "a defect, not diligence."

---

## 4. The real consequence: TOP contention across five lanes

Five lanes now compete for TOP capacity in a 38-hour window, and `TIER-02` says the
Director reduces the *number* of concurrent TOP reviews and serialises them — never
downgrades a reviewer to save budget. That requires an explicit order, or the loudest lane
wins by accident.

**TOP allocation, in priority order. Higher priority pre-empts lower.**

1. **D — trade eviction.** Money path, and its worst case is losing a user's trade
   history. This is the single most consequential review of the weekend and it is not
   cheapened for any reason.
2. **A — parity oracle on base-series residency and compact bar storage.** Price data. A
   divergent bar is a correctness failure that reaches every user.
3. **B — train assembly and the deploy gate.** Ship gate; what reaches the canary.
4. **E — the one kill-switch semantics review.** Single packet, queues behind the three
   above, does not block E's other work while it waits.
5. **C — none by default.** Instruments are trusted because `GATE-01` shows them RED on a
   known-defective input, not because of the tier that wrote them. C escalates only on a
   twice-rejected packet.

**If limits tighten:** serialise in the order above. D's reviews never queue behind
anyone's.

---

## 5. `TIER-01` compliance is not optional for E

E records `tier=` and `model=` on every packet from its first entry, and justifies any
TOP claim with one clause naming why the packet needs it — the way B did for the nginx
packet. Two standing reasons:

- Silent downgrade is what cost us hours yesterday and was invisible while it happened.
- A tier claimed by reflex and a tier claimed by need look identical in a log unless the
  reason is written down, and the log is what we audit.

E also inherits the refusal duty: E does **not** proceed on a packet requiring TOP review
if TOP cannot be obtained. It reports the block instead. That is the one thing E is
allowed to stop for, and it is the exception to `AUTH-01`, not a violation of it.

---

## 6. Reminder issued to the other four

`TIER-01` compliance was verified in the journals yesterday and was good — D at
`tier=mid model=gpt-5.5` escalating only money-path review, C at MID on gpt-5.5 and
grok-4.5, B justifying its one TOP claim in the entry. That standard holds through the
weekend with one addition: five lanes means the TOP order in §4 is now explicit, and a
manager taking TOP out of order is taking it from D's money-path review.

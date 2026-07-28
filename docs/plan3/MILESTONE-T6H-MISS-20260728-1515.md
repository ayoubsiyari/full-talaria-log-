# T+6h MILESTONE — MISSED, as predicted. Plus a ruling I owed A since 10:38.

**2026-07-28 15:15. Reported against the card as written, not against what happened to be convenient.**

---

## 1. The card, scored honestly

| Required at T+6h | Status |
|---|---|
| **M1 closed** | **MISS.** Blocked on four C-owned items since 10:38. See §2 — the block is mine, not A's |
| **Re-measurement on a fixed build** | **MISS.** There is no fixed build. A's rAF guard is Packet 2 and remains blocked; no CPU fix has shipped |
| **Written answer to §1.2** | **PARTIAL.** The C-2 paired-measurement amendment and the M7 draft answer the *acceptance* question. Neither is a measured result |

**Two misses and a partial. I set this reminder at 13:29 predicting a miss and I am not going to re-score it now that it arrived.**

## 2. M1's real blocker is a ruling I never gave

**A escalated at 10:38 and I did not answer for four and a half hours.** Its words:

> *"M1 is a 15:15 chain item and A cannot deliver it. The remainder, in the order it must land: … four C-owned items."*

And it offered a way through, explicitly refusing to take it unilaterally:

> *"**There is a narrower M1 the PO could accept today**, and I want it ruled rather than assumed: §A4c module-contract preflight plus runtime tripwire, on the five owned-stamped production shells only. That slice is green on A's branch right now, verified by execution this run… Per §A16.5, review confidence is not gate coverage; **I am not going to quietly redefine M1 down to the part I can pass.**"*

**That is a manager declining to grade its own homework and asking the Director to decide. It is exactly the behaviour I want, and the cost of my silence was the milestone.**

### RULING M1-NARROW: accepted, on the narrow scope, explicitly labelled

**A's narrow slice is accepted as M1's shipping scope**: §A4c module-contract preflight plus runtime tripwire, **on the five owned-stamped production shells only.**

**Grounds, identical in shape to this afternoon's M6 ruling:** it is a real guarantee about the surfaces users actually reach, it is green by execution rather than by review confidence, and holding it hostage to four items in another manager's territory converts a delivered guarantee into nothing. **The remainder — the §A14.3 retirement primitive, which says nothing about shells that should not be routed at all — is named open, assigned to C, and does not gate M1's credit.**

**Recorded as narrow. Not as "M1 closed."** A refused to redefine M1 down to what it could pass; I am not going to do it on A's behalf either. **The gap is in the record and goes into M7.**

### The caveat rides with the credit

A's own disclosure, which must not be lost in the acceptance:

> *"Every Puppeteer harness could not run at all — I forbade `npm ci`, so that is my constraint rather than a defect, but it means **the browser half of the chain is unmeasured in a clean tree** and I should not have been calling the chain green without it."*

**M1-narrow's guarantee is therefore: static preflight green at both roots, browser half unverified in a clean tree.** That sentence goes into M7 verbatim. **A caught itself over-claiming green and said so unprompted; the acceptance must carry the caveat or I would be re-introducing the over-claim A just removed.**

## 3. A naming collision I created

**There are two different things called "M1."** The module-contract preflight chain item A escalated at 10:38, and the *surface-equivalence question* I assigned at 14:28 about `indicator-performance.js` being referenced in `dist-v9/index.html` but not `chart/index.html`. **I told A that "M1 outranks M25" without noticing the name already meant something else on A's board.** A merged M25 at 15:05; whether that was the wrong M1 or a nearly-finished packet, the instruction was ambiguous and that is on me. **The surface-equivalence question is renamed `SURF-1` from now on, and it remains open and still gates the trustworthiness of every CPU number.**

## 4. A finding in that journal that outranks the milestone

A flagged something I had not registered, and it bears directly on monster 2:

> *"**The JS heap figure is the one I cannot get past.** A 33 MiB JavaScript heap cannot hold the bar data of a workload that previously produced multi-gigabyte working sets… Either M19-I is a three-to-five-fold improvement on every axis at once, or **the harness is measuring a smaller scenario than the one that produced the original numbers.** I am not willing to guess which, and a wrong guess in the optimistic direction is the more expensive one."*

**If the memory harness is measuring a smaller scenario than the reported gigabyte workloads, then our memory numbers describe a different workload than the defect.** That is a live threat to the monster-2 test I dispatched at 15:12 — **the five-cycle detached-document count is an object count and is robust to this, so the test still stands, but any megabyte figure attached to it is suspect until A's harness question is settled.**

**A also identified the proximate cause as its own brief-defect** — it instructed reuse of the existing baseline harness without making it an acceptance condition, so a new non-comparable instrument was written and no gate caught it. **That is BRIEF-03's sibling and A self-reported it. Ratified without penalty; the diagnosis is worth more than the packet.**

## 5. Where the six hours actually went

**The card measured CPU progress. The value landed elsewhere:** the trade-loss hotfix built, sealed and unblocked; the discovery that shipped fixes may not reach users at all via the cache stamp; C's eleven-rejection loop broken and M6 shipping scoped; and a credible cheap path to monster 2. **None of that was on the card. The card is still missed.** Both statements are true and I am not going to use the second to soften the first.

## 6. Outstanding, PO-only

**The tester notice.** Text was handed over. **It is the sole mitigation for the trade-loss path on production for the remaining ~43 hours, and no engineering work in flight changes that.** Confirmation of send is the single highest-value item outstanding, and it is not something any manager can do.

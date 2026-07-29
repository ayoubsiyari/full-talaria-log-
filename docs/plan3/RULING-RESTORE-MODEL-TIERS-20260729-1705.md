# RULING — restore the three-tier model routing after the API-limit fallback (2026-07-29 17:05)

API capacity ran out unnoticed and every manager fell back to a single model. The PO has restored
capacity and paused all four managers. This ruling reinstates the routing policy and settles what
the fallback period did to our evidence.

## The policy, restored (from C-5, 2026-07-28)

| Tier | Use it for |
|---|---|
| **TOP** | Reviewer on **money-path** and **ship-gate** work. Author only after a packet has been rejected twice. |
| **MID** | **Default author** for any bounded, well-specified packet that has a RED/GREEN oracle. This is most work. |
| **LOW** | Mechanical work with no judgement: inventories, greps, running an existing gate, collecting evidence, journal and doc updates. |

Two standing corrections from C-5 remain binding:

- **Escalate-on-repeat-rejection stays**, but escalating *both* author and reviewer on every
  iteration is how that rule becomes a blank cheque. Escalate the role that is failing.
- **Top tier on both roles for eight consecutive packets is a defect**, not diligence. C did this on
  M6 and it was the trigger for the original ruling.

## Money-path and ship-gate, defined so nobody has to guess

TOP-tier review is required where a mistake costs money or ships silently:

- Anything touching orders, positions, balance, SL/TP execution, or the trade journal — D's entire
  territory qualifies.
- The deploy gate, the build assembly, and any change to what reaches the canary — B's train.
- Kill-switch semantics, since a switch that fails is how a bad fix stays live.

Everything else defaults to MID author, and the reviewer matches the packet, not the manager.

## What the fallback period did to the evidence

Work authored on an unintended tier is **not automatically invalid**. The RED/GREEN oracle is what
makes a fix trustworthy, and that oracle does not care which model wrote it. A fix with a
demonstrated RED and a passing GREEN stands.

But two things do need revisiting:

1. **Any ship-gate or money-path review performed during the fallback was done below policy.**
   Those specifically must be re-reviewed at TOP tier before canary. B and D should each identify
   which of their reviews fall in that window rather than assume none do.
2. **A's Cluster C authors died twice on API limits** (`v1` and `v2`), producing zero product
   commits. That is lost time, not lost evidence. The probe finding preserved in the redispatch —
   independent-pair starve when `ensureReplayDataCoversTimestamp` keeps a cover promise in flight
   while `replayTimestamp` advances — survives and is the most useful thing to come out of it.

Promote **TIER-01**: a manager must record `tier=` and `model=` on every packet, and must refuse to
proceed on a money-path or ship-gate packet if it cannot obtain TOP-tier review. Silent downgrade is
the failure we just experienced, and it was invisible for hours.

## Resume state at the pause

| Manager | Stopped at | Resumes on |
|---|---|---|
| **A** | Cluster C author v3 redispatched after two API deaths | Cluster C NQ paint-starve, then SYMBOL-PERSIST |
| **B** | Assembling; **live floor still b90 from 14:46** | Deploy. Nothing else until a build number exists. |
| **C** | Interval budget gate RED on pinned b90 — GATE-01 satisfied | Calibrate against the real canary; the 20x disagreement with the PO |
| **D** | Timezone fix landed (`chartTimezone` over V9 Chicago) | Cluster G remainder |

B remains the critical path. A's orphan-listener kills and lag tick fix have been finished for two
hours and are still not live, so the leak is fixed in code and unfixed in the product.

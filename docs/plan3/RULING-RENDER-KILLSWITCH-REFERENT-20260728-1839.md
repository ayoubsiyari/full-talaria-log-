# RULING — the "render-path fix" needing a kill-switch is the V6-P4 chart.js invalidation change, by elimination. But the rule is what blocks the train, not the identity, so it generalises: nothing that changes render behaviour ships without a runtime kill-switch.

**2026-07-28 18:39. A asked which artifact I meant. The ambiguity was mine.**

---

## 1. Owning the defect first

**I wrote "A's render fix MUST have a runtime kill-switch (blocks train)" without naming a file, a flag or a packet.** That is the same failure mode I have repeatedly sent back to managers — a brief that describes rather than identifies. **A was right to stop and ask instead of guessing, and asking cost minutes where guessing could have cost hours.**

## 2. The referent, by elimination

**Answer: option A, the V6-P4 lines-disappearing cure in `chart.js` invalidation.**

**Not option B, `__TALARIA_DISABLE_ORDER_OVERLAY_PAN_ALWAYS_V1`** — the referent needs a kill-switch, and that one *is* a kill-switch. It cannot be the thing lacking one.

**Not option C, the M25 accessor.** I cancelled M25 Packet 1 at 17:42, and an accessor conversion is a refactor with no behavioural delta — there is nothing for a flag to switch off. **If A is still holding M25, that confirms the cut has not landed; treat the cut as in force.**

**That leaves the V6-P4 invalidation change, which is the only live item among the options that alters what the chart decides to redraw** — squarely render-path behaviour, and squarely the class of change that must be revertible at runtime rather than by redeploy.

## 3. The generalisation, which is what actually blocks the train

**The ruling's substance was never about one artifact.** B's objection was that something changing render behaviour was sitting in the release train with no way to switch it off in the field. **That objection is correct for every such change, not just the one B happened to notice.**

**Ruling: A enumerates every item it has in the train that alters render or invalidation behaviour, and confirms each has a runtime kill-switch. Any that lacks one is added before the train closes.**

**This makes the answer robust to my own uncertainty.** If B meant something other than V6-P4, the enumeration catches it anyway, and **no further round trip between A and B is needed.** A should not wait on B for this.

## 4. Why a runtime switch specifically

**Stated because it determines the implementation, not as justification.** A rebuild-and-redeploy revert is not a revert during a canary — the deployment model is a single push, so **an unflagged regression discovered after the push cannot be undone without another push.** The switch must be readable at runtime by the running page, in the same style as the existing `__TALARIA_DISABLE_*` flags, and **flag-on must restore the previous behaviour exactly** rather than approximately.

## 5. Precedence note

**This does not reopen anything cancelled.** M25 Packets 1 and 2 both remain cut, the rAF guard remains cancelled, and A's five-item order from the 17:42 rebalance stands with the kill-switch as item 1 — **now with a named referent and an enumeration requirement attached.**

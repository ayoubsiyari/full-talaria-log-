# CORRECTION to D-8 — I gated FIX 1's merge on a switch reaching all panel realms and in the same ruling sent the realm mechanism to top-tier review, which is the capacity we do not have. That chains FIX 1 to the blocker D-8 was granted to escape, making the grant hollow. FIX 1 reads its own flag through the parent window directly; the generic mechanism stays top tier and stops being FIX 1's dependency.

**2026-07-29 00:00. Caught before dispatch rather than by A stalling on it. The two constraints were written eight paragraphs apart in the same document and I did not compose them.**

---

## 1. The chain I built

**D-8 §3 control 1:** FIX 1 does not merge without a kill-switch **reaching every panel realm**, reversible without reload.

**D-8 §2:** the realm propagation mechanism **is excluded from mid-tier review and waits for top tier.**

**FIX 1's code is in `chart.js`, which executes inside each panel iframe, so its flag is read in the panel realm.** Therefore FIX 1 needs realm propagation, therefore FIX 1 needs the mechanism, therefore **FIX 1 waits for top-tier capacity — the exact blocker the PO granted D-8 to route around.**

**The grant, as written, unblocked nothing.**

## 2. Why the exclusion was still right

**I am not withdrawing §2.** The reasoning holds: the generic mechanism will carry the switch for FIX 1, for FIX 2's cancelled flag if it ever revives, for the three suspected-stranded packets, and for the ~145 deferred switches when their audit lands. **It is infrastructure whose silent half-failure would make every switch in the tree look present and do nothing, and it is not reviewable at a discount.**

**What was wrong was making FIX 1 a consumer of infrastructure it does not need.**

## 3. The correction

**FIX 1 reads its own flag directly through the parent window** — panels are same-origin iframes served from `/chart/multichart-prod/`, so a guarded read of the host's property is available without any propagation layer.

**Shape, for the avoidance of a second wrong turn:** the panel resolves its flag as *its own realm first, then the host's*, inside a try/catch, evaluated **at each decision point rather than sampled once at init** — which is what makes it reversible without reload per `FLAG-02`, and testable against the **absent** property per `FLAG-01`. **A single-purpose read of one named flag is small enough to review inside FIX 1's mid-tier packet.**

**The generic mechanism remains top tier and remains ordered. FIX 1 simply stops depending on it.** When the mechanism lands, FIX 1's bespoke read is replaced by it — **and that replacement is a simplification, not a migration.**

## 4. What this does not license

**Every other switch in the train keeps waiting for the generic mechanism.** **This is not a pattern to copy twenty-eight times** — a per-switch bespoke read repeated across the tree is precisely the mess the generic mechanism exists to prevent, and the second instance of it should be rejected on sight.

**One exception, granted because FIX 1 is the only fix on the critical path tonight and the read is three lines. Not a precedent.**

## 5. Method note on myself

**Both constraints were in one document, eight paragraphs apart, and I published without composing them.** That is the same failure as the unsatisfiable de-route gate at 22:25 — **a criterion that reads as sound in isolation and is impossible in combination with something I wrote myself.**

**The pattern is now twice in three hours, and it has a shape: I check each requirement against the world and not against my other requirements.** Recording it here rather than in a rule, because the remedy is attention rather than process, and a process step I would also forget to run is not a remedy.

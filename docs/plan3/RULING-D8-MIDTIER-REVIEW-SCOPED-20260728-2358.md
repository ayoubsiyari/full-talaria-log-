# PO DECISION D-8 — Mid-tier review is permitted for FIX 1, scoped to FIX 1 alone, with the compensating controls made binding rather than assumed. The realm propagation mechanism is explicitly excluded, because you may relax review on a change that a kill-switch protects but never on the kill-switch mechanism itself.

**2026-07-28 23:58. The downgrade is justified only by the controls. If the controls are optional, this is not a compensated downgrade — it is a lowered bar with a paragraph attached.**

---

## 1. Granted, narrowly

**FIX 1 — the background-panel render cadence change — may be authored at mid tier and reviewed at mid tier.**

**This is not a general relaxation of `A13`'s reviewer-tier rule. It applies to one named packet.** Any other `chart.js` shared-path change still requires top-tier review, and **the moment top-tier capacity returns this grant lapses without further instruction.**

## 2. The exclusion, which matters more than the grant

**The realm propagation mechanism is NOT covered and must be reviewed at top tier, even if that means it waits.**

**The reasoning is structural rather than cautious.** Every compensating control below rests on the kill-switch working. **The realm mechanism is what makes kill-switches work across panel iframes.** Reviewing it at reduced tier would mean **relaxing review on the very thing whose reliability justifies relaxing review elsewhere** — the risk becomes circular, and a silent half-failure in that mechanism would leave every switch in the train looking present and doing nothing. **That is the exact defect class Plan 3 exists to eliminate.**

**So: FIX 1 may go out reviewed at mid tier because a working switch can retract it. The switch mechanism itself gets no such protection and therefore no such discount.**

## 3. The four controls, now binding

**1. Runtime kill-switch, satisfying both directions.** `__TALARIA_DISABLE_MC_BACKGROUND_RENDER_CADENCE_V1`, reaching every panel realm, reversible without a page reload per `FLAG-02`, and testable against the **absent** property per `FLAG-01`. **FIX 1 does not merge without it.**

**2. Independent grading by C's W64 instrument — and this carries a dependency I am naming rather than assuming.** W64 must clear its own adversarial review `R-W64` first. **Two of the seven attack vectors against it would invalidate the smoothness figure specifically.** **Grading a fix with an unvalidated instrument is not an independent control; it is a second unverified claim standing next to the first.**

**3. PO verification by feel on the deployed build.** The defect was found by a human noticing it. **A measured improvement that the PO cannot feel is not a fix of the reported complaint.**

**4. Adversarial review discipline is unchanged by the tier.** Mid tier does not mean a friendly read. **The review brief carries named attack vectors in the manner C has been using, and a reviewer that returns ACCEPT without having attempted to break the packet has not reviewed it.**

## 4. The trap this creates, stated plainly

**FIX 1 was validated by C's reading: throughput retention 1.0, smoothness retention 0.167.** **If `R-W64` upholds the attack that smoothness was measured from host long-tasks and credited per panel, that reading falls — and FIX 1's justification falls with it.**

**Ruled: FIX 1 must not merge on the strength of a measurement that review has refuted.** If `R-W64` invalidates the smoothness figure, **FIX 1 returns to the same status FIX 2 had at 23:11 — an unmeasured premise — and it is re-decided, not shipped on momentum.**

**I am writing this now, before the review returns, because the temptation to keep a fix that already has a green light is strongest after the light turns amber.**

## 5. Recorded in the artefact, not only here

**The packet records that it was reviewed at mid tier under D-8, with the four controls named.** **`M7` must not describe the multichart lag improvement with more confidence than the review tier and the instrument's own status support.** If the number came from a short window on a harness whose panel-independence check was red, **that is what the release notes say.**

## 6. What proceeds immediately

**A:** realm mechanism at top tier when capacity permits; **FIX 1 authored now at reduced tier, merge gated on the kill-switch and on `R-W64` clearing.**
**C:** `R-W64` is now on the critical path — it gates FIX 1's merge. It outranks the soak exemption.
**B:** unchanged — the guard-firing check on the live host remains the highest item on the board, because it concerns data rather than frame rate.

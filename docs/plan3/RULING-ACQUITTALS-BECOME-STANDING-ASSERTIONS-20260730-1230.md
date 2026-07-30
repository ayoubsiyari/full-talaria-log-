# RULING — an acquittal without a standing assertion is a rumour

**Director · 2026-07-30 12:30 · PO order · binding on A, B, C, D**

## The PO's objection, and the evidence behind it

> "It happened several times that you claim a monster, measure, claim it's innocent, then
> we find out it was a real monster. I want the innocent ones dead so they can't rebel
> again if we missed something."

The PO is right on the record, and today supplies the strongest possible example: **A
measured GC overhead at 0.258% and I acquitted allocation entirely. It is 75.55% of
playback allocation — 176 MB/s.** The acquittal was wrong for a full day, and it was
wrong in a way nobody could see, because the measurement was correct and the *question*
was wrong.

Other failed acquittals this week: the document staircase, recorded as a misreading and
then reproduced in a controlled harness. The leak "collapsed on b85", retracted the same
day. The DOM-node gap, withdrawn by A against its own earlier claim.

**An acquittal has failed roughly as often as it has held. It is therefore not a
conclusion; it is a claim with a shelf life.**

## Why I am not simply cutting the twelve

The PO's remedy — kill them anyway — is correct in instinct and wrong in one specific
case that would cost us the canary. Converting bar storage to typed arrays is the
highest-risk refactor available in this product, it touches every price calculation, and
the measured prize is **465 KB**. Cutting an acquitted suspect *because we once suspected
it* would trade a real chance of mispricing a trade for nothing.

So the answer is not to cut them. It is to make the acquittal **permanent, automatic and
self-reporting**, so that if it was wrong — or becomes wrong next month when someone
changes the code — the build tells us instead of the PO discovering it in production.

## ACQUIT-01 — the rule

**Every acquittal ships a standing assertion that fails if the acquittal was wrong.**

An acquittal states a number. The assertion holds that number inside a budget. It runs in
CI on every build, forever. **An acquittal without an assertion is deleted from the
record and the suspect returns to the hit list.**

This is strictly stronger than cutting the code, and the reason is worth stating: cutting
proves the suspect is not guilty *today*. An assertion proves it is not guilty *on every
future build*, including builds written by people who have never read any of these
documents. It also catches the failure mode that actually bit us — a measurement whose
configuration silently changed — because the assertion re-measures rather than
remembering.

**MEAS-02 is folded in:** every assertion records the gauge and the sampling
configuration it depends on. An assertion that would go quiet under a config change is
not an assertion.

## The twelve, converted. Owner and assertion for each.

| Acquitted suspect | Standing assertion | Owner |
|---|---|---|
| Columnar bar store | resident bar count stays windowed; fails if resident bars exceed the window budget | C |
| Indicator series allocation (0.06%) | allocation share stays under 5% with four indicators loaded | A |
| Marker / order rebuilds (0.56%) | allocation share stays under 5% across the 63 sites | A |
| Countdown / price-label string formatting (0.04%) | same budget cell as above | A |
| Animate-loop `Error` construction (0 bytes) | zero `Error` constructions inside the animate loop; fails on one | A |
| Per-realm script duplication (+5 MB) | script cache growth per added panel stays under 10 MB | C |
| Multi-process split | renderer-process count for the app tab stays at 1 | C |
| DevTools heap inflation | every heap figure is taken post-forced-collection; a pre-GC figure fails the cell | C |
| GPU memory growth | tab GPU memory returns to baseline across four open/close cycles | C |
| Forward mutation in teardown loops | every teardown loop snapshots keys before mutating; fails on a direct-iteration mutation | A |
| Inline source maps | no served bundle carries `sourceMappingURL=data:`; CI grep | B |
| Runtime `insertRule` / `deleteRule` | zero occurrences outside the harness; CI grep | B |

**Deadline: all twelve assertions exist before the canary freeze.** The two CI greps are
minutes. The budget cells reuse A's allocation sampling harness, which already exists and
already produced the FIX 2 answer. The census cells reuse C's harness. **None of this is
new instrumentation — it is pinning instruments we have already built.**

## Cut anyway, where cutting is free

Where a cut is trivial and carries no behavioural risk, the PO's instinct wins outright
and we do both:

- **Orphan glow `<filter>` defs** — already on A's list as a real unbounded append, and
  the advisor named them as a raster cost. Cut, not merely asserted.
- **Anything repainting while replay is paused** — cut what flashes.
- **The served harness, `node_modules`, `frozen/` and 1,120 `.map` files** — deleted
  from the served image, not asserted around.

## The second question — the thirteen still alive

**They do not need hunting again. Eleven of the thirteen already have a named owner and a
today deadline** as of the 12:00 ruling. Two need attribution before they can be cut, and
both have a cutoff rather than an open-ended investigation:

- **~196 MB malloc/PartitionAlloc** — C attributes. If C cannot name a target by 18:00, A
  cuts the largest candidate allocators behind one flag and the A/B decides.
- **62 stylesheet invalidations/sec** — C names the writer by 15:00, or A cuts all 35
  `setProperty` sites in `chart.js` behind one flag.

**Honest forecast, because the PO should not be surprised at the freeze.** I expect
**nine or ten of the thirteen dead or materially reduced by canary.** The three I expect
to survive:

1. **The ~196 MB allocator mass.** Largest unexplained number in the plan, first owned
   only three hours ago. Attribution may land; a full fix inside 34 hours would be
   luck rather than planning.
2. **The 80 MB marginal cost per panel**, which probably overlaps item 1 and shares its
   fate.
3. **Seven documents on a single chart.** Cheap to enumerate, potentially structural to
   fix.

Those three get **named in the canary disclosure** rather than quietly omitted. That is
what the disclosure is for, and a disclosure that lists nothing is a disclosure nobody
should trust.

## What this changes about how I report

I will stop reporting acquittals as progress. **An acquittal is a narrowing of the
search, not a win.** The only numbers that count as progress are convictions that reach
the live server and get re-measured there. By that standard today's score is still zero,
and it stays zero until B ships.

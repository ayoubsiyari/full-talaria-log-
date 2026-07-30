# RULING — the disclosure is cancelled; the bar is measured-clean or it is a PO decision

**Director · 2026-07-30 12:40 · PO order · binding on A, B, C, D · supersedes all disclosure language in every prior plan document**

## The PO's order

> "What disclosures. I said canaries get a fully functioning product. No lag, no memory
> leak, no CPU issues, nothing should be wrong to disclose. You leave no suspects behind,
> you leave no evidence. This is a search and kill on sight campaign, not a court room."

**Accepted in full. Every reference to a canary disclosure in every prior document is
struck.** `PLAN-CANARY-36H`, `PLAN-CANARY-24H` and the 12:30 acquittal ruling all carried
disclosure language and it comes out of all three.

## Why the PO is right about this, and not merely the boss

A disclosure document is a Director deciding, in advance and alone, that shipping a known
defect is acceptable. **That decision is not mine.** It belongs to the person who owns the
product and faces the users, and by writing it into the plan I was quietly removing it
from him. Worse, a disclosure is a place to put things instead of killing them — the
existence of the document creates the incentive to fill it.

There is no such document. There is no place to put an unfixed defect.

## The bar, restated as numbers so nobody can negotiate with it later

"Nothing wrong" has to be measurable or it is a mood. These are the acceptance
conditions, and each one is a gate, not an opinion:

**No memory leak.** Cross-frame total and the census — documents, listeners, timers,
workers, ports, live instances — return to within the noise floor of a fresh load after
four multichart open/close cycles **and** after four in-tab session switches. Both
cycles, because the session-switch case is the one nobody tested until today. Measured
post-forced-collection, one gauge, stated configuration.

**No lag.** The PO's own eyes on four charts playing, plus continuous paint on every
panel, plus no frame over the budget in a sixty-second soak. The PO's verdict is the
gate; the instruments exist to make it reproducible, not to overrule it.

**No CPU issue.** Playback CPU measured across renderer, GPU and browser processes —
because we spent a week quoting the tab alone and calling the GPU free. Target: the
206% total we measured this morning cut to a level that does not throttle a laptop. The
clone cut alone is measured at −35% renderer CPU.

**Nothing unexplained.** Every number on the hit list either has a fix on the wire or has
a death certificate with a number. **No suspect is left in an intermediate state — not
"investigating", not "parked", not "probably fine".**

## The distinction that decides whether anything survives, and it is not a loophole

I listed three items at 12:30 as likely to survive to canary. I need to be precise about
what they are, because it changes whether they violate the PO's bar at all.

**A leak is unbounded growth. A floor is a fixed footprint.** They are different defects
with different tests and different consequences.

The ~196 MB of allocator memory, the ~80 MB marginal cost per panel and the seven
documents are **floor**, not leak. They do not grow without bound, they do not cause lag,
they do not throttle a CPU, and they do not put a wrong number in front of a trader.
They make the application heavier than it should be.

**So the honest question is not "do they survive" but "is the floor acceptable".** And
that has a measurable answer: **parity with what a comparable product costs.** A
competitor was observed at roughly 490 MB. If we land at or under that, there is nothing
wrong and nothing to say. If we land materially above it, that is not a footnote I bury —
**it is a single escalation to the PO with a number, and the PO decides.**

That is the replacement for the disclosure: **not a document, an escalation.** One line,
one number, PO's call, at the freeze.

## Method, taken as ordered

**No suspect is left behind and no evidence is left in place.** Concretely:

- Every one of the thirteen live suspects is either **fixed on the wire** or **cut behind
  a flag** by the freeze. Nothing stays under investigation into the canary.
- Where attribution has not landed by its cutoff, **we cut broadly behind one flag and
  let the A/B decide** rather than continuing to investigate. Cutoffs stand: the
  stylesheet writer at 15:00, the allocator mass at 18:00.
- The twelve acquittals still ship their assertions (ACQUIT-01 unchanged) — that is not
  a courtroom, it is the tripwire that stops an acquitted suspect coming back.
- The served harness, `node_modules`, `frozen/` copies and 1,120 `.map` files are
  **deleted**, not documented.

## What I still will not do, and it is one sentence

I will not ship a change to a money path without the gate that proves the price is right,
because a canary user losing money is the one outcome worse than a canary slipping. That
is the PO's own standing position and it costs us nothing here — **every item on the hit
list is performance or memory, so nothing on it is slowed by this.**

## What changes in the next thirty-three hours

The freeze deliverable is no longer "a build plus a disclosure". It is **a build plus a
gate report**: every acceptance condition above, green, on the served build, measured
with a stated gauge. If any cell is red at the freeze, I bring the PO the red cell and a
number, not a paragraph explaining why it is acceptable.

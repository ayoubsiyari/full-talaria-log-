# RULING — no suspect retires without a number, and everything parked is re-armed

**Director · 2026-07-30 12:00 · PO order · binding on A, B, C, D**

## The PO's correction, and it lands

> "I don't want any suspects. We don't negotiate with kidnappers, we shoot them."

Accepted. I have been retiring candidates at a rate that looks like progress and is
partly just tidying. The distinction I should have been holding, and will now enforce
mechanically:

**A suspect killed by a MEASUREMENT is dead. A suspect parked by an ARGUMENT is alive
and must be shot.**

A profiler returning 0.04% *is* the bullet — cutting that code costs risk and buys
nothing measurable, and "kill on sight" was never an order to spend the canary window on
rounding errors. But that is the only acceptable death, and by that standard **several
things I have called closed today are not closed. They are parked.** The PO is right and
this ruling re-arms every one of them.

## KILL-02 — the rule

**A suspect may be retired only by producing the number that killed it.** The number, its
gauge, its configuration (MEAS-02) and its date go in the ledger beside the row.

**Anything that cannot produce that number is cut behind a flag, today, regardless of
how plausible the argument for leaving it is.** A parked suspect with a good story is
worse than a bad fix behind a switch, because the switch is reversible in seconds and the
story costs a day.

**The Director does not park. The Director assigns or shoots.** Every item below that
lacked an owner this morning lacked one because I was reasoning about it instead of
routing it.

## The hit list — everything currently alive, with an owner

Ordered by size of the unexplained number.

**1. ~196 MB of malloc/PartitionAlloc in the renderer. UNATTRIBUTED AND UNOWNED.**
This is the **largest unexplained number in the plan** and nobody has been on it. C
withdrew the DOM attribution and I recorded the withdrawal without reassigning the
mass. Two thirds of a single chart's renderer process, unexplained. **C attributes it,
A cuts whatever it names, today.**

**2. `_reseedReplayFullRawFromLoadedData` — 995 MB in the A/B.** Named as the relocation
target when the clone is removed and then left standing. A new top allocation site is
not a footnote to a fix, it is the next target. **A, same packet as the clone cut.**

**3. The 80 MB marginal cost per panel, of which only ~8 MB is JavaScript.** Measured
this morning, never attributed. Overlaps item 1 and may be the same mass. **C, together
with item 1.**

**4. 62 stylesheet rule-set invalidations per second.** I flipped ownership from the
design layer to the engine on a grep and then assigned a *measurement*. **C names the
writer within the hour; A cuts it the same day.** If C cannot name it by 15:00, A cuts
all 35 `setProperty` sites in `chart.js` behind one flag and we find out by A/B.

**5. Seven documents on a single chart.** Never explained, repeatedly observed.
Enumerate, do not count. **C enumerates; A cuts every one that is not justified.**

**6. Node accumulation across session loads.** Suspended pending the forced-collection
test, which is the correct instrument and is **due today, not "when convenient".** **C.**

**7. Cache accumulation across in-tab session loads** — image 63 → 86 MB, script 32 → 65
MB over four loads. Open, and B has the question of whether a session switch is a real
navigation. **B answers and caps it today** — if the browser will not evict, we evict.

**8. Residency.** Parked on A's observation that fetch is already viewport-windowed.
**A answers in one line: does the residency packet remove anything the windowing does
not?** If yes it ships today. If no it is killed with a number and removed from every
plan document. It does not stay parked.

**9. Anything that repaints while replay is PAUSED.** The advisor's cheapest check.
**Cut what flashes, do not catalogue it.**

**10. Listeners that accumulate across chrome open/close.** **C counts, A cuts.**

**11. Compositor layer churn.** **C counts, A cuts.**

**12. Hover render scope.** The dashboard campaign's 31.5 ms → 0.42 ms bug, every
precondition present here. **A profiles a pointer sweep and cuts what commits outside
the hovered element.**

**13. Image and script assets beyond the logos.** **B, already running.**

## What stays dead, with its death certificate

Recorded so nobody re-litigates them and so the PO can audit the standard.

| Suspect | Number that killed it |
|---|---|
| Columnar bar store | 2,011 bars resident of 6.1M; ~465 KB total at 231.4 B/bar |
| Indicator series allocation | 0.06% of playback allocation; 7.28% with four indicators, outweighed 11:1 |
| Marker and order rebuilds | 0.56% across 63 sites |
| Countdown / price-label string formatting | 0.04% |
| Animate-loop `Error` construction | zero bytes, zero call sites |
| Per-realm script duplication | +5 MB for three extra panels, not +96 MB |
| Multi-process split | one renderer row at eight panels |
| DevTools heap inflation | JS fell 332 → 128 MB on attach; opposite sign |
| GPU memory growth | near-fixed on controlled census |
| Forward mutation in teardown loops | all four loops snapshot before mutating |
| Inline source maps | absent from every served bundle over 100 KB |
| Runtime `insertRule`/`deleteRule` | zero occurrences outside the harness |

**Every row in that table has a number. That is the standard, and anything that cannot
meet it is on the hit list above instead.**

## One thing I will not do, stated once

I will not ship a change to a money path without the gate that proves it. Not because it
is a suspect worth negotiating with, but because a wrong fill price is a worse outcome
than a slow chart, and the PO's own standing position is that the canary must not
surprise users in front of their trades. **Kill on sight applies to performance and
retention. It does not apply to correctness, where the order has always been: gate
first, then cut.** Every item on the hit list above is performance or retention, so
nothing on it is slowed by this.

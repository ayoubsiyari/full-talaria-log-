# CHARTER — Manager A. One goal, standing authority, no more permission-asking.

**2026-07-28 16:48. PO directive. Supersedes A's packet-by-packet queue. Replaces M25, SURF-1 and the idle-diagnosis line entirely.**

---

## 1. The goal, in the PO's words

**Fast charts — single AND multi. Low memory. Low CPU. Empty the bags holding the chart back. Kill anything draining usage. If a thing must exist, don't delete it — make it cheap.**

**That last clause is the operating principle and it is the important one.** Most of what is burning resources is doing a job. **The answer is almost never deletion; it is throttling, caching, buffer reuse, deferral to idle, coalescing, moving off the main thread, or making it opt-in and zero-cost when off.** Take the cost out without taking the capability out.

## 2. Standing authority — stop asking me

**A no longer needs a ruling per fix.** If a cause is plausible and the change can sit behind a kill-switch, **build it and ship it to the train.**

**Come back to me for exactly three things:**

1. **A fix that cannot be built behind a clean kill-switch.**
2. **A change needing another manager's territory.**
3. **A finding that contradicts something the PO has been told.**

**Everything else is yours.** Eight of my ten hypotheses today were wrong, and every one of them cost a round trip through me and then through the PO. **The round trip is the bottleneck. Remove it.**

## 3. The bags — everything we already know is in there

**No new diagnosis needed to start on any of these. They are all established from evidence in hand.**

| Bag | Evidence | Likely move |
|---|---|---|
| **17 orphaned replay engines**, ~7.5 MB each | PO snapshot, 4 → 17 unbounded | Fix merging. Release the strong-`Map` key and `fullData` |
| **Compiled code 45 → 137 MB**, 30% of heap | PO snapshot | Follows from the orphans — each leaked panel document retains a compiled bundle copy |
| **Per-tick allocation, 15.9 MB/s** | PO measurement, 4 panels | Buffer reuse, hoist allocations out of the tick |
| **Every panel renders synchronously per tick** | A's own journal, 14 of 17 clearing sites | Cadence for non-focused panels |
| **4 unconditional 60fps rAF loops** with 4 panels | Never measured in multichart — only single-chart idle | Third in line, behind Fix 1 |
| **1,098 live listeners; `Pending activities` 5.5 MB** | PO snapshot | Likely the orphans. **Also the leading spike candidate** |
| **19,852 baseline detached divs before any multichart** | PO snapshot 1 | Unexplained and unowned. Yours now |
| **Our own instrumentation** | `mcDiag` wraps the replay system; A's counters add work | See §4 |

## 4. Our diagnostics are a legitimate target

**`chart.js:2644` wraps the replay system for `mcDiag`, and that wrapper is a live candidate for the strong-`Map` retainer behind the orphan leak.** Our measuring tool may be causing the defect it measures.

**A is authorised to remove, gate or restructure any instrumentation we have added — including its own.** The `mcDiag` counters, the M25 attribution, all of it. **Preferred form is the §1 principle: keep the capability, make it zero-cost when off, rather than deleting it.** An instrumented build that is slow teaches us about a product nobody ships.

## 5. Targets — directional, honest, not fake-precise

**Do not aim at a number you cannot measure. Aim at these:**

1. **`M20Q6ReplaySystem` count returns to exactly 1** in a single-chart state after multichart cycles. **Binary, already specified as M-6, already the acceptance.**
2. **Memory grows sub-linearly with panel count.** Today: 497 MB at one panel, 915 MB at four. **Four panels should not cost four charts' worth of memory when they share one dataset and one origin.**
3. **Four-panel replay materially closer to single-panel speed than the current ~50% gap.** No fake target — **if we cut it to 25% that is a real win and we say 25%.**
4. **Nothing accumulates across a multichart open/close cycle.** Engines, documents, listeners, compiled code, detached nodes — **all flat, not merely slower-growing.**

**Report every one as a count or a ratio, never as megabytes** — your own harness-scenario doubt still stands and byte totals remain untrustworthy.

## 6. What is off the table

**Idle single-chart diagnosis is closed.** No more ablations, React-pump attribution or idle-floor archaeology. **The PO never complained about an idle single chart and we spent most of today measuring one.**

**Do not spend PO test rounds.** C is building the M-6 gate and the 4-panel replay benchmark specifically so measurement stops routing through a human. **Use C's instruments when they land; until then, ship behind flags and let the gate grade you.**

## 7. Why this is written as a charter and not a task list

**A has spent today blocked more than it has spent building** — on my four-and-a-half-hour silence, on a name collision I created, on a wake mechanism I would not specify, and on two of my confident claims that turned out wrong. **Almost none of that was A's doing.**

**The bottleneck was me, and this document removes me from the loop.**

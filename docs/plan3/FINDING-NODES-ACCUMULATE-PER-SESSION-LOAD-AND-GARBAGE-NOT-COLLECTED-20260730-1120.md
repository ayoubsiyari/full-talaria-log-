# FINDING — DOM nodes accumulate per session load, and 216 MB of the heap was uncollected garbage

**Director · 2026-07-30 11:20 · binding on A, B, C**

## Test 1 result — the DevTools inflation hypothesis is REFUTED

Same tab, PID 3224, one variable changed.

| | Task Manager JavaScript memory |
|---|---|
| DevTools **closed** | **332,000K (316,000K live)** |
| DevTools **open**, same page | **128,080K (102,718K live)** |

Opening DevTools did not inflate the reading. **It fell by 204 MB, and the live figure
fell by 213 MB.** My 1.8x inflation hypothesis is dead, and so is the reassurance that
came with it — the product is not quietly in better shape than our numbers said.

DevTools also runs in **its own renderer process** (PID 22980, 79 MB JS), so it does not
add to the page's process at all. That is a second, independent reason the inflation
theory could not have been right.

## Finding 1 — ~213 MB of the heap was garbage waiting for a collection

Chrome's `X (Y live)` reports live as of the last collection. Live went from **316 MB to
103 MB** the moment DevTools attached and triggered a collection. Nothing was fixed in
between. **The page was holding roughly 213 MB of unreachable objects that no collection
had yet reclaimed.**

This is not a leak. A leak is memory that *cannot* be reclaimed. This is memory that
simply *had not been* — V8 does not collect aggressively while headroom exists, so a
program that allocates hard keeps a high floor between collections even when nothing is
retained.

**It reconciles two findings that looked contradictory.** A measured GC overhead at
0.258%, which I wrongly read as proof that allocation was not a problem. And playback
was measured this morning adding 135 MB of *live* JavaScript across four panels. Both
are true simultaneously: allocation is enormous, collection is cheap, and the resident
floor stays high because the collector has no reason to run.

**Consequence for every memory measurement in this plan.** A heap figure taken without
a forced collection measures allocation rate as much as retention, and we have been
reading those two as one number for a week. **Every future heap reading is taken after a
forced collection or it is not comparable to any other reading.** C's harness already
does this; the PO's manual readings never have.

## Finding 2 — DOM NODES ACCUMULATE PER SESSION LOAD. This is the mechanism.

Same tab, same process, successive single-chart session loads:

| Session | DOM nodes |
|---|---|
| 924 era | 51,303 |
| 925 | 97,488 |
| 926 | **137,834** |

**Roughly forty thousand nodes added per session load, never released.** Alongside the
caches recorded at 11:00 — image 63 → 85.8 MB, script 32 → 64.7 MB across the same
navigations — and 7 documents on a single chart.

**This is very likely the memory mechanism we have been hunting all week**, and it
explains why it was never found:

- Every leak hunt was run on **multichart open/close cycles**. Nobody cycled *sessions*.
- Every measurement started from a **fresh session**. The defect only appears on the
  second load.
- The JS-side instruments could not see it, because DOM nodes are not JS heap — they are
  in the ~90% of a panel's cost that nothing we built could measure.
- And it is *not* panel-count-shaped, which is why panel-count experiments kept coming
  back inconclusive.

It also matches the reported experience exactly. A trader opens the platform in the
morning and switches sessions all day in one tab. **Our benchmarks measured the first
minute of the best case; the complaints describe the fourth hour of the real one.**

**Stated as a strong hypothesis, not a fact (DECL-01).** These readings vary in data
range as well as load count. **C's controlled test decides it**: node count on a freshly
opened tab, then after four successive session loads of the *same* session, same range,
in that tab. If nodes climb with load count at fixed range, it is confirmed and it
becomes the top defect in the plan, ahead of everything.

## Finding 3 — three gauges, three answers, same instant

Task Manager JavaScript memory read **128,080K** while Performance Monitor read
**335 MB** on the same page at the same moment. That is **2.7x**. C previously measured
CDP at 0.695 of `performance.memory`.

**No absolute memory number from any of these gauges may be quoted again.** Within-gauge
comparisons only — same gauge, same conditions, same collection state. Every
cross-gauge comparison made in this plan, including several of mine, is void.

## Orders

**C — the controlled session-load test is now your highest priority, ahead of the node
census composition.** Fresh tab; open one session; record nodes, documents, listeners,
image cache, script cache, and JS heap after a forced collection. Reload the *same*
session in the same tab four times. Record after each. Fixed data range throughout, so
range cannot explain the curve. If it climbs, name what a session switch fails to
release. That is the whole hunt in one experiment.

**A — hold the allocation profile, it is still yours and Finding 1 raises its value.**
213 MB of garbage between collections is an allocation-rate statement. The top five
allocating call sites during playback are now doubly worth naming.

**B — one question added to the asset packet, and it may be the same question C is
asking.** Is a session switch a real navigation, a soft route change, or a
teardown-and-rebuild inside the same document? If the document survives a session
switch, then nodes, caches, listeners and documents all surviving with it is one defect
with one fix.

## Method note

I asked for this test to check a hypothesis of mine. It refuted that hypothesis and
returned two findings larger than the one it was designed to test. **The value was in
the PO photographing the whole panel rather than the cell I asked about** — the same
thing that produced the 11:00 finding. Narrow instructions, wide capture.

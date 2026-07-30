# CORRECTION — the node counter includes uncollected detached nodes; my 11:20 finding is suspended

**Director · 2026-07-30 11:30 · binding on A, C**

## What I published at 11:20, and why it may be wrong

I recorded DOM nodes climbing 51,303 → 97,488 → 137,834 across successive in-tab
session loads and called it "very likely the memory mechanism we have been hunting all
week."

**C published W89 at 10:55, twenty-five minutes before I wrote that, stating that the
Performance Monitor node counter includes uncollected detached nodes, and that the
actual chart DOM is 2,483 elements and invariant in bars and ticks.**

I did not read C's branch before publishing. That is the failure, not the hypothesis —
the hypothesis was reasonable and the evidence to test it was already committed and
sitting three feet away. **The Director must read the managers' tips before publishing
a finding that overlaps their lane.** Recorded as a process defect against me.

## What follows if C is right

The node "accumulation" is the **same phenomenon as the 213 MB of uncollected garbage**
in the same document: objects detached and unreachable, but not yet collected, being
counted as though they were live. One mechanism, two counters, and I reported them as
two separate findings within an hour of each other.

The test is identical to the one Finding 1 implies and it settles both:

**Node count after a FORCED COLLECTION, at each session load.** If the count returns to
roughly 2,483 after collection, there is no node accumulation and my finding is
withdrawn in full. If it climbs after collection, the nodes are genuinely retained and
the finding stands.

**Status: SUSPENDED, not withdrawn.** DECL-01 cuts both ways — I do not get to kill it
by argument either. C's instrument decides.

## The open conflict between A and C, and it is not resolved by seniority

**A, 10:38:** 51,303 nodes = 4 documents x ~12.8k each; no per-bar DOM exists; withdrew
its own earlier "large gap" claim, having scaled from a bare shell.

**C, 10:55:** chart DOM is 2,483 elements, invariant in bars and ticks; the counter
includes detached nodes.

Both are careful, both self-corrected in the same packet, and they disagree by a factor
of five per document. The reconciliation is probably that A counted what the counter
reports and C counted live elements — in which case **the difference between them is
precisely the detached-node population, and that number is the finding.**

**Assigned jointly, one packet, C authors and A reviews:** live element count versus
counter reading, same page, same instant, before and after a forced collection. Report
the gap. Do not resolve it in prose.

## Three further C results that change assignments

**Fetch is already viewport-windowed — 2,011 bars resident out of 6.1M.**

This has two consequences and they point opposite ways, so both are stated.

First, it **invalidates the reasoning** behind my 09:30 cancellation of the columnar
bar-store change. I argued the heap barely moved across a 100-1000x data increase; in
fact the resident bar count barely moved either, because the app windows the fetch. The
test did not measure what I claimed it measured.

Second, **the conclusion survives and is strengthened.** At 2,011 resident bars, the
entire bar dataset is on the order of a few hundred kilobytes. There is nothing there to
convert. The columnar change stays cancelled, now for a better reason.

Third, and this is an assignment change: **A's residency work may be redundant.** If the
fetch is already windowed, trimming resident arrays saves little. A states plainly
whether its residency packet delivers anything on top of the existing windowing, and if
not, it is cancelled and A's hours go to the allocation profile.

**Non-JS renderer mass is malloc/PartitionAlloc, not DOM.** My 10:00 ruling attributed
the ~196 MB of non-JS renderer memory to DOM, style and layout. C's census says
allocator memory. **That attribution is withdrawn.** The 90%-of-a-panel-is-not-JS
measurement stands; my guess at what fills it does not.

**GPU process is near-fixed.** My 10:20 observation that GPU memory grew in four
successive samples is superseded by a controlled census. Withdrawn.

## What survives all of this, and it is not nothing

**A's two verified unbounded appends: LabelTool handles and order glow filters.** Real,
named, bounded in scope, cuttable today. These are the first confirmed retention
mechanisms of the morning that no instrument has since demoted. **A cuts both, behind
flags, now.** The advisor's §1.3 specifically named orphaned glow `<filter>` defs as a
raster cost, so the glow filters are plausibly a CPU cut as well as a memory cut.

**One renderer at eight panels.** The process-split hypothesis is closed permanently.

**213 MB uncollected at the moment of measurement.** Unaffected by any of the above, and
the instruction it produced stands: every heap reading is taken after a forced
collection or it is not comparable.

## The pattern I am now the worst offender against

Today I have published findings faster than the managers could grade them, and three
have been superseded within the hour by evidence that already existed. The speed has
been genuinely productive — the logo finding, the JS-versus-renderer split and the
uncollected-garbage result are all real and all came from moving fast. But
**"fast" cannot mean "before reading what the instrument owner already committed."**

**New rule, binding on the Director first:** before publishing a finding that touches a
manager's lane, read that manager's branch tip. If it contradicts, the manager's
instrument outranks the Director's inference, and the finding is routed to them as a
question rather than published as a result.

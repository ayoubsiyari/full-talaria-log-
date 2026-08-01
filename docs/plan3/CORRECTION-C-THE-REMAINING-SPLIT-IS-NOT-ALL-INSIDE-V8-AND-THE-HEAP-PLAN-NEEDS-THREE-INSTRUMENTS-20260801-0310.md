# Correction: the remaining split is not all inside V8, and the heap plan is built on the assumption that it is

**Manager C — 2026-08-01 03:10**
Supersedes the closing claim of the 20:41 arena finding. Build 20260731b120, badge and digest recorded,
**unsealed — composition evidence only, no absolute figures.**

---

## What I said at 20:41

> "Canvas/bitmaps/GPU/DOM all excluded by number. **Remaining split is INSIDE v8**: bar data vs code
> residency, which needs a heap snapshot by type."

And the prediction I wrote into the allocator script before measuring:

> "v8 carries essentially all growth; if partition_alloc climbs instead, bar data lives outside V8."

Tomorrow's heap plan — *what grows by 24 KB per bar, classified by constructor* — is built on that sentence.
A constructor census is a **V8 heap snapshot**. If the remaining split is inside V8, one instrument answers
the question.

## What the paired dump actually measured

Two background memory-infra dumps 2.15 hours apart, same renderer pid, **zero trades throughout**, 21,051 →
60,154 resident bars:

| allocator | growth | share of growth | per bar |
|---|---|---|---|
| **v8** | 625.0 MB | **58.9%** | 16.37 KB |
| **blink_gc** | 212.5 MB | **20.0%** | 5.56 KB |
| **partition_alloc** | 176.8 MB | **16.7%** | 4.63 KB |
| malloc | 44.4 MB | 4.2% | 1.16 KB |
| cc | 6.3 MB | 0.6% | 0.16 KB |
| web_cache | −4.5 MB | −0.4% | −0.12 KB |
| **total** | **1,060.5 MB** | | **27.77 KB/bar** |

**41.1% of per-bar growth is outside V8.** The prediction is refuted as written, and so is the claim that the
remaining split is internal to V8.

## Why this matters more than the percentage

**A V8 heap snapshot by constructor is blind to 11.4 KB of every 27.8 KB per bar.** Run as planned, the heap
census would have classified 59% of the growth beautifully, reported constructor totals that did not reconcile
with the footprint, and left the discrepancy looking like snapshot error rather than a different arena. The
plan needs three instruments:

| arena | per bar | instrument |
|---|---|---|
| v8 | 16.37 KB | heap snapshot by constructor, as planned, plus workers counted separately |
| blink_gc (Oilpan) | 5.56 KB | memory-infra Blink detail — *not* visible to a V8 snapshot |
| partition_alloc | 4.63 KB | partition dumps by bucket — backs Blink strings, vectors and array buffers |

## An open tension I am not going to paper over

I published earlier tonight that growth is **not** retained DOM: a collection returned 206 MB of heap, 12,060
listeners and 25,891 nodes while footprint rose straight through it, and node counts stayed flat while memory
climbed. Yet blink_gc — Oilpan, which is where Blink's garbage-collected objects live, DOM among them — grew
212.5 MB in this window.

Both observations are measured and I am not going to reconcile them by argument. Oilpan holds a great deal
that is not a DOM node, so *"blink_gc grew"* does not contradict *"node count was flat"* — but 212 MB is far
too large to wave through, and I do not currently know what is in it. **That is now the sharpest open
question in the memory story**, and it is answerable with the Blink detail the same dump already carries; I
did not request that granularity tonight.

## Cross-check, and the level-versus-growth distinction

The total, 27.12 MB per thousand bars on the allocator gauge, sits against 23.98 / 24.55 / 25.35 measured on
the OS-footprint gauge — two independent instruments within ~10%.

Worth stating precisely, because it is the part that makes the earlier finding *narrow* rather than *wrong*:
V8's share of the **level** at 20:41 was 60.1% (1,479.3 of 2,462.9 MB), and its share of the **growth** here
is 58.9%. Those agree. The 20:41 finding correctly named the arenas by level. What it got wrong was the next
sentence — that everything still unexplained lived inside V8 — and that is the sentence the heap plan
inherited.

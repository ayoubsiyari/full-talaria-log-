# Correction: blink_gc 212 MB growth vs E's 13.00 MB level — reconciled

**Manager C — 2026-08-02 21:30+01:00**
Responds to the Director's direct conflict: E's per-arena dump reads `blink_gc` at
**13.00 MB**; an earlier C arena split attributed **212.5 MB of growth** to `blink_gc`.
Those must not both be quoted to the advisor until one is withdrawn or explained.

---

## Verdict

**They are not the same quantity, and they were not taken under the same condition.**
Quoting them as two readings of "how much blink_gc is" was the error.

| Figure | Kind | Condition | Disposition for advisor quote |
|---|---|---|---|
| **212.5 MB** | **GROWTH (Δ)** between two BACKGROUND dumps | Zero-trade soak, ~21k→60k resident bars, build b120, pid 30588 | **WITHDRAWN as advisor-quotable** |
| **401.1 MB** | **LEVEL** | Same soak, dump A still on disk, bars≈63,318 | Historical level under that soak; not E's condition |
| **115.4 MB** | **LEVEL** | CONF-01 pause+forced-GC floor tonight, b122 | Stands for that condition only |
| **13.00 MB** | **LEVEL** | E arena-reclaim session (renderer private ~263 MB, JS heap 12.8 MB) | Stands for that condition; E owns the row |

**Do not quote 212.5 MB beside E's 13.00 MB.** Growth is not a level. A multi-hour
soak at 60k bars is not a light reclaim probe.

---

## What I can still prove from disk

Dump A is still present at
`_evidence/manager-C/LIVE-ALLOCATOR-DUMP-20260731.json` (paths relative to the
talaria1 evidence root outside the git tree). On the heaviest renderer (pid 30588)
at ~63k bars it records:

| root | MB |
|---|---:|
| v8 | 1,479.3 |
| **blink_gc** | **401.1** |
| partition_alloc | 307.9 |
| malloc | 172.8 |

The **second dump of the pair is missing from disk.** The 212.5 MB growth figure
therefore cannot be re-diffed from primary evidence tonight. That alone is enough
to withdraw it as advisor-quotable: a growth claim whose B artifact is gone is a
prose memory, not a recoverable measurement.

---

## Why E's 13 MB does not refute a heavy-soak Oilpan level

Tonight's CONF-01 drained dump (forced GC, four panels, b122) reads:

| root | MB |
|---|---:|
| **blink_gc** | **115.441** |
| **blink_objects** | **13.453** |
| v8 | 58.817 |
| partition_alloc | 49.285 |
| malloc | 74.114 |

Two notes:

1. **`blink_objects` ≈ 13.45 MB is a separate memory-infra root from `blink_gc`.**
   E's published 13.00 sits next to that number. I am not asserting E mislabeled —
   I do not have E's artifact on this host — but anyone reconciling names must not
   treat `blink_gc` and `blink_objects` as interchangeable.

2. **Levels scale with session weight.** Light reclaim (E: JS heap 12.8, blink_gc 13)
   → CONF-01 drained (v8 59, blink_gc 115) → soak heavy (v8 1,479, blink_gc 401).
   That ordering is coherent. It does not require E's 13 or my 401 to be wrong.

---

## What is withdrawn, precisely

- **WITHDRAWN for advisor quotation:** "blink_gc grew 212.5 MB (20% of per-bar growth)"
  as a figure that can be set beside E's 13.00 MB level, or as a standing claim about
  current builds. Reasons: (1) kind mismatch with E's level; (2) second dump artifact
  absent; (3) different build and bar regime from E's probe.
- **NOT withdrawn:** the qualitative correction that per-bar growth is not V8-only —
  that direction is independently consistent with tonight's short forced-GC leg
  (v8 +22, gpu +15, shared_memory +14, malloc +8, blink_gc +6.75 on a 12-minute window).
  Magnitudes from the lost pair are not re-used.
- **E's 13.00 MB level stands** for the condition E measured. Attribution inside
  `partition_alloc` / `malloc` remains E's row; I am not building a parallel arena
  instrument.

---

## Slope / floor consequence (separate, still open)

Pause-and-wait floors (including the 22.89 MB/kbar hoard slope) remain **non-quotable**
until a forced-collection re-base lands on the common-window (`same-symbol`) session.
That is the remaining C lane and does not depend on resolving Oilpan further first.

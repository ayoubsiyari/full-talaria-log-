# The JS heap rose across the collection — mechanism found, and it is not confined to one gate

**C, 2026-08-03 22:05+01:00.** Chasing the anomaly the Director flagged: the JS heap reading higher
after forced collection in four of the five b120 reps. Two hypotheses were on the table — the
collection is not taking effect, or we are sampling during post-collection re-allocation. **It is the
second, and the cause is structural rather than incidental.**

---

## 1. First hypothesis eliminated with data already on disk

If the "heap" were growing because the *set of isolates being summed* changed — workers spawning
between the two reads — the growth would be an artefact of the denominator, not real allocation.

| rep | isolates live → post | heap live → post | per isolate |
|---|---|---|---|
| 1 | 4 → 4 | 279.7 → 234.1 | 69.9 → 58.5 |
| 2 | 4 → 4 | 284.0 → **357.1** | 71.0 → **89.3** |
| 3 | 4 → 4 | 135.3 → **318.7** | 33.8 → **79.7** |
| 4 | 4 → 4 | 250.4 → **340.6** | 62.6 → **85.1** |
| 5 | 3 → 3 | 324.4 → **330.6** | 108.1 → **110.2** |

**The isolate count is identical across the collection in all five reps.** The heap genuinely grew.
Hypothesis eliminated.

## 2. The mechanism: the page was never stopped

`scripts/conf01-baseline-gate.mjs` contains **no `setPlaying`, no pause, no quiescence step anywhere**.
It forces collection on a live, playing, streaming session and reads 3 seconds later. Post-collection
re-allocation is therefore not a possibility to be weighed — it is guaranteed by construction. Three
seconds at replay speed 10 is roughly thirty bars delivered into a freshly emptied heap.

**Rep 3 is the tell.** Its *live* heap of 135.3 MB is anomalously low against the other reps' 250–324
MB. That reading did not catch a smaller heap; it caught the sawtooth near its trough, just after a
natural collection. The post read then caught the refill. So the pair is not (before, after) — it is
**two random-phase samples of a running sawtooth**, and their difference is dominated by phase.

That is where the spread comes from. Sampling one sawtooth twice at random phase produces exactly the
signature we see: `gcReleased` spanning **125.7–261.0 MB**, and the post-GC totals themselves spanning
**188.2 MB** (1,052.1 to 1,240.3) across five reps of one configuration.

## 3. How far it reaches — 4 instruments of ~30 pause before collecting

This is the part that changes how today's numbers are read. Auditing every instrument that calls
`collectGarbage` or `forceCollection` for a verified pause before the collection:

**Pause before collecting (4):** `forced-gc-pause-probe.mjs`, `forced-gc-hoard-slope.mjs`,
`hoard-census.mjs`, `hoard-constructor-census.mjs`, `exhaustion-probe.mjs`.

**Do not (~29),** including `conf01-baseline-gate.mjs`, `conf01-reference-baseline.mjs`,
`conf01-duration-gate.mjs`, `arena-timeseries.mjs`, `combined-canvas-fix-baseline.mjs`,
`v8-monotone-heap-diff.mjs`, `v8-authoritative-heap-read.mjs`, `buffer-partition-discriminator.mjs`,
`pair-switch-arena-accumulation.mjs`, `speed01-allocation-sampling.mjs`.

**`scripts/lib/settle-protocol.mjs` is itself in the second list.** The shared protocol every later
instrument inherited forces collection and waits, and never established quiescence. That is the root:
the instruments did not each forget, they inherited an omission.

### How to read the affected numbers

- A forced-GC **floor** from a no-pause instrument is not a floor. It is one random-phase sample of a
  sawtooth, and its error bar is the sawtooth amplitude — which rep 3 puts at **at least 183 MB** on
  the JS heap alone.
- A **difference** between two such readings taken in the same session and the same phase discipline
  may still survive, because phase error partly cancels. The 108.2 MB method gap is of this kind: two
  rungs of one curve.
- Anything quoted as an **absolute** from a no-pause instrument should be treated as an upper bound
  with an unstated error, not as a measurement.

## 4. What has been done about it

`SETTLE-CRITERION-V2` (`scripts/lib/settle-criterion.mjs`) makes quiescence condition **Q**, and an
across-collection heap rise condition **C**. Both are refusals with their own states, so a live page
and an ineffective collection do not collapse into the same red. The criterion is proved against these
five reps as a mutant: all five refused, and the four with rising heaps caught by C specifically.

**It is not retrofittable to the published numbers.** Those runs did not record whether the page was
paused, and under the criterion an unrecorded quiescence field is not a pass. The affected figures can
be re-taken under the criterion; they cannot be rescued by re-analysis.

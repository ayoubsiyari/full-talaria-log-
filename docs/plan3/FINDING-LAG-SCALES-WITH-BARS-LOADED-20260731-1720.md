# FINDING — Main-thread blocking scales with bars loaded on one unchanging build, and the artificial load is irrelevant

**2026-07-31 17:25 · Manager B · b120, live product, replay at 10x**

Found while hunting a build difference for `K4`. It is not a `K4` result and does not depend on the
`K4` retraction being right or wrong. Published separately so it is not read as part of one.

## Two results

**1. Bars alone block the main thread. The artificial load is irrelevant.** This is the clean result
and it is the one that matters, because it is the PO's scenario.

| | few bars (~580) | many bars (2,761–3,197) |
|---|---|---|
| **no artificial load** | **0 ms/s**, 26 ms worst gap | **312.6 / 318.4 / 322.7 ms/s** |
| **60 concurrent gated requests** | 55 ms/s | 302–343 ms/s |

At many bars the two rows are indistinguishable. **The 60-request load contributes nothing once bars
have accumulated.** A zero-trade run with nobody generating traffic still loses about a third of
every second of main thread. The PO has been describing this for two days.

**2. The degradation is 6× more long tasks, not longer ones.** This is the part I would have got
wrong by quoting a single aggregate, so it is stated with the aggregate that disagrees.

| witness | few bars, under load | many bars | ratio |
|---|---:|---:|---:|
| long tasks per 30 s | 44 | 246–278 | **~5.9×** |
| long tasks per second | 1.5 | 8.6 | ~5.7× |
| **blocked ms/s** (Total Blocking Time convention) | 55 | ~320 | **5.8×** |
| blocking contributed *per task* | 37.5 ms | 35.8–37.5 ms | **1.0×** |
| p95 task duration | 187 ms | 94–102 ms | **0.5×** |
| **p95 timer lateness** | 96 ms | 132–159 ms | **1.5×** |
| worst timer gap | 261 ms | 267–745 ms | ~1–2.9× |

**Individual tasks did not get longer — they got shorter.** What rose is their frequency, from 1.5/s
to ~8.6/s, which at 7–8 bars/sec is **about one long task per bar**.

So the honest reading of "6×" is: **six times as many ~90 ms interruptions, one per bar, each
costing what it always cost.** The 5.8× in blocked ms/s is real but it is a count effect. The
independent witness without a 50 ms threshold — timer lateness — rises only **1.5×** at p95. Anyone
quoting 6× as "each freeze is six times worse" would be wrong.

## The shape

```
 blocked
  ms/s
  343 |                    ● ● ●   ● ● ● ● ●   ● ● ●     <- plateau, ~1/3 of wall clock
      |
  200 |          /
      |        /              steep climb
   55 |    ●
    0 | ●  (no load)
      +---------------------------------------------------
        579   ~1,100      1,930  2,592  2,761  3,197   bars loaded
```

**It climbs steeply, then plateaus.** 55 → ~300 between 579 and ~1,100 bars, then flat at 302–343
across 1,100–3,197 bars. Within the plateau the correlation of bars against blocked ms/s is
**−0.016** over five runs — genuinely flat, not slowly rising.

**The plateau is not gauge saturation.** A third of wall clock is far from any ceiling; the same
instrument reported 0 ms/s in the same session. The flatness is a property of the product.

**A cost that grows with bars and then stops growing is not unbounded accumulation.** Unbounded
accumulation keeps costing more. This is a **bounded working set being rebuilt per event.**

## The lead for A

Putting the two results together gives something specific to aim at:

- work runs **per bar event**
- at ~580 bars loaded it stays under 50 ms and is invisible to the Long Tasks API — only 1 bar in 7
  produces a long task
- by ~1,100 bars nearly **every** bar produces one, ~90 ms
- past that, loading 1.65× more bars (1,930 → 3,197) changes nothing measurable

**Hypothesis, consistent with all of it and cheap to falsify:** something rebuilds the whole
**visible window** on each bar event instead of appending one bar. Below the window's capacity the
per-event cost scales with bars loaded; once loaded bars exceed what is on screen, cost saturates
because only the visible window is ever rebuilt. That produces exactly a steep climb and a hard
plateau.

**The prediction that kills it:** the plateau height should depend on **how many candles are
visible**, not how many are loaded. Zoom out, the plateau should rise; zoom in, it should fall; load
more bars at fixed zoom, it should not move. If the plateau is indifferent to zoom, the bounded set
is something other than the viewport and this hypothesis is wrong.

One corroboration that this is real work rather than instrument noise: **the bar rate falls as
blocking rises** — 10.3 bars/sec at 579 bars down to 7.2 at 3,197, against a requested 10x
throughout. The replay is being slowed by its own cost. That matches the mechanism the Director
established for `L1` this morning, where paints/sec *falls* as the thread gets busier.

## Status and limits

- **`CONF-03`:** taken **outside** `CONF-01` and `CONF-05`. This forms a hypothesis and must not be
  used to choose what to optimise.
- **One dataset, one session, one symbol** (file 677, session 936), single realm, 10x. The plateau
  *level* is specific to this setup; the *shape* is the part that may generalise, and that is a
  claim about one configuration until `CONF-05` says otherwise.
- **The low-bar cells were measured earlier in the day than the high-bar cells**, so elapsed wall
  time is not fully separated from bar count. Bars are the axis I recorded, and the plateau holds
  across runs minutes apart, but a time-dependent confound is **not excluded**. This is the same
  class of error that produced the `K4` retraction and I am naming it rather than waiting to be
  caught by it.
- **I have not identified the code.** The per-bar task count and the plateau are measurements. The
  viewport-rebuild explanation is a hypothesis with a stated way to kill it.

## For C's `CONF-05` tonight

The prediction to test: **blocked main thread rises with elapsed bars and plateaus at roughly a
third of wall clock, with no artificial load required.**

Two instrumentation notes that cost me most of a cycle:

1. **Instrument against bars loaded, not only wall clock.** That is the axis carrying the signal,
   and its absence is why I misattributed this to a build.
2. **Record long-task count and timer lateness separately, not just total blocking time.** Total
   blocking time moved 5.8× while timer lateness moved 1.5×. A soak reporting only the first will
   overstate the severity by ~4×.

If it does not rise, the relationship belongs to my setup and that is worth learning cheaply.

## Method

`_evidence/manager-B/k4-window-claim/main-thread-freeze.mjs`, parameterised by `SPEED`, `WINDOWS`,
`LOAD`, `MEASURE_MS`. Two independent witnesses per run: the Long Tasks API (blocking counted as the
part of each task beyond 50 ms) and the measured lateness of a 50 ms interval, so neither has to be
trusted alone. Bar count recorded at arm time. Raw rows in `/root/b-k4/freeze-results.jsonl`;
`fill-missing-cell.sh` reproduces the completed grid and `compare-witnesses.sh` the witness table.

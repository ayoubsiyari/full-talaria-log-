# A — Event rate measured: it ceilings at 62.5/s, which resolves the overshoot I flagged. Plus sweep status and the teardown census.

**2026-07-31 21:40** · Manager A · queue of the 21:13 ruling
Harness `scripts/sr04/event-rate.mjs` · raw `docs/plan3/evidence/A-SR04-PIPELINE-TIMING-20260731/event-rate.json`

---

## 0. RESOLVER — ALREADY SHIPPED, E IS UNBLOCKED NOW

**`_resolveTradeJournalAttribution(order)` landed at `4ff581301`, one turn before this ruling.** Verified on
disk at HEAD rather than from memory: present in **both** mirrors with the `window.` export, suite **10/10**
green, 5/5 mutants killed by named behavioural cells.

**E does not need to wait for anything.** It resolves via `order.sourceFileId` (stamped at 18 sites from the
owning chart's `currentFileId`), returns `null` on no-match **and on ambiguity**, and is focus-invariant.

---

## 1. SWEEP STATUS — IT RAN. Committed `748a9acc9`, 20:50.

Stating it explicitly since it was absent from my last summary: **the timeframe sweep executed, four timeframes
× nine resident-bar points, plus a seven-point spacing probe.** Full report:
`A-SWEEP-THE-KNEE-DOES-NOT-MOVE-WITH-THE-CAPS-AND-B-CONFIRMED-ON-THE-WRONG-BRANCH-20260731-2050.md`.

Result: **the knee does not move with the per-TF caps.** Display output is pinned at **260 bars** at every
resident count and every timeframe — it never approaches 4320/1200/900. Cost tracks **resident** bars: 1w at
60,000 resident bars emits **seven** display bars and still costs 4.00 ms. A full resample fires **1.0× per
event at all 45 points.** By your framing that is the second outcome — a third mechanism, not visible-bar
scaling.

---

## 2. EVENT RATE — the unit converter, and it has a ceiling

Real `getCandlePlaybackCadence` extracted from `replay-system.js:4978` and evaluated across the speed ladder.

| speed | interval ms | steps/tick | **ticks/s** | steps/s |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 100 | 1 | 10 | 10 |
| 30 | 33 | 1 | 30.3 | 30.3 |
| **60** | **16** | **1** | **62.5** | **62.5** |
| 120 | 16 | 2 | 62.5 | 125 |
| 240 | 16 | 4 | **62.5** | 250 |

**The tick rate ceilings at 62.5/s** — `MIN_INTERVAL_MS = 16` floors the interval, so every speed at or above
60× runs the same 62.5 ticks/s and buys additional speed through `stepsPerTick`, not through more ticks.

**The pipeline event rate follows ticks, not steps.** `_runCandlePlaybackTick` advances *n* steps with
`skipChartUpdate` and then calls `_scheduleCandlePlaybackPaint` **once** on rAF (my PAINT-01 finding), and
repeated `getDisplaySeries` calls inside one paint hit the display cache, whose key is stable within a paint.
So the expensive full resample fires **once per tick, capped at 62.5/s**, no matter how fast playback is set.

### This resolves the overshoot I flagged at 21:15 — against my own model

I reported that at 60,000 resident bars the arithmetic gave 764 ms/s and **overshot the entire 708 ms/s
budget**, and said an input must be wrong. **The rate was not the wrong input — it cannot exceed 62.5/s.** So
the error is in the millisecond figure, and that row was the noisiest point in the sweep (12.22 ms in one run
against 5.42 ms in another for the same configuration). Taking the lower reading, 5.42 × 62.5 = 339 ms/s, which
sits inside the budget.

**Corrected conversion table** (event rate now derived rather than assumed):

| resident bars | ms/event | × 62.5/s | share of 708 ms/s |
| ---: | ---: | ---: | ---: |
| 8,000 | 1.61 | 101 ms/s | 14% |
| 25,583 | 3.03 | 189 ms/s | **27%** |
| 36,104 | 3.41 | 213 ms/s | 30% |
| 60,000 | 5.42–12.22 | 339–764 ms/s | **unstable — do not cite this row** |

**The 27% at C's measured span is the number I stand behind.** The 60,000-bar row needs a re-run before anyone
uses it.

### Bounds

Node milliseconds, not Chromium. The cadence table is exact — it is the real function evaluated, not a model.
The **one-expensive-resample-per-tick** claim rests on PAINT-01's coalescing finding plus the display cache
being stable within a paint; **if a second cache-invalidating event occurs mid-paint the rate is higher and
every row scales up.** That is the assumption most worth attacking, and C's bucketed trace would settle it.

---

## 3. ORDER-MANAGER TEARDOWN CENSUS — 48,664 lines, no `destroy()`

| resource | acquired | released | **uncovered** |
| --- | ---: | ---: | ---: |
| `document` listeners | 21 | — | — |
| `window` listeners | 11 | — | — |
| **global listeners total** | **32** | 22 `removeEventListener` | **~10** |
| `setTimeout` | 49 | 8 `clearTimeout` | **~41** |
| `requestAnimationFrame` | 40 | 8 `cancelAnimationFrame` | **~32** |
| `setInterval` | 1 | 1 `clearInterval` | 0 — covered |
| `ResizeObserver` | 1 | — | 1 |
| **`destroy()` on OrderManager** | — | — | **does not exist** |

`_m20A1Teardown` exists (3 sites) and is hooked to `pagehide`, clearing A1 timers and closing IndexedDB — a
real partial teardown that a `destroy()` should compose with rather than replace.

**Per-site cost — the honest version.** The right-hand column is **counts, not pairings.** A `removeEventListener`
count does not prove *which* listener it releases, and I have been wrong this week precisely by treating a count
as a fan-out. A defensible per-site cost needs handler-level matching — each acquisition traced to its release
or proven to have none — and that is the next unit of work here, not something I can publish off a census.

What the census does establish: **the uncovered surface is dominated by timers and rAF handles (~73 sites), not
by listeners (~10).** That inverts the emphasis I would have expected, and it means a `destroy()` for this file
is mostly a timer-handle-registry problem. Worth knowing before anyone budgets it.

---

## 4. B's retraction

Noted that it does not stand until B re-checks the cache key in rate terms. At 62.5 events/s a 2–4% share of an
~86 ms task is a materially different number from 2–4% of the total, and my own slice candidate survives the
same conversion as genuinely negligible (~4.9 ms/s) while the cache key may not.

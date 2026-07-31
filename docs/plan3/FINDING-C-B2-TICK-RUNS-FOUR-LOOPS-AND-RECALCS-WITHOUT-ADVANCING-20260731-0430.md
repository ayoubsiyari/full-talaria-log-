# FINDING C — B2: tick runs four loops and recalculates without advancing

**2026-07-31 04:30** · Manager C · overnight battery B2 · tier=mid model=claude-opus-5-thinking-high
**Instrument:** `REPLAY-MODE-TRUTH-V1` with the mode parameterised, run in **tick** mode
**Build read off the page:** `20260730b116` · **CONF-04:** `tick` requested and **verified held** in
all four realms after settling
**Artifact:** `_evidence\manager-C\B2-RECALC-CADENCE-TICKMODE-20260731.json`

## Why this ran in tick rather than candle

B2 as written was answered at 01:00 in candle mode: **1.00 recalcs per advanced candle** across 32
windows, and recalc cost **BOUNDED** (p50 0.714 → 0.750 ms between minute 2 and minute 15). Tick
mode had never been measured, and tick is where the unattributed 20x per-bar cost lives. Same
instrument, different mode.

## Three answers

### 1. No P0, and a structural difference nobody had recorded

All four realms read `tick` at every checkpoint (2, 10, 15 min) with no disagreement, so the
mode-split P0 does not exist in tick either.

But **`getPlaybackLoopKind()` returns `tick` in all four realms**, where in candle mode the three
peers return `null`. That is not cosmetic:

| mode | host | three peers |
| --- | --- | --- |
| candle | `candle` loop | `null` — no loop; driven passively per host candle |
| tick | `tick` loop | **`tick` loop each — four independent animation loops** |

Candle mode runs **one** loop and drives peers passively. Tick mode runs **four**. That is a
4x structural work multiplier before any per-frame cost is counted.

### 2. Recalcs per candle: NOT MEASURABLE, and I am voiding my own number

The instrument reported `meanRecalcsPerCandle: 41.87`. **That number is void and must not be
quoted.** Re-grading the 84 window-realm pairs:

| denominator | pairs |
| --- | --- |
| zero candles advanced | 55 |
| **negative** (playhead moved backwards on a re-seek) | 13 |
| 1-4 candles, below a usable floor | 16 |
| **≥ 5 candles — usable** | **0** |

Not one window advanced enough candles to divide by. The 41.87 was arithmetic on broken
denominators, including thirteen negative ones. The instrument now excludes windows by reason and
reports `NOT MEASURABLE` with the exclusion counts, plus a rate-based fallback that survives a
frozen bar axis. This is the second time tonight a frozen axis has produced a plausible-looking
number, and it is now designed out rather than remembered.

### 3. The rate, which is the answer the cadence could not give

Over 16 minutes, per realm:

| realm | recalcs fired | candles advanced |
| --- | --- | --- |
| host, 1m | 21 | **0** |
| peer, 5m | **6,768** | 4 |
| peer, 15m | **6,240** | 2 |
| peer, 1h | **1,680** | 1 |

**14,709 indicator recalcs bought seven candles of progress.** Recalc cost is flat and bounded —
p50 0.687 ms mean across 84 realm-windows, range 0.4-1.0 ms, indistinguishable from candle mode —
so the cost is not *per recalc*, it is *how many*.

That is the 20x mechanism stated without hand-waving: **in tick mode the recalc and paint work is
driven by the animation clock, not by bar advance.** The work rate per second is comparable to
candle mode (~15 recalcs/s across the peers, against 15-19 bars/s in candle) but forward progress
is ~zero, so cost *per bar* explodes. Tick does not do more work per bar; it does the same work per
second and delivers almost no bars.

## The likelier reason tick does not advance, and it is testable

The host's resident window **never extended**: 2,011 bars at the start, 2,011 at the end, with the
playhead pinned at 2,010. In tonight's candle run under an identical boot the host started in the
same place — playhead 2,644 of 2,645 resident — and grew to **14,548 resident**.

So: **candle mode at end-of-data fetches forward and extends the resident window; tick mode at
end-of-data appears not to.** It animates in place instead. That would explain the stalls in both
tick runs without any appeal to my re-arm helper.

Stated as a hypothesis, not a finding: it rests on two runs in different modes rather than an A/B
inside one session. The discriminating test is one session, tick, playhead deliberately placed well
*behind* the end of resident data — if it advances normally there, the defect is the fetch-forward
path in tick, not tick itself. That is the next tick measurement and it is cheap.

## Corrections carried forward

- My earlier "tick is 20.7x slower per bar" stands as a floor, not a ceiling. Tonight's run is far
  worse than 20x, but it was pinned at end-of-data, so the two are not measuring the same thing and
  I am not restating the multiplier from this run.
- The `41.87` never left this document as a measurement, and the instrument can no longer produce
  its shape.

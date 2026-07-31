# FINDING — the 14x settled: the speed slider is candles per second, not a multiple of real time

**2026-07-31 10:25** · Manager C · tier=mid model=claude-opus-5-thinking-high
**Ruling** cbfdb81f4 item 1 · **Rules applied** `UNIT-01`, `MEAS-01`
**Evidence** source at `chart/modules/replay-system.js:4660-4670` plus `SWEEP-S1-20260731.json` (1x point, 22 samples)

## Verdict first

**Neither a user-facing P0 nor a defect in my probe. It is a units mismatch in the expectation.**

The slider's number is **candles per second**, not a multiple of real time. My probe measured
correctly and the engine behaves as written. The "14x" appeared because 873 bars/min was compared
against 60 bars/min — the rate that "60x" would mean *if* the multiplier were a real-time multiple on
a 1-minute chart. It is not.

## The source says so outright, and the measurement confirms it to 4%

```
/**
 * Candle-mode cadence: slider speed ≈ steps/sec.
 */
getCandlePlaybackCadence() {
    const speed = Math.max(1, Number(this.speed) || 1);
    const MIN_INTERVAL_MS = 16;
    let intervalMs   = Math.max(MIN_INTERVAL_MS, Math.floor(1000 / speed));
    let stepsPerTick = Math.max(1, Math.round((speed * intervalMs) / 1000));
```

At slider **1x**: `intervalMs` = 1000, `stepsPerTick` = 1, so the engine intends **1.00 candles per
second**. S1's 1x point measured **1.04 bars/s across 22 samples** with all four panels advancing.
Predicted 1.00, measured 1.04. The implementation and the instrument agree.

## What that means on a 1-minute chart

| slider | engine intends | that is, in real-time multiples on a 1m chart |
|---|---|---|
| 1x | 1.00 candles/s | **60x real time** |
| 60x | 62.5 candles/s (16 ms floor, 1 step/tick) | **3,750x real time** |

So slider "1x" already runs 60 times faster than real time, and "60x" intends 3,750x. The letter x on
that control does not denote a real-time multiple at any setting.

## Which makes the 873 bars/min a shortfall, not an excess

B4 measured **873 bars/min = 14.55 candles/s** at slider 60x. Against the engine's own intended 62.5
candles/s that is **23% of requested cadence** — the engine is starved, not fast. Read against the
assumed 60 bars/min it looked like a 14.55x overspeed. Same measurement, opposite sign, because the
denominator was wrong.

This morning's S3 brackets it and shows what moves it: at slider 60x the delivered rate was **26.78
candles/s with zero indicators** (43% of intended) and **9.77 with two per chart** (16% of intended).
The shortfall is load-dependent, which is the lag defect stated in the product's own units.

## Two real defects, now separated

1. **Labelling / semantics, user-facing.** A control marked in "x" that means candles per second will
   mislead every trader who reads it as a speed multiple, and its meaning changes with the chart's
   timeframe — the same "10x" is 600x real time on a 1-minute chart and 10x on a 1-hour chart. This
   needs a PO decision on intended semantics, not a unilateral code change. I am not calling it a P0
   on my own authority; I am calling it a decision that has never been made explicitly.
2. **Cadence starvation, ours.** At slider 60x the engine delivers 16-43% of the cadence it asks
   itself for, depending on indicator load. That is Monster 2 expressed as a throughput deficit rather
   than a decay slope, and it is the same defect S3 measured.

A third, minor and self-consistent: the 16 ms interval floor means slider 60x actually issues 62.5
ticks/s, a 4% overspeed against its own setting. Harmless, and it is evidence the implementation is
coherent around 60.

## What this does and does not do to every rate we hold

**It does not touch any per-bar figure I have published.** Every one is computed from bars actually
observed to advance — `replayIndex` differenced between samples — never inferred from the slider. So
`+2.812` and `+1.036` CPU-ms per bar per thousand bars, S3's dose-response, B3's copies-per-bar and
B4's residency all stand unchanged.

**Delta 2 is resolved in the safe direction, and more strongly than by the same-build argument.** The
Director's point was that a common factor cannot create a difference between arms. Correct — and it
turns out there was no factor to begin with: the arms were not mislabelled by 14x, they were measured
per observed bar throughout.

**What would need restating is any figure that assumed a bar rate.** I hold one: wall-clock
extrapolations like "MB per hour" carry an implicit bar rate, which is exactly why `UNIT-01` requires
the configuration declared alongside. The 10:10 correlation finding already restates the memory rate
per closed trade for the same reason.

## For the PO, in one line

Replay speed is measured in candles per second, so "60x" on a 1-minute chart asks for 3,750 times real
time and currently delivers between 16% and 43% of that depending on how many indicators are loaded.
The number on the control is not a real-time multiple, and that is a labelling decision nobody has
taken rather than a bug anybody introduced.

## Remaining, landing within the hour

S1's full curve at 1x / 5x / 10x / 30x / 60x will show **where** delivery departs from intent — the
point at which the engine stops keeping up. Intended cadence is linear in the slider by construction,
so the delivered curve's knee locates the ceiling directly, and `FIT-01` requires I report its residual
shape rather than fit a line through a saturation curve.

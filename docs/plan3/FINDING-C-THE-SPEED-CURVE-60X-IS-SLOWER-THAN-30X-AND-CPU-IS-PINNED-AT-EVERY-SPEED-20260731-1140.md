# FINDING — the speed curve: 60x is slower than 30x, and CPU is pinned at every speed including 1x

**2026-07-31 11:40** · Manager C · tier=mid model=claude-opus-5-thinking-high
**Ruling** cbfdb81f4 item 1 · **Rules applied** `UNIT-01`, `FIT-01`, `SWEEP-01`
**Instrument** `S1-CADENCE-CURVE-V1` over `SWEEP-S1-20260731.json` · four panels, two indicators each,
1-minute host chart, 12 minutes per point

## Verdict first

**Selecting 60x makes replay slower than selecting 30x.** 12.83 candles/s against 13.34. The fastest
setting on the control is not the fastest, and the whole upper half of the range does nothing.

The engine tracks its own intended cadence exactly up to 5x, then breaks away and delivers about
**13 candles/s** regardless of what is asked for.

> **CORRECTED 13:15 by `MONOTONIC-BARS-GATE`.** This document originally called that 13 candles/s a
> *ceiling*. It is not a fixed engine limit — it is the rate at whatever bar count the measurement had
> reached. A separate run at a constant 5x with zero trades opened at 18.7 candles/s and decayed to 8.4
> while nothing changed but resident bars, at −19.2 bars/min per thousand. **The knee position and the
> delivered rate are both bar-count dependent.** The tracking range up to 5x, the inversion where 60x is
> slower than 30x, and the CPU pinned at every speed all stand unchanged; the word "ceiling" was too
> strong and the number should be read as "13 candles/s at the bar counts these 12-minute points
> reached".

## The curve

Intent is not assumed here — it is computed from the shipped formula in `getCandlePlaybackCadence`, so
the comparison is against the engine's own arithmetic rather than against a real-time multiple.

| selected | intends | delivers | ratio | renderer CPU | paints/s | real-time multiple on a 1m chart |
|---|---|---|---|---|---|---|
| **1x** | 1.00 | **1.03** | **1.03** | 118.5% | 141.7 | intended 60x, got 62x |
| **5x** | 5.00 | **5.01** | **1.002** | 119.3% | 118.0 | intended 300x, got 301x |
| 10x | 10.00 | — | **VOID** | — | — | window-claim hang |
| **30x** | 30.30 | **13.34** | **0.44** | 125.0% | 84.7 | intended 1,818x, got 800x |
| **60x** | 62.50 | **12.83** | **0.205** | 132.2% | 74.2 | intended 3,750x, got 770x |

The 10x point is VOID on the window-claim hang, so **the knee is bracketed to (5x, 30x] and cannot be
located inside it.** The artifact says so rather than drawing a line through the hole.

Per `FIT-01`, no linear fit is published for this curve and that is deliberate: a straight line through a
saturating relationship returns a high `rSquared` and a slope that describes neither regime. The
reportable facts are the tracking range, the knee bracket, and the ceiling.

## Three findings, in order of how much they change what we do

### 1. The control is inverted above the knee

30x delivers **13.34** candles/s; 60x delivers **12.83**. Asking for twice the speed returns 3.8% less.
The mechanism is visible in the formula: at 60x the interval floor of 16 ms is reached, so the engine
schedules a tick every 16 ms. When a tick's work exceeds 16 ms the queue never drains, and the extra
scheduling pressure costs more than it buys. At 30x the interval is 33 ms, closer to what the work
actually takes.

This also reproduces B4 independently: B4 measured 873 bars/min = **14.55** candles/s at selected 60x,
against **12.83** here on a different day with a different instrument. Same regime, and B4's probe was
sound.

### 2. Renderer CPU is pinned at every speed, including 1x

**118.5% at 1x. 132.2% at 60x.** A twelve-fold change in delivered work moves CPU by 12%.

At 1x the renderer burns more than a full core to advance **one candle per second**. That is not per-bar
work — it is a fixed cost that exists whenever replay is active, and at low speeds it is essentially the
entire cost.

**S1's declared prediction set fires, but not cleanly, and I am saying which.** The declaration was
"rises with speed means per-bar work, flat means a timer or animation loop". CPU is flat — but a **pinned
gauge cannot discriminate**, which is the same caveat I raised on S3. What settles it is the other axis:
if the cost were purely a fixed loop, delivered throughput would keep rising with the setting, and it
saturates instead. So **both terms exist**: a large speed-independent loop cost that dominates at low
speed, and a per-bar cost that caps throughput at ~13 candles/s.

### 3. The engine paints far more often than anything changes

**141.7 paints/s at 1x**, while one candle advances per second — roughly **141 paints per candle**, and
more than twice a 60 Hz display can show. Paints/s *falls* as speed rises (141.7 → 118 → 84.7 → 74.2),
so the paint loop is decoupled from bar advance and runs flat out, competing with the work that actually
matters.

This is a new lead and it belongs to the fixed cost in finding 2. It is also the cheapest thing on this
page to test: cap paints to one per advanced bar behind a flag and re-measure.

## What must not be read from this table

`ms/bar` falls from 1,154 to 102 across the range. **That is not an efficiency gain.** With CPU pinned at
~120%, `ms/bar` is arithmetically the reciprocal of delivered throughput and carries no independent
information. Quoting it as "the engine gets more efficient at speed" would be reading a saturated gauge
backwards.

## What this does to the plan's numbers

**Nothing needs restating.** Every per-bar figure I have published is computed from observed
`replayIndex` deltas, never inferred from the slider, so the 63/37 indicator split and the CPU-ms/bar
slopes stand exactly as published. `Delta 2` holds and for a stronger reason than the same-build
argument: there was no mislabelling factor in the arms to cancel.

What the curve *does* change is the **absolute** framing. A user who selects 60x on a 1-minute chart is
getting **770x real time**, not 3,750x — and would get 800x by selecting 30x instead.

## For the PO, in three lines

Replay speed is measured in candles per second, so the number on the control is not a real-time multiple.
It works as labelled up to about 5x. Above that the engine cannot keep up and flattens at roughly 13
candles per second, and **60x is slightly slower than 30x** — so the top half of the control does
nothing, and the very top is worse than the middle.

## Queued from this

1. **Locate the knee.** The 10x point must be re-run to close the (5x, 30x] bracket. Cheap, 12 minutes,
   blocked only by the window-claim hang.
2. **The over-paint test.** 141 paints per candle at 1x is the largest unexplained constant on this page.
3. **For A:** the interval floor at `replay-system.js:4668` is where the inversion lives. A tick budget
   that backs off when work exceeds the interval would make 60x at least as fast as 30x, which is the
   minimum a user expects from a speed control.

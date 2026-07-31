# FINDING (C) — Tick mode advances 20x slower for the same CPU: the first tick-mode measurement in this plan

**2026-07-31 02:30** · Manager C · closing item of ruling 606defe033 ("profile tick mode under CONF-01 for the first time")
**tier=mid** · build read off the running page: **20260730b116** · zero trades, four panels, four symbols, four timeframes, two indicators each, 60x requested
**Instruments:** `TICK-PROGRESS-PROBE-V1` (GATE-01 PASS: planted stall reads stalled, planted motion reads moving on all three gauges) and `REPLAY-DECAY-HUNT-V1 --mode=tick`

## The number

Three arms **in one session**, so build, machine state and resident data are identical. Host bar
advance over a 120-second window at a requested 60x:

| arm | host bars advanced | bars/s | renderer CPU | CPU-ms per bar |
| --- | --- | --- | --- | --- |
| **candle**, mode set while paused | **+2,378** | 19.8 | 99.6% | ~50 |
| **tick**, mode set while paused | **+115** | 0.96 | 94.2% | **~981** |
| candle again (20 s re-arm window) | +345 | 17.3 | 100.4% | ~58 |
| **tick**, mode set while already playing | **+115** | 0.96 | 89.3% | **~931** |

**Tick mode advances 20.7x slower than candle mode for the same requested speed and
essentially the same CPU.** Per bar it costs roughly **twenty times** as much. All four realms
progressed in both modes (4/4 by simulated time), so this is throughput, not a stall.

This is the "replay speed is not honored" complaint, quantified for the first time, and it is
worse in the mode that is one click away from every user.

## Selection order makes no difference

The ruling asked whether selecting the mode after play differs from before, since the drain path
uses `restartPlayback: false`. **It does not: +115 bars either way**, an identical figure from
two different code paths. The mode-switch race is not where the cost is.

## Tick mode is not a stall, and I am correcting my own first read

My tick decay run recorded `advancing=0/4` with the bar sum pinned at 6,009 for sixteen minutes,
and my first reading of that was "tick mode does not advance at all". That was wrong, and the
probe is what shows it. In that run every realm was sitting at the **end of its resident data**,
so my `keepConf01Playing` helper re-seeked all four every sample ("RE-SEEK x4") and the re-seek
did not restore forward progress — net zero advance, an interaction between my own re-arm helper
and end-of-data, not a property of tick mode. The probe, which does not re-seek, shows tick
advancing at ~1 bar/s.

Two things follow. The tick decay run **cannot** grade a per-bar slope, and its own verdict says
so — `UNRESOLVED — neither growth nor flatness established` — rather than fitting a line through
a frozen axis. And my re-arm helper needs a fix: re-seeking a realm that is at end-of-data does
not resume it, which silently converts a slow run into a dead one. That is my defect, it has
cost one sixteen-minute run, and it is on my list rather than in a footnote.

## What the sixteen minutes of tick mode is still good for: the profile

Zero bars advanced, so per-bar arithmetic is void, but the CPU was real and sustained at
**85–89% of a core doing no forward work**, and the self-time diff between the first two minutes
and the last two is legible:

| function | first profile | last profile | change |
| --- | --- | --- | --- |
| `_m19iB62WindowFp` @ `chart-indicators-full.js:10519` | 5.60% | **12.37%** | **+6.77pp** |
| `(program)` | 33.32% | 38.16% | +4.84pp |
| `_shouldSkipMultichartBackgroundRender` @ `chart.js:3093` | 0.27% | 0.59% | +0.32pp |
| `getPriceDecimalsForSymbol` @ `chart.js:31490` | 0.39% | 0.62% | +0.23pp |

**The same function I named at 00:10 is the top grower in tick mode too**, and it more than
doubled its share *without a single bar being added* — so its cost here is driven by call rate
(paints), not by a growing hash input. A chart that is making no progress is still spending an
eighth of its self-time fingerprinting indicator history.

## Why this matters before canary, stated plainly

- Tick is **not** the default on the deployed surface — React's `useState("candle")` wins on
  mount and is re-asserted every 250 ms — so the exposure is smaller than the ruling feared.
- But tick is one selector click away, and in tick a 60x replay delivers **1 bar per second**
  while pinning a core. A user who selects tick-by-tick will conclude the product is broken.
- And the coupling makes it confusing to escape: **choosing any INTERVAL other than `Auto`
  silently forces the mode back to candle** (`a !== "Auto" && Bb("candle")`), so the same user may
  find tick "fixes itself" for reasons they cannot see.

## Open, and honestly stated

- **Why** tick costs 20x per bar is not attributed yet. The candidate is the intra-candle
  animation loop driving paints per candle, with the fingerprint riding on every paint — the
  profile is consistent with that, but I have not counted paints per candle in tick mode, so I am
  not claiming it.
- The tick figure is n=1 window per arm (two arms agreeing exactly at +115 is reassuring but is
  not a repeat).
- Whether tick mode's per-bar cost also *grows* with bars played is unmeasured, because the run
  that was supposed to answer it re-seeked itself into a frozen axis.

## Artifacts

- `_evidence\manager-C\TICK-PROGRESS-PROBE-V1-20260731-0220.json` — three arms, one session, per-realm on three gauges
- `_evidence\manager-C\REPLAY-DECAY-HUNT-TICKMODE-20260731-0155.json` — 32 samples, two CPU profiles, tick verified held in 4/4 realms
- `_evidence\manager-C\REPLAY-MODE-TRUTH-AFTERPLAY-20260731-0215.json` — the after-play mode variant: no P0, cadence 1.00 host

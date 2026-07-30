# RULING — Every multichart optimisation is gated on same-pair. The real configuration has zero coverage.

**Date:** 2026-07-30 14:30
**Author:** Director
**Supersedes on this point:** RULING-SCALING-TEST-KILLS-LANDING2 (20260730-0930), RULING-MC-CLONE-IS-75-PERCENT (20260730-1150) — both aimed at the wrong configuration.
**Status:** binding

---

## 1. What the PO measured

Same machine, same fifteen minutes, four panels on **four different symbols and four
different timeframes** on both products. This is the first genuinely controlled
cross-product measurement in the campaign.

### Four charts, playing

| | Talaria b112 | TradeZella | ratio |
|---|---|---|---|
| Tab memory footprint | 1,629 MB | 597 MB | **2.7x** |
| JavaScript memory (live) | 586 MB | 104 MB | **5.6x** |
| Tab CPU | 107% | 65% | 1.6x |
| GPU process CPU | 51% | 17% | 3.0x |
| Browser CPU | 19% | 26% | 0.7x |
| **Total CPU** | **~177%** | **~108%** | **1.6x** |
| Image cache | 5.6 MB | 0.17 MB | 33x |
| Script cache | 32 MB | 64 MB | 0.5x |

### The number that names the defect

| live JS heap | idle → playing |
|---|---|
| TradeZella | 133 MB → **104 MB** (falls) |
| Talaria | 247 MB → **586 MB** (+339 MB) |

TradeZella's heap does not grow when it plays. Ours adds 339 MB. Their script cache
is **twice** ours, so they ship more code and still run four instruments in a fifth
of our heap. This is not a floor. It is not assets. It is not documents. It is how we
hold and move bar data during playback.

---

## 2. The PO's ruling on configuration, and what it invalidates

The PO has ruled, as a product fact:

> People will most likely use different timeframes and different symbols when having
> multicharts, and it is important to fix.

**Consequence.** Every performance measurement this campaign has taken on four panels
was taken on the **same** symbol and timeframe. The 0930 scaling test that cancelled
Landing 2 was single-dataset. The 1150 clone A/B was same-pair. I declined the
bar-store change at 13 hours out on the strength of measurements that did not touch
the configuration users will run.

I aimed the campaign at the configuration that was easy to measure rather than the
one that ships. That is the error, and it is mine.

---

## 3. The mechanism, read from the code (not inferred)

Read on `manager-a/critical-path`, `homepage/public/chart/chart.js`.

There are **sixteen** call sites of `_multichartSamePairAsHost(...)`
(`:4669` definition; guards at `:4736, 5090, 5113, 5345, 5475, 5752, 6065, 7306,
7464, 8030, 11012, 11052, 11262, 19993, 35329`).

Those sixteen guards gate, collectively:

- parent replay-master reuse (`_syncReplayMasterFromParentIfCovers`, `:7464`)
- host-native master adoption (`parent-native-master`, `:11262`)
- the `this.rawData = parent.rawData; this.data = parent.data` **alias** (`:7495-7500`,
  and the resample path at `:4570`)
- same-pair replay catch-up that avoids per-panel `/bars` during play (`:8030`)
- the finer-panel self-own path (`:5090`, `:5113`)

**When the symbols differ, all sixteen return false.** Nothing is shared, nothing is
aliased, no catch-up is short-circuited. Each panel independently:

1. fetches its own full 1-minute base series from the server,
2. retains it whole in `_panelFullRawData`,
3. resamples it to its own display timeframe,
4. keeps a second copy in `replay.fullRawData`,
5. and issues its own `/bars` requests while playing, because catch-up is off.

`_mcRawDataCopyLimit()` returns **200,000** (`:3530`). For any realistic range that is
not a cap; it is the absence of one.

### Why this explains the whole history

- **Memory.** Four independent full 1m base series, each with a resampled display
  array and a replay copy, as one JS object per bar. Four datasets, ~130 MB each.
- **CPU.** Four independent fetch-and-resample pipelines, four indicator recomputes,
  none coalesced.
- **The original crash reports.** Multichart + indicators + orders, four panels each
  fetching independently during play, is exactly the configuration with zero
  optimisation coverage. It was never a mystery. We had simply never measured it.
- **Why our instruments always looked better than the PO's experience.** Our harnesses
  ran same-pair. The optimised path. The one users won't use.

**Standing correction (BRIEF-02).** My 14:00 statement to the PO — "four different
timeframes means four clones, and same-timeframe panels already alias" — was half
right and wrongly attributed. The alias is gated on same **pair**, not same
**timeframe**. Different symbols is the dominant term, not different timeframes.

---

## 4. The acceptance bar gains a dimension: duration

The PO has added a goal that was never in the bar:

> The chart should perform well — no lag, no excess memory use or CPU use — **no
> matter how long the session was.**

Every number in this campaign is a snapshot: thirty seconds of playback, six
open/close cycles. "Still correct after two hours of real work" is a different
property and it is the one the original crash reports were actually about.

### `DUR-01` (new, binding)

> A performance acceptance is a **slope over time**, not a reading at an instant. Any
> claim that memory, CPU or smoothness is acceptable must be supported by a
> measurement series long enough for a trend to be fitted, in the configuration the
> PO has named. A single sample cannot distinguish "flat" from "climbing slowly", and
> slowly is what kills a trading session.

### `CONF-01` (new, binding)

> The reference configuration for every performance measurement from this point is
> **four panels, four different symbols, four different timeframes, indicators
> loaded, orders open.** Same-pair measurements are a diagnostic convenience and
> carry no acceptance weight. Any existing GREEN taken same-pair is downgraded to
> unverified.

---

## 5. Consequences for existing verdicts

| Prior verdict | New status |
|---|---|
| Landing 2 (bar representation) cancelled, 0930 | **Re-opened.** Cancelled on a single-dataset test. |
| Clone cut graded −75% allocation, 1150 | **Stands for CPU, unverified for memory.** Graded same-pair. |
| Residency "killed with a number" | **Re-opened under CONF-01.** A's own note says the columnar death certificate measured the wrong array. The right array is `_panelFullRawData`. |
| Every GREEN from a four-panel same-pair harness | **Unverified.** Not RED — unmeasured. |

Under `KILL-02` nothing is parked by argument. These are re-armed because the
measurement that retired them did not cover the shipping configuration.

---

## 6. What is true and encouraging

Two things survive and should not be lost in the correction.

**The CPU work is real.** Renderer CPU came down from 186% to 107% and it did so on a
configuration *harder* than the one that produced 186%. The clone cut and reseed cut
earned that.

**The target is proven reachable.** TradeZella holds four different instruments,
playing, in 104 MB of live heap while shipping twice our JavaScript. Whatever they do,
it is possible in a browser. We are not fighting physics; we are carrying four copies
of something that wants to be held once and viewed four ways.

---

## 7. Assignments

Full dispatch text is in `DISPATCH-CONF01-20260730-1430.md`. In summary:

- **A** — own the per-panel dataset cost under CONF-01. Two landings: bound
  `_panelFullRawData` to a real residency window (the 200,000 "cap" is not one), and
  compact bar storage for the base series. Flagged, oracle-first on price
  correctness. This is the 5.6x.
- **B** — the different-symbol path fetches per panel with no catch-up. Establish what
  four panels on four symbols actually request during thirty seconds of play, and
  whether requests are coalesced, deduplicated, or serialised behind the window
  claim. The window-claim hang remains P0.
- **C** — rebuild the instrument to CONF-01 and to DUR-01. Every gauge, every
  baseline, four symbols four timeframes. Then the long-duration series: two hours,
  indicators and orders present, sampled to a slope. This replaces the single-pair
  soak as the freeze gate.
- **D** — correctness under CONF-01. The gate audit stands; additionally, any gate
  that runs same-pair is gate-vacuous for the shipping configuration and is reopened.

---

## 8. Honest position on the freeze

Freeze is in roughly 22 hours. A residency bound plus compact storage on the base
series, oracle-gated on price correctness, is a real change to how price data is held.
I am not going to promise the 5.6x closes by freeze.

What I will commit to: by freeze we will know the number in the configuration that
ships, measured over a duration rather than an instant, and every remaining gap will
have a named mechanism and an owner rather than a shrug. If the gap is still open, the
PO decides what happens to the canary with a real number in hand — not an estimate,
and not a surprise on launch day.

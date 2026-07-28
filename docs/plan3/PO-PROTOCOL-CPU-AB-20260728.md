# PO protocol — Talaria vs TradeZella CPU/memory A/B

**Purpose:** isolate which single factor drives Talaria's CPU cost, by adding one variable at a time and comparing each step against the same step on TradeZella. **This protocol is also the acceptance criterion for every CPU change per §1.5** — any claimed improvement is reported as a before/after pair on these exact phases.

## Controls — identical on both products, or the comparison is void

- **Fresh private/incognito window** for each product. **Close the other product's tab entirely** while measuring — an idle 1.6 GB tab was present in the PO's earlier TradeZella captures.
- **EURUSD**, **1-minute** timeframe, roughly **3 years** of data available.
- **Same browser window size**, maximised. Canvas area is a cost input; a different window size invalidates the comparison.
- **No other heavy tabs.** Note anything unavoidable.
- Measurement tool: **`Shift+Esc`** (browser Task Manager). Sort by **CPU** so the chart tab stays at the top.

## The critical measurement discipline

CPU updates about once per second and **fluctuates**. A single screenshot captures one instant and is not the measurement.

**For every phase: watch the CPU column for 30 seconds, then record three things.**

1. **Screenshot** at a representative moment.
2. **The observed range** — lowest and highest value seen.
3. **Spike period, if any** — "spikes to ~120 roughly every 2 seconds". **This is the most valuable single observation in the whole protocol**, because a periodic spike identifies which timer is responsible.

**Filenames:** `TAL-P2-idle.png`, `TZ-P2-idle.png` — product, phase, name.

## The phases

| # | Phase | What it isolates |
|---|---|---|
| **P0** | Blank private window, no app. Record browser's own CPU/memory. | The floor everything else is measured against. |
| **P1** | **Chart open, 1 pair, 1m, NOTHING playing, no indicators, no orders.** Wait 10s after load settles, then observe 30s. | **The key phase.** Idle cost must be near zero. Talaria showed 20.6 with ~120 spikes; TradeZella 0.4. |
| **P2** | Leave P1 **untouched for 2 minutes.** Record again. | Does CPU stay elevated with zero interaction, and **does memory grow while idle?** Memory rising with no user action is a leak with no excuse. |
| **P3** | Add **one** indicator (EMA 20). Still not playing. | Per-indicator idle cost. |
| **P4** | Add **three more** (4 total). Still not playing. | Whether indicator cost is linear or worse. |
| **P5** | Start replay at **1x**. | The true cost of replay, measured against a known idle floor. |
| **P6** | Raise to **10x** (or TradeZella's nearest equivalent — record which). | **Does speed actually drive CPU?** The PO's step-4 test suggests it may not. |
| **P7** | **Pause** replay. Wait 30s. | Does CPU return to the P4 level? If not, **replay leaves work running after it stops.** |
| **P8** | Add **20 orders** with SL/TP. Not playing. | The July 25 run reached 1.6 GB with 20 orders. |
| **P9** | *(Talaria only, optional)* Open a **second panel**, then close it and return to a single chart. Record all three states. | Quantifies the teardown ratchet already evidenced in `FINDING-LAG-IS-RESIDUE-20260728.md`. |

**If time is short, P1, P2, P6 and P7 are the four that carry the most information.** P1 and P2 locate the idle defect; P6 settles the speed question; P7 settles whether stopping actually stops.

## One Talaria-only diagnostic that likely names the culprit outright

At **P1**, with the chart completely idle:

1. `F12` → **Performance** tab → record → wait **10 seconds** → stop.
2. Screenshot the **summary donut** (Scripting / Rendering / Painting / System).
3. Expand the longest repeated block in the flame chart and screenshot it.

**With nothing happening on screen, anything appearing in that flame chart is the defect.** This is expected to name the function directly.

Also at P1, paste into the console and screenshot the result:

```javascript
performance.getEntriesByType('measure').slice(-20)
```

## Reporting

A short table is enough — no prose needed:

```
PHASE | TALARIA mem | TALARIA cpu (min-max, spike period) | TZ mem | TZ cpu (min-max)
P1    | 1.62 GB     | 20-120, spikes ~every 2s            | 280 MB | 0.4-5
```

**Report what you see, including anything that contradicts the expectations above.** Three hypotheses have already died this week on measurements like these, and a result that breaks the pattern is worth more than one that confirms it.

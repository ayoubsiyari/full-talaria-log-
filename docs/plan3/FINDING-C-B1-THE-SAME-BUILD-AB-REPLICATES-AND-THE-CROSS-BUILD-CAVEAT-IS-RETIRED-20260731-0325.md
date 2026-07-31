# FINDING C — B1: the same-build A/B replicates, and my cross-build caveat is retired

**2026-07-31 03:25** · Manager C · overnight battery B1/B1b · tier=mid model=claude-opus-5-thinking-high
**Instrument:** `INDICATOR-DECAY-AB-V1`, two single-arm runs merged offline
**Build read off the page:** `20260730b116` in **both** arms · **CONF-04:** all four realms read `candle`
**Artifacts:** `_evidence\manager-C\B1-INDICATOR-AB-SAMEBUILD-{ARM2,ARM0,MERGED}-20260731.json`

## Verdict

**The decay survives zero indicators, and indicators carry 63.2% of it.** Same build, same
session shape, arms back to back. This is what the 01:50 A/B said; the difference is that the
caveat I attached to it no longer applies.

| arm | CPU-ms/bar start → end | slope per 1k bars | CI95 | verdict |
| --- | --- | --- | --- | --- |
| two indicators | 57.83 → 81.95 (+41.7%) | **+2.812** | [2.508, 3.116] | CLIMBS |
| zero indicators | 29.07 → 46.25 (+59.1%) | **+1.036** | [0.942, 1.131] | CLIMBS |

Confidence intervals do not overlap. Slope ratio **2.71**. Indicators carry **63.2%** of the
growth; **36.8% survives with no indicators loaded at all**.

## Why this run existed

The 01:50 A/B reached the same conclusion but its arms landed on **b115 and b116** — B shipped
between them, and I said so at the time. That was the one loose thread in the two-culprit split.
Both arms here ran inside one battery, on one build, verified by reading the stamp off the page in
each arm and refusing to merge on mismatch (`comparable: true`, `configurationMismatch: []`).

## It replicates almost exactly

| quantity | 01:50 (cross-build) | 03:25 (same build) |
| --- | --- | --- |
| two-indicator slope | +2.444 CI[1.811, 3.076] | +2.812 CI[2.508, 3.116] |
| zero-indicator slope | +0.881 CI[0.807, 0.954] | +1.036 CI[0.942, 1.131] |
| indicator share of growth | 63.9% | **63.2%** |
| level ratio, two vs zero | 2.2x | 1.99x |

Two independent runs, different builds, agreeing on the share to within 0.7 percentage points.
The tighter CIs here come from the arms being longer-lived and better re-armed, not from a
different mechanism.

## What it means for A's two cuts

Unchanged in direction and now firmer in magnitude. The split holds:

- **`_m19iB62WindowFp`** (full-history FNV-1a hash per paint, `chart/modules/chart-indicators-full.js`)
  is **indicator-gated** and accounts for the 63.2% that disappears when indicators are removed.
- **`m20Q6CapturedClear`** (linear scan of an unbounded `state.schedulers` ledger,
  `replay-system.js`) is **not indicator-gated** and is the natural owner of the 36.8% that
  survives at zero indicators.

Cutting only the fingerprint leaves roughly a third of the decay standing. Both cuts are needed,
which is what "shoot suspects simultaneously" was for.

## Honest limits

- Zero indicators is **verified from product state** in every realm (`ind=[0,0,0,0]`), not assumed
  from the arming call.
- The x-axis is **host bars with three peers resident and advancing by simulated time**
  (`byIndex=1/4`, `bySimTime=4/4` in all 28 windows of both arms) — the correction I made at
  01:30, restated here so nobody re-reads it as four independent bar axes.
- Both arms are n=1 sessions of 28 windows each. The slope CIs are within-run fits; they do not
  carry between-session variance, and I have not claimed they do.

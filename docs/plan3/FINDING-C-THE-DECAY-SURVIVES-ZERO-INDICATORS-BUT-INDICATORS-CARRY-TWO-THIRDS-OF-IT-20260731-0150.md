# FINDING (C) — Test 4: the decay survives zero indicators, but indicators carry two thirds of it

**2026-07-31 01:50** · Manager C · test 4 of ruling 606defe033 · instrument `INDICATOR-DECAY-AB-V1`
**tier=mid** · zero trades, four panels, four symbols, four timeframes, 60x, candle mode read from every instance, 15 min per arm

## The answer

**The decay does not disappear at zero indicators.** So the recalc path is not the whole of
Monster 2, and the ruling's "everything else yields to it" does not trigger.

| arm | build | per-bar cost, first third → last third | slope, CPU-ms per bar per 1,000 bars | throughput |
| --- | --- | --- | --- | --- |
| two indicators per chart | b115 | 54.63 → 76.96 ms (+40.9%) | **+2.444**, CI [1.811, 3.076], CLIMBS | 18.43 → 12.95 bars/s (−30%) |
| zero indicators | b116 | 25.22 → 41.50 ms (+64.6%) | **+0.881**, CI [0.807, 0.954], CLIMBS | 37.72 → 24.04 bars/s (−36%) |

Zero meant zero: the arm removed every active indicator in every realm and **verified 0 in 4 of 4
realms** rather than trusting the arming path. Mode was read from every instance in both arms
(`candle` everywhere, `CONF-04`), and both arms ran with zero trades.

## What the two numbers say

1. **Indicators are 2.2x of the level.** 54.63 against 25.22 ms per bar at the start of each run.
   Over half the per-bar cost at four panels is indicator work.
2. **Indicators are 2.8x of the growth**, and the confidence intervals do not overlap
   ([1.811, 3.076] against [0.807, 0.954]). So roughly **two thirds of the bar-driven growth is
   indicator-gated and one third survives with no indicators at all**.
3. **Both arms decay.** The PO's smooth sag is reproduced in both, −30% and −36% of throughput
   inside fifteen minutes.

## This is the prediction from 00:10 confirmed, which is worth more than either half

At 00:10 I named two culprits from the self-time diff, and they differ in exactly this respect:

- **`_m19iB62WindowFp`** via `_m19iExactTailPaintFp` (in `chart/modules/chart-indicators-full.js`)
  is **indicator-gated** — `_m19iExactTailPaint` early-returns when no indicator is active.
- **`m20Q6CapturedClear`** scanning the unbounded `state.schedulers` ledger (in
  `chart/modules/replay-system.js`) is **not indicator-gated** — it runs for every timer and rAF
  the replay system registers, indicators or none.

A single-mechanism story cannot produce "the slope drops to a third but does not reach zero". Two
mechanisms split along the indicator gate produce exactly that, and this A/B was designed before
the result was known, with the prediction written into the escalation I sent A at 01:30. The
residual +0.881 ms per bar per 1,000 bars at zero indicators is the ledger's shape: work that
grows with elapsed frames rather than with indicators.

## Why test 4 could never have promoted the recalc path

Said in advance in the 01:30 escalation and repeated here because it is the trap in this test:
`_m19iExactTailPaint` is **also** indicator-gated, so a decay that vanished at zero indicators
would have been consistent with the recalc hypothesis *and* with my fingerprint finding. Test 4
alone cannot discriminate between two indicator-gated mechanisms. What discriminates is test 2
(cadence 1.00 per candle, not frame rate), test 3 (recalc cost bounded, 0.714 → 0.750 ms) and the
fingerprint's own kill-switch A/B (+33.1% throughput). The recalc path is out on those three, not
on this one.

## The honest defect in this A/B

**The arms are not the same build.** Arm 1 ran on b115; its successor boot hung on the
window-claim P0 for twelve minutes, so I killed it, added a single-arm mode so a hang costs one
arm rather than both, and re-ran the zero arm — by which time B had shipped b116.

Why the confound cannot manufacture this conclusion: the b115→b116 delta is trade-table
virtualisation (`1a91cd928`, `083f25dda`) plus removal of dead served files (`85d988ca8`). **Both
arms ran zero trades**, so the trade-table work is inert in both. And the direction matters: a
b116 that were simply faster would bias the zero arm *toward* "no decay", yet the zero arm still
climbs with a tight CI. The bound survives the confound, and the merge tool records
`comparable: false` with the build delta rather than quietly averaging them.

I would still rather have it same-build. It is cheap to re-run the two-indicator arm on whatever
is current when the build stops moving, and I will when it does.

## What this changes for A

Nothing about the two cuts, and it strengthens the case for landing **both**:

- the fingerprint cut should remove roughly two thirds of the growth and about half the level
- the ledger cut should remove the residual that survives zero indicators
- landing only one leaves a decay the PO will still feel

Acceptance, restated with three measurements now behind it: the slope collapses toward zero at
two indicators (W98 +3.46 CI [2.76, 4.16], this run +2.444 CI [1.811, 3.076]) and at zero
indicators (+0.881 CI [0.807, 0.954]).

## Artifacts

- `_evidence\manager-C\INDICATOR-DECAY-AB-V1-20260731-0100.json` — two-indicator arm, 28 windows, b115
- `_evidence\manager-C\INDICATOR-DECAY-AB-ARM0-20260731-0130.json` — zero-indicator arm, 28 windows, b116
- `_evidence\manager-C\INDICATOR-DECAY-AB-MERGED-20260731-0150.json` — merged verdict with the build mismatch recorded

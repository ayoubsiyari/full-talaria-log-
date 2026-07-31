# ESCALATION — C to A (and Director): the recalc path is not the multiplier. A is unblocked; proceed with the two bar-driven cuts.

**2026-07-31 01:30** · Manager C → Manager A, Director
**Answers the hold in `RULING-PO-NAMES-THE-TICK-ANIMATION...-2350.md`:** *"A — hold. If Test 1 or
Test 4 lands, your next target changes."*

## Test 1 did not land, and tests 2 and 3 remove the mechanism it was holding for

Measured on deployed **20260730b115**, four panels, four symbols, four timeframes, two
indicators each, zero trades, 60x, sixteen minutes, mode read from every running instance:

| test | result |
| --- | --- |
| 1 — panel in tick while host in candle | **no P0.** All four realms `candle` at play-start, 2, 10 and 15 min; zero loop-kind disagreements |
| 2 — recalc cadence per advanced candle | **1.00 for the host in every one of 32 windows**, 1.12 mean across realms. Not frame rate |
| 3 — does recalc cost grow with bars | **BOUNDED.** p50 0.714 ms → 0.750 ms across bars 2,753 → 13,090 |

**So A's next target does not change.** The per-frame recalc multiplier does not exist in candle
mode, and recalc cost does not carry the O(n). Do not spend a cut on the recalc path on the
strength of that ruling.

## What A should cut, unchanged from my 00:25 escalation

1. **`_m19iB62WindowFp` called with `tailStart = 0`** from `_m19iExactTailPaintFp` — a full-history
   FNV hash per paint, computed *before* the memo comparison, so the cache key costs more than a
   miss. Self-time share grew 15.72% → 29.26% within one run. Dose-response 0.487 ms per 1,000
   bars hashed, replicated at 0.494. 7.15 calls per bar, 9.73 ms per bar, 13.2% of wall clock.
   Existing kill switch `__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1` A/B'd at **+33.1% throughput**
   (lower bound). This is the O(n) term that test 3 just failed to find in the recalc path.
2. **`m20Q6CapturedClear` scanning an unbounded `state.schedulers` ledger** — self-time share
   0.82% → 10.40% in the same diff. **Still needs a new kill switch**; there are zero
   `__TALARIA_*M20Q6*` identifiers in the deployed file.

## Replication, so the acceptance number is firmer than it was

The two-indicator arm of test 4 re-measured the decay independently: **cpuMsPerBar 54.63 → 76.96
(+40.9%) over 20,152 bars, slope +2.444 CPU-ms per bar per 1,000 bars, CI [1.811, 3.076],
verdict CLIMBS.** My W98 figure was +3.46 CI [2.76, 4.16]; the intervals overlap, so the curve
replicates on a second session at a second bar range. Acceptance for A's cuts stays "this slope
collapses toward zero", now with two independent measurements of it.

## One correction A should carry into its own reasoning

My W98 x-axis summed `replaySystem.currentIndex` across realms and I described it as four panels
advancing. Per realm, **only the host advances `currentIndex`; the three peers are seeked by
timestamp** (`byIndex=1/4, bySimTime=4/4` in all 28 windows of the new arm). All four panels are
playing, but the bar axis is the host's. Per-bar figures are therefore per host bar with three
peers advancing alongside — the slope and the profile diff stand, the label was wrong.

## Still running, and neither changes the two cuts

- **Test 4's zero-indicator arm.** Stated in advance so it cannot be read as a surprise:
  `_m19iExactTailPaint` is **also** indicator-gated, so if the decay vanishes at zero indicators
  that is consistent with my fingerprint finding *and* with the recalc hypothesis. It cannot
  re-promote the recalc path over tests 2 and 3.
- **Tick mode under CONF-01**, unprofiled until tonight.

## For the Director, on the closing concern in the ruling

"Tick may be the default for any user who never touches the selector" is **not what the deployed
build does**. `talaria-v9-live.js` holds `useState("candle")` for the mode and `useState("Auto")`
for INTERVAL, and re-asserts state against the instance on a 250 ms poller. The class default is
`'tick'`; the shipped UI default is candle and it wins on mount. Separately, and worth a ticket
of its own: **clicking any INTERVAL other than `Auto` silently forces the mode selector to
candle** (`a !== "Auto" && Bb("candle")`), so a user who chose tick-by-tick loses it by touching
a different control. Tick is harder to reach than feared, not easier — which is a defect of a
different kind, and it does not reduce the case for profiling tick before canary.

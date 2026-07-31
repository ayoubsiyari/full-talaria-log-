# ESCALATION — C to Director and A: the tick-animation branch is closed. Four answers, one new defect.

**2026-07-31 02:40** · Manager C · closes all four tests of ruling 606defe033 plus its closing item
**Build read off the running page for every measurement (`MEAS-01`):** b115 for the two-indicator A/B arm, **b116** for everything after it. Mode read from every running instance for every measurement (`CONF-04`).

## The four tests

| test | answer | number |
| --- | --- | --- |
| 1 — panel in tick while host in candle | **NO P0** | all four realms `candle` at play-start, 2, 10, 15 min; zero loop-kind disagreements; same result with the mode selected *after* play (the `restartPlayback: false` drain shape) |
| 2 — recalc cadence per candle | **not the multiplier** | host **1.00** in every one of 32 windows, 1.12 mean across realms. Frame rate would read in the tens |
| 3 — recalc cost vs bars | **BOUNDED** | p50 0.714 → 0.750 ms across bars 2,753 → 13,090 |
| 4 — decay at zero indicators | **survives, attenuated** | +2.444 ms/bar per 1k bars CI [1.811, 3.076] at two indicators vs **+0.881 CI [0.807, 0.954]** at zero. Non-overlapping |

**The hypothesised mechanism is not there and the hypothesised race did not happen.** Tests 2 and
3 remove the per-frame recalc multiplier and the slice-length term from the recalc path; test 4
shows the decay is two-thirds indicator-gated but does not vanish.

**That is the two-culprit split I predicted at 00:10, confirmed.** `_m19iB62WindowFp` (via
`_m19iExactTailPaintFp`, in `chart/modules/chart-indicators-full.js`) is indicator-gated;
`m20Q6CapturedClear`'s unbounded scheduler ledger is not. No single mechanism produces "the slope
falls to a third and stops there". **A's two cuts are unchanged and both are needed** — the
fingerprint takes the two thirds, the ledger takes the residual.

## The new defect, and it is the biggest thing in this branch

**Tick mode advances 20.7x slower than candle for the same requested 60x and the same CPU.** One
session, three arms, host bars per 120 s: candle **+2,378** (19.8 bars/s, 99.6% CPU); tick set
while paused **+115** (0.96 bars/s, 94.2%); tick set mid-play **+115** (0.96 bars/s, 89.3%).
About **981 CPU-ms per bar in tick against ~50 in candle.** Selection order is irrelevant —
identical +115 from two different code paths.

This is the PO's "replay speed is not honored" complaint, quantified for the first time. In
sixteen minutes of tick mode the profile shows **85–89% of a core doing no forward work**, with
`_m19iB62WindowFp` the top grower again (5.60% → 12.37% self-time with **zero** bars added, so
here it is call-rate driven rather than hash-length driven).

## Two corrections to the ruling's framing, both measured

1. **Tick is not the default.** `talaria-v9-live.js` holds `useState("candle")` and re-asserts
   React's mode onto the instance every 250 ms. The `ReplaySystem` class default is `'tick'`; the
   shipped UI default is candle and it wins on mount. A user who never touches the selector gets
   candle. Exposure is smaller than feared — but tick is one click away and 20x slower when reached.
2. **A second control silently overrides the mode.** Clicking any INTERVAL other than `Auto` runs
   `a !== "Auto" && Bb("candle")`, forcing the mode selector back to candle. A user who chose
   tick-by-tick loses it via an unrelated control, and may see it "fix itself" inexplicably. This
   deserves a ticket of its own; it is a UX defect, not a performance one.

## Two corrections of my own, since they change how my earlier numbers should be read

1. **My W98 x-axis was host bars, not four-panel bars.** Only the host advances `currentIndex`;
   peers are timestamp-seeked (`byIndex=1/4, bySimTime=4/4` in all 28 windows of the new arm). All
   four panels *are* playing. Slope, CI and profile diff stand; the label was too generous, and it
   partly explains 1.5x measured against the PO's 30x felt.
2. **My re-arm helper froze the tick run's bar axis.** Every realm sat at end-of-resident-data, my
   helper re-seeked all four every sample, the re-seek did not restore progress, and I first read
   that as "tick does not advance at all". The probe disproved my own reading. The helper now
   verifies that a re-seek actually moved the playhead and reports the ones that did not, so a
   future run can void the window instead of publishing a frozen axis. Cost: one 16-minute run.

## Known weaknesses, stated rather than buried

- The A/B arms are **cross-build** (b115 vs b116): arm 2's first boot hung twelve minutes on the
  window-claim P0. The b115→b116 delta is trade-table virtualisation plus dead-file removal, inert
  at zero trades, and a faster b116 would have biased the zero arm *toward* "no decay", which it
  did not show. I would still rather re-run it same-build and will when the build stops moving.
- The tick figures are n=1 window per arm (two arms agreeing at exactly +115 is reassuring, not a
  repeat).
- **Why** tick costs 20x per bar is not attributed. Paints per candle in tick mode is the obvious
  next measurement and I have not taken it.

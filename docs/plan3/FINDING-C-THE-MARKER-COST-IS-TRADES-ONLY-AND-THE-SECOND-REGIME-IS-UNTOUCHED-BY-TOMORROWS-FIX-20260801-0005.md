# The marker cost is trades-only, and a second regime survives with zero trades

**Manager C — 2026-08-01 00:05**
Build 20260731b120. Host rasteriser ANGLE (NVIDIA RTX 4060 Laptop GPU, D3D11) — hardware, so paint costs are user-representative.

---

## The ordered question, answered

Every freeze I dissected today carried 43 closed trades. The question was whether tomorrow's marker fix
covers one regime or both. **It covers one.**

At a matched bar count, with zero trades verified rather than assumed:

| | with trades (soak) | zero trades | 
|---|---|---|
| resident bars | 31,085 | 28,229 |
| **order-manager / marker family** | **4.9% of thread** | **ABSENT — no entry at any share** |
| blocking time | 398.9 ms/s | 178.9 ms/s |
| unthresholded task time | 637.6 ms/s | 513.6 ms/s |

The marker family — `_findCandleIndexForTime` (order-manager.js:41982) at 2.5% and its caller at 41988 at
2.4% — is the same code path that read 24.1% of the main thread in the heavier 43-trade profile and 31.8%
of a single 692 ms freeze. With no trades in the book it does not appear in the profile at all, at any
share, in **three traces spanning 12,339 to 35,754 resident bars** — including one taken at 15% *more*
bars than the with-trades comparison.

## The zero-trade regime scales with bars on its own

The three traces are a small dose-response curve in resident bars, with trades held at zero throughout:

| resident bars | blocking | `_m19iB62WindowFp` | `set innerHTML` | order-manager |
|---|---|---|---|---|
| 12,339 | 159.1 ms/s | 11.2% | 16.1%¹ | absent |
| 28,229 | 178.9 ms/s | 24.9% | 14.1% | absent |
| 35,754 | 247.6 ms/s | 28.0% | 13.0% | absent |
| *31,085, with trades* | *398.9 ms/s* | *11.8%* | *18.5%* | *4.9%* |

¹ attributed to `talariaAppendIndicatorLegendRow` rather than the DOM setter in that trace; same work,
different attribution depth.

Two things follow. **Blocking in the zero-trade arm rises with resident bars** (159 → 179 → 248 ms/s),
so the second regime is not a fixed overhead — it is the same bar-scaling shape as Monster 2. And at
35,754 bars, *more* than the with-trades arm carried, zero-trade blocking is still **38% lower**
(247.6 against 398.9 ms/s), which is the cleanest single statement of what removing trades buys.

`_m19iB62WindowFp` more than doubles its share as bars grow, from 11.2% to 28.0%. Whatever tomorrow's
marker fix does, this is the function that will dominate the profile afterwards.

This is a presence-versus-absence result, which is why I am willing to lead with it. It survives every
normalisation argument below because zero times anything is zero.

## The second regime, which the marker fix will not touch

With zero trades, no orders, and no open positions, **43% of the main thread is still three things**:

| function | share, zero trades | file |
|---|---|---|
| `_m19iB62WindowFp` | 24.9% (249.1 ms/s) | chart-indicators-full.js:10526 |
| `set innerHTML` | 14.1% (140.6 ms/s) | via `talariaAppendIndicatorLegendRow`, indicator-ui.js:2968 |
| `getBoundingClientRect` | 4.0% (40.3 ms/s) | via `_isMultichartPanelVisibleForPaint`, chart.js:3046 |

All three were already escalated today as levers, and all three are now shown to be **trade-independent**.
A fix that removes the marker lookups leaves this untouched.

One new name, visible only once the trade noise is gone: `talariaFillLegendLoadingDots`
(indicator-ui.js:2849) at 5.3% / 52.6 ms/s in the earlier trace. Legend *loading dots* cost five percent
of the main thread during replay.

`m20Q6CapturedClear` behaves differently from the rest: 11.8% with trades, 6.8% and 2.4% in the two
zero-trade traces. A substantial part of it is trade-driven, consistent with its callers being
replay-dashboard-sync and the economic-news sidebar, which have trade panels to repaint.

## What I will not publish, and why

A per-function delta table across the two arms would be the natural deliverable here and it would be
wrong. Three reasons, and the third is the one that stopped me:

1. **The arms deliver bars at different rates** — 9.77 bars/s zero-trade against 7.43 with trades at
   matched resident bars. Removing trades bought 31% more throughput, so every per-second cost is
   measured against a different denominator.
2. **They are separate sessions**, not one session with trades switched off mid-flight, so panel bar
   distribution and indicator instances are not held constant.
3. **One function moves the wrong way.** Normalised per bar, `_m19iB62WindowFp` costs *more* without
   trades (25.5 against 15.9 ms/bar). I do not have an explanation for that, and a table that reported
   four tidy reductions alongside one unexplained increase would invite the reader to average them.
   Until I can explain it, the per-function arithmetic is not evidence.

The blocking-time halving (398.9 → 178.9 ms/s) carries caveats 1 and 2 and is quoted as a wall-clock
observation — which is what a user experiences — not as a per-bar coefficient.

## How the arm was verified

- **Zero trades** read from `orderManager.closedPositions` = 0, with 0 orders and 0 open positions.
  Two earlier guesses (`orderManager.closedTrades`, `orderService.closedTrades`) do not exist on this
  build and both returned `null`. A null is not a zero, and it is the value that slips past a
  truthiness check looking like a pass.
- **Four panels live**, not one. Bar-count advance read 1 of 4 and would have voided the arm; playhead
  advance reads 4 of 4, all moving 7.9 simulated hours in 25 seconds across 1m/5m/15m/1h. This is the
  false-void trap my own session library documents, caught for the second time today.
- **Two indicators per panel** (E's published selection: ema(20,close) incremental + vwap(session,hlc3)
  anchored), speed 60 confirmed on all four panels.

## A latent defect in my own library, found on the way

`conf01-session.mjs:74` reads `svc.closedTrades`, which does not exist on this build. `readConf01State`
has therefore **always** reported `closedTrades: null`. The ten-hour soak escaped only because
`bend-soak.mjs:249` falls back to a second route. Any other caller that trusted that field received a
silent null where it expected a count.

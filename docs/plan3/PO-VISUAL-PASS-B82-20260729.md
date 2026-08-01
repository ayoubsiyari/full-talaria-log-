# PO visual pass — 124-ticket backlog against b82

Purpose: the intake's own conclusion was that most of the 124 tickets came from the OLD website and
would close by a visual re-check on the current build. This is that re-check. It costs no
engineering time and it is the only thing that turns the backlog from unknown into a number.

**Surface:** `http://31.97.192.82:3000/chart/index.html?mode=backtest&sessionId=903`
**Build must read b82 or later.** If it reads lower, stop and tell me — the surface is wrong and
every result below would be void.

## What I deliberately left out, so you don't waste time

- **Clusters A, B, F** (rollback, ledger, fibonacci) — today's audit proved zero work was done.
  We already know they fail. Manager D starts on them now. Nothing to learn by looking.
- **Cluster M** (22 old-layout tickets from Ibrahim) — superseded by the new multichart.
- **Cluster N** (lag/memory) — you already validated this. Indicator lag dead, leak still open.
- **Cluster O** (10 feature requests) — not bugs.
- **Cluster P** — already closed.

That removes about 60 of the 124. What follows is the 9 clusters where the answer is genuinely
unknown and where your eyes settle it.

## How to record

For each check write one of: **PASS** (behaves correctly), **FAIL** (still broken), **UNCLEAR**
(couldn't reproduce the setup). One word is enough. If FAIL, one sentence on what you saw.

---

## 1. Multichart replay freeze — cluster C (6 reports)

Setup: 4-panel multichart, NQ and ES among them, sync ON, 1m, indicators on.
Do: run replay at 1x for 3 minutes. Watch every panel, not just the focused one.
PASS if: all panels advance continuously, no panel stalls until you pause/resume, no panel shakes
tick-by-tick, and no panel stops at the last candle.

Record: ______

## 2. Session restore / resume position — cluster D (5 reports)

Setup: open session 903, replay forward roughly 50 candles, note the date/time on screen.
Do: exit the session completely, re-enter it.
PASS if: it resumes where you left it, not at an earlier point, and a single step-forward advances
exactly one candle rather than jumping days.

Record: ______

## 3. Refresh and persistence — cluster E (6 reports)

Do all four, they are separate rows:
- 3a. Change symbol, refresh. PASS if the symbol stays changed rather than reverting.
- 3b. Pin two timeframes and a drawing tool, refresh, then exit and open a NEW session.
  PASS if pins survive all three. Your spec: pins are user-level memory.
- 3c. Note the PnL figure, refresh. PASS if it is identical.
- 3d. Place an order, let it auto-screenshot, press play, refresh, open the trade card.
  PASS if there is exactly one screenshot, not two.

Record: 3a ___ 3b ___ 3c ___ 3d ___

## 4. Order mechanics — cluster G (12+ reports, the big one)

The highest-value five of the twelve:
- 4a. Place a trade, let price hit TP. PASS if the trade closes at TP rather than running on.
- 4b. Place an order with entry 1 tick above current price. PASS if it becomes a stop/limit, not
  a market order.
- 4c. Place an order with SL and TP, close it, place a NEW order. PASS if the new order does NOT
  inherit the previous SL/TP.
- 4d. Place limit and stop orders. PASS if every SL line is visible on the chart.
- 4e. Open the order dialog, then cancel before confirming. PASS if NO market order is placed.

Record: 4a ___ 4b ___ 4c ___ 4d ___ 4e ___

## 5. Indicator labels — cluster H (3 reports)

Setup: 3 or 4 indicators on, replay PAUSED.
Do: step candle-by-candle.
PASS if: indicator and level labels stay visible while paused and while stepping — the complaint
was they vanish unless you press Play.
Also: switch timeframe with ORB on. PASS if ORB keeps its size. And check daily-open vertical
lines are present.

Record: labels ___ ORB ___ daily-open lines ___

## 6. Candle and data integrity — cluster I (7 reports)

- 6a. Switch 1m → 15m. PASS if the candles actually change shape.
- 6b. Compare current price on 1m vs 5m at the same moment. PASS if identical.
- 6c. From the current WEEKLY candle, switch down to 1h. PASS if the chart stays on your analysis
  area rather than jumping back in date. (Recurring across testers — high value.)

Skip completed-bar close mutation. Confirmed open, zero work, canary blocker under review.

Record: 6a ___ 6b ___ 6c ___

## 7. Zoom, scale, grid, axis — cluster J (9 reports)

- 7a. Scroll to zoom out. PASS if it zooms out rather than in.
- 7b. Scroll both directions on the price scale. PASS if one direction zooms in and the other out.
- 7c. Shrink the browser window or set zoom to 150%. PASS if toolbar icons do not overlap.
- 7d. Press the gridline shortcut, then reset. PASS if per-candle gridlines do NOT reappear.
- 7e. Drag the time-axis label. PASS if the chart does not run away from you.

Record: 7a ___ 7b ___ 7c ___ 7d ___ 7e ___

## 8. Crosshair — cluster K (4 reports)

Setup: synced multichart, replay running.
Do: hold the crosshair still and watch its time-axis label as candles advance.
PASS if: the time label updates as new candles shift the chart, rather than freezing at a fixed
date. A fix for exactly this shipped — this check tells us whether it worked.

Record: ______

## 9. Replay controls — cluster L (7 reports)

- 9a. Press step-forward slowly five times. PASS if each press paints exactly one candle — the
  complaint was 2 silent presses then 3 candles at once.
- 9b. Let replay run across a weekend boundary. PASS if the clock does not advance through the
  weekend while price sits frozen.
- 9c. Let the last candle drift off-screen during replay. PASS if the chart auto-follows.
- 9d. Add drawings with locked labels, run replay. PASS if drawings track the chart without lagging
  behind it.

Record: 9a ___ 9b ___ 9c ___ 9d ___

---

## After you finish

Send me the sheet. Every PASS closes a cluster and shrinks the backlog to a real number. Every FAIL
becomes a dispatched mechanism with a named owner the same hour — not a row in a document.

My commitment: no result from this pass gets filed and forgotten the way the 27 July intake was.

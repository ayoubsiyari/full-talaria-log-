# PO Check - Unknown Intake Clusters

Use one current accepted TEST build. Record the build id once, then mark each check PASS / FAIL / NOT RUN. Screenshots only on FAIL.

## 1. Cluster C - Two-Chart Replay Keeps Moving

Covers the reports where a second chart freezes, shakes, lags, or stops at the last candle.

1. Open a two-panel multichart layout with related futures symbols, for example NQ and ES.
2. Put one panel on `1m` and the other on `15m`.
3. Add the usual indicator set the PO uses when testing replay.
4. Start replay at high speed for one full minute.
5. Pause and resume once while both panels are visible.

Pass: both panels keep advancing, the second panel does not freeze until pause/resume, and no order or marker disappears just because the second panel was closed or reopened.

Fail: either panel stops while the other continues, shakes tick-by-tick, catches up only after pause/resume, or loses visible order state.

## 2. Cluster D - Session Resume And Go To

Covers the reports where re-entering a session returns to the wrong date, step-forward jumps days, or Go To skips sessions.

1. Open a backtest session.
2. Move replay to a very obvious date and time in the middle of the session.
3. Exit to the sessions page.
4. Re-enter the same session.
5. Use Go To to jump to a London or New York session boundary.
6. Step forward three times.

Pass: re-entry restores the same date/time, Go To lands on the intended session, and step-forward advances normally without jumping days.

Fail: the chart returns to an earlier point, Go To errors or skips sessions, or step-forward jumps multiple days from the restored point.

## 3. Cluster E - Refresh Keeps User State

Covers reports about session layouts leaking, symbol/pins reverting, PnL changing after refresh, and duplicate trade screenshots.

1. Open a session with a non-default symbol and a custom layout.
2. Pin two timeframes and two drawing tools.
3. Place one trade and confirm the trade card gets one screenshot.
4. Press Play briefly, then refresh the browser.
5. Re-enter the session, then open a different session.

Pass: the symbol, pins, and intended layout are stable; the first session's layout does not leak into the second; the trade's PnL/history does not change just because of refresh; the trade card still has one screenshot.

Fail: symbol or pins reset, a previous session's layout appears in a new session, PnL/history changes without a trade event, or the same trade receives a second screenshot.

## 4. Cluster H - Indicator Labels Stay Visible

Covers reports where indicator labels or daily-open/ORB labels vanish while stepping or switching timeframe.

1. Add an indicator with a visible label, a daily-open line, and ORB if available.
2. Pause replay.
3. Step candle-by-candle five times.
4. Press Play for five seconds, then pause again.
5. Switch timeframe up and back down.

Pass: labels remain readable while paused, while stepping, while playing, and after timeframe switch; ORB size does not change unexpectedly.

Fail: labels appear only during Play, become white-on-white/invisible, daily-open lines vanish, or ORB size changes after a timeframe switch.

## 5. Cluster I - Candle History Does Not Change Shape

Covers reports about phantom daily candles, completed-bar mutation, cross-timeframe price differences, and weekly-to-lower-timeframe date jumps.

1. Choose an area on a weekly candle that is easy to recognize.
2. Switch down to `1h`, then to `5m`, then back to `1W`.
3. Freeze the replay playhead and compare the visible current price across `1m`, `5m`, `15m`, `1h`, `4h`, `1D`, and `1W`.
4. Watch the previous completed candle at the next open.

Pass: the chart stays near the analyzed area, timeframe switches actually change the candles, the same frozen playhead has consistent prices, and completed candles do not change after close.

Fail: the chart jumps away in date, candles do not redraw for the selected timeframe, price differs across timeframes at the same frozen playhead, or a completed candle changes close/high/low after the next candle opens.

## 6. Cluster J - Zoom, Scale, Grid, And Toolbar

Covers reports where zoom direction reverses, gridlines return after reset, custom timeframe labels spread days apart, news flags scale with zoom, or toolbar buttons overlap.

1. On a small browser width or browser zoom level above 100%, check whether toolbar buttons overlap.
2. Scroll both directions on the price scale.
3. Use a custom `3m` timeframe and zoom out.
4. Reset the chart with the keyboard shortcut.
5. Drag the time label left and right.
6. Toggle news flags if available and zoom in/out.

Pass: toolbar buttons remain usable, scroll directions are correct, gridlines and time labels stay aligned, reset does not bring back per-candle grid clutter, news flags remain a stable size, and dragging the time label does not run the chart away.

Fail: buttons overlap, both scroll directions zoom the same way, grid/time labels separate by days, reset reintroduces bad gridlines, news flags grow/shrink with zoom, or the chart runs away/disappears.

## 7. Cluster K - Crosshair During Replay

Covers reports where the crosshair time label freezes or crosshair behavior differs between layouts/tablet.

1. Open synced multichart replay.
2. Hold the crosshair over the chart while replay is playing.
3. Watch the time label under the cursor for ten candles.
4. Change crosshair settings on one layout.
5. On tablet or touch mode, drag near the crosshair/cursor.

Pass: the crosshair time label updates as candles advance, settings apply consistently where expected, and touch/cursor drag does not move the whole chart unintentionally.

Fail: the time label stays frozen while candles advance, settings apply to only one layout when they should sync, or cursor drag moves the chart instead.

## 8. Cluster L - Replay Controls Behave Literally

Covers reports about step-forward batching, interval substeps, weekend clock drift, tick wick/body order, auto-follow, and drawings lag.

1. Pause replay.
2. Press Step Forward five times and count candles.
3. Set replay interval below the chart timeframe and step ten times.
4. Play across a weekend.
5. Use tick mode and watch whether wick/body draw in the expected order.
6. Pan so the last candle is off-screen, press Play, and watch auto-follow.
7. Add a drawing with a label and replay for ten seconds.

Pass: one step is one visible step, lower replay interval advances as selected, the clock does not run through a weekend while price is frozen, tick body/wick order looks natural, auto-follow returns to the latest candle, and drawings/labels stay attached to candles.

Fail: steps are silent then batch, interval advances only a few substeps, clock moves while price is frozen, wick draws before body in a visible wrong order, replay does not follow the last candle, or drawings lag behind the chart.

## 9. Intake Watch - Memory And Idle Lag

Covers reports where idle return lags, memory climbs to multi-GB, or Chrome risks crashing.

1. Open the same loaded multichart scenario used for replay testing.
2. Start replay with indicators visible.
3. Leave it running for 30 minutes.
4. Return and immediately pan/zoom, then pause/play.
5. Record browser task-manager memory.

Pass: interaction remains responsive after idle, memory remains bounded and does not climb into multi-GB territory, and pause/play does not stall.

Fail: the tab becomes laggy after idle, memory climbs toward multi-GB, Chrome warns/crashes, or the app stalls for a long period before resuming.

## Coverage Inventory

- Cluster C: multichart replay lag, shaking, stale second chart, and loaded tester layouts.
- Cluster D: session resume, Go To, re-entry position, and step-forward jumps from restored points.
- Cluster E: refresh persistence, session isolation, stable symbols/pins/layouts, PnL/history stability, and duplicate screenshots.
- Cluster H: indicator labels, daily-open lines, and ORB label/size stability.
- Cluster I: cross-timeframe price, candle history shape, completed candles, weekly-to-lower-timeframe jumps, and calendar correctness.
- Cluster J: zoom, scale, grid, time-label drag, news flag scale, and responsive toolbar overlap.
- Cluster K: crosshair replay label and crosshair setting behavior.
- Cluster L: replay controls, tick draw order, weekend clock, auto-follow, and drawing lag.
- Intake watch: sustained memory and idle lag on loaded replay.

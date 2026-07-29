# PO Check - Unknown Intake Clusters

Use one current accepted TEST build. Record the build id once, then mark each check PASS / FAIL / NOT RUN. Screenshots only on FAIL.

## Row-Closing Budget

Run in this order if time is short: Cluster G/M6 (15), Cluster I (8), Cluster C (6), Cluster D (6), Cluster L (7), Cluster N (2), Cluster B (1), then the cosmetic/current-surface groups.

- Cluster B trade ledger: 1 row.
- Cluster C multichart replay: 6 rows.
- Cluster D session resume / Go To: 6 rows.
- Cluster E refresh state: 1 row.
- Cluster G/M6 order drag and marker leftovers: 15 rows.
- Cluster H indicator/daily-open/ORB labels: 6 rows.
- Cluster I candle/history/data integrity: 8 rows.
- Cluster J zoom/scale/grid/toolbar: 11 rows.
- Cluster K crosshair replay/settings: 3 rows.
- Cluster L replay controls: 7 rows.
- Cluster M old-layout/current-surface sanity: 16 rows.
- Cluster N memory/idle lag: 2 rows.
- Cluster O feature requests: 9 rows.
- M10 residual trade marker: 1 row.
- Rayan monitor/self-resolved: 3 rows.
- Recurrence watch: 1 row.
- Scratched intake row: 1 row.

## 1. Cluster B - Trade Reaches History

Closes 1 row: representative `TAL-01911`.

1. Open a saved backtest session with at least one visible trade setup.
2. Place a small market or limit trade, let it close, then open All Trades / history.
3. Refresh the browser and re-enter the same session.
4. Check the trade count and the newest closed trade in both the chart panel and history view.

Pass: the executed trade is present in history after refresh, the count does not go down, and the chart marker matches the history row.

Fail: the chart shows the trade but history does not, the count drops after refresh, or the newest closed trade disappears.

## 2. Cluster C - Two-Chart Replay Keeps Moving

Closes 6 rows: representative `TAL-01733`.

Covers the reports where a second chart freezes, shakes, lags, or stops at the last candle.

1. Open a two-panel multichart layout with related futures symbols, for example NQ and ES.
2. Put one panel on `1m` and the other on `15m`.
3. Add the usual indicator set the PO uses when testing replay.
4. Start replay at high speed for one full minute.
5. Pause and resume once while both panels are visible.

Pass: both panels keep advancing, the second panel does not freeze until pause/resume, and no order or marker disappears just because the second panel was closed or reopened.

Fail: either panel stops while the other continues, shakes tick-by-tick, catches up only after pause/resume, or loses visible order state.

## 3. Cluster D - Session Resume And Go To

Closes 6 rows: representative `TAL-01909`.

Covers the reports where re-entering a session returns to the wrong date, step-forward jumps days, or Go To skips sessions.

1. Open a backtest session.
2. Move replay to a very obvious date and time in the middle of the session.
3. Exit to the sessions page.
4. Re-enter the same session.
5. Use Go To to jump to a London or New York session boundary.
6. Step forward three times.

Pass: re-entry restores the same date/time, Go To lands on the intended session, and step-forward advances normally without jumping days.

Fail: the chart returns to an earlier point, Go To errors or skips sessions, or step-forward jumps multiple days from the restored point.

## 4. Cluster E - Refresh Keeps User State

Closes 1 row: representative `TAL-01759`.

Covers reports about session layouts leaking, symbol/pins reverting, PnL changing after refresh, and duplicate trade screenshots.

1. Open a session with a non-default symbol and a custom layout.
2. Pin two timeframes and two drawing tools.
3. Place one trade and confirm the trade card gets one screenshot.
4. Press Play briefly, then refresh the browser.
5. Re-enter the session, then open a different session.

Pass: the symbol, pins, and intended layout are stable; the first session's layout does not leak into the second; the trade's PnL/history does not change just because of refresh; the trade card still has one screenshot.

Fail: symbol or pins reset, a previous session's layout appears in a new session, PnL/history changes without a trade event, or the same trade receives a second screenshot.

## 5. Cluster G/M6 - Order Drag And Markers Stay Literal

Closes 15 rows: representative `TAL-01696`.

Covers the leftover order-drag reports where SL/TP/entry lines disappear, lag behind the cursor, inherit stale draft state, or markers fail to match the order being edited.

1. Open the order panel and prepare a multi-TP draft with entry, SL, and at least two TP rows.
2. Drag the entry line; watch whether SL/TP rows follow only when the tool says they should.
3. Drag SL and TP lines, then release; check that visible fields, labels, and risk/reward numbers agree.
4. Put two TP rows at or near the same price, pan/zoom, then drag each row separately.
5. Cancel one drag with Escape, then start a fresh order and confirm no old hidden level reappears.
6. Place and cancel a small pending order, then check that its entry/SL/TP markers do not stick or vanish incorrectly.

Pass: lines remain visible and individually draggable, visible values match the line positions while and after dragging, Escape leaves no stale hidden state, and markers belong to the correct order.

Fail: a line disappears, a stale SL/TP returns after clear/cancel, two TP rows cannot be grabbed separately, values update only after release, or markers stick to the wrong order.

## 6. Cluster H - Indicator Labels Stay Visible

Closes 6 rows: representative `TAL-01914`.

Covers reports where indicator labels or daily-open/ORB labels vanish while stepping or switching timeframe.

1. Add an indicator with a visible label, a daily-open line, and ORB if available.
2. Pause replay.
3. Step candle-by-candle five times.
4. Press Play for five seconds, then pause again.
5. Switch timeframe up and back down.

Pass: labels remain readable while paused, while stepping, while playing, and after timeframe switch; ORB size does not change unexpectedly.

Fail: labels appear only during Play, become white-on-white/invisible, daily-open lines vanish, or ORB size changes after a timeframe switch.

## 7. Cluster I - Candle History Does Not Change Shape

Closes 8 rows: representative `TAL-01802`.

Covers reports about phantom daily candles, completed-bar mutation, cross-timeframe price differences, and weekly-to-lower-timeframe date jumps.

1. Choose an area on a weekly candle that is easy to recognize.
2. Switch down to `1h`, then to `5m`, then back to `1W`.
3. Freeze the replay playhead and compare the visible current price across `1m`, `5m`, `15m`, `1h`, `4h`, `1D`, and `1W`.
4. Watch the previous completed candle at the next open.

Pass: the chart stays near the analyzed area, timeframe switches actually change the candles, the same frozen playhead has consistent prices, and completed candles do not change after close.

Fail: the chart jumps away in date, candles do not redraw for the selected timeframe, price differs across timeframes at the same frozen playhead, or a completed candle changes close/high/low after the next candle opens.

## 8. Cluster J - Zoom, Scale, Grid, And Toolbar

Closes 11 rows: representative `TAL-01821`.

Covers reports where zoom direction reverses, gridlines return after reset, custom timeframe labels spread days apart, news flags scale with zoom, or toolbar buttons overlap.

1. On a small browser width or browser zoom level above 100%, check whether toolbar buttons overlap.
2. Scroll both directions on the price scale.
3. Use a custom `3m` timeframe and zoom out.
4. Reset the chart with the keyboard shortcut.
5. Drag the time label left and right.
6. Toggle news flags if available and zoom in/out.

Pass: toolbar buttons remain usable, scroll directions are correct, gridlines and time labels stay aligned, reset does not bring back per-candle grid clutter, news flags remain a stable size, and dragging the time label does not run the chart away.

Fail: buttons overlap, both scroll directions zoom the same way, grid/time labels separate by days, reset reintroduces bad gridlines, news flags grow/shrink with zoom, or the chart runs away/disappears.

## 9. Cluster K - Crosshair During Replay

Closes 3 rows: representative `TAL-01700`.

Covers reports where the crosshair time label freezes or crosshair behavior differs between layouts/tablet.

1. Open synced multichart replay.
2. Hold the crosshair over the chart while replay is playing.
3. Watch the time label under the cursor for ten candles.
4. Change crosshair settings on one layout.
5. On tablet or touch mode, drag near the crosshair/cursor.

Pass: the crosshair time label updates as candles advance, settings apply consistently where expected, and touch/cursor drag does not move the whole chart unintentionally.

Fail: the time label stays frozen while candles advance, settings apply to only one layout when they should sync, or cursor drag moves the chart instead.

## 10. Cluster L - Replay Controls Behave Literally

Closes 7 rows: representative `TAL-01931`.

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

## 11. Cluster M - Old-Layout Reports On The Current Surface

Closes 16 rows: representative `TAL-01709`.

Covers old-layout or stale-surface reports that may no longer apply to the current V9 TEST build.

1. In the current TEST build, try the same workflow from the old report if the report is clear: open layout, switch chart, pan/zoom, click the described control.
2. If the exact old control no longer exists, try the equivalent current control once.
3. Do not hunt for a new bug; this check only decides whether the old report still reproduces on the current surface.

Pass: the old control is gone with no current equivalent, or the equivalent current workflow behaves normally.

Fail: the same user-visible problem reproduces on the current surface.

## 12. Intake Watch - Memory And Idle Lag

Closes 2 rows: representative `TAL-01891`.

Covers reports where idle return lags, memory climbs to multi-GB, or Chrome risks crashing.

1. Open the same loaded multichart scenario used for replay testing.
2. Start replay with indicators visible.
3. Leave it running for 30 minutes.
4. Return and immediately pan/zoom, then pause/play.
5. Record browser task-manager memory.

Pass: interaction remains responsive after idle, memory remains bounded and does not climb into multi-GB territory, and pause/play does not stall.

Fail: the tab becomes laggy after idle, memory climbs toward multi-GB, Chrome warns/crashes, or the app stalls for a long period before resuming.

## 13. Cluster O - Feature Requests Are Not Regressions

Closes 9 rows: representative `TAL-01849`.

Covers rows that read as requested new behavior rather than a broken current behavior.

1. Open the related current feature if it exists.
2. Check whether the requested behavior is already present.
3. If it is absent, mark it as "feature not implemented", not as a failed regression.

Pass: the feature exists and works, or the PO agrees the row is a feature request outside canary-fix scope.

Fail: an existing feature that should already work is broken.

## 14. M10 Residual - Trade Marker Projection

Closes 1 row: representative `TAL-01796`.

1. Place a small trade on `1m` replay.
2. Switch to a higher timeframe and pan around the same time window.
3. Return to `1m`.

Pass: the trade marker remains attached to the correct candle/time and does not duplicate or drift.

Fail: the marker moves to the wrong candle, disappears, or duplicates after timeframe changes.

## 15. Rayan Monitor Rows

Closes 3 rows: representative `Rayan #8`.

1. Open the monitor item named by the row owner.
2. Try the reported action once on the current TEST build.
3. If it was previously called self-resolved, verify only that it is still not reproducing.

Pass: the issue does not reproduce on the current TEST build.

Fail: the same visible issue reproduces and can be described in one sentence.

## 16. Recurrence Watch

Closes 1 row: representative `TAL-01723`.

1. Re-run the recurrence workflow from the original note once on the current TEST build.
2. Do not broaden the scope; this is only a stale-surface recurrence check.

Pass: the old recurrence does not reproduce.

Fail: the same recurrence reproduces.

## 17. Scratched Intake Row

Closes 1 row: representative `TAL-01920`.

1. Confirm with the PO that the row is still scratched / withdrawn.
2. If withdrawn, no product clicking is needed.

Pass: PO confirms the row is scratched or no longer a defect report.

Fail: PO says it is still an active defect; move it to the closest cluster above and run that script.

## Coverage Inventory

- Cluster B: history registration for executed trades.
- Cluster C: multichart replay lag, shaking, stale second chart, and loaded tester layouts.
- Cluster D: session resume, Go To, re-entry position, and step-forward jumps from restored points.
- Cluster E: refresh persistence, session isolation, stable symbols/pins/layouts, PnL/history stability, and duplicate screenshots.
- Cluster G/M6: remaining order drag, line persistence, draft-state, marker, and entry/SL/TP interaction rows.
- Cluster H: indicator labels, daily-open lines, and ORB label/size stability.
- Cluster I: cross-timeframe price, candle history shape, completed candles, weekly-to-lower-timeframe jumps, and calendar correctness.
- Cluster J: zoom, scale, grid, time-label drag, news flag scale, and responsive toolbar overlap.
- Cluster K: crosshair replay label and crosshair setting behavior.
- Cluster L: replay controls, tick draw order, weekend clock, auto-follow, and drawing lag.
- Cluster M: old-layout reports checked only against the current surface.
- Cluster N: sustained memory and idle lag on loaded replay.
- Cluster O: feature-request disposition.
- M10 residual: trade-marker projection under timeframe changes.
- Rayan monitor / recurrence / scratched rows: one-pass current-surface disposition.

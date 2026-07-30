# Canary-Critical Money/Data Tests — 2026-07-30

Scope: 21 money-path rows and 12 data-integrity rows still needing canary-critical verification. These are grouped by mechanism. Run on the deployed build only, not a branch preview or local checkout.

## MEAS-01: Required For Every Script

Before each script:
- Read the build stamp from the deployed screen and write it into the result.
- Write the account email/session name used.
- Write whether the test ran on production, canary, or test deployment.
- If the stamp is older than the last-touching fix for the row, stop and mark `NEEDS NEW BUILD`.

Pass evidence must include the build stamp plus the exact rows closed. Fail evidence must include the build stamp plus the first visible symptom.

## Money Path Script 1: M24 Trade Ledger Survives Refresh And ID Stays Stable

Label: `DEPLOYED BUILD ONLY`

Rows closed on pass:
- Rayan `#4/#5/#9`
- Rayan `#11`
- `TAL-01908`
- `TAL-01911`
- `TAL-01919`
- `TAL-01924`
- `TAL-01926`

What to click:
- Open a clean backtest session on the deployed build.
- Capture MEAS-01.
- Place four quick market trades with visible SL/TP so each trade has chart markers and a journal row.
- Write down the visible trade IDs in order, for example `#5`, `#6`, `#7`, `#8`.
- Refresh the browser.
- Reopen the same session.
- Count the history rows.
- Compare every visible trade ID after refresh with the ID written down before refresh.
- Place one more trade after refresh and write down its new ID.

Pass in PO words:
- The same trades come back.
- The count does not go down.
- No trade changes its number after refresh.
- The new trade gets the next number and does not reuse an old one.

Fail examples:
- A row disappears.
- A row survives but `#5` becomes `#942`.
- The next trade reuses an old number.
- The total trade count or P&L freezes after refresh.

Notes:
- This directly re-verifies the b103 escape. Branch gate `m24-order-id-restore-stability.test.mjs` is TOP accepted, but it is still necessary and not sufficient; this script is the deployed-build check.
- The module cache-buster/redeploy must include the corrected `order-manager.js`. If the screen stamp predates that bundle, mark this script `NEEDS NEW BUILD`.

## Money Path Script 2: M23 Rollback Does Not Reactivate Or Double Count Trades

Label: `DEPLOYED BUILD ONLY`

Rows closed on pass:
- Rayan `#1`
- Rayan `#3`
- Rayan `#6b`
- `TAL-01937`
- `TAL-01800`

What to click:
- Open a clean backtest session on the deployed build.
- Capture MEAS-01.
- Place a market trade with SL and TP visible.
- Let replay run until the trade executes and closes, or manually close it after it is clearly open.
- Confirm the trade is in history and write down its ID.
- Roll back to before the trade entry.
- If the app asks for confirmation/cancel, choose the cancel/remove path.
- Press play forward through the same candles again.
- Do not manually place another order.
- Refresh the browser and reopen the same session.

Pass in PO words:
- The old trade does not come back to life.
- The arrows/order lines from that old trade do not stick on the chart.
- P&L does not keep changing for a cancelled historical trade.
- The history row does not duplicate.
- After refresh, the old cancelled path stays cancelled.

Fail examples:
- The original order reappears without the PO placing it again.
- P&L moves for a trade that should no longer exist.
- The old trade duplicates in history.
- Entry/exit arrows remain after rollback cancellation.

## Money Path Script 3: Execution Triggers And Position Accounting

Label: `DEPLOYED BUILD ONLY`

Rows closed on pass:
- `TAL-01933`
- `TAL-01932`
- `TAL-01904`
- `TAL-01905`
- `TAL-01809`
- `TAL-01810`
- `TAL-01796`

What to click:
- Open a clean session and capture MEAS-01.
- Create one BUY with TP close enough to be hit soon; run replay until price touches TP.
- Create a pending entry one tick above current price where the app should classify it as stop/limit, not market.
- Create a SELL limit against a 5-contract long-position scenario if the deployed UI supports the exact quantity setup.
- Watch balance, P&L, and history after each fill/close.
- Refresh and reopen the session after the trades are closed.

Pass in PO words:
- A touched TP closes the trade.
- A pending entry does not silently become a market order.
- The 5-contract close triggers when price reaches the sell limit.
- No order closes instantly on entry unless its SL/TP was actually crossed.
- Balance does not go negative from a normal trade.
- Exit arrows are on the candles where the exits happened.
- Refresh does not change the result.

Fail examples:
- TP is touched and the trade keeps running.
- A one-tick-above entry places immediately as market.
- Sell limit never closes the 5-contract position.
- Trade closes immediately at entry with no valid trigger.
- Balance or P&L changes after refresh.

## Money Path Script 4: Duration And Journal Row Display

Label: `DEPLOYED BUILD ONLY`

Rows closed on pass:
- `TAL-01896`
- Journal-display residuals not covered by M24 identity if duration is the only symptom.

What to click:
- Capture MEAS-01.
- Open a replay session and place one trade that opens and closes during replay.
- Open All Trades / History.
- Record the displayed duration.
- Refresh and reopen the same session.
- Reopen All Trades / History and compare the same row.

Pass in PO words:
- Closed trades show a believable replay duration.
- The same closed trade does not turn into a giant wall-clock duration after refresh.
- Missing close-time rows show a blank/dash instead of a fake huge duration.

Fail examples:
- Duration shows thousands of hours.
- Duration changes across refresh even though the trade did not change.

## Money Path Script 5: Journal Side Effects Are Idempotent

Label: `DEPLOYED BUILD ONLY`

Rows closed on pass:
- `TAL-01927`
- `TAL-01940`

What to click:
- Capture MEAS-01.
- Place one trade and let the auto-screenshot attach to the trade card.
- Press play, then refresh and reopen the same session.
- Open the same trade card.
- Add or edit post-trade variables with two same-option groups visible if the deployed UI supports that configuration.
- Save, close, reopen the same trade card, then refresh and check it again.

Pass in PO words:
- The existing trade card does not take a second screenshot for the same trade after refresh.
- Editing one post-trade variable group does not silently change another same-option group.
- Refresh does not duplicate, drop, or cross-wire the journal-side data.

Fail examples:
- A second screenshot appears for an already-screenshotted trade.
- Two variable groups share one selection when they should be independent.
- Refresh changes post-trade variables without a user edit.

## Data Integrity Script 1: Completed Bar Never Mutates

Label: `DEPLOYED BUILD ONLY`

Rows closed on pass:
- `TAL-01918`
- Completed-bar close mutation portion of `TAL-01922` if same session-boundary evidence is used.

What to click:
- Capture MEAS-01.
- Open a session with replay on a liquid pair/instrument.
- Use a timeframe where candle closes are visible, preferably 1H and then 15m.
- Pause right after a candle closes.
- Write down the closed candle's OHLC, especially close.
- Let several more candles play.
- Do not change symbol.
- Return to the same closed candle and compare the OHLC.

Pass in PO words:
- A candle that is already closed never changes its close, high, low, or open later.
- The chart can move forward, but history behind it stays still.

Fail examples:
- A previous candle's close changes after the next candle opens.
- A closed bar high/low expands later without changing timeframe or symbol.

## Data Integrity Script 2: Cross-Timeframe Price Consistency

Label: `DEPLOYED BUILD ONLY`

Rows closed on pass:
- `TAL-01802`
- `TAL-01886`
- `TAL-01917`
- `TAL-01936`

What to click:
- Capture MEAS-01.
- Pick one symbol and one replay timestamp.
- Pause replay.
- Record current price on 1m.
- Switch to 5m, 15m, and 1H without advancing replay.
- Record current price on each timeframe.
- Toggle the time-alignment setting if present and repeat once.

Pass in PO words:
- The same paused moment shows the same current price across timeframes within normal rounding.
- Switching timeframe changes candle aggregation, not the underlying current price.
- Time alignment setting is honored.

Fail examples:
- 1m and 5m show different current prices for the same paused moment.
- 15m looks identical to 1m when it should aggregate.
- Time alignment setting has no visible effect.

## Data Integrity Script 3: Calendar / Session Boundary And History Range

Label: `DEPLOYED BUILD ONLY`

Rows closed on pass:
- `TAL-01922`
- `TAL-01864`
- `TAL-01925`
- `TAL-01898`

What to click:
- Capture MEAS-01.
- Open a daily/weekly view near a session boundary.
- Verify no future daily candle is painted before its day starts.
- Request a long history range, including the reported 10-year case if available.
- Switch from current weekly candle to a lower timeframe such as 1H.
- Record whether the chart stays near the same analysis area.

Pass in PO words:
- No phantom daily candle appears before the day exists.
- Requested history range loads the expected range, not a shorter pre-range substitute.
- Switching from weekly to 1H keeps the user near the analysis area instead of jumping back in date.

Fail examples:
- A daily candle appears for a day that has not started.
- A 10-year request loads only about 6 years or starts before the requested range.
- Weekly to lower timeframe jumps away from the current analysis area.

## Data Integrity Script 4: Replay Restore / Playhead State

Label: `DEPLOYED BUILD ONLY`

Rows closed on pass:
- `TAL-01929`
- `TAL-01909`
- Data side of session restore before persistence ownership splits.

What to click:
- Capture MEAS-01.
- Open a replay session and advance to a distinctive candle/time.
- Write down symbol, timeframe, visible date/time, and playhead position.
- Exit the session and re-enter it.
- Step forward once at 1x.
- Refresh and reopen again.

Pass in PO words:
- The session reopens at the same point.
- Step-forward moves one expected step, not days.
- Refresh does not send the user back to an older saved point.

Fail examples:
- Session always returns to 2/5 or another stale point.
- Step-forward jumps days.
- Re-entering the session loses the current playhead.

## Data Integrity Script 5: Tick-Path And Stepping Fidelity

Label: `DEPLOYED BUILD ONLY`

Rows closed on pass:
- `TAL-01899`
- `TAL-01900`
- `TAL-01902`
- `TAL-01718`

What to click:
- Capture MEAS-01.
- Open a replay session and switch to tick-by-tick or the smallest available replay interval.
- Step forward candle-by-candle and sub-step-by-sub-step.
- Increase replay speed above 30x, then return to tick-by-tick.
- Let replay cross a weekend or closed-session gap if the selected market has one.

Pass in PO words:
- Tick replay draws the candle in the right order, not wick-before-body.
- Sub-timeframe stepping keeps advancing rather than stopping after a few sub-steps.
- High speed does not permanently degrade tick replay into candle-only mode.
- The replay clock does not run through a closed market while price is frozen as if trading were open.

Fail examples:
- Wick appears before the candle body in tick replay.
- Interval below chart timeframe only advances five sub-steps and stalls.
- Above-30x replay breaks tick mode after returning to normal speed.
- Clock advances through weekend while price does not.

## NEEDS-INFO, Not Scripts

Do not invent click sequences for:
- Rayan `#8`: random sell order self-opened after idle plus skipped ID, no repro sequence.
- `TAL-01941`: recurring slippage/SL miss, but pair/timeframe/click sequence undocumented. Keep instrumentation/repro lane only.
- Old-layout superseded rows unless PO confirms the same symptom on the deployed new build.
- Feature requests unless PO reclassifies them as bugs with steps.

## B Coordination Stop-Line

Do not write new frontend persistence fixes before B answers the backend/session-state question. A backend 500 or preference write/read failure can close the persistence cluster faster than separate frontend patches. Symbol persistence stays with A (`chart.js`), timezone residuals stay with A/M20-A, and pins/favorites need B merge/backend acceptance.

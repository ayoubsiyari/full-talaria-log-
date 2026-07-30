# PO Band 1 - Money Path Checks On b99

Use this now on the live b99 build. Do not wait for B's next build unless a script says `NEEDS NEW BUILD`.

MEAS-01 for every result: before clicking, read the build stamp from the screen and write it next to PASS / FAIL / NOT RUN. If the stamp is not b99, stop and report the stamp.

## Script 1 - Trade Reaches History

Label: AWAITING STAMP — B must confirm served stamp before PO runs.

Closes 2 rows: `TAL-01911`, `TAL-01940`.

What to click:

1. Open a saved backtest session on b99.
2. Read and write the build stamp from the screen.
3. Place one small market or limit trade.
4. Let the trade close, or close it manually if that is the normal PO flow.
5. Open All Trades / history.
6. Refresh the browser and re-enter the same session.
7. Open All Trades / history again.

Pass in PO words: the trade I just closed is still in history after refresh, the count does not drop, and the chart marker matches the history row.

Fail in PO words: I can see the trade on the chart but it is missing from history, the history count drops after refresh, or the newest closed trade disappears.

Decision: PASS closes the two Band 1 trade-ledger unverified rows. FAIL makes the trade-ledger row broken on b99 and blocks canary until a flagged fix lands.

## Script 2 - Order Lines Stay Visible And Literal While Dragging

Label: NEEDS NEW BUILD.

Reason: drag-family fixes touching this script landed after the b99 16:12 cut. Do not use b99 for a pass result on this script.

Closes 11 rows: `TAL-01696`, `TAL-01698`, `TAL-01617`, `TAL-01653`, `TAL-01692`, `TAL-01658`, `TAL-01691`, `TAL-01805`, `TAL-01795`, `TAL-01789`, `TAL-01791`.

What to click:

1. Open a backtest session on b99 and read/write the build stamp from the screen.
2. Open the order panel and prepare a draft with entry, SL, and at least two TP rows.
3. Drag the entry line slowly up and down.
4. Drag the SL line slowly, watching the risk/reward and quantity fields while the mouse is still down.
5. Drag TP1 and TP2; put them close together, then pan or zoom and try to grab each one separately.
6. Release each drag and compare the line position, panel field, and label.

Pass in PO words: all order lines stay visible, each line can be grabbed by itself, the numbers move with the line while I drag, and after release the panel values match the chart.

Fail in PO words: a line vanishes, a line cannot be grabbed by itself, the panel waits until release to update, or the chart and panel disagree after the drag.

Decision: PASS closes the order-line/drag visibility and live-value rows above. FAIL makes the visible order-drag family broken on b99 and routes to an immediate flagged fix.

## Script 3 - Cancel Or Clear Does Not Bring Back Old Order State

Label: NEEDS NEW BUILD.

b99 result: FAIL. Retest only after the pending-protection mirror clear fix is in the build.

Closes 4 rows: `TAL-01756`, `TAL-01780`, `TAL-01781`, `TAL-01760`.

What to click:

1. Stay on b99 and write the same build stamp for this result.
2. Start a new order draft with entry, SL, and TP.
3. Drag SL or TP, then press Escape before placing.
4. Clear the visible SL/TP fields if the UI allows it.
5. Start a fresh order draft.
6. Place and cancel a small pending order.

Pass in PO words: cancel and clear really clear the draft; no old SL, TP, entry, marker, or hidden level comes back in the next order.

Fail in PO words: after Escape, clear, or cancel, an old line/value/marker returns in the next order, or a canceled pending order leaves stale chart state behind.

Decision: PASS closes the Band 1 stale-order-state rows above. FAIL makes stale hidden order state broken on b99 and blocks canary until a flagged fix lands.

## Script 4 - Trade Marker Stays On The Right Candle Across Timeframes

Label: AWAITING STAMP — B must confirm served stamp before PO runs.

Closes 1 row: `TAL-01796`.

What to click:

1. On b99, read/write the build stamp from the screen.
2. Place a small trade on `1m` replay.
3. Note the candle/time where the trade marker appears.
4. Switch to a higher timeframe, pan around the same area, then return to `1m`.
5. Compare the marker to the original candle/time.

Pass in PO words: the trade marker stays attached to the same trade and the same candle/time; it does not drift, duplicate, or disappear after timeframe changes.

Fail in PO words: the marker moves to a different candle, duplicates, disappears, or no longer matches the trade row.

Decision: PASS closes the Band 1 trade-marker projection row. FAIL makes trade-marker projection broken on b99.

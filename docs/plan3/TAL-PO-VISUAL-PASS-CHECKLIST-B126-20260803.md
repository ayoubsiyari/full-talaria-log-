# TAL PO Visual Pass Checklist — b126

Timestamp: 2026-08-03 22:59+01:00  
Surface: `20260803b126` visual pass before seal  
Purpose: give the PO direct pass/fail rows for TAL-01696, TAL-01698, TAL-01865, Rayan #8, and the refresh-persistence directive.

Mark each row `PASS` or `FAIL` from the served b126 UI. This checklist is visual evidence; it does not replace the queued served mutant suite or money-path gates.
Rows 1–18 are **Seal Gate 3**. Rows 19–24 are **Beyond Gate** and must not extend the PO's committed visual-pass window.

## Seal Gate 3 — Rows 1–18

1. TAL-01696 fixed box size across order types — STOP, MARKET, and LIMIT info boxes keep the same width and height while their displayed values change.
2. TAL-01696 values update without moving the box — price, size, and money text updates live during drag, and the surrounding info box does not jump or shift.
3. TAL-01696 hover buttons hidden during drag — edit/delete/level control buttons disappear while a line is being dragged and do not blink back in until drag ends.
4. TAL-01696 drag tracks cursor 1:1 — SL, TP, and pending-entry lines stay under the pointer during drag; the line does not lag behind or move at a different scale.
5. TAL-01696 units present and consistently bracketed — order labels show the size unit, and money/size detail uses the same bracket style everywhere, for example `(1 Lots)`.
6. TAL-01696 one box on activation — activating an order line shows exactly one info box for that line, not a duplicate stacked or offset second box.
7. TAL-01696 matching fonts vertically aligned — tag text, value text, and control glyphs use matching font size/family and sit on the same visual baseline.
8. TAL-01698 multi-TP average updates live — while dragging an individual TP, the average TP line moves immediately with the drag preview before mouse release.
9. TAL-01865 four-FX label parity — PASS if, on 1m for `EURUSD`, `GBPUSD`, `AUDUSD`, and `USDJPY`, the crosshair label and a line-tool label placed on the same candle show the same date and clock; FAIL if any pair shows a different date or clock between the two labels.
10. TAL-01865 selected timezone drives candles — PASS if changing the chart timezone changes the displayed candle clock to that timezone, including non-UTC zones; FAIL if labels stay on UTC, browser local time, or a fixed offset after the timezone changes.
11. TAL-01865 refresh restores visible symbol — PASS if switching to a non-`EURUSD` pair such as `USDJPY`, refreshing, and reopening returns to that visible pair; FAIL if refresh returns to `EURUSD` or the session's first pair instead.
12. TAL-01865 refresh restores replay position — PASS if advancing replay, refreshing, and reopening returns to the reached candle/playhead; FAIL if replay restarts at the session start or an earlier candle.
13. Rayan #8 trading picker refuses a supporting pair — PASS if a pair already chosen as supporting cannot also be selected as a trading symbol; FAIL if the UI allows the overlap.
14. Rayan #8 supporting picker refuses a trading pair — PASS if a pair already chosen for trading cannot also be selected as supporting context; FAIL if the UI allows the overlap.
15. Rayan #8 supporting symbols are gold — PASS if supporting symbols render in gold in the symbol dropdown; FAIL if they look the same as tradable symbols.
16. Rayan #8 supporting symbols refuse orders — PASS if trying to place an order on a supporting symbol is blocked and the order panel says the symbol is analysis-only; FAIL if an order can be placed or the panel gives no explanatory message.
17. Rayan #8 Compare remains available — PASS if the Compare button remains visible and usable when the session contains supporting symbols; FAIL if supporting symbols remove or disable Compare.
18. TAL-01865 drawings persist by market time — PASS if a trendline and a horizontal level on two panels survive refresh at the same prices and market times, not merely at the same bar indices; FAIL if they move to different candles, return index-anchored, or disappear.

## Beyond Gate — Rows 19–24

19. Refresh persistence restores indicators and settings — after refresh, indicators return with their last selected settings.
20. Refresh persistence restores pinned items — after refresh, pinned items return in the same visible state.
21. Money-path refresh survival restores open positions — after refresh, open positions remain present with the same values.
22. Money-path refresh survival restores pending orders — after refresh, pending orders remain present with the same values.
23. Money-path refresh survival restores journal — after refresh, journal rows remain present and unchanged.
24. Money-path refresh survival restores balance — after refresh, account balance remains intact.

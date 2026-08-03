# TAL PO Visual Pass Checklist — b126

Timestamp: 2026-08-03 19:16+01:00  
Surface: `20260803b126` visual pass before seal  
Purpose: give the PO direct pass/fail rows for TAL-01696, TAL-01698, TAL-01865, Rayan #8, and the refresh-persistence directive.

Mark each row `PASS` or `FAIL` from the served b126 UI. This checklist is visual evidence; it does not replace the queued served mutant suite or money-path gates.

1. TAL-01696 fixed box size across order types — STOP, MARKET, and LIMIT info boxes keep the same width and height while their displayed values change.
2. TAL-01696 values update without moving the box — price, size, and money text updates live during drag, and the surrounding info box does not jump or shift.
3. TAL-01696 hover buttons hidden during drag — edit/delete/level control buttons disappear while a line is being dragged and do not blink back in until drag ends.
4. TAL-01696 drag tracks cursor 1:1 — SL, TP, and pending-entry lines stay under the pointer during drag; the line does not lag behind or move at a different scale.
5. TAL-01696 units present and consistently bracketed — order labels show the size unit, and money/size detail uses the same bracket style everywhere, for example `(1 Lots)`.
6. TAL-01696 one box on activation — activating an order line shows exactly one info box for that line, not a duplicate stacked or offset second box.
7. TAL-01696 matching fonts vertically aligned — tag text, value text, and control glyphs use matching font size/family and sit on the same visual baseline.
8. TAL-01698 multi-TP average updates live — while dragging an individual TP, the average TP line moves immediately with the drag preview before mouse release.
9. TAL-01865 crosshair and line-tool labels agree — on 1m, for all four symbols, the crosshair label and the line-tool label identify the same candle.
10. TAL-01865 selected timezone controls displayed candles — changing the timezone changes displayed candle labels to that timezone, not to the browser default or UTC by accident.
11. TAL-01865 refresh returns to the visible symbol — after refresh, the chart opens on the symbol that was on screen before refresh, not EURUSD unless EURUSD was the visible symbol.
12. TAL-01865 refresh returns to the reached replay position — after refresh, replay resumes at the position reached before refresh, not at the session start.
13. Rayan #8 session creation prevents duplicate roles — the same pair cannot be selected as both a trading symbol and a supporting symbol in one session.
14. Rayan #8 supporting symbols are gold — supporting symbols appear in gold in the symbol dropdown.
15. Rayan #8 supporting symbols refuse orders — attempting to place an order on a supporting symbol is blocked, and the order panel explains that the symbol is analysis-only.
16. Rayan #8 Compare remains available — the Compare button is still visible and usable when the session includes supporting symbols.
17. Refresh persistence restores symbols — after refresh, the same symbol set returns.
18. Refresh persistence restores timeframes — after refresh, each panel returns to its pre-refresh timeframe.
19. Refresh persistence restores indicators and settings — after refresh, indicators return with their last selected settings.
20. Refresh persistence restores drawings by market time — after refresh, drawings reappear at the same prices and market times, not merely at the same bar indices.
21. Refresh persistence restores pinned items — after refresh, pinned items return in the same visible state.
22. Money-path refresh survival restores open positions — after refresh, open positions remain present with the same values.
23. Money-path refresh survival restores pending orders — after refresh, pending orders remain present with the same values.
24. Money-path refresh survival restores journal — after refresh, journal rows remain present and unchanged.
25. Money-path refresh survival restores balance — after refresh, account balance remains intact.

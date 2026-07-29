# PO Check-3 Drag-Family Verification

Goal: verify the five order-drag symptoms by eye on the next build in about ten minutes.

Use one liquid replay symbol and one normal chart tab. Start each check from a fresh order draft unless the steps say otherwise.

## 1. New Order Does Not Remember Old SL/TP Drag State

1. Place an order with both SL and TP.
2. Let it fill, then close it.
3. Click **Make new order** in the same chart area.
4. Confirm the SL/TP fields are empty.
5. Turn SL on and drag the SL line into position.

Pass condition: the SL starts from the new visible draft, not the previous order's SL. It can be dragged closer or farther; it does not snap back to the old stop or only allow a larger distance.

## 2. SL/TP Values Update While Dragging

1. Open a new order draft with Entry, SL, and TP visible.
2. Drag TP up/down without releasing the mouse.
3. While still dragging, watch the panel P&L and R:R values.
4. Repeat with SL.

Pass condition: the panel numbers move live with the line. They do not stay zero or stale until mouseup.

## 3. Fixed-Risk Quantity Follows SL Live And Cancels Cleanly

1. Set position sizing to fixed-dollar risk or percent-risk.
2. Add an SL and note the quantity.
3. Drag the SL closer to Entry without releasing.
4. Press **Escape** before releasing, then repeat and release normally.

Pass condition: quantity updates while the SL is moving. Escape returns the quantity to the committed SL distance; releasing commits the new quantity. No stale size remains after cancel.

## 4. Place Cannot Submit A Half-Dragged Draft

1. Open a new order draft with SL enabled and fixed-risk sizing.
2. Start dragging the SL and keep the mouse held down.
3. While still dragging, try to press Place/confirm using the visible order controls.
4. Release or cancel the drag, then place normally.

Pass condition: the order cannot be submitted while the SL/TP drag is in progress. After release or cancel, Place works using the final visible levels and quantity.

## 5. Stacked TP1/TP2 Can Be Separated

1. Enable multiple take profits.
2. Set TP1 and TP2 to the same price so their boxes/lines stack.
3. Try to grab and move TP2 independently from TP1.
4. Pan or zoom the chart, then try again.

Pass condition: TP1 and TP2 are individually grabbable even when stacked at the same price. Moving one does not drag both together, and the separation survives pan/zoom.

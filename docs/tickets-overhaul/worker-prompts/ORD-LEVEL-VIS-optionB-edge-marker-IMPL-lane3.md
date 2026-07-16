# Lane 3 — IMPLEMENT (freeze-safe): Option B off-screen order-level edge marker

## Context
Diagnostic `ORD-LEVEL-VIS-diagnostic-report.md` confirmed: chart `calculateScales()` Y-domain (chart.js ~24020–24145) uses visible OHLC + last price only and excludes order/pending entry prices. `drawPendingOrderLine`/`drawOrderLine` DO create the line elements, but `_applyOrderRowMainPlotVisibility` (~39255) sets `display:none` when `yScale(entryPrice)` is outside the plot, and `drawYAxisPriceHighlight` (~24272) bails off-plot. Net: no visible indication of an order until price reaches it.

Manager ruling: implement **Option B (edge marker)** now — it is freeze-safe (order-manager.js only, own kill-switch). Option A (expand chart.js Y-domain) is escalated separately (ESC-022) and is NOT in this task.

## Constraints (freeze-safe)
- **Edit `order-manager.js` ONLY.** Do NOT edit `chart.js`, `replay-system.js`, or re-migration engine files.
- All new behavior behind a kill-switch: **`__TALARIA_DISABLE_ORDER_OFFSCREEN_MARKER_V1`** (default ON = marker shown; switch present disables → reverts to today's behavior).
- I15: prove with honest actuation on the real built product — place a real pending order off-screen, assert the marker exists in-plot; flip the switch → assert it does not.
- One-phase-per-commit; file-scoped commit (order-manager.js + build artifacts only).

## What to build
When an order/pending level's `yScale(price)` is outside the main plot area (the condition already detected in `_applyOrderRowMainPlotVisibility` ~39255):
1. Instead of only hiding the line, render a compact **edge marker** clamped to the near plot edge (top if level is above visible domain, bottom if below):
   - Small directional arrow (▲ if above, ▼ if below) in the order's color (BUY `#2962ff` / SELL `#f23645`).
   - The order price label (reuse existing `formatPrice`) and order type/direction tag, compact.
   - Positioned at the axis edge, not overlapping the last-price highlight.
2. Keep it live: reposition on pan/zoom/replay tick (hook the same update path as `updateOrderLines` ~39388, do not add a new rAF loop if the existing reposition pass already fires).
3. When the level re-enters the visible domain, hide the marker and show the normal full-width line (existing path) — no duplicate.
4. Applies to **both pending orders and open positions** (same off-plot condition), and must work in **panel B** (per-iframe chart) identically.
5. Clicking the marker (optional, low-risk): scroll/recenter is NOT in scope — keep marker `pointer-events:none` to avoid drag conflicts unless trivial.

## Kill-switch behavior
- Switch absent/false (default): edge marker shown when level off-plot.
- Switch true: skip marker entirely → identical to today (line `display:none` off-plot). Must be a clean A/B revert.

## Harness (honest RED → GREEN)
Add/prove scenarios (coordinate ids with Lane 4 — proposed):
- `RC5-ORD-LEVEL-VIS-1`: place pending far ABOVE current price → assert an edge marker element exists within plot bounds carrying the order price; switch ON → assert none.
- `RC5-ORD-LEVEL-VIS-2`: off-screen SL/TP level → marker present.
- `RC5-ORD-LEVEL-VIS-3`: panel B, off-screen pending → marker present in that iframe chart.
Each must fail with the switch flipped (non-vacuous A/B).

## Deliverable report
`docs/tickets-overhaul/worker-reports/ORD-LEVEL-VIS-optionB-edge-marker-IMPL-report.md`:
- Exact hunks (file:line), switch name, build id bump.
- A/B proof output (marker present ON / absent OFF), all 3 REDs green ON + fail OFF.
- Confirmation no chart.js/replay edits; commit hash (file-scoped).
- NEEDS-LIVE flag for PO confirm (place off-screen pending → see marker at edge).

Do NOT touch Option A. STOP after report + file-scoped commit.

# Order Panel UI/UX Redesign

Redesign the right-side Order Panel in `talaria-v8b.jsx` to be more compact, user-friendly, and visually aligned with the Talaria design system. The current panel has all the correct functionality — do NOT change any logic or features. Only restructure the layout, spacing, and visual hierarchy.

Reference the attached screenshots of the current panel for the exact feature set. Reference `DESIGN_SYSTEM.md` for all color tokens, typography, and component patterns.

---

## Design Constraints

- **Fixed width**: 280px (matching the current panel slot)
- **NO scrolling**: Everything must fit in the visible viewport height (~600-700px usable). The user should never need to scroll to reach the execute button.
- **Single-file**: All changes stay within `talaria-v8b.jsx`

---

## Panel Structure (top to bottom, compact)

### 1. Header Row (24px height max)
- Left: Talaria logo icon + "Place Order" label (11px, weight 700)
- Right: Symbol badge (e.g., "NQ") in blue accent + "Futures" tag in muted text + close (×) button
- Single row, no wasted vertical space

### 2. Template Preset (22px height)
- Compact single row: dropdown select (flex:1) + Load / Save / Del as small icon buttons (not text buttons) to save horizontal space
- Use the well background + inset shadow pattern for the select

### 3. BUY / SELL Toggle + Order Type (combined into one block, 44px total)
- **Row 1**: BUY (green dim bg when active) | SELL (red dim bg when active) — full width, 50/50 split, bold text
- **Row 2**: Market | Limit | Stop as text tabs with gradient-fade underline active state (same as timeframes)
- No extra padding between these two rows — they form one visual unit

### 4. Size Input (22px height)
- Single compact row: mode buttons ($, %, #) as 18px square toggles + input well (flex:1) showing the value + minus/plus buttons
- The percentage display "1.00%" sits right-aligned inside the input well as secondary text

### 5. ENTRY Section (collapsed ~70px, expanded ~120px)
- **Header row**: "ENTRY" label left + "SINGLE" badge (blue accent) right + "STOP LOSS" toggle (red dot + checkbox) far right + large price display
- **Scale-in rows**: Each row is ONE compact line: quantity input (narrow) + minus/plus + risk $ input (narrow) + minus/plus + delete (×) button. Use 18px row height.
- Show percentage and lot size inline after each row as muted micro text, NOT on a separate line
- **Summary row**: "Avg 24734.61" left + "Qty 0.00 Contracts" right — single line, muted text
- **Dist / Qty**: "Dist 69.44 pts · Qty 0 Contracts" as a single muted info line
- "Equal" button only shows when 2+ scale-in rows exist, right-aligned, small

### 6. PROFIT TARGET Section (collapsed ~50px, expanded ~90px)
- **Header row**: green dot + "PROFIT TARGET" label + blue checkbox + "SINGLE" badge — same pattern as Entry
- **Target rows**: Each row is one compact line: price input + R:R value (muted) + profit value (green) + delete (×)
- Use 18px row height per target row
- **Blended summary**: "0.0R → +$0.00" right-aligned, single line
- **SL/TP visual bar**: The red (SL) and green (TP) ratio bar — keep it at 3px height, full width. This is a nice visual, keep it compact.

### 7. Advanced Order Section (collapsible, 0px when closed, ~60px when open)
- **Toggle row**: Gold toggle switch + "Advanced order" label — single line, 22px
- When open, show TABS (not both sections): "Move to Breakeven" | "Trailing Stop Loss" — tab style with gradient underline
- **Breakeven tab content**: Single compact row: "After [input] R → entry + [input] pts" — all inline, one row
- **Trailing SL tab content**: 
  - Unit selector: R | Pips | $ as small toggle buttons
  - Params row: "After [input] R trail [input] every [input] R" — all inline
  - Limit row (optional): "Limit [input]" with description text as tooltip on hover, NOT displayed permanently
  - Activation info shown as 1 line of muted micro text (7px)

### 8. Risk Summary (fixed, always visible, 36px)
- Three items in a single row spread evenly:
  - "Reward" with green link icon
  - "Risk $100.00" in red
  - "Margin —" in muted
- Use flex with justify-content: space-between, font size 8.5px

### 9. Execute Button (fixed at bottom, 36px + 6px padding)
- Full width, chamfered clipPath corners (existing pattern)
- Green gradient for BUY, red gradient for SELL
- Text: "Buy 0 Contracts · Set Position Size" (12px, weight 800, white)
- Subtle glow shadow matching the buy/sell color

---

## Spacing Rules

- **Between major sections**: 1px border separator (using `c.br` color), NO extra padding gaps
- **Within sections**: 2px gap between rows
- **Section labels**: 8px font, weight 800, uppercase, muted color — always on the same line as controls when possible
- **Input wells**: 18-20px height, `c.well` background, `inset 0 1px 2px rgba(0,0,0,0.2)` shadow
- **All mini inputs**: Right-aligned values, tabular-nums, weight 700

## Visual Style Rules

- Follow the established Talaria design tokens from `DESIGN_SYSTEM.md`:
  - `c.well` for input backgrounds
  - `c.br` for borders
  - `c.acL` / `c.acD` / `c.acB` for active/selected states
  - `c.gn` / `c.gnD` for buy/profit elements
  - `c.rd` / `c.rdD` for sell/loss elements
  - `c.gold` for the advanced toggle
  - `c.tm` for labels, `c.ts` for secondary values, `c.tx` for primary values
- Diamond checkbox pattern (11×11, rotated 45°) for checkboxes
- Gradient-fade underline for active tabs
- No rounded corners on inputs/buttons (angular feel)
- All buttons use the `B` component or match its style

## Interaction States

- BUY/SELL: active gets colored dim background + gradient underline, inactive is transparent
- Order type tabs: active gets blue gradient underline, inactive is muted text
- Scale-in delete (×): red on hover, muted by default
- Toggle switches: use the existing `Toggle` component (28×14px)
- Advanced tabs: blue gradient underline when active, muted when inactive
- Execute button: slight hover lift (translateY -1px) + brighter gradient + deeper shadow

---

## What NOT to Change

- Do not change any state variables or their logic
- Do not change the order panel slide animation (wrapper approach)
- Do not remove any features — every input, button, toggle, and display in the current panel must remain
- Keep the `orderPanelOpen` conditional and the 280px wrapper approach
- Keep the execute button's chamfered clipPath

Apply all changes in a single pass. The goal is a panel that shows EVERYTHING without scrolling, feels like a precision instrument, and follows the established design language exactly.

# Talaria Design System Reference

## Brand Identity
- **Product**: Talaria — Arabic-native backtesting & replay trading platform
- **Target**: MENA market, Arabic-speaking discretionary futures traders
- **Aesthetic**: "Precision Instrument" — inspired by aerospace control panels, high-end audio equipment

## Color Palette

### Primary Accent (Blue Gradient)
- `ac: "#2643F7"` — primary blue
- `acL: "#4A6AFF"` — light blue (gradients, active text)
- `acD: "rgba(38,67,247,0.08)"` — blue dim (active backgrounds)
- `acB: "rgba(38,67,247,0.22)"` — blue border (active borders)
- `acG: "rgba(38,67,247,0.12)"` — blue glow (box-shadows)

### Brand Gold (secondary, used sparingly)
- `gold: "#C9A84C"` — gold accent (profit target dot, advanced order toggle)
- `goldD: "rgba(201,168,76,0.07)"` — gold dim

### Surfaces (Blue-tinted near-black)
- `bg: "#07080E"` — main chart background
- `sf: "#0A0C14"` — surface (panels, bars, rails)
- `el: "#0F1119"` — elevated (tooltips, popups)
- `well: "#060710"` — recessed wells (inputs, inset panels)

### Borders
- `br: "rgba(140,160,255,0.05)"` — default border
- `brL: "rgba(140,160,255,0.08)"` — light border (hover)
- `brH: "rgba(140,160,255,0.12)"` — highlight border (active popups)

### Text
- `tx: "rgba(255,255,255,0.88)"` — primary text
- `ts: "rgba(255,255,255,0.40)"` — secondary text
- `tm: "rgba(255,255,255,0.18)"` — muted text (labels, hints)

### Semantic
- `gn: "#00D4A1"` — green (buy, long, profit, positive)
- `gnD: "rgba(0,212,161,0.07)"` — green dim
- `gnB: "rgba(0,212,161,0.18)"` — green border
- `rd: "#FF5068"` — red (sell, short, loss, stop loss, negative)
- `rdD: "rgba(255,80,104,0.07)"` — red dim
- `rdB: "rgba(255,80,104,0.18)"` — red border

### Chart
- `axTx: "rgba(255,255,255,0.25)"` — axis text
- `grid: "rgba(140,160,255,0.025)"` — grid lines

## Typography
- **Font**: `'DM Sans', sans-serif` — used everywhere, no exceptions
- **Weights**: 500 (body), 600 (secondary labels), 700 (primary labels, values), 800 (section headers, buttons)
- **Numeric**: `fontVariantNumeric: "tabular-nums"` on all price/number displays

### Size Scale
- 7px: micro labels (sub-headers like "DRAWING PROPERTIES", badges)
- 8px: table headers, muted info, status text
- 8.5px: secondary info, timestamps
- 9px: axis labels, small inputs
- 9.5px: tool labels, OHLC values, replay speed
- 10px: tab labels, timeframes, table body, order panel text
- 10.5px: dropdown items
- 11px: section labels, dialog body text, OHLC overlay ticker
- 12px: panel headers ("Place Order"), instrument name
- 13-14px: dialog title, entry price display

## Component Patterns

### Active State: Gradient-Fade Underline
Used consistently across: timeframes, chart type toggle, tool buttons, dialog tabs, order type tabs, buy/sell toggle, positions tabs.
```
position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2,
background: `linear-gradient(90deg, transparent, ${acL}, transparent)`,
boxShadow: `0 0 6px ${acG}`
```

### Hover State: Faint White Underline
```
position: "absolute", bottom: 0, left: "25%", right: "25%", height: 1,
background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)`
```

### Panel Button (PB / B component)
Shared button style for all non-tab buttons:
- **Default**: `background: well`, `border: 1px solid br`, `inset shadow`
- **Primary**: `background: linear-gradient(135deg, ac, acL)`, white text, blue glow shadow
- **Small variant**: reduced padding and font size

### Styled Select (Sel component)
Custom-styled native select matching panel style:
- `background: well`, `border: 1px solid br`, custom SVG dropdown arrow, inset shadow

### Toggle Switch
- 28×14px, rounded, well background when off, colored glow when on
- 10px circular thumb with transition

### Diamond Checkbox (Dialog)
- 11×11px, rotated 45°, blue gradient fill when checked, blue glow
- Check icon counter-rotated inside

### Mini Input (MiniIn)
- Well background, inset shadow, optional prefix label, right-aligned value
- Used in scale-in rows, advanced order params

## Layout Structure

### Top Bar — 36px
Logo (T) | Instrument | Tick/Candle toggle | Indicators btn | Timeframes | [flex] | Objects Tree | News | Fullscreen

### Left Tool Rail — 36px
Drawing tools with gradient-fade underline active state, right-pointing chevron for dropdown tools, separator gradients between groups

### Chart Area
- OHLC overlay: top-left, with rollback indicator (green circular arrow = on, red = locked)
- Price Y-axis: right, 65px
- Time X-axis: bottom, 18px
- Grid lines from both axes

### Replay Bar — 28px (centered controls)
Timestamp(left) | Config btn | Play/Pause | Skip/Step back | Speed Nx + slider | Step/Skip fwd | Goto btn

### Positions Panel — 110px
Tabbed: Positions / Open Orders / History

### Right Order Panel — 280px
Header → Spread → Template → BUY/SELL + Order Type → Sizing → Entry (scale-in) → Profit Target → SL/TP bars → Advanced (tabbed: Breakeven OR Trailing SL) → Reward/Risk/Margin → Execute button

### Bottom — 14px (empty strip)

## Overlay Rendering Pattern
All popups/dropdowns/dialogs are rendered at ROOT level with `position: fixed` and `zIndex: 9000+`. This avoids event bubbling issues. Each overlay has `onClick: stopPropagation`. Clicking the chart area closes tool dropdowns.

## Dropdown Flyout Design
- Blue gradient top bar (2px)
- Active item has blue dim background + diamond indicator dot
- Items: icon + label, 10.5px font
- Positioned using `getBoundingClientRect()` from trigger button

## Key Design Decisions
1. NO rounded corners on tool buttons (sharp/angular feel)
2. Blue gradient for ALL active states (not gold — gold is secondary accent only)
3. Gradient-fade underlines instead of solid bars or background fills
4. Recessed "well" background for inputs and inset panels
5. Chamfered clipPath on execute button and logo
6. DM Sans everywhere — no font mixing
7. Advanced order uses TABS (either/or) not dual toggles
8. Rollback indicator lives in OHLC overlay, not in a toolbar
9. Replay config replaces "Auto" text with icon button + popup

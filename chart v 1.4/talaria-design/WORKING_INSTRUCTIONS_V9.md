# Talaria Chart UI — Working Instructions

## Current State
The main component is `talaria-v8b.jsx` — a single-file React component containing the full charting tool UI mockup. It renders at 100% viewport size.

## How to Request Changes Efficiently

### Reference by Section
Use these section names:
- **TOP BAR** — logo, instrument, tick/candle, indicators, timeframes, utility buttons
- **LEFT RAIL** — tool buttons (crosshair, trendline, hline, channel, fib, shapes, text, brush, patterns, measure, eye, palette, magnet, lock, trash, undo, redo)
- **CHART AREA** — grid, price line, SL line, OHLC overlay, rollback indicator
- **PRICE AXIS** — right Y-axis labels
- **TIME AXIS** — bottom X-axis labels
- **REPLAY BAR** — config, play/pause, skip/step, speed, goto
- **POSITIONS** — tabs, table
- **ORDER PANEL** — header, spread, template, buy/sell, order type, sizing, entry, scale-in, profit target, SL/TP bars, advanced order, risk/reward, execute button
- **DROPDOWN** — tool flyout menu
- **DIALOG** — trend line settings window
- **LOGO MENU** — settings/profile dropdown
- **REPLAY CONFIG** — mode + timeframe popup
- **GOTO** — date/time popup

### Be Specific
Good: "In ENTRY section, change price font size from 14 to 16"
Good: "In DROPDOWN, add a 'Ray' option between 'Trend Line' and 'Horizontal Ray'"
Good: "Change `well` color from `#060710` to `#070812`"

Less efficient: "Make the entry price bigger" (I have to find it and guess the size)

### Batch Changes
List multiple changes in one message:
```
1. TOP BAR: move indicators button after timeframes
2. LEFT RAIL: add a ruler icon between measure and eye
3. ORDER PANEL: change execute button border radius to 6px
4. DIALOG: reduce checkbox gap from 7px to 5px
5. Colors: change `gn` from `#00D4A1` to `#00C896`
```

### For New Features
Describe:
- Where it goes (which section)
- What it does
- How it should look (reference existing components if possible)
- Any interactions

## File Structure
- `talaria-v8b.jsx` — THE component (single source of truth)
- `DESIGN_SYSTEM.md` — color tokens, typography, component patterns
- `WORKING_INSTRUCTIONS.md` — this file

## Technical Notes
- Single-file React component, no external dependencies except React
- All SVG icons inline (no icon library)
- All overlays rendered at root level with `position: fixed`
- Event propagation handled via `stopPropagation` on overlay containers
- State managed with `useState` hooks at component top level

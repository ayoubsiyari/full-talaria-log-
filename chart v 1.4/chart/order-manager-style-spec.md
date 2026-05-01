# Order Manager UI — TradingView-Style Redesign Spec

## Overview

Redesign the three order states rendered by `order-manager.js` to match TradingView's clean, compact, professional chart overlay style. The current UI has inconsistent spacing, misaligned elements, and an unprofessional appearance. This spec defines the exact layout, sizing, colors, typography, and alignment rules for all three states.

---

## Three Order States to Redesign

1. **Preview Orders** — shown before confirmation (Image 1)
2. **Pending Orders** — limit order waiting to fill (Image 2, LIMIT BUY)
3. **Executed / Active Orders** — filled positions (Image 2, `buy 0.26`)

---

## Design System — CSS Variables

Define these at the top of your stylesheet or inside the component:

```css
:root {
  /* Backgrounds */
  --tv-bg-dark: #131722;
  --tv-bg-panel: #1e222d;
  --tv-bg-label: #2a2e39;
  --tv-bg-label-hover: #363a45;

  /* Brand colors */
  --tv-buy: #2962ff;
  --tv-buy-light: #1565c0;
  --tv-sell: #f23645;
  --tv-green: #089981;
  --tv-green-light: #0ecb81;
  --tv-red: #f23645;
  --tv-orange: #f5a623;
  --tv-yellow-border: #f5a623;

  /* Text */
  --tv-text-primary: #d1d4dc;
  --tv-text-secondary: #787b86;
  --tv-text-white: #ffffff;
  --tv-text-profit: #089981;
  --tv-text-loss: #f23645;

  /* Lines */
  --tv-line-buy: #2962ff;
  --tv-line-tp: #089981;
  --tv-line-sl: #f23645;
  --tv-line-avg: #f5a623;

  /* Sizing */
  --tv-label-height: 22px;
  --tv-label-radius: 3px;
  --tv-font: 'Trebuchet MS', 'Roboto Condensed', sans-serif;
  --tv-font-size: 11px;
  --tv-font-size-price: 12px;
}
```

---

## Typography Rules

| Element | Font Size | Font Weight | Color |
|---|---|---|---|
| Order type label (BUY/SL/TP) | 11px | 700 | `#ffffff` |
| Lot size / quantity | 11px | 400 | `#d1d4dc` |
| P&L value | 11px | 600 | green or red |
| Price tag (right side) | 12px | 600 | `#ffffff` |
| Avg Entry / Avg TP label | 11px | 500 | `#f5a623` |

Use `font-family: var(--tv-font)`. No italic. No text shadows. Letter-spacing: `0`.

---

## Layout & Alignment Rules

### Golden Rule
**All label elements on a single order line must be vertically centered on the same baseline as the horizontal line.** The line runs across the full chart width. Labels sit on top of the line, not above or below it.

### Label Placement
- Left-side label (e.g. `BUY`, `SL`, `TP1`) starts at a fixed left offset (e.g. `left: 120px`)
- All subsequent elements (lot display, P&L chip, action buttons) flow left-to-right with `4px` gap between each
- Right-side price box is absolutely positioned at `right: 0`, vertically centered on the line

### Horizontal Line
- Full-width, 1px solid stroke
- Color matches order type (buy = blue, TP = green, SL = red, Avg = orange dashed)
- `opacity: 0.85`

---

## Component Specs

### 1. Order Type Label (leftmost pill)

```
┌──────────────┐
│  MARKET BUY  │   height: 22px, padding: 0 8px, border-radius: 3px
└──────────────┘
```

- **Market Buy**: `background: #2962ff`, white text
- **Limit Buy**: `background: #2962ff`, white text (same)  
- **SL**: `background: #f23645`, white text
- **TP1 / TP2**: `background: #089981`, white text
- **Avg Entry**: `background: transparent`, `border: 1px solid #f5a623`, text `#f5a623`
- **Avg TP**: `background: transparent`, `border: 1px solid #f5a623`, text `#f5a623`

---

### 2. Lot Size Display (next to label)

```
┌───────┐
│  0.44 │   height: 22px, padding: 0 6px, border-radius: 3px
└───────┘
```

- `background: #1e222d`
- `border: 1px solid #363a45`
- `color: #d1d4dc`
- Display format: plain number, e.g. `0.44`, `0.26`

---

### 3. P&L Chip (profit/loss indicator)

```
┌──────────────────┐
│  +$48.21 (0.35)  │   height: 22px, padding: 0 7px, border-radius: 3px
└──────────────────┘
```

- Positive P&L: `background: rgba(8,153,129,0.15)`, `border: 1px solid #089981`, text `#089981`
- Negative P&L: `background: rgba(242,54,69,0.15)`, `border: 1px solid #f23645`, text `#f23645`
- Zero / neutral: `background: #1e222d`, `border: 1px solid #363a45`, text `#d1d4dc`
- Show `+$0.00` for just-filled orders until price moves

---

### 4. Action Buttons

Three icon buttons: **Decrease (−)**, **Increase (+)**, **Close (×)**

```
( − )  ( + )  ( × )
```

- Size: `18px × 18px`, `border-radius: 50%`
- Gap between buttons: `3px`
- **−** button: `border: 1px solid #f23645`, icon color `#f23645`, `background: transparent`
- **+** button: `border: 1px solid #089981`, icon color `#089981`, `background: transparent`
- **×** button: `border: 1px solid #787b86`, icon color `#787b86`, `background: transparent`
- On hover: fill background with button's border color at `0.15` opacity

---

### 5. Price Box (rightmost, on chart edge)

```
┌──────────┐
│ 127.060  │   height: 22px, min-width: 64px, padding: 0 6px, border-radius: 3px
└──────────┘
```

- **Buy / Limit Buy**: `background: #2962ff`
- **TP1 / TP2**: `background: #089981`
- **SL**: `background: #f23645`
- **Avg Entry / Avg TP**: `background: #f5a623`
- Text: `#ffffff`, `font-size: 12px`, `font-weight: 600`, right-aligned or centered
- Position: `right: 0px`, absolutely placed, vertically centered on the line

---

### 6. Avg Entry / Avg TP Rows (dashed orange lines)

- Line style: `border-top: 1px dashed #f5a623`
- Label: pill with orange border (see label spec above)
- Lot display box next to label (same style as §2)
- P&L chip shows current floating P&L
- **No action buttons** on Avg rows — they are informational only
- Price box: `background: #f5a623`, text white

---

## State-by-State Breakdown

### State 1 — Preview Orders (`perview orders`)

Show all orders before user confirms. Render with **full controls** (lot adjust + close buttons).

```
Line color     Label           Lot box    P&L chip            Buttons       Price box
──────────────[  TP2  ]────[  0.35  ]──[+$69.35(0.35)]──[−][+][×]────── 127.253
- - - - - - -[Avg TP ]- - - - - - - - - - - - - - - - - - - - - - - - -[127.228]
──────────────[  TP1  ]────[  0.35  ]──[+$48.21(0.35)]──[−][+][×]────── 127.176
══════════════[ MKT BUY]───[  0.26  ]──────────────────────[+][×]─────── 127.060
- - - - - - -[Avg Entry]──[  0.70  ]──[  +$0.00  ]──[✓][×]- - - - - - -[127.001]
──────────────[LMT BUY ]───[  0.44  ]──────────────────────[+][×]─────── 126.965
──────────────[   SL   ]──────────────[-$100.06(0.70)]──[×]────────────── 126.819
```

**Rules for Preview state:**
- Market Buy row: show `[+]` and `[×]` only (no `[−]`)
- Limit Buy row: same as Market Buy
- TP rows: show all three `[−][+][×]`
- SL row: show `[×]` only
- Avg rows: show `[✓]` (confirm) and `[×]` (cancel)

---

### State 2 — Pending Orders (`pending orders`)

Limit order placed, not yet filled. Render with **simplified controls**.

```
Line color     Label              Lot box    Buttons    Price box
──────────────[  TP2 (50%) 0.13 ]──[+$19.75]──[−][+][×]────── 127.253
- - - - - - -[    Avg TP 0.70  ]- - - - - - - - - - - -[127.228]
──────────────[  TP1 (50%) 0.13 ]──[+$11.87]──[−][+][×]────── 127.176
──────────────[   buy 0.26 ↑   ]──[+$0.00]────[×]──────────── 127.060
- - - - - - -[  Avg Entry 0.26 ]──[+$0.00]- - - - - - -[127.000]
──────────────[  LIMIT BUY 0.44]──────────────[×]──────────── 126.965
──────────────[    SL 0.26     ]──[-$49.32]────[×]──────────── 126.819
```

**Rules for Pending state:**
- TP labels show percentage: `TP1 (50%) 0.13` — include lot size inside label or next to it
- Active filled buy shows arrow `↑` for long, `↓` for short after lot size
- Limit rows: `[×]` only — not yet filled so no P&L chip
- Avg Entry shows current P&L
- SL shows current risk in dollar amount

---

### State 3 — Executed / Active Orders

Fully filled, position open. Same as Pending but:
- No LIMIT BUY row (it has filled)
- Avg Entry P&L updates live
- All rows show live floating P&L
- TP and SL rows keep `[−][+][×]` buttons

---

## Spacing & Gap Rules

| Between elements | Gap |
|---|---|
| Label → Lot box | 4px |
| Lot box → P&L chip | 4px |
| P&L chip → first button | 6px |
| Button → button | 3px |
| Last button → price box | auto (right-aligned) |
| Line to line (vertical) | natural price scale spacing |

**Do not** add artificial vertical padding between order rows. Let the price axis determine spacing — rows should sit exactly at their price level.

---

## Line Rules

| Order Type | Line Color | Line Style |
|---|---|---|
| Market Buy / Buy | `#2962ff` | solid 1px |
| Limit Buy | `#2962ff` | solid 1px |
| TP1 / TP2 | `#089981` | solid 1px |
| SL | `#f23645` | solid 1px |
| Avg Entry | `#f5a623` | dashed 1px, dash `4px` gap `3px` |
| Avg TP | `#f5a623` | dashed 1px, dash `4px` gap `3px` |

---

## Hover Behavior

- On hover over any order row: show controls (if hidden), highlight label with `0.15` opacity white overlay
- On hover over price box: cursor becomes `ew-resize` (draggable to move level)
- On hover over `[×]` button: button background fills `rgba(242,54,69,0.2)`
- On hover over `[+]` button: button background fills `rgba(8,153,129,0.2)`

---

## What to Remove / Fix from Current Implementation

| Current Problem | Fix |
|---|---|
| Inconsistent vertical alignment of pills on the line | Use `position: absolute; top: 50%; transform: translateY(-50%)` for all label containers |
| Large gap between label and lot box | Reduce to `4px` gap using flex row |
| Buttons too large and misaligned | Set buttons to `18×18px`, `border-radius: 50%`, vertically centered |
| Price boxes don't align to right edge | Absolutely position at `right: 0` |
| Mixed font sizes and weights | Standardize to `11px` / `12px` as per table above |
| P&L chip too wide and boxy | Set `height: 22px`, auto width with `padding: 0 7px` |
| No clear visual hierarchy between order types | Use color coding strictly as defined — don't reuse colors across types |
| Avg row looks same as order row | Dashed line + outlined (not filled) label clearly differentiates it |

---

## Implementation Notes for `order-manager.js`

1. Each order row should be a `div` with `position: absolute`, `top` set to the pixel Y of its price level, `width: 100%`, `height: 22px`.
2. Inside each row, use a flex container: `display: flex; align-items: center; gap: 4px; padding-left: 120px; padding-right: 70px`.
3. The horizontal line is a `::before` pseudo-element or a separate `div` with `position: absolute; top: 50%; width: 100%; height: 1px`.
4. The price box is `position: absolute; right: 0; top: 0; height: 22px`.
5. Keep all label heights uniform at `22px` — no exceptions.
6. Render order rows in a `z-index` layer above the chart canvas but below tooltips.
7. For the lot size badge inside TP labels (Pending state): render as `TP1 (50%) · 0.13` — use a centered dot `·` as separator inside the label text.

---

## Quick Reference — Color by Order Type

| Order | Label BG | Line Color | Price Box BG |
|---|---|---|---|
| Market Buy | `#2962ff` | `#2962ff` | `#2962ff` |
| Limit Buy | `#2962ff` | `#2962ff` | `#2962ff` |
| TP1 / TP2 | `#089981` | `#089981` | `#089981` |
| SL | `#f23645` | `#f23645` | `#f23645` |
| Avg Entry | outlined `#f5a623` | dashed `#f5a623` | `#f5a623` |
| Avg TP | outlined `#f5a623` | dashed `#f5a623` | `#f5a623` |

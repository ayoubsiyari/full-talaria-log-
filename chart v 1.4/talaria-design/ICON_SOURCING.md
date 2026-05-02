# Icon & Symbol Sourcing Guide — Talaria Platform

This document tells Claude Code where to find premade icons/symbols online when building or extending the Talaria charting platform UI.

## Design Constraints (must match existing set)

All icons added to the Talaria codebase must conform to:

- **Style:** Material Symbols — Sharp
- **Grid:** 24 × 24
- **Color:** `currentColor` (never hardcoded)
- **Format:** Inline SVG (no icon fonts, no PNG)
- **Weight:** 400 (regular) unless a specific UI state calls for filled/heavier
- **Stroke/fill:** Match the existing 97-icon set already in the project

Before adding any new icon, inspect the existing icon set in the repo and match the visual weight, corner radius, and padding conventions already established.

## Primary Source — Use First

**Material Symbols (Google Fonts)**
- URL: https://fonts.google.com/icons
- Filter: Style = **Sharp**, Fill = 0, Weight = 400, Grade = 0, Optical size = 24
- Download as SVG
- This is the canonical source since the existing Talaria icon set is built in this style

## Secondary Source — Fast Search Across Sets

**Iconify**
- URL: https://iconify.design
- When searching, filter the set to `material-symbols` (specifically `material-symbols:*-sharp` variants)
- Useful when the Google Fonts site is slow or the search is weak — Iconify's search is better
- Copy the SVG directly from the site

## Fallback Sources (only if Material Symbols doesn't have the glyph)

Use these only when Material Symbols genuinely lacks the icon. Adapt the pulled SVG to match the sharp/geometric style of the existing set before committing.

1. **Tabler Icons** — https://tabler.io/icons (geometric, 24×24, stroke-based — requires conversion to filled sharp style)
2. **Lucide** — https://lucide.dev (similar caveat — stroke-based, needs adaptation)
3. **SVG Repo** — https://svgrepo.com (search "chart," "candlestick," "trading" — quality varies, inspect carefully)
4. **Phosphor Icons** — https://phosphoricons.com (use the "fill" weight if adapting)

## Trading/Finance-Specific Needs

### Instrument tickers & symbols
- **TradingView symbol list** is the standard reference for ticker names (ES, NQ, EURUSD, etc.) — not for icons, for nomenclature
- Do not invent ticker conventions; match TradingView's canonical format

### Cryptocurrency logos
- **cryptoicons.co** — free SVG set for crypto tickers

### FX pair flags
- **flag-icons** (https://flagicons.lipis.dev) — country flags as SVG for forex pairs (pair them side-by-side: e.g., EU flag + US flag for EURUSD)

### Exchange / broker logos
- **Simple Icons** — https://simpleicons.org (CME, CBOE, major brokers)
- These are brand marks — do NOT recolor or restyle them beyond the permitted usage in each brand's guidelines

## Chart Drawing Tools (trendlines, Fibonacci, order blocks, etc.)

Most drawing-tool icons exist in Material Symbols under names like:
- `trending_up`, `trending_down`, `show_chart`, `bar_chart`, `candlestick_chart`
- `horizontal_rule`, `vertical_align_center`, `grid_on`
- `crop_square`, `rectangle`, `change_history` (triangle)
- `edit`, `draw`, `gesture`

For ICT/order-flow-specific concepts (FVG, order block, liquidity, BOS) that no library provides, build custom SVGs from scratch using the same sharp geometric language as the existing set.

## Workflow for Claude Code

When you need an icon:

1. **Check the repo first** — the 97-icon set may already have it. Search `/src/icons/` (or wherever the set lives) before going external.
2. **Search Material Symbols** — try Google Fonts first, then Iconify filtered to `material-symbols-sharp`.
3. **Download the raw SVG.** Do not use `<img>` tags, data-URIs, or icon fonts — always inline the SVG.
4. **Normalize it:**
   - Set `viewBox="0 0 24 24"`
   - Replace any `fill="#xxxxxx"` with `fill="currentColor"` (or `stroke="currentColor"` if stroke-based)
   - Strip `width`/`height` from the `<svg>` tag — size is set by the parent via CSS
   - Remove any `<title>`, `<desc>`, or metadata tags
   - Remove any XML declaration or comments
5. **Add it to the icon set** following the naming convention already used in the repo (typically `snake_case.svg` or as a named export in an icon index file).
6. **Verify it renders at 16, 20, 24, and 32 px** — Talaria UI uses multiple icon sizes and sharp icons can look off at smaller sizes without testing.
7. **Verify color inheritance** — toggling the parent's `color` CSS property should change the icon. If it doesn't, step 4 was done wrong.

## Things to Avoid

- **Do not mix icon styles.** Don't pull one icon from Lucide (rounded stroke) and place it next to Material Symbols Sharp icons — they will visually clash.
- **Do not use emoji** as icons anywhere in the UI.
- **Do not hardcode brand colors** (gold `#C9A84C`, electric blue `#2643F7`) into SVG files — colors come from parent CSS/theme tokens.
- **Do not download icon fonts** (Font Awesome `.woff2`, etc.) — inline SVG only.
- **Do not use AI-generated icons** for the core set — they drift in style and break the visual system.

## Quick Reference Table

| Need                          | Go to                                      |
| ----------------------------- | ------------------------------------------ |
| General UI icon               | fonts.google.com/icons (Sharp, 24, 400)    |
| Fast search across libraries  | iconify.design                             |
| Crypto ticker logo            | cryptoicons.co                             |
| Forex pair flag               | flagicons.lipis.dev                        |
| Exchange/broker brand mark    | simpleicons.org                            |
| ICT/order-flow concept        | Build custom in sharp style                |
| Ticker nomenclature reference | TradingView symbol list                    |

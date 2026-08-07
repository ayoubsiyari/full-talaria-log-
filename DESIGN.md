# Design

<!-- impeccable:design-schema 1 -->

---
name: Talaria-Log V9 Chrome
description: Obsidian black-first trading terminal chrome — flat CTAs, secondary blues, rebuilt Indicators / Tool settings / Order.
colors:
  brand-black: "#000000"
  brand-white: "#FFFFFF"
  brand-blue: "#3090FF"
  brand-blue-deep: "#232CF4"
  brand-slate: "#2C537A"
  brand-lilac: "#A2A1CD"
  brand-mist: "#EBE9FE"
  bg-dark: "#000000"
  surface-dark: "#0a0a0b"
  surface-raised-dark: "#141416"
  surface-sunken-dark: "#050505"
  text-dark: "#f4f4f5"
  bg-light: "#f7f6ff"
  surface-light: "#ffffff"
  bg-light-soft: "#eef0f3"
  accent-dark: "#3090FF"
  accent-light: "#1f7ae6"
  up: "oklch(0.72 0.14 155)"
  down: "oklch(0.63 0.18 25)"
  warn: "oklch(0.78 0.14 85)"
typography:
  body:
    fontFamily: "Helvetica Now, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "normal"
  display:
    fontFamily: "Blauer Nue, Exo 2, Helvetica Neue, sans-serif"
    fontSize: "14px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  label:
    fontFamily: "Helvetica Now, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.04em"
rounded:
  control: "6px"
  panel: "8px"
  cta: "6px"
  window: "8px"
  card: "8px"
  pill: "999px"
spacing:
  intra: "4px"
  inter: "12px"
  panel: "14px"
  topbar: "48px"
  rail: "48px"
  replaybar: "48px"
  order-rail: "320px"
  icon-hit: "36px"
components:
  button-primary:
    backgroundColor: "{colors.brand-white}"
    textColor: "{colors.brand-black}"
    rounded: "{rounded.cta}"
    height: "40px"
  button-primary-light:
    backgroundColor: "{colors.brand-black}"
    textColor: "{colors.brand-white}"
    rounded: "{rounded.cta}"
  button-secondary:
    backgroundColor: "{colors.brand-slate}"
    textColor: "{colors.brand-white}"
    rounded: "{rounded.control}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.control}"
  button-buy-active:
    backgroundColor: "{colors.up}"
    textColor: "#04140c"
    rounded: "{rounded.control}"
    height: "42px"
  button-sell-active:
    backgroundColor: "{colors.down}"
    textColor: "#1a0606"
    rounded: "{rounded.control}"
    height: "42px"
---

## Overview

Talaria V9 chrome is **A · Obsidian**: dense black-first trading terminal UI. Black is prime; blues / slate / lilac / mist are secondary (selection, focus, hairlines, secondary fills). Primary CTAs stay flat white↔black (invert in light). No gradients, no glow underlines, no chrome shadows.

**Full system document (complete details):**  
[`chart v 1.4/talaria-design/V9-CHROME-DESIGN-SYSTEM.md`](chart%20v%201.4/talaria-design/V9-CHROME-DESIGN-SYSTEM.md)

**Code:** `chrome-tokens.css` · `chrome-kit.css` · `chrome-rebuild.css` · `chromeTheme.js` · `chromeIcons.jsx`

**Scope:** chart chrome (order ticket, indicators, tool settings, top/rail/replay) **and** product app under `/dashboard/*` (V16 Dashboard / Trades / Sessions / Strategies / Resources / Profile, shell, journal analytics, COT, modals). Auth/shadcn `.dark` tokens remapped to Obsidian. **Not** `chart v 1.4/chart/**` canvas paint.

**Themes:** `dark` · `light` · `light-soft` via `data-chrome-theme`.  
**Presets 1–4** via `data-chrome-preset` (dock/float + light tone; cycle from left rail).

## Colors

Brand primitives: black `#000000`, white `#FFFFFF`, blue `#3090FF`, blue-deep `#232CF4`, slate `#2C537A`, lilac `#A2A1CD`, mist `#EBE9FE`.

Dark surfaces: bg `#000` · surface `#0a0a0b` · raised `#141416` · sunken `#050505`. Lines are lilac-tinted mixes. Accent `#3090FF` / quiet wash. CTA white fill / black text (hover mist).

Light: mist paper `#f7f6ff` / white surface; CTA black fill / white text. Soft-gray light (`light-soft`): `#eef0f3` paper for preset 4.

`--up` / `--down` / `--warn` are market & risk only — not generic chrome button fills (except Buy/Sell side controls).

## Typography

- **UI:** Helvetica Now → `"Helvetica Now", "Helvetica Neue", Helvetica, Arial, sans-serif`
- **Display:** Blauer Nue → interim Exo 2
- **Numbers:** JetBrains Mono + `tabular-nums`
- Scale: 10 · 11 · 12 · 13 · 14 · 15–18. Section labels often 11px uppercase `0.04em`.

## Layout

4px grid. Top bar 48 · rail 48 · replay 48 · tab strip 36 · order rail 320 (360 in preset 2) · icon glyph 18 · hit 36 · intra 4 · inter 12 · panel pad 14.

**Rebuilt windows:**
- Indicators `data-ind-v2` — 820×600 two-pane catalog (left category nav + cards)
- Tool settings `data-tool-sett-v2` — 480 left-nav (Style/Text/Input/…) + pane
- Chart settings `data-sett-v2` — 560×560 left-nav (Candles/Canvas/Time/Trading/Templates) + pane
- Order `data-order-v2` — hero symbol + Side/Type/Size/Levels blocks + sticky execute

## Elevation & Depth

Tonal only: `--surface-raised` / `--surface-sunken` + 1px `--line`. No drop shadows, glow, or `backdrop-filter` on chrome (`[data-v9-chrome]` strips them). Focus = 2px accent outline.

## Shapes

Control **12** · panel **16** · CTA **14** · rebuild windows **18** · cards/blocks **14** · pills **999**. Soft geometry, not sharp terminal.

## Components

- **Primary** — flat CTA vars (white/black invert by theme)
- **Secondary** — solid slate, white label
- **Ghost / icon** — line or transparent; active icon = accent-quiet + blue
- **Buy / Sell** — market green/red when active; muted wash when idle
- **Segment** — `data-brand-seg` sunken track, raised selected item
- **Field** — sunken well, accent border on focus
- **Window** — `data-win-header` / `data-win-foot` / `data-win-search`
- **Icons** — stroke `ChromeIcon` only

Motion: `--motion` 140ms ease-out; menus 160ms. Respect `prefers-reduced-motion`.

## Do's and Don'ts

**Do:** flat white/black Place Order & Apply; secondary blue for selection/focus; slate secondary buttons; lilac hairlines; left-nav / two-pane / ticket-stack for dense windows; keep function hooks when reshelling.

**Don't:** blue/gradient primary CTAs; glow underlines; nested decorative cards; touch canvas paint; green/red for non-market chrome; put `data-brand-icon` on full-width text buttons; invent hex outside the brand table without updating tokens + the full system doc.

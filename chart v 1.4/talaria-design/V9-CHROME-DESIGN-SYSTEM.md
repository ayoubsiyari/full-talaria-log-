# Talaria V9 Chrome — Complete Design System

**World:** A · Obsidian  
**Mode:** Operate (trading terminal chrome)  
**Scope:** UI chrome only — never canvas / `chart/**` paint paths  
**As of:** 2026-08-05T18:00+01:00  
**Source of truth (code):**

| Layer | File |
|---|---|
| CSS tokens + button/shell grammar | `src/chrome-tokens.css` (+ homepage copy under `homepage/src/styles/obsidian/`) |
| Kit (window header/foot, menus, forced radii) | `src/chrome-kit.css` |
| Product bridge (dashboard/sessions/trades/journal) | `homepage/src/styles/obsidian/obsidian-product.css` |
| Rebuild layouts (Indicators / Tool settings / Chart settings / Order) | `src/chrome-rebuild.css` |
| JS theme helpers + presets | `src/chromeTheme.js` |
| Stroke icon set | `src/chromeIcons.jsx` |
| Live shell | `src/TalariaV8bLive.jsx` |
| Product mega-UI | `Sources Handoff/TalariaV16.jsx` (Dashboard / Trades / Sessions / …) |
| Load order (chart) | `live/main.jsx` → tokens → kit → rebuild |
| Load order (product) | `homepage/.../dashboard/layout.tsx` → tokens → kit → product bridge |

Canonical short agent brief (root): [`DESIGN.md`](../../DESIGN.md).

---

## 1. Visual identity

**Obsidian** is a dense, black-first trading terminal. Black is the **prime** color. Blues, slate, lilac, and mist are **secondary** — selection, focus, hairlines, secondary fills — never the primary CTA.

### Character

- Flat, HeroUI-minimal controls (no button gradients, no glow underlines, no blur)
- Soft geometry (12–18px radii), not sharp “hacker terminal”
- Information density first; brand shows in precise details (type, accent, CTA inversion)
- Market green/red only for P&L / buy-sell market meaning — not for generic chrome chrome buttons

### Hard bans

- Gradients on buttons / CTAs  
- Drop shadows, glow filters, `backdrop-filter`, text-shadow on chrome (`box-shadow` / `filter` forced off under `[data-v9-chrome]`)  
- Nested decorative cards in the hero of a surface  
- Touching canvas paint, shadows, or per-frame decoration  
- Blue fill as primary Place Order / Apply CTA  

---

## 2. Brand primitives

| Token | Hex | Role |
|---|---|---|
| `--brand-black` | `#000000` | Prime surface / dark CTA text |
| `--brand-white` | `#FFFFFF` | Primary CTA fill (dark) / CTA text (light) |
| `--brand-blue` | `#3090FF` | Accent / selection / focus |
| `--brand-blue-deep` | `#232CF4` | Deep accent (sparingly) |
| `--brand-slate` | `#2C537A` | Secondary button fill |
| `--brand-lilac` | `#A2A1CD` | Hairline + muted text tint |
| `--brand-mist` | `#EBE9FE` | Soft paper / CTA hover (dark) |

JS mirror: `CHROME_BRAND` in `chromeTheme.js`.

---

## 3. Themes (`data-chrome-theme`)

Set on `[data-v9-app]` via `resolveChromeThemeAttr(colorMode, presetId)`.

### 3.1 Dark (default)

| Token | Value |
|---|---|
| `--bg` | `#000000` |
| `--surface` | `#0a0a0b` |
| `--surface-raised` | `#141416` |
| `--surface-sunken` | `#050505` |
| `--line` | lilac @ 22% |
| `--line-strong` | lilac @ 42% |
| `--text` | `#f4f4f5` |
| `--text-muted` | text mixed with lilac @ 64% |
| `--text-faint` | text mixed with lilac @ 40% |
| `--accent` | `#3090FF` |
| `--accent-hover` | `#4aa0ff` |
| `--accent-quiet` | blue @ 16% |
| `--cta-bg` / `--cta-fg` | white / black |
| `--cta-hover` | mist `#EBE9FE` |
| `--up` | `oklch(0.72 0.14 155)` |
| `--down` | `oklch(0.63 0.18 25)` |
| `--warn` | `oklch(0.78 0.14 85)` |

### 3.2 Light (`light`) — “true light”

Mist paper, black ink. Used by presets 1–3 in light mode.

| Token | Value |
|---|---|
| `--bg` | `#f7f6ff` |
| `--surface` | `#ffffff` |
| `--surface-raised` | `#f0effa` |
| `--surface-sunken` | `#ebe9fe` |
| `--line` / `--line-strong` | slate @ 18% / 34% |
| `--text` | `#0a0a0b` |
| `--accent` | `#1f7ae6` |
| `--cta-bg` / `--cta-fg` | black / white |

### 3.3 Light soft (`light-soft`) — preset 4 light

Low-glare gray day mode.

| Token | Value |
|---|---|
| `--bg` | `#eef0f3` |
| `--surface` | `#f6f7f9` |
| `--surface-raised` | `#ffffff` |
| `--surface-sunken` | `#e4e7ec` |
| `--text` | `#12141a` |
| `--accent` | `#2a7de8` |
| `--cta-bg` / `--cta-fg` | black / white |

### Persistence

- Color mode: `localStorage` key `talaria_v9_chrome_theme` → `"dark"` \| `"light"`
- Preset id: `talaria_v9_chrome_preset` → `1`–`4`
- Left rail: sun/moon toggles color mode; layout chip cycles presets 1→4

---

## 4. Chrome presets (`data-chrome-preset`)

| Id | Key | Order mode | Light theme | Notes |
|---|---|---|---|---|
| 1 | `dock-right-true-light-full` | dock | `light` | Default full chrome |
| 2 | `dock-right-true-light-order-first` | dock | `light` | Wider order rail (360), tighter bars (44) |
| 3 | `floating-ticket-true-light-full` | float | `light` | Detached order ticket |
| 4 | `dock-right-soft-gray-full` | dock | `light-soft` | Soft gray light |

Preset 2 token overrides:

```css
--order-rail-w: 360px;
--topbar-h: 44px;
--rail-w: 44px;
```

---

## 5. Typography

| Role | Stack | Token |
|---|---|---|
| UI / body | `"Helvetica Now", "Helvetica Neue", Helvetica, Arial, sans-serif` | `--font-ui` |
| Display / section | `"Blauer Nue", "Exo 2", "Helvetica Neue", sans-serif` | `--font-display` |
| Mono / numbers | `"JetBrains Mono", ui-monospace, monospace` | `--font-mono` |

### Scale (px)

| Size | Typical use |
|---|---|
| 10 | Metrics labels, counts, micro captions |
| 11 | Section block titles (uppercase), secondary captions |
| 12 | Nav items, segmented labels, body dense |
| 13 | Card titles, button labels, panel body |
| 14 | Window titles, execute CTA, symbol hero |
| 15–18 | Rare emphasis / icons |

Weights in use: **500 · 600 · 650 · 700 · 750 · 800**.  
Tracking: section titles `0.04em` uppercase; side buttons `0.06em`.  
Numbers: `font-variant-numeric: tabular-nums` on `[data-v9-chrome]`.

Floor: nothing below **10px** in rebuilt surfaces; prefer ≥11 for readable labels.

---

## 6. Layout & spacing

| Token | Value | Use |
|---|---|---|
| `--topbar-h` | `48px` (44 in preset 2) | Top bar |
| `--rail-w` | `48px` (44 in preset 2) | Left tool rail |
| `--replaybar-h` | `48px` | Bottom transport |
| `--tabstrip-h` | `36px` | Chart tabs |
| `--order-rail-w` | `320px` (360 preset 2) | Docked order |
| `--icon-glyph` | `18px` | Stroke icon size |
| `--icon-hit` | `36px` | Icon button hit |
| `--gap-intra` | `4px` | Within a control cluster |
| `--gap-inter` | `12px` | Between clusters |
| `--pad-panel` | `14px` | Panel padding |

Grid: **4px**.  

Shell attributes: `[data-v9-app]`, `[data-v9-chrome]`, `[data-v9-topbar]`, `[data-v9-rail]`, `[data-v9-replaybar]`, `[data-v9-order-rail]`, `[data-v9-order]`.

Top bar zones: `data-tb-zone="logo|mid|right"`.  
Replay bar zones: `data-rp-zone="…"`.

### Responsive collapse (tokens)

- **≤1180px:** hide Indicators / ChartType text labels; compress speed track  
- **≤980px:** hide Place Order label, screenshot/news utils, some replay metrics  
- **≤820px:** hide layers util; tighten right zone  

---

## 7. Shapes (radii)

| Token | Value | Use |
|---|---|---|
| `--radius-control` | `6px` | Buttons, icon hits, inputs, segments |
| `--radius-panel` | `8px` | Panels / floats |
| `--radius-cta` | `6px` | Primary CTA |
| `--radius-pill` | `999px` | Symbol chips, size mode pill |
| Rebuild windows | `8px` | Indicators / Tool settings shells |
| Cards / order blocks | `8px` | Indicator cards, order blocks |
| Nav items | `6px` | Left nav buttons inside windows |

---

## 8. Elevation & depth

**Tonal only.** No shadows on chrome.

| Level | How |
|---|---|
| Base | `--bg` |
| Panel | `--surface` + 1px `--line` |
| Raised / hover | `--surface-raised` |
| Well / sunken | `--surface-sunken` |
| Active accent wash | `--accent-quiet` |
| Focus | 2px `outline` `--focus-ring` (`--accent`), offset 2px |

Floating panels may use a single large ambient shadow in JSX for detach affordance; kit still strips decorative glow underlines and blur.

---

## 9. Motion

| Token | Value |
|---|---|
| `--motion` | `140ms ease-out` |
| `--motion-menu` | `160ms ease-out` |

- Window in/out: `tlrWinIn` / `tlrWinOut`, `tlrSettIn` / `tlrSettOut`, `tlrDropIn`  
- No bounce / elastic  
- `@media (prefers-reduced-motion: reduce)` → animations & transitions off  
- Never animate chrome for spectacle during replay playback  

---

## 10. Control grammar (`data-brand-*`)

### Buttons

| Attr | Fill | Text | Radius |
|---|---|---|---|
| `data-brand-btn="primary"` | `--cta-bg` | `--cta-fg` | `--radius-cta` |
| `data-brand-btn="secondary"` | slate | white | `--radius-control` |
| `data-brand-btn="ghost"` | transparent + `--line` | muted → text | `--radius-control` |
| `data-brand-btn="buy"` | up wash / solid when active | up / near-black | control |
| `data-brand-btn="sell"` | down wash / solid when active | down / near-black | control |

Primary is **always** white-on-black in dark and black-on-white in light (CTA vars invert). Never blue primary.

### Icon buttons

`data-brand-icon="1"` → 36×36, radius 12, muted → raised hover, active = accent-quiet + accent.

**Do not** put `data-brand-icon` on full-width nav/rail text buttons (forces 36×36).

### Segmented control

`data-brand-seg="1"` + children `data-brand-seg-item` with `data-active="1"` / `aria-pressed`.

### Fields

`data-brand-field="1"` — sunken well, line border, accent border on focus.

### Panels

`data-brand-panel="1"` — surface + line + panel radius.

### Window chrome

| Attr | Role |
|---|---|
| `data-win-header` | Drag bar: icon + title + actions |
| `data-win-icon` | 32×32 accent-quiet tile |
| `data-win-title` | 14 / 650 |
| `data-win-foot` | Cancel/ghost + primary actions |
| `data-win-search` | Search row with icon + field |

Applies under indicators, tool-sett-v2, order-v2, settings, profile, ind-sett.

### Menus

`data-sdrop="1"` + `data-menu-row` — 10px radius rows, muted → raised hover.

---

## 11. Icons

- Component: `ChromeIcon` / `I` from `chromeIcons.jsx`  
- Language: **stroke** (not Material fill)  
- Default glyph 18; in headers often 15–16  
- Unknown names render a placeholder square (fail loud visually)  
- Categories: cursor, lines, shapes, channels, fib/gann, text, patterns, volume, projections, visibility, chrome utilities (`layout`, `indicator`, `search`, `x`, `check`, …)

---

## 12. Rebuilt surfaces (v2)

### 12.1 Indicators — `data-ind-v2="1"`

**Layout:** 820×600 · 18px radius · header + two-pane body + foot  

```
┌──────── header (icon · Indicators · templates · close) ────────┐
│ ┌─ nav 168px ─┐ ┌──────── main ─────────────────────────────┐ │
│ │ Active  n   │ │ [ search ……………………………… ]                 │ │
│ │ Pinned  n   │ │ ┌ card: abbr | name/desc | pin | Add/Rem ┐ │ │
│ │ All     n   │ │ └────────────────────────────────────────┘ │ │
│ │ Trend   …   │ │ …                                         │ │
│ └─────────────┘ └───────────────────────────────────────────┘ │
└──────── foot (Close · Done) ───────────────────────────────────┘
```

**Nav tabs:** Active, Pinned, All, Trend, Momentum, Volatility, Volume, Sessions, Others, Talaria.  
**Card states:** idle · hover · `data-on` (active on chart) · `data-sel` (selected).  
**Actions preserved:** add/remove (max 10), pin, templates save/apply/clear, search, drag position.

### 12.2 Tool settings — `data-tool-sett-v2="1"`

**Layout:** 480 wide · max-height `min(720px, 100vh-32)` · left nav 112px + content pane  

```
┌─ header (tool icon · editable name · templates · close) ──────┐
│ ┌ nav ┐ ┌ pane (scroll) ────────────────────────────────────┐ │
│ │Style│ │ tab body (style / text / input / coords / vis)    │ │
│ │Text │ │                                                   │ │
│ │…    │ │                                                   │ │
│ └─────┘ └───────────────────────────────────────────────────┘ │
└─ foot (Cancel · Apply) ───────────────────────────────────────┘
```

**Nav:** Style · Text · Input · Coordinates · Visibility (tabs appear only when the tool supports them).  
**Actions preserved:** `tlSettTab`, style/text/input/coords/visibility editors, template save/apply/default, `cancelTlSett` / `confirmTlSett`, drag + color-picker follow.

### 12.3 Chart settings — `data-sett-v2="1"`

**Layout:** 560×560 · left nav 128px + content pane  

```
┌─ header (settings · Chart settings · close) ──────────────────┐
│ ┌ nav ──────┐ ┌ pane (scroll) ──────────────────────────────┐ │
│ │ Candles   │ │ focused section only                        │ │
│ │ Canvas    │ │                                             │ │
│ │ Time      │ │                                             │ │
│ │ Trading   │ │                                             │ │
│ │ Templates │ │                                             │ │
│ └───────────┘ └─────────────────────────────────────────────┘ │
└─ foot (Cancel · Apply) ───────────────────────────────────────┘
```

**Nav:** Candles · Canvas · Time · Trading · Templates (`settingsTab`).  
**Candles:** live bull/bear preview · body/border/wick swatches · unified bar color.  
**Canvas:** background · grid / crosshair / price-line overlays (on + style + width + color).  
**Time:** time format · timezone · precision.  
**Trading:** order history / open orders toggles.  
**Templates:** compact bar (search · Presets/Yours · Save/Reset) · one-line selected + color chips · dense 3-col gallery swatches · custom delete.  
**Actions preserved:** `openCP`, `settDrop` style/thickness/time menus, `Chk` / `Toggle` / `updateSetting`, `applyTemplate` / `upsertCustomTemplate` / reset `DEFAULT_CHART_SETTINGS`, `confirmSettingsModal` persist, drag clamp 560×560.

### 12.4 Order panel — `data-order-v2="1"`

**Layout:** docked rail or float ticket · hero + stack of blocks + sticky foot  

```
┌─ header (Order · size-mode pill · ··· · templates · close) ──┐
│ hero: symbol pill · asset class · Spread / Comm / Margin     │
│ ┌ Side ──────┐  BUY | SELL (solid up/down when active)       │
│ ┌ Type ──────┐  Market | Limit | Stop                        │
│ ┌ Size ──────┐  risk / qty well + basis                      │
│ ┌ Levels ────┐  Entry / SL / TP / notes (existing logic)     │
│ R:R bar · validation · futures warnings                      │
└─ foot: primary Execute (full width 44h) ─────────────────────┘
```

**Blocks:** `data-order-block` + uppercase `data-order-block-title`.  
**Side:** `data-order-side` grid 1fr 1fr, height 42, weight 750.  
**Actions preserved:** buy/sell flip + SL/TP mirror, order type + hidden `#orderPanel` bridge, size modes `$/%/#`, entry/SL/TP rows, notes, screenshots, `placeOrderButton` click, detach/resize.

---

## 13. Shell structure (app chrome)

```
[data-v9-app data-chrome-theme data-chrome-preset]
├── [data-v9-topbar]     logo · symbol · TF · indicators · place order · utils
├── main row
│   ├── [data-v9-rail]   tool clusters + theme/preset foot
│   ├── chart canvas     ← OUT OF SCOPE for this system
│   └── [data-v9-order-rail] / floating [data-v9-order]
├── tab strip
└── [data-v9-replaybar]  transport · speed · account metrics · timezone
```

Rail theme foot: cycle preset + light/dark.  
Portaled windows: indicators, tool settings, settings, profile, color pickers — `z-index` up to `2147483647` for tool settings.

---

## 14. JS token bridge (`chromeTokens`)

Legacy `c.*` keys map onto CSS vars so older inline styles theme correctly:

| `c` key | CSS |
|---|---|
| `sf` / `el` / `well` | surface / raised / sunken |
| `br` / `brH` | line / line-strong |
| `tx` / `ts` / `tm` | text / muted / faint |
| `ac` / `acL` / `acD` | accent / hover / quiet |
| `gn` / `rd` | up / down |
| `hv` / `hv2` | raised / accent-quiet |

Prefer `var(--…)` in new code; keep `chromeTokens()` for remaining inline styles.

---

## 15. Accessibility & interaction

- Focus-visible: 2px accent ring, offset 2  
- Icon / utility buttons: 36×36 minimum hit  
- `cursor: default` on trading chrome (not pointer) — product convention  
- Modal primary/cancel: `modalPointerActivate` (fires on pointerdown so press isn’t lost to stopPropagation)  
- Reduced motion respected  
- Buy/Sell use `aria-pressed`  

---

## 16. Do’s and don’ts

### Do

- Flat primary CTA (white↔black invert by theme)  
- Secondary blue for selection, focus, active icons  
- Slate for secondary filled buttons  
- Lilac-tinted hairlines  
- Soft 12–18px radii  
- Tabular numbers on prices / P&L / metrics  
- Left-nav / two-pane / ticket-stack layouts for dense windows  
- Keep function hooks when redesigning shells  

### Don’t

- Blue or gradient primary CTAs  
- Glow underlines, neon accents, multi-layer shadows  
- Nested card stacks without a job  
- Touch canvas render paths for chrome polish  
- Green/red for non-market chrome  
- `data-brand-icon` on full-width text buttons  
- Invent new hex outside the brand table without updating tokens + this doc  

---

## 17. Implementation checklist (new chrome surface)

1. Wrap in `data-v9-chrome="1"` (and theme inherits from app).  
2. Use CSS vars from `chrome-tokens.css` — no new one-off hex.  
3. Buttons via `data-brand-btn` / icon / seg / field.  
4. Windows: `data-win-header` + body + `data-win-foot`.  
5. If layout is catalog / settings / ticket — extend `chrome-rebuild.css` with a `data-*-v2` grammar.  
6. Icons from `ChromeIcon` only.  
7. Confirm light + dark + preset 2/4.  
8. Confirm `prefers-reduced-motion`.  
9. Do not import chrome decoration into canvas modules.

---

## 18. File map (quick)

```
chart v 1.4/talaria-design/
├── live/main.jsx                 # imports tokens → kit → rebuild
├── src/
│   ├── chrome-tokens.css         # themes, brand, buttons, shell sizes
│   ├── chrome-kit.css            # window/menu kit
│   ├── chrome-rebuild.css        # Ind / ToolSett / Order v2
│   ├── chromeTheme.js            # presets, persistence, chromeTokens()
│   ├── chromeIcons.jsx           # stroke icons
│   └── TalariaV8bLive.jsx        # Live shell + rebuilt surfaces
└── V9-CHROME-DESIGN-SYSTEM.md    # this file
```

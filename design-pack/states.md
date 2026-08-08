# Control states — SK-05

All states are **CSS-driven**. Hover must not poke chart engine state. Prefer `:hover` / `[aria-pressed]` / `:disabled` / `[data-state]`.

## Shared grammar

| State | How to express | Visual |
|---|---|---|
| Default | — | `--talaria-text-muted` on quiet chrome; surface bg |
| Hover | `:hover:not(:disabled)` | `--talaria-surface-raised` + `--talaria-text` |
| Active / selected | `[aria-pressed="true"]` or `[aria-selected="true"]` or `[data-active="1"]` | `--talaria-accent-quiet` fill + `--talaria-accent` ink |
| Disabled | `:disabled` or `[aria-disabled="true"]` | opacity ~0.35–0.45; no hover lift |
| Focus (keyboard) | `:focus-visible` | 2px `--talaria-focus-ring` outline, offset 2px |
| Empty | `[data-state="empty"]` | muted copy; no card chrome; pointer-events none on chart empty |
| Error | `[data-state="error"]` (host adds) | use `--talaria-down` for message ink; do not pulse |

Motion: `--talaria-motion` (140ms) on color/background only. No perpetual animation on idle chrome. Respect `prefers-reduced-motion`.

## Per control

### Topbar chips (symbol, chart type, indicators)

| State | Spec |
|---|---|
| Default | Transparent; muted label |
| Hover | Raised surface |
| Active (menu open) | `aria-expanded="true"` + accent quiet (host may set) |
| Disabled | Opacity 0.4 |

### Timeframe buttons

| State | Spec |
|---|---|
| Default | Muted tabular label |
| Hover | Raised |
| Active | `aria-pressed="true"` — accent quiet + accent text |
| Disabled | Opacity 0.35 |

### Place Order CTA

| State | Spec |
|---|---|
| Default | Flat `--talaria-cta-bg` / `--talaria-cta-fg` (no gradient) |
| Hover | `--talaria-cta-hover` |
| Disabled | Opacity 0.45 |
| Active (panel open) | Optional `aria-pressed="true"` — same fill; host may invert |

### Icon buttons (utils, play, rail tools)

| State | Spec |
|---|---|
| Default | Muted currentColor icon via sprite |
| Hover | Raised + full text color |
| Active | Accent quiet + accent icon |
| Disabled | Opacity 0.35 |

### Trades tabs

| State | Spec |
|---|---|
| Default | Muted; count pill accent-quiet |
| Hover | Full text |
| Selected | `aria-selected="true"` — accent text + 2px accent underline |
| Empty list | Show `.talaria-trades__empty`; keep tabs enabled |

### Chart viewport

| State | Spec |
|---|---|
| Empty | `.talaria-chart-stage__empty` visible; stage stays black |
| Ready | Host removes/hides empty node; canvas paints |
| Error | Host overlays message with `--talaria-down`; do not animate stage bg |

### Order slot

| State | Spec |
|---|---|
| Closed | `data-order-open="0"` — width 0 |
| Open | `data-order-open="1"` — width `--talaria-order-rail-w` (snap, no width tween) |

### Theme control

| State | Spec |
|---|---|
| Change | Set `data-talaria-theme` once on root — never stream token writes |

# Out of scope — Plan 4 Phase 1 design pack

This pack is a **drop-in skin** for a bare chart shell. The host product already owns everything below. Do not re-implement them here.

## Engine & data

- Chart canvas paint path, pan/zoom, crosshair geometry, price scale, time scale
- Any chart library (Lightweight Charts, TradingView, D3 series, custom WebGL)
- Market data feeds, CSV loaders, tick/bar buffers, viewport data managers
- Replay engine, playhead, speed math, session clocks

## Trading

- Order ticket business logic (size, risk, R:R, BE, trailing)
- Order manager, fills, balance/equity ledgers, PnL computation
- Pending / open / history trade rows beyond chrome tab labels
- Broker / prop / Stripe / auth

## Performance-critical chrome mistakes (do not add)

- Writing CSS variables every frame (crosshair x/y, hover price on `:root`)
- `setProperty` / `insertRule` / rewriting `<style>` inside `rAF` or `mousemove`
- `backdrop-filter`, stacked box-shadows, perpetual CSS animations on always-visible chrome
- Dozens of inline SVG copies (use `icons/sprite.svg` + `<use>`)
- Duplicate “mirror” trees of this pack

## What you may change when applying the pack

- Token values in `tokens.json` / `tokens.css` (theme apply once)
- Chrome markup placement and copy that does not require engine APIs
- Icon glyphs inside the single sprite

## What you must not change when applying the pack

- Host canvas mount contract (`#chart-stage` / `[data-slot="chart-canvas"]`)
- Event names emitted for TF / tool (`talaria:tf`, `talaria:tool`) unless the host agrees
- Memory rules listed in `README.md`

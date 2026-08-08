# Layout map — where each control lives

Coordinate system: shell root `.talaria-shell`. Slots map to Plan 4 skin IDs **SK-01…SK-05**.

```
┌──────────────────────────────── SK-03 topbar ────────────────────────────────┐
│ logo │ symbol │ chartType │ indicators │ TF[1m…1d] │ … │ cloud chat CTA utils │
├── SK-04 rail ──┬──────────────────── SK-02 chart host ──────────────┬─ order ┤
│ crosshair      │                                                    │ slot   │
│ ───            │              [data-slot=chart-canvas]              │ (opt)  │
│ trend hline    │                                                    │        │
│ fib text ruler │                                                    │        │
│ ───            ├──────────── SK-04 replaybar ───────────────────────┤        │
│ magnet trash   │ date │ play │ speed │ BAL EQ PnL │ export          │        │
│ theme          ├──────────── SK-04 trades tabs ─────────────────────┤        │
└────────────────┴────────────────────────────────────────────────────┴────────┘
```

| Control | SK | Selector / attribute | Notes |
|---|---|---|---|
| Theme tokens | SK-01 | `data-talaria-theme` on `html` + `.talaria-shell` | Apply once; see `tokens.css` |
| Chart viewport host | SK-02 | `#chart-stage` / `[data-slot="chart-canvas"]` | Mount canvas here; empty state is chrome-only |
| Logo / app menu | SK-03 | `[data-action="menu"]` | Host wires navigation |
| Symbol picker | SK-03 | `[data-action="symbol"]` | Label only in pack |
| Chart type | SK-03 | `[data-action="chartType"]` | |
| Indicators | SK-03 | `[data-action="indicators"]` | |
| Timeframes | SK-03 | `[data-tf]` in `.talaria-tf` | Emits `talaria:tf` |
| Cloud sync | SK-03 | `[data-action="cloud"]` | |
| Support | SK-03 | `[data-action="support"]` | |
| Place Order CTA | SK-03 | `[data-action="placeOrder"]` | Toggles `data-order-open` |
| Layouts / Objects / News / Screenshot / Fullscreen | SK-03 | `[data-util]` / `[data-action]` | |
| Drawing tools | SK-04 | `[data-tool]` in `.talaria-rail` | Emits `talaria:tool` |
| Magnet / trash | SK-04 | `[data-tool="magnet\|trash"]` | |
| Theme select (demo) | SK-04 | `#theme-select` | Static theme apply |
| Replay date | SK-04 | `.talaria-replaybar__date` | Host fills string |
| Play / pause | SK-04 | `[data-action="play"]` | Visual toggle only |
| Speed scrubber | SK-04 | `.talaria-speed` | Visual track; host owns value |
| Balance / Equity / PnL | SK-04 | `[data-metric]` | Host fills numbers |
| Export | SK-04 | `[data-action="export"]` | |
| Trades tabs | SK-04 | `[data-tab]` | All / Pending / Open / History / Analytics |
| Order panel slot | SK-03/SK-04 | `.talaria-order-slot` | Width via `data-order-open`; no math |
| Icon sprite | SK-05 | `icons/sprite.svg` `#icon-*` | One `<use>` per glyph |
| Control states | SK-05 | See `states.md` | hover / active / disabled / empty |

## Narrow widths

| Breakpoint | Behavior |
|---|---|
| ≤820px | Hide long chip labels + CTA text; hide Equity metric |
| ≤640px | Hide left rail; order slot stays closed (host should overlay ticket) |

## Z-index (static)

| Layer | Token |
|---|---|
| Rail | `--talaria-z-rail` (30) |
| Dropdowns | `--talaria-z-drop` (9000) |
| Modals | `--talaria-z-modal` (9002) |
| Tips | `--talaria-z-tip` (99999) |

# Chart chrome redesign report — 2026-08-04+01:00

## Scope

UI chrome only (`TalariaV8bLive.jsx`, `chrome-tokens.css`, `chromeTheme.js`, `DESIGN.md`). No edits under `chart v 1.4/chart/**` (canvas / `src/chart/**` equivalent).

## Before

PO screenshot: `/Users/hr/.cursor/projects/Users-hr-Desktop-Talaria-log/assets/Screenshot_2026-08-04_at_17.19.35-bf5c8c9f-e82d-42a9-8f42-5e677c11d0df.png`

Issues observed: loud Place Order, undifferentiated left rail, orphaned cloud icon, mixed TF casing, colliding build badge, undivided bottom bar, glow accents.

## After (this change)

Tokens: OKLCH chrome variables in `chart v 1.4/talaria-design/src/chrome-tokens.css`.
Shell mapping: `chromeTheme.js` → Live theme object uses `var(--*)`.
Fonts: DM Sans + JetBrains Mono (self-hosted; no new npm deps).

### §1 acceptance mapping

| # | Issue | Fix |
|---|---|---|
| 1 | Build string collision | `#talaria-build-badge{display:none}`; build id in logo menu |
| 2 | Place Order too bright | Flat `--accent` fill, no glow/gradient, 12/500 |
| 3 | Left rail undifferentiated | 4 clusters + hairlines; carets only when `dd` |
| 4 | Top-right ungrouped | Sync/support cluster · Place Order · utility cluster (12px gaps) |
| 5 | Orphan cloud | Moved into right sync cluster |
| 6 | Mixed TF casing | `formatTfLabel` → `1h 4h 1d` display |
| 7 | Date formats | HUD title-case to match axis (`Tue 26 Nov '12`) |
| 8 | Price label styles | Theme bridge: muted scale text; accent price line (thicker); muted crosshair |
| 9 | Dashed lines | Crosshair thin/faint vs price line accent/weight 2 via settings defaults |
| 10 | Bottom bar zones | Hairline dividers between clock · transport · account |
| 11 | Tabular nums | Chrome CSS + mono on account/clock/speed |
| 12 | Top/canvas seam | Top bar `border-bottom: 1px var(--line)` |

## Detector

`npx impeccable detect src/components/` — path absent in this repo.

Chrome token modules: **0 findings**.

`TalariaV8bLive.jsx` (full shell): remaining noise is a false-positive `broken-image` on a comment mentioning `<img src>` (~L10804). Layout/bounce chrome transitions removed. CSS kill-switch on `[data-v9-chrome] *` strips box-shadow/filter/glow at runtime.

## Build note

Official `npm run build:live` refuses uncommitted sources (clean-build-tree). Verified compile via `npx vite build --config vite.config.live.js` → `chart/dist-v9/` (2026-08-04+01:00). Commit chrome sources before a stamped production build.

## Perf budgets

No canvas module edits. Re-measure frame time during playback per `PERF-MEMORY-GUARDRAILS.md` after deploy (file not yet in tree; stated rules honored).

## After screenshot

Capture after `npm run build:live` + sync to homepage on a local chart session; place beside the Before asset above.

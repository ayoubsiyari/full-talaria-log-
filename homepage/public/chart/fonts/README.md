# Self-hosted chart fonts

Fonts are served from `/chart/fonts/` (no Google Fonts CDN). This avoids CSP blocks and works offline.

## Regenerate

```bash
cd "chart v 1.4/chart"
npm run bundle-fonts
```

This downloads woff2 files into `woff2/` and writes `talaria-fonts.css`.

## Deploy

The `fonts/` folder is copied with the chart static tree and synced to `homepage/public/chart/fonts/` on `npm run build:live`.

Families included: DM Sans, Exo 2, JetBrains Mono, Roboto, Zain, Plus Jakarta Sans.

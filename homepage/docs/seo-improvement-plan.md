# SEO improvement plan

**Status:** Tier 1 **implemented** (2026-05-20). Tier 2+ still optional.

## Tier 1 (done)

- [x] `src/app/robots.ts` — allow public site; disallow dashboard, auth, chart, checkout success
- [x] `src/app/sitemap.ts` — marketing + legal URLs only
- [x] `src/lib/siteUrl.ts` — canonical origin (`NEXT_PUBLIC_SITE_URL`)
- [x] Root `layout.tsx` — stronger default title/description, canonical `/`
- [x] Per-route metadata: pricing, bootcamp, ninjatrader, legal pages, login/register (noindex)
- [x] Dashboard: server `layout.tsx` with `robots: noindex` + `DashboardShell.tsx` (client shell)
- [x] `pricing/success/` noindex layout

## Verify after deploy

1. `https://www.talaria-log.com/robots.txt`
2. `https://www.talaria-log.com/sitemap.xml`
3. View source on `/` and `/pricing/` — unique `<title>` and meta description
4. Google Search Console → submit sitemap

## Tier 2 (optional, later)

- JSON-LD (`SoftwareApplication`, `Organization`) on homepage
- Server wrapper for marketing homepage (`page.tsx`) for richer static copy
- `hreflang` en/ar
- FAQ section + blog/docs
- Core Web Vitals (fonts, motion lazy-load)

## Env

Production build should set:

```bash
NEXT_PUBLIC_SITE_URL=https://www.talaria-log.com
```

(already in `homepage/Dockerfile` and `docker-compose.yml`)

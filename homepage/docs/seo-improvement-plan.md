# SEO improvement plan

**Status:** Tier 1 + **AI visibility Tier 2** implemented (2026-05-20).

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

## Tier 2 — AI visibility (done)

- [x] `public/llms.txt` — plain-text summary for LLM crawlers
- [x] `JsonLdScript` in root layout — Organization, WebSite, SoftwareApplication, FAQPage
- [x] `MarketingFaqSection` on `/` (server, via `HomePageClient` slot) and `/pricing/`
- [x] `HomePageClient.tsx` + server `page.tsx` (FAQ in static HTML at build)

## Tier 3 (optional, later)

- `hreflang` en/ar
- Blog/docs for long-tail keywords
- Core Web Vitals (fonts, motion lazy-load)
- Explicit `GPTBot` / `ClaudeBot` allow rules in `robots.ts` if needed

## Env

Production build should set:

```bash
NEXT_PUBLIC_SITE_URL=https://www.talaria-log.com
```

(already in `homepage/Dockerfile` and `docker-compose.yml`)

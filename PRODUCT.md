# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are **retail traders reviewing their own performance** — discretionary futures/forex traders (including prop-firm aspirants) who replay sessions, journal trades, and decide whether a source or strategy is trustworthy enough to keep trading. Mentors/admins are secondary operators of the same product surfaces.

Confirmed surface authority: **product** (app UI / dashboard / tool / trading terminal), not brand/marketing.

## Product Purpose

Talaria-Log is a bilingual (EN/AR) trading platform that combines historical session replay, backtesting, a trading journal with analytics, and chart tooling so a trader can evaluate edge under one product. Success means a trader can finish a real workflow — open a session, replay/render correctly, record or review trades, and leave with a clear performance/risk read — without data or money-path corruption.

## Positioning

The durable mechanism is the shared source model that ties **historical replay → backtest session → journal/analytics source** (with prop-firm rule paths and mentorship/bootcamp adjacency), so evaluation and live journaling sit on the same data and chart surface rather than in disconnected tools. Neighboring generic journals or chart viewers cannot truthfully claim that closed loop as one product.

## Operating Context

- Live product with external paying users; support tickets and PO visual verification are part of operating reality.
- Surfaces include marketing/home hub, auth, pricing, dashboard shell, journal, backtest sessions, strategy lab, chart (V9), admin, and bootcamp/mentorship pages.
- NinjaTrader integration is a real product path, not decorative.
- Engineering gates (money-path, customer-data, provenance/build identity, mirror parity for chart copies) constrain what UI work may change.
- Chrome redesign (2026-08-04) is in progress under DESIGN.md / chrome-tokens.css. Canvas measurement queue remains the user's engineering sequence and does not block chrome-only work already ordered.

## Capabilities and Constraints

- Stack is incumbent: Next.js homepage (`homepage/`), chart/V9 UI (`chart v 1.4/`), Flask journal backend (`journal-backend/`), Docker Compose nginx routing.
- Product UI is a **dense, dark, information-first trading terminal**. Density and scanability outrank decorative expression.
- Impeccable / design-system work applies to **UI chrome only** (dashboard, analytics panels, order ticket, trade list, settings, navigation). It does **not** apply to chart canvas / render hot path (`src/chart/**` in product language; in this repo primarily `chart v 1.4/chart/**` and its homepage mirror).
- Chart canvas is under hard performance budgets (referenced as `PERF-MEMORY-GUARDRAILS.md`: no gradients, no shadows, no CSS filters, no per-frame allocation). If a design suggestion conflicts with those budgets, **the budget wins**.
- Do not fabricate customers, testimonials, benchmarks, pricing claims, or licensing claims in UI copy.

## Brand Commitments

- Product name: **Talaria-Log** / **تالاريا-لوج**
- Bilingual EN/AR is first-class for public/marketing and product surfaces that already speak both.
- Existing logo/wordmark assets in-repo (`talaria-logo.png`, `LOGO-*.png`, `homepage` public marks, Hermes mark) are binding brand material; do not invent a replacement identity unless the user explicitly rebrands.
- Related brand names present in marketing UI (e.g. Talaria-Prop / Flow / Copy) are placeholders unless separately confirmed as live products.
- **2025 brand boards** (user-supplied): **black is the prime color** (`#000000`); white for primary CTAs; **secondary** blues `#3090FF` / `#232CF4`, slate `#2C537A`, lilac `#A2A1CD`, mist `#EBE9FE` for selection, focus, secondary controls, and hairlines. Helvetica Now (body) + Blauer Nue (display). Soft radii. **No gradients on buttons** — flat fills only. Not a blue-washed shell, and not monochrome-only.
- Binding anti-references for product UI: consumer SaaS landing pages, oversized hero sections, decorative cards, blue/gradient *primary* buttons.

## Evidence on Hand

- Runnable incumbent UI under `homepage/` and `chart v 1.4/`
- Handoff and dashboard contracts under `Sources Handoff/`
- Routing/architecture maps: `SITE_ROUTING_ARCHITECTURE.md`, `DASHBOARD_PAGE_MAP.md`
- Logos and OG assets under repo root and `homepage/public/`
- Absences future work must not fabricate: invented testimonials, fake customer counts, unverified prop-firm partnerships, or performance claims not backed by product data
- `PERF-MEMORY-GUARDRAILS.md` is cited as the canvas budget authority; not present at repo root as of this write (checked tree) — treat the user's stated rules (no gradients/shadows/CSS filters/per-frame allocation) as binding until that file lands

## Product Principles

1. Dense, dark, information-first terminal UI for traders reviewing their own performance — not brand spectacle.
2. Preserve the replay → backtest → journal source loop; UI must not break that mental model.
3. Treat money-path, customer data, build/provenance integrity, and canvas performance budgets as product constraints that outrank design suggestions.
4. Keep EN/AR and Talaria-Log naming coherent wherever the product already commits to them.
5. Keep Impeccable pressure on UI chrome; keep it off the chart rendering hot path.

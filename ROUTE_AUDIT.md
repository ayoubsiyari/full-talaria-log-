# Talaria — Route Audit (Dead / Duplicate Page Report)

> **Generated:** Jun 2026 · **Scope:** `homepage/` (Next.js static export) routing
> **Method:** Static analysis only — cross-referenced `app/**/page.tsx` files against
> `homepage/nginx.conf` (the real prod router), `homepage/next.config.mjs` redirects,
> and every internal link (`href`/`router.push`/`window.location`) in `homepage/src`.
> **No files were deleted or changed.** This is a findings document only.

## How routing actually resolves

The site is a **Next.js static export** (`output: "export"`), so:

- **`next.config.mjs` `redirects()`/`rewrites()` do NOT run in production** — they are compiled away. Only **`homepage/nginx.conf`** routes live traffic.
- nginx serves pages via `try_files $uri $uri/ $uri.html =404` — i.e. an unmatched path returns a real **404** (`/404.html` from `app/not-found.tsx`, which exists ✅).
- Page-level auth/access is **client-side only** (each protected page calls `/api/auth/me`); the API enforces the real security.

---

## Summary of findings

| # | Finding | Severity | Count |
|---|---------|----------|-------|
| 1 | Built pages that are **unreachable in prod** (nginx 301s before Next serves) | Duplicate / dead | 2 |
| 2 | **Broken internal links** to routes that have no page (will 404) | Broken | 3 paths |
| 3 | **Legacy redirect-shim pages** (functional but redundant with `?view=`) | Redundant | 3 |
| 4 | **Stale allowlist entries** for `/journal/*` pages that no longer exist | Dead code | 7 |
| 5 | Duplicate pricing surface (`/journal/pricing` vs `/pricing`) | Duplicate | 1 |

---

## 1. Unreachable built pages (dead duplicates)

These `page.tsx` files are **built but can never be served in production** because nginx
intercepts the path with a `301` before Next.js gets it. They are duplicates of canonical pages.

| Page file | Path | nginx rule | Verdict |
|-----------|------|------------|---------|
| `app/journal/pricing/page.tsx` | `/journal/pricing` | `location = /journal/pricing → 301 /pricing/` (nginx.conf:140) | **Dead duplicate** of `/pricing`. The page itself also client-redirects to `/pricing/`. |
| `app/journal/subscription-status/page.tsx` | `/journal/subscription-status` | `location = /journal/subscription-status → 301 /pricing/?browse=1` (nginx.conf:146) | **Dead.** Page also client-redirects to `/pricing/?browse=1`. |

> Both are leftovers from the removed `/journal/*` SPA. Safe-to-delete candidates (do **not** delete yet per request).
> The catch-all `location ^~ /journal/ → 301 /dashboard/journal/` (nginx.conf:164) covers any other `/journal/*` UI path.

## 2. Broken internal links (point at routes with no page → 404)

These links exist in the UI but target paths that have **no `page.tsx`** and **no nginx redirect**,
so clicking them returns a 404.

| Link target | Where it's used | Problem | Correct path |
|-------------|-----------------|---------|--------------|
| `/privacy-policy/` | `app/pricing/PricingClient.tsx:860` (footer) | No such route | Should be **`/privacy/`** |
| `/refund-policy/` | `app/pricing/PricingClient.tsx:863` (footer) | No such route | Should be **`/refunds/`** |
| `/dashboard/admin/datasets/` | `app/dashboard/admin/page.tsx:184` and `:437` | No `dashboard/admin/datasets/page.tsx` exists; nginx does not proxy `/dashboard/*` | Page missing — either create it or point to `/chart/admin-dashboard.html` |

> Note: `app/pricing/PricingClient.tsx:857` correctly uses `/terms/`. Only `privacy-policy` and `refund-policy` are wrong.

## 3. Legacy redirect-shim pages (functional but redundant)

These are real pages whose entire job is to client-side redirect into the V16 dashboard `?view=` model.
They work, but overlap with the canonical dashboard and are candidates for consolidation.

| Page file | Path | Redirects to | Notes |
|-----------|------|--------------|-------|
| `app/backtest/page.tsx` | `/backtest` | `/dashboard/?view=sessions` | Bookmark-compat shim |
| `app/backtest/analytics/page.tsx` | `/backtest/analytics` | `/dashboard/` | Bookmark-compat shim |
| `app/backtest/design/page.tsx` | `/backtest/design` | `/dashboard/backtest/design/` | Shim → real embed below |

> The **real** chart embed is `app/dashboard/backtest/design/page.tsx` (full-screen V9 chart iframe) — **working, keep.**
> `app/dashboard/design/handoff/page.tsx` is **working** and linked from `DashboardShell.tsx:633`.
> Only listed in `app/robots.ts` (`/backtest/`); not linked from main nav.

## 4. Stale allowlist entries (dead code, not routes)

`homepage/src/components/ui/auth-fuse.tsx` → `isJournalPublicNextPath()` (lines 41-62) still
allows these `/journal/*` paths as valid post-login `next` targets, but **none of these pages exist anymore**:

- `/journal/features`
- `/journal/contact`
- `/journal/legal`
- `/journal/privacy-policy`
- `/journal/terms`
- `/journal/cookie-policy`
- `/journal/refund-policy`

> Harmless (they'd just 301 via the `^~ /journal/` catch-all), but dead and misleading. Prune candidates.

## 5. Pricing duplication

There are effectively **two pricing surfaces**: `/pricing` (canonical) and `/journal/pricing` (dead, see §1).
Both also appear in the `auth-fuse.tsx` allowlist. Recommendation: keep **`/pricing`** only.

---

## Full route inventory & status

Legend: ✅ working · ↪ redirect-shim · ☠️ dead/unreachable · 🔗 broken-link target

### Public / marketing / auth

| Path | File | Status |
|------|------|--------|
| `/` | `app/page.tsx` | ✅ |
| `/pricing` | `app/pricing/page.tsx` | ✅ (canonical pricing) |
| `/pricing/success` | `app/pricing/success/page.tsx` | ✅ |
| `/ninjatrader` | `app/ninjatrader/page.tsx` | ✅ |
| `/bootcamp` | `app/bootcamp/page.tsx` | ✅ (auth-gated) |
| `/login` | `app/login/page.tsx` | ✅ |
| `/register` | `app/register/page.tsx` | ✅ (nginx pre-auths, nginx.conf:110) |
| `/forbidden` | `app/forbidden/page.tsx` | ✅ |
| `/privacy` | `app/privacy/page.tsx` | ✅ |
| `/terms` | `app/terms/page.tsx` | ✅ |
| `/refunds` | `app/refunds/page.tsx` | ✅ |
| `/disclaimer` | `app/disclaimer/page.tsx` | ✅ |
| `/privacy-policy` | — | 🔗 no page (linked from PricingClient) |
| `/refund-policy` | — | 🔗 no page (linked from PricingClient) |

### `/journal/*` (legacy namespace)

| Path | File | Status |
|------|------|--------|
| `/journal/pricing` | `app/journal/pricing/page.tsx` | ☠️ nginx 301 → `/pricing/` |
| `/journal/subscription-status` | `app/journal/subscription-status/page.tsx` | ☠️ nginx 301 → `/pricing/?browse=1` |
| `/journal`, `/journal/*` (any other) | — | ↪ nginx 301 → `/dashboard/journal/` |

### Dashboard core (auth)

| Path | File | Status |
|------|------|--------|
| `/dashboard` | `app/dashboard/page.tsx` | ✅ V16 shell (`?view=trades\|sessions\|stratbank`) |
| `/dashboard/profile` | `app/dashboard/profile/page.tsx` | ✅ |
| `/dashboard/cot` | `app/dashboard/cot/page.tsx` | ✅ |
| `/dashboard/support` | `app/dashboard/support/page.tsx` | ✅ (redirects to profile?tab=support) |
| `/dashboard/admin` | `app/dashboard/admin/page.tsx` | ✅ (admin-only) |
| `/dashboard/admin/datasets` | — | 🔗 no page (linked from admin page) |
| `/dashboard/sessions` | `app/dashboard/sessions/page.tsx` | ✅ |
| `/dashboard/sessions/analytics` | `app/dashboard/sessions/analytics/page.tsx` | ✅ |
| `/dashboard/sessions/[id]/analytics` | `app/dashboard/sessions/[id]/analytics/page.tsx` | ✅ dynamic |
| `/dashboard/design/handoff` | `app/dashboard/design/handoff/page.tsx` | ✅ (linked in shell) |
| `/dashboard/backtest/design` | `app/dashboard/backtest/design/page.tsx` | ✅ real V9 chart embed |

### Backtest top-level (redirect shims)

| Path | File | Status |
|------|------|--------|
| `/backtest` | `app/backtest/page.tsx` | ↪ → `/dashboard/?view=sessions` |
| `/backtest/analytics` | `app/backtest/analytics/page.tsx` | ↪ → `/dashboard/` |
| `/backtest/design` | `app/backtest/design/page.tsx` | ↪ → `/dashboard/backtest/design/` |

### Journal app (auth)

| Path | File | Status |
|------|------|--------|
| `/dashboard/journal` | `app/dashboard/journal/page.tsx` | ✅ |
| `/dashboard/journal/journal` | `app/dashboard/journal/journal/page.tsx` | ✅ |
| `/dashboard/journal/trades` | `app/dashboard/journal/trades/page.tsx` | ✅ |
| `/dashboard/journal/notes` | `app/dashboard/journal/notes/page.tsx` | ✅ |
| `/dashboard/journal/learn` | `app/dashboard/journal/learn/page.tsx` | ✅ |
| `/dashboard/journal/settings` | `app/dashboard/journal/settings/page.tsx` | ✅ |
| `/dashboard/journal/select-profile` | `app/dashboard/journal/select-profile/page.tsx` | ✅ |
| `/dashboard/journal/manage-profiles` | `app/dashboard/journal/manage-profiles/page.tsx` | ✅ |
| `/dashboard/journal/import-trades` | `app/dashboard/journal/import-trades/page.tsx` | ✅ |
| `/dashboard/journal/ai-dashboard` | `app/dashboard/journal/ai-dashboard/page.tsx` | ✅ |

### Analytics (`/dashboard/journal/analytics/*`, auth)

| Path | File | Status |
|------|------|--------|
| `/dashboard/journal/analytics` | `.../analytics/page.tsx` | ✅ |
| `/dashboard/journal/analytics/equity` | `.../equity/page.tsx` | ✅ |
| `/dashboard/journal/analytics/calendar` | `.../calendar/page.tsx` | ✅ |
| `/dashboard/journal/analytics/performance-analysis` | `.../performance-analysis/page.tsx` | ✅ |
| `/dashboard/journal/analytics/streaks` | `.../streaks/page.tsx` | ✅ |
| `/dashboard/journal/analytics/trade-duration` | `.../trade-duration/page.tsx` | ✅ |
| `/dashboard/journal/analytics/exitanalysis` | `.../exitanalysis/page.tsx` | ✅ |
| `/dashboard/journal/analytics/exitanalysis-amelioration` | `.../exitanalysis-amelioration/page.tsx` | ✅ |
| `/dashboard/journal/analytics/pnl-distribution` | `.../pnl-distribution/page.tsx` | ✅ |
| `/dashboard/journal/analytics/daily-limit-optimization` | `.../daily-limit-optimization/page.tsx` | ✅ |
| `/dashboard/journal/analytics/symbols` | `.../symbols/page.tsx` | ✅ |
| `/dashboard/journal/analytics/variables` | `.../variables/page.tsx` | ✅ |
| `/dashboard/journal/analytics/all-metrics` | `.../all-metrics/page.tsx` | ✅ |

---

## Recommended actions (for later — nothing deleted yet)

1. **Delete dead duplicates:** `app/journal/pricing/` and `app/journal/subscription-status/` (nginx already 301s them).
2. **Fix broken footer links** in `app/pricing/PricingClient.tsx`: `/privacy-policy/` → `/privacy/`, `/refund-policy/` → `/refunds/`.
3. **Resolve `/dashboard/admin/datasets/`**: either add the page or repoint the two links in `app/dashboard/admin/page.tsx` to the existing chart admin (`/chart/admin-dashboard.html`).
4. **Prune stale allowlist** in `auth-fuse.tsx:41-62` (7 non-existent `/journal/*` entries).
5. **Consider collapsing** the three `/backtest/*` redirect shims once analytics confirms no inbound traffic relies on them.

## Caveats

- This is **static link/route analysis**, not live HTTP probing. To confirm runtime behavior,
  hit each path against a running stack (`docker compose up`) and check status codes — especially
  the 🔗 broken-link rows and the ☠️ nginx-301 rows.
- `next.config.mjs` contains many `redirects()` that look authoritative but **do not execute** under
  static export; nginx is the source of truth. Anything relying on those redirects should be mirrored in `nginx.conf`.

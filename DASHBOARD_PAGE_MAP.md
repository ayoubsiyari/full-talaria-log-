# Dashboard Page Map — navigation, duplication & gaps

> **Generated:** Jun 2026 · **Method:** walked the app like a user (sidebar → views → pages),
> then scanned `Sources Handoff/TalariaV16.jsx` (~50k LOC) and every `app/dashboard/**/page.tsx`.
> **No code changed.** Findings only.

## TL;DR — your instinct is right

- The **entire** dashboard (Snapshot, Trades, Sessions, Strategies, Profile, etc.) is **one 50k-line
  component** (`TalariaV16.jsx`) rendered at **one URL** (`/dashboard/`). It uses **3 layers of
  internal navigation**, none of which change the route.
- There is a **parallel skeleton of ~22 empty route pages** (`return null`) that mirror an older,
  pre-V16 structure. They render nothing and nothing links to them — pure dead weight.
- **Profile** and **Support** each exist in **3 forms**. **Backtest/Sessions** is named two ways.

---

## How navigation actually works (3 layers, 1 URL)

```
/dashboard/                ← the ONLY real dashboard URL
   └─ TalariaV16.jsx (one component)
        Layer 1: LEFT SIDEBAR  → switches sessView   (?view=… synced)
        Layer 2: DASHBOARD PAGES dropdown → switches dashFreshPage (NOT in URL)
        Layer 3: TRADES sub-views (overview/…)        (NOT in URL)
```

### Layer 1 — left sidebar (`DashboardShell.tsx:557` `ALL_NAV_ITEMS`)
Clicking these does **not** navigate to a new page — it flips the V16 `sessView` and updates `?view=`:

| Sidebar item | id | V16 view (`v16DashboardRoutes.ts`) | URL |
|---|---|---|---|
| Dashboard | `dashboard` | `dashboard` | `/dashboard/` |
| Trades | `trades` | `trades` | `/dashboard/?view=trades` |
| Backtest *(shows "Sessions")* | `backtest` | `sessions` | `/dashboard/?view=sessions` |
| Strategies | `strategies` | `stratbank` | `/dashboard/?view=stratbank` |
| Resources | `resources` | `resources` | `/dashboard/?view=resources` |
| Support / Profile (bottom) | — | `profile` + portal | `/dashboard/?view=profile` |

### Layer 2 — "Dashboard Pages" dropdown (`TalariaV16.jsx:22318` `dashboardNavGroups`)
Only visible inside the `dashboard` view. These are the cards in your screenshot. They switch
internal state `dashFreshPage` and are **not reflected in the URL** (not deep-linkable):

**Dashboard group:** Snapshot (`overview`) · Performance · The Numbers (`numbers`) · Trade Quality ·
What-If Lab · Edge & Behavior · Journal
**Mode Pages (conditional):** Prop Challenge (`isPropD`) · Live Discipline (`isLived`)

### Layer 3 — Trades sub-views (`TalariaV16.jsx:23158` `builtInViews`)
The Trades view has its own column-view switcher (`overview`, etc.) — a third nav layer inside the
same file.

---

## What's REAL vs what's a DEAD STUB

### ✅ Real, rendered pages under `/dashboard`
| Route | File | Renders |
|---|---|---|
| `/dashboard` | `page.tsx` | `TalariaV16Dashboard` → the whole 50k-line app |
| `/dashboard/journal` | `journal/page.tsx` (885 lines) | A **second** real journal/analytics surface |
| `/dashboard/profile` | `profile/page.tsx` → `ProfilePageClient` | Standalone profile |
| `/dashboard/admin` | `admin/page.tsx` | Admin (admin-only) |
| `/dashboard/cot` | `cot/page.tsx` | COT report |
| `/dashboard/support` | `support/page.tsx` | Redirect → `/dashboard/profile/?tab=support` |
| `/dashboard/backtest/design` | real | Full-screen V9 chart iframe |
| `/dashboard/design/handoff` | real | V16 **mock** iframe (admin preview) |
| `/dashboard/sessions/analytics`, `/sessions/[id]/analytics` | real | Session analytics panels |

### ☠️ Empty stub routes — `export default function X() { return null; }`
These are **real Next routes that render a blank page**, unlinked from any nav. Leftovers from the
pre-V16 (and earlier iframe-era) structure:

**Journal section (9):**
`/dashboard/journal/trades`, `/journal/journal`, `/journal/notes`, `/journal/learn`,
`/journal/settings`, `/journal/import-trades`, `/journal/manage-profiles`,
`/journal/select-profile`, `/journal/ai-dashboard`

**Analytics section (13):**
`/dashboard/journal/analytics` (index) + `equity`, `calendar`, `performance-analysis`, `streaks`,
`trade-duration`, `exitanalysis`, `exitanalysis-amelioration`, `pnl-distribution`,
`daily-limit-optimization`, `symbols`, `variables`, `all-metrics`

> **~22 dead route stubs total.** The analytics index even still says *"rendered by the embedded
> journal iframe"* — a stale comment from a removed architecture.
>
> ⚠️ **Correction to `ROUTE_AUDIT.md`:** these were listed as ✅ working (file existed). They exist
> but render **nothing**. `ROUTE_AUDIT.md` should be updated to mark them ☠️ empty stubs.

---

## Duplication found

1. **Two journal/analytics surfaces.** Analytics live **inside** `TalariaV16.jsx` (Performance, The
   Numbers, Trade Quality, Edge & Behavior, What-If Lab) **and** as a separate real page
   `/dashboard/journal/page.tsx` (885 lines) — plus the 13 empty analytics stubs that mirror the old
   per-metric layout. Three generations of the same idea coexist.
2. **Profile ×3:** V16 `sessView==="profile"` + `V16ProfilePortal` overlay + standalone
   `/dashboard/profile`. Three entry points to "profile".
3. **Support ×3:** `V16SupportChatPopover` (in-dashboard) + `/dashboard/support` (redirects to
   profile) + admin link to `/chart/admin-dashboard.html#sec-support`.
4. **Backtest vs Sessions naming:** sidebar id `backtest` labeled "Backtest" maps to the `sessions`
   view (screenshot shows "SESSIONS"); plus `/backtest/*` redirect shims and `/dashboard/sessions/*`
   pages. One concept, several names/paths.

## What's missing / broken

1. **No deep-linking for Dashboard Pages.** `dashFreshPage` (Snapshot/Performance/Trade Quality/…)
   is **not** in the URL — only `__TALARIA_V16_SYNC_VIEW_URL__` syncs top-level `view`/`profile`
   (`TalariaV16Dashboard.tsx:50-69`). You can't bookmark or share "Trade Quality".
2. **Stubs return blank instead of redirecting.** Hitting `/dashboard/journal/analytics/equity`
   (old bookmark / SEO / nav typo) shows an **empty page**, not a redirect to the V16 equivalent.
3. **Possible dead link:** admin links to `/dashboard/sessions/` (`admin/page.tsx:438`) but there is
   **no** `sessions/page.tsx` index (only `sessions/analytics` + `sessions/[id]/analytics`) → likely
   blank/404. (Also `/dashboard/admin/datasets` from earlier audit.)
4. **No 404 boundary inside the dashboard** for unknown `/dashboard/journal/*` — they resolve to the
   empty stubs rather than a proper not-found.

---

## Why it feels disorganized (root cause)

The app went through migrations (iframe SPA → standalone Next pages → consolidated V16 component) and
**the old layers were emptied but never removed.** So today you have:

- **One mega-file** doing everything (hard to navigate, 3 nav layers), AND
- **A ghost skeleton** of ~22 empty routes from the previous design, AND
- **Duplicate entry points** for profile/support/analytics.

## Recommended cleanup (later — nothing deleted now)

1. **Delete the ~22 `return null` stub routes** (or replace each with a redirect to the matching V16
   `?view=`/dashboard page) so blank pages and ghost routes disappear.
2. **Pick one home for analytics:** either the V16 internal pages **or** `/dashboard/journal` — not
   both. Retire the loser.
3. **Collapse Profile and Support** to a single canonical surface each.
4. **Add URL deep-linking** for `dashFreshPage` (e.g. `?view=dashboard&page=trade-quality`) so pages
   are shareable/bookmarkable.
5. **Standardize naming:** Backtest vs Sessions — choose one label + one path.
6. **(Bigger)** Extract the V16 views into separate lazy-loaded modules (see `BIG_DATA_REMEDIATION.md`
   / the Scaling tab) so "one file = everything" stops being true.

## Guardrail
When deleting stubs, add redirects for any that may be bookmarked/indexed; don't remove the paid-
access guard or auth on the real pages.

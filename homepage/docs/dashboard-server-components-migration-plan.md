# Dashboard Server Components Migration Plan

**Status:** Phase P1 (profile) **implemented** 2026-05-20. Other phases still draft.  
**Created:** 2026-05-20  
**Updated:** 2026-05-20 — priority zones (payments / user info first; trades / backtest optional)  
**Scope:** See §0 below (not only `dashboard/`).

---

## 0. What actually needs to be “safe” (your priority)

You said **trades and backtest are not the problem**. Focus safety on **payments, plans, subscription, marketing homepage, and user profile data**.

### Important truth

**Server vs Client `page.tsx` does not protect Stripe or passwords by itself.**  
Real safety is on the **backend**:

| Layer | Role |
|-------|------|
| `journal-backend/routes/subscription_routes.py` | Checkout, webhooks, `verify-session`, plans — **Stripe secret stays here** |
| `chart v 1.4/chart/api_server.py` (`/api/auth/billing-portal`, cancel/reactivate) | Proxies billing actions with server-side Stripe key |
| JWT + `paid_access` / `subscription_access` | Who can use journal/chart — enforced on API, not in React |

The frontend only calls APIs with the user’s cookie/JWT. A Client page is OK **if it never embeds secrets** and the API validates every action.

### Priority map (this repo today)

| Area | Route(s) | `page.tsx` today | Real risk | Migration priority |
|------|----------|------------------|-----------|-------------------|
| **Plans & checkout** | `/pricing/` | **Server** → `PricingClient` | Low UI risk; checkout URL from API | **Already good** — optional: harden `PricingClient` only |
| **Post-payment** | `/pricing/success/` | **Client** | Medium — verifies `session_id` via API | **Medium** — thin Server page + client verify (Phase P2) |
| **User + billing UI** | `/dashboard/profile/` | **Client** | **Highest UI exposure** — name, email, subscription, portal | **High** — Server page + `ProfilePageClient` (Phase P1) |
| **Login / register** | `/login/`, `/register/` | **Client** | Credentials in forms (HTTPS + API) | **Medium** — keep client forms; ensure no secrets in bundle |
| **Marketing home** | `/` (`page.tsx`) | **Client** | Low — calls `/api/auth/me` for nav only | **Low** — optional Server shell later |
| **Journal pricing (legacy)** | `/journal/pricing/` | **Client** | Duplicate of `/pricing/`? | **Low** — audit / redirect to `/pricing/` |
| **Subscription status (legacy)** | `/journal/subscription-status/` | **Client** | Same | **Low** |
| **Trades / backtest** | `/dashboard/trades/`, `/dashboard/backtest/` | Client | Not your concern | **Skip** — no migration required |
| **Admin** | `/dashboard/admin/` | Client | Admin-only; separate from subscriber billing | Defer |

### Recommended order (safe, small steps)

1. **Do nothing** on trades/backtest unless you want consistency later.  
2. **Phase P1 — Profile only:** ✅ Done — Server `profile/page.tsx` + `ProfilePageClient.tsx` (user info + subscription tab UI unchanged).  
3. **Phase P2 — Pricing success:** Server `pricing/success/page.tsx` + `PricingSuccessClient.tsx`.  
4. **Phase P3 — Backend audit checklist** (no React): webhook signature, redirect URL allowlist, rate limits — already in `subscription_routes.py` / security rules.  
5. **Defer:** homepage `/`, login/register refactors, full dashboard migration.

### What to protect in profile / pricing (checklist, not Server Components)

- [ ] Never put `STRIPE_SECRET_KEY` or webhook secrets in `homepage/`  
- [ ] Billing portal URL only from `POST /api/auth/billing-portal` (server creates Stripe session)  
- [ ] Checkout only via `POST /journal/api/subscriptions/checkout`  
- [ ] `return_url` / redirect targets validated server-side (`security_redirects`)  
- [ ] Profile save / password change only via authenticated API routes  
- [ ] Do not log full JWT or card data in browser console  

---

## 1. Goal

Move interactive UI out of `page.tsx` files so **route `page.tsx` files are Server Components** (no top-level `"use client"`), while **keeping behavior identical** for users.

**Target pattern (already used on 2 routes):**

```tsx
// page.tsx — Server Component (no "use client")
import SomePageClient from "./SomePageClient";

export default function SomePage() {
  return <SomePageClient />;
}
```

```tsx
// SomePageClient.tsx — "use client"
export default function SomePageClient() { /* hooks, fetch, UI */ }
```

---

## 2. Non-goals (out of scope for this migration)

| Item | Reason |
|------|--------|
| Rewrite `dashboard/layout.tsx` to Server | Needs `usePathname`, auth, providers, gates — high break risk |
| Change journal Flask/iframe architecture | 19 stub pages return `null`; separate product decision |
| Move browser `localStorage` JWT to httpOnly cookies | Security improvement, but **not** required for this refactor |
| Refactor `BacktestNewSessionModal.tsx` (2200+ lines) | Already a client module; only touched if imports break |
| Admin-only WIP routes behavior | Keep same access rules from `dashboardAccess` |

---

## 3. Current state (audit summary)

### Already correct (Server `page.tsx`)

| Route | Client child |
|-------|----------------|
| `/dashboard/` | `analytics/BacktestAnalyticsPage.tsx` |
| `/dashboard/strategies/` | `strategies/StrategylabV9PageClient.tsx` |
| `/dashboard/sessions/[id]/analytics/` | `sessions/[id]/analytics/RedirectClient.tsx` |

### Client `page.tsx` (candidates to migrate)

| Route | File | Notes |
|-------|------|--------|
| `/dashboard/trades/` | `trades/page.tsx` | Thin wrapper — **easiest, do first** |
| `/dashboard/backtest/` | `backtest/page.tsx` | Thin wrapper → `BacktestView.tsx` |
| `/dashboard/backtest/design/` | `backtest/design/page.tsx` | Chart iframe — small file |
| `/dashboard/backtest/analytics/` | `backtest/analytics/page.tsx` | Redirect only — extract client redirect component |
| `/dashboard/support/` | `support/page.tsx` | Redirect to profile — extract client redirect |
| `/dashboard/profile/` | `profile/page.tsx` | Large; logic stays in client file |
| `/dashboard/cot/` | `cot/page.tsx` | ~1300 lines — **move body to `CotPageClient.tsx`** |
| `/dashboard/journal/` | `journal/page.tsx` | ~900 lines — **move body to `JournalPageClient.tsx`** |
| `/dashboard/sessions/analytics/` | `sessions/analytics/page.tsx` | Large inline — extract client file |
| `/dashboard/admin/` | `admin/page.tsx` | Admin panel — extract client file |

### Server stubs (no change unless product asks)

19 routes under `/dashboard/journal/**` export `null` (placeholder for legacy iframe comments). **Leave as-is** unless journal routing is redesigned.

### Always stays Client

- `dashboard/layout.tsx` — shell, nav, subscription gate, providers
- All existing `*View.tsx`, modals, contexts under `dashboard/`

---

## 4. Safety principles

1. **One route per PR/commit** (or small group: trades + backtest only).
2. **No logic changes** — only file moves and import path updates.
3. **Run `npm run build` in `homepage/`** after each phase.
4. **Manual smoke test** checklist per route (section 8).
5. **Revert single commit** if a route regresses; never big-bang all 10 pages.
6. **Do not delete** old code until the new client file is verified in browser.

---

## 5. Phased execution order (lowest risk → highest)

### Phase 0 — Prep (no user-visible change)

- [ ] **0.1** Confirm branch: `git checkout -b chore/dashboard-server-pages`
- [ ] **0.2** Baseline build: `cd homepage && npm run build` — must pass before edits
- [ ] **0.3** Note current behavior screenshots or short screen recording for: trades, backtest, profile, journal, cot
- [ ] **0.4** Read Next.js rule: Server `page.tsx` must not use hooks; only imported Client children may

### Phase 1 — Trivial thin wrappers (≈15 min, lowest risk)

**1A — Trades**

- [ ] Create `trades/TradesPageClient.tsx` with `"use client"`:
  ```tsx
  import { TradesView } from "../TradesView";
  export default function TradesPageClient() {
    return <TradesView />;
  }
  ```
- [ ] Replace `trades/page.tsx` with Server:
  ```tsx
  import TradesPageClient from "./TradesPageClient";
  export default function DashboardTradesPage() {
    return <TradesPageClient />;
  }
  ```
- [ ] Build + smoke: `/dashboard/trades/` — table loads, filters, pagination

**1B — Backtest**

- [ ] Same pattern: `backtest/BacktestPageClient.tsx` → `BacktestView`
- [ ] Server `backtest/page.tsx`
- [ ] Build + smoke: `/dashboard/backtest/` — sessions list, open modal, create session

### Phase 2 — Redirect-only pages (low risk)

**2A — `/dashboard/backtest/analytics/`**

- [ ] Move `BacktestAnalyticsCanonicalRedirectInner` + default export to `backtest/analytics/BacktestAnalyticsRedirectClient.tsx`
- [ ] Server `page.tsx` wraps `<Suspense><BacktestAnalyticsRedirectClient /></Suspense>`
- [ ] Smoke: visit `/dashboard/backtest/analytics/?foo=1` → lands on `/dashboard/?foo=1`

**2B — `/dashboard/support/`**

- [ ] Extract to `support/SupportRedirectClient.tsx` (already have `SupportInbox` elsewhere)
- [ ] Server `support/page.tsx`
- [ ] Smoke: `/dashboard/support/?thread=1` → profile support tab

**2C — Optional: use Next `redirect()` from server**

- For pure redirects, consider **Server** `redirect()` from `next/navigation` in `page.tsx` (no client JS). **Only if** query string must be preserved — verify Next 14/15 API; if fragile, keep client redirect component.

### Phase 3 — Medium: extract large page bodies (medium risk)

Do **one file at a time**, build after each.

**3A — Profile** (`profile/page.tsx` → `ProfilePageClient.tsx`)

- [ ] Copy entire current `page.tsx` body into `profile/ProfilePageClient.tsx` with `"use client"`
- [ ] Server `page.tsx`: `export default function ProfilePage() { return <ProfilePageClient />; }`
- [ ] Keep `profile-page.css` import in client file
- [ ] Smoke: tabs profile/security/subscription/support, billing links, support inbox

**3B — Backtest design** (`backtest/design/page.tsx`)

- [ ] `backtest/design/BacktestDesignPageClient.tsx`
- [ ] Smoke: iframe chart loads, fullscreen, no console errors

**3C — Sessions analytics** (`sessions/analytics/page.tsx`)

- [ ] `sessions/analytics/SessionsAnalyticsPageClient.tsx`
- [ ] Smoke: charts/KPIs load with session query params

**3D — Admin** (`admin/page.tsx`)

- [ ] `admin/AdminDashboardPageClient.tsx`
- [ ] Smoke: admin-only user sees panel; non-admin blocked by layout gate

### Phase 4 — High effort (do last, optional split across weeks)

**4A — COT** (`cot/page.tsx`)

- [ ] `cot/CotPageClient.tsx` — move all hooks/state/UI
- [ ] Keep `cot-page.css`, `cot-instruments.ts`, `cot-fetch.ts` imports in client file
- [ ] Server `cot/page.tsx`
- [ ] Smoke: instrument tabs, snapshot load, filters

**4B — Journal hub** (`journal/page.tsx`)

- [ ] `journal/JournalPageClient.tsx` — move ~900 lines
- [ ] Keep CSS imports in client file
- [ ] Smoke: connect brokers, analytics view, modals, filters
- [ ] Confirm `/dashboard/journal/analytics/...` stub routes still acceptable (still `null`)

### Phase 5 — Layout (optional, future — **not in initial migration**)

- [ ] Split `layout.tsx` into:
  - `DashboardLayoutServer.tsx` (static wrapper)
  - `DashboardShellClient.tsx` (nav, auth, children slot)
- [ ] **High risk** — only after all pages stable; separate project

---

## 6. Files that must keep `"use client"`

Do not remove `"use client"` from these (they need hooks/browser):

- `dashboard/layout.tsx`
- `BacktestView.tsx`, `TradesView.tsx`, `BacktestNewSessionModal.tsx`
- `analytics/BacktestAnalyticsPage.tsx`, `BacktestOsDashboardLayout.tsx`, etc.
- `SubscriptionGateOverlay.tsx`, `DashboardAccessSkeleton.tsx`
- All `*Context.tsx` providers
- `strategies/StrategylabV9PageClient.tsx` (already client module)

---

## 7. Common breakages and fixes

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| Build error: hooks in Server Component | Hook left in `page.tsx` | Move hook to `*PageClient.tsx` |
| `useSearchParams` without Suspense | Boundary missing | Wrap client redirect in `<Suspense>` in Server `page.tsx` |
| CSS not applied | `import "./x.css"` moved to server file | Import CSS only in client component |
| `window is not defined` | SSR running browser code in server file | Guard in client file only |
| Blank journal sub-routes | Stub `return null` | Expected — not introduced by this migration |
| Chart iframe blank | Wrong path in design page | Verify `NEXT_PUBLIC_TALARIA_V9_IFRAME_SRC` unchanged |

---

## 8. Smoke test checklist (run after each phase)

Login as a normal subscriber user and as admin.

- [ ] `/dashboard/` — analytics dashboard loads, session selector works
- [ ] `/dashboard/trades/` — trade table, column picker
- [ ] `/dashboard/backtest/` — session list, new session modal
- [ ] `/dashboard/backtest/design/` — chart iframe
- [ ] `/dashboard/strategies/` — strategy lab (already server page)
- [ ] `/dashboard/profile/` — all tabs
- [ ] `/dashboard/cot/` — data loads (if user has access)
- [ ] `/dashboard/journal/` — main journal hub
- [ ] `/dashboard/admin/` — admin only
- [ ] Nav sidebar: switch modules, no double scroll, subscription gate still works
- [ ] Hard refresh (Ctrl+Shift+R) on each route — no hydration errors in console

---

## 9. Verification commands

```bash
cd homepage
npm run build          # must pass
npm run lint           # if configured
```

Optional local dev:

```bash
cd homepage
npm run dev
# manual routes above
```

Production deploy: rebuild **homepage** Docker image only after Phase 1–3 pass locally.

---

## 10. Rollback plan

- Each phase = **one git commit** with message like: `refactor(dashboard): server page for trades`
- Rollback: `git revert <commit-sha>` for the broken route only
- No database or API changes — **frontend-only** migration

---

## 11. Estimated effort

| Phase | Routes | Risk | Time estimate |
|-------|--------|------|----------------|
| 0 Prep | — | None | 30 min |
| 1 Thin wrappers | 2 | Very low | 30 min |
| 2 Redirects | 2 | Low | 1 h |
| 3 Medium extracts | 4 | Medium | 3–4 h |
| 4 COT + Journal | 2 | Higher | 4–6 h |
| 5 Layout split | 1 | High | **Defer** |

**Total (Phases 0–4):** ~1–2 days careful work, or spread over multiple PRs.

---

## 12. Decision log (fill when approved)

| Date | Decision | By |
|------|----------|-----|
| | Approve Phase 1 only first? | |
| | Skip admin/cot until later? | |
| | Use server `redirect()` for support/backtest analytics? | |

---

## 13. Approval gate

**Do not start coding until:**

1. You confirm which phases to run:
   - **Recommended for your goals:** **Phase P1 (profile only)** + optional **P2 (pricing success)** — see §0.
   - **Not needed for safety:** dashboard Phase 1 trades/backtest (§5).
2. You accept that `layout.tsx` stays client for now.
3. Journal stub routes (`return null`) stay unchanged.

Reply with e.g. *"Approved — profile only (P1)"* or *"Approved — full dashboard plan"* and implementation can begin step-by-step per this document.

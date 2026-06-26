# Big-Data Dashboard Remediation Plan

> **Goal:** make the dashboard handle large trade volumes and many concurrent users
> without lag, freezes, or errors.
> **Method:** traced the real data flow (boot → APIs → metrics). This lists the exact
> files/functions to change, ordered by impact. **No code was changed — this is the plan.**

---

## Root cause (confirmed in code)

The platform currently **loads everything in full and loops over it in memory** — in both the
browser and the backend — with caching disabled. Three concrete proofs:

1. **Frontend boot loads the entire dataset up front.**
   `homepage/src/app/dashboard/v16/useV16LiveBootstrap.ts:197-213` fires a `Promise.all` that pulls
   all sessions, all KPIs, **all journal entries**, and community templates, then loads **all trades
   for the open session** (`:228`). Everything is mapped in JS and held in `window.__TALARIA_V16_BOOT__`.

2. **The journal list endpoint returns ALL rows (no pagination).**
   `journal-backend/routes/journal/trades.py:211 /list` → `entries = query.all()` (`:243`).
   `homepage/.../v16/v16JournalMappers.ts:644 fetchJournalApiData()` calls `/journal/list` with
   `cache: "no-store"` (`:655`) — every dashboard open re-downloads the full history.

3. **Analytics endpoints load all rows and loop in Python (no SQL aggregation, no cache).**
   `journal-backend/routes/journal/analytics.py` — `/stats`, `/strategy-analysis`, `/symbol-analysis`,
   `/risk-summary`, `/pnl-distribution` each do `entries = query.all()` then iterate in
   `calculate_basic_stats()` (`:30-86`). This is **O(users × trades)** CPU on every request.

> Net effect: fine with a few hundred trades; **lags/freezes the tab and spikes server CPU**
> as trades and concurrent users grow.

---

## Priority 1 — Stop shipping the whole dataset to the browser

**Why first:** this is what actually freezes the user's tab and bloats payloads.

| Change | File / location | What to do |
|--------|-----------------|------------|
| Paginate `/journal/list` | `journal-backend/routes/journal/trades.py:211-255` | Add `limit`/`offset` (or keyset/cursor on `date,id`) query params; return `{ items, total, next_cursor }`. Default e.g. `limit=100`. |
| Load only the first page at boot | `homepage/src/app/dashboard/v16/v16JournalMappers.ts:644 fetchJournalApiData()` | Request page 1 only; expose a "load more"/lazy fetch for the rest. Don't hold the full history in `window.__TALARIA_V16_BOOT__`. |
| Virtualize trade tables | trade list render inside `Sources Handoff/TalariaV16.jsx` (+ any list in `analytics/`) | Use TanStack Virtual or `react-window` — render only visible rows. **Biggest UI win** (5000 rows → ~30 nodes). No virtualization lib is currently present. |
| Lazy-load session trades | `useV16LiveBootstrap.ts:228` and `:74-88` (`__TALARIA_V16_FETCH_TRADES_FOR_SESSION__`) | Already partly lazy + cached per session — keep, but ensure trades are fetched **paginated** too, not whole-session at once for large sessions. |

## Priority 2 — Compute metrics in the database, not in Python loops

**Why:** `query.all()` + Python loops is the server-CPU bottleneck under concurrency.

| Change | File / location | What to do |
|--------|-----------------|------------|
| SQL aggregation for `/stats` | `analytics.py:89-137` + `calculate_basic_stats:30-86` | Replace the load-all-then-loop with SQL: `func.count`, `func.sum`, `func.avg`, `case()` for win/loss buckets, `func.min/max`. Return aggregates directly. Keep `calculate_basic_stats` only as a fallback/unit-tested helper. |
| `GROUP BY` for grouped analyses | `analytics.py:140 /strategy-analysis`, `:178 /symbol-analysis`, `:273 /pnl-distribution` | Use `GROUP BY strategy` / `GROUP BY symbol` / histogram buckets in SQL instead of building Python dicts in a loop. |
| Push filters into SQL | `apply_variables_filter(entries, ...)` (called at `analytics.py:124,152,…`) | It currently filters a **Python list after `query.all()`**, which forces loading all rows. Move filterable fields into indexed columns / SQL `WHERE`. If `variables` is JSON, consider a JSONB column + GIN index (Postgres) so it can be filtered in-query. |

## Priority 3 — Cache computed results (compute once, serve many)

**Why:** turns N users × M requests of identical work into one computation. You already have Redis.

| Change | File / location | What to do |
|--------|-----------------|------------|
| Cache analytics responses | `analytics.py` endpoints | Wrap each in a Redis cache keyed by `(user_id, profile_id, filter_hash, data_version)`. Short TTL + explicit invalidation. |
| Bump `data_version` on write | `trades.py:91 add_entry`, `:257 update_entry`, `:367 delete_entry`, and `routes/journal/import_export.py` | On any trade mutation, increment the user's `data_version` (a Redis counter). This invalidates all their cached metrics atomically. |
| Stop forcing `no-store` where safe | `v16JournalMappers.ts:655-659`, `useV16LiveBootstrap.ts` `fetchJson` | Replace blanket `cache: "no-store"` with ETag / short `max-age` for read endpoints so the browser/CDN can reuse responses. Keep `no-store` only for truly volatile data. |

> **Reuse the pattern you already have:** the what-if backtest path uses `BACKTEST_WHATIF_ASYNC` +
> `BACKTEST_WHATIF_CACHE_TTL_SEC` + Redis. Apply the same async-compute + cache model to dashboard metrics.

## Priority 4 — Indexing & query hygiene

| Change | File / location | What to do |
|--------|-----------------|------------|
| Composite indexes | `journal-backend/models.py` (`JournalEntry`) + a new migration in `journal-backend/migrations/versions/` | Ensure indexes on `(user_id, profile_id, date)` and `(user_id, profile_id, strategy)` / `symbol`. Without these, paginated + grouped queries still table-scan. |
| Avoid N+1 | `analytics.py`, `trades.py` | Use `.with_entities(...)` to select only needed columns for aggregation; don't hydrate full ORM objects when you only need `pnl`/`rr`. |

## Priority 5 — Keep heavy work off the request thread

| Change | File / location | What to do |
|--------|-----------------|------------|
| Async large imports | `journal-backend/routes/journal/import_export.py` | For big CSV imports, enqueue to a worker (you have Redis + `trading-chart-worker`) and return a job id; don't block the HTTP worker. Recompute aggregates in the job. |
| Rate-limit expensive endpoints | analytics + import routes | You already rate-limit backtests; extend to dashboard analytics + import to protect the cluster under load. |

## Priority 6 — Frontend structure (re-render isolation)

| Change | File / location | What to do |
|--------|-----------------|------------|
| Split dashboard views | `Sources Handoff/TalariaV16.jsx` (~50k LOC) → per-view modules under `dashboard/v16/` | Extract `SessionsView`/`TradesView`/`StrategyBuilder`/`ProfileView`, `dynamic()`-import each. Confines re-renders + shrinks initial bundle. Incremental, not a rewrite. |
| Memoize | within those views | `useMemo` heavy calcs, `React.memo` rows, stable `key`s, debounce filters. |

---

## Robustness / error-handling notes (separate from perf)

- **Whole-dashboard failure on one fetch:** `useV16LiveBootstrap.ts:197` — `/api/sessions` and
  `/api/sessions/kpis` failures aren't all caught the way journal/community are (`:202-212`), so a
  single failing call can throw the dashboard into the `error` state (`:303-310`). Consider
  per-section fallbacks so one slow/failing endpoint degrades gracefully instead of blanking the page.
- **Falsy-PnL edge:** `calculate_basic_stats` uses `e.pnl and e.pnl > 0` (`analytics.py:49`), so a
  `pnl == 0` is treated as breakeven — fine, but verify it matches the frontend's definition to avoid
  mismatched totals between client and server during the migration.

## Suggested order of execution

1. **P1 pagination + virtualization** (immediate UX: no more frozen tabs).
2. **P2 SQL aggregation** (cuts per-request CPU dramatically).
3. **P3 Redis caching + data_version invalidation** (concurrency / many users).
4. **P4 indexes** (makes P1/P2 queries actually fast).
5. **P5 async imports + rate limits** (protects under spikes).
6. **P6 frontend split + memoization** (long-term maintainability + load time).

## Guardrail

None of these may weaken existing security: keep `@jwt_required`, profile/group scoping
(`build_group_aware_query`), rate limits, and redirect/CORS guards intact. Caching keys **must**
include `user_id`/`profile_id` so one user can never receive another's cached metrics.

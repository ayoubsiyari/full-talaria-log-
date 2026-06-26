# `dashboard/` — Dashboard metrics backend (organized, additive, NON-BREAKING)

This folder holds the **scalable** backend for the dashboard's metrics — built to handle
large trade volumes and many concurrent users (SQL aggregation + Redis caching + pagination),
following `BIG_DATA_REMEDIATION.md`.

## ⚠️ It is ADDITIVE and currently INERT — it does NOT change the live dashboard

- **Nothing here is registered into Flask yet.** `dashboard_bp` is defined but **not** imported by
  `routes/journal/__init__.py` or `routes/blueprint_setup.py`, so these endpoints don't exist at
  runtime until you wire them (see "How to enable").
- The existing endpoints (`/api/journal/stats`, `/api/journal/list`, the rest of
  `routes/journal/analytics.py` and `trades.py`) are **untouched**. The current dashboard keeps
  working exactly as today.
- Migration is opt-in and reversible: enable → verify numbers match → switch the frontend → remove
  the old path only once you're confident.

## Why this folder exists

Today the dashboard loads *all* trades into the browser and the analytics endpoints do
`query.all()` + Python loops with no cache (see `BIG_DATA_REMEDIATION.md`). That works at small
scale but lags/freezes and spikes CPU as data/users grow. This module fixes the backend half:

- **`queries.py`** — computes stats with **one SQL pass** (`COUNT/SUM/AVG/CASE`, `GROUP BY`).
  No row-by-row Python loops, no loading the whole table into memory.
- **`cache.py`** — optional **Redis** cache keyed by `(user, profile, filters, data_version)`,
  invalidated by bumping a per-user `data_version`. Compute once, serve many.
- **`routes.py`** — new **v2** endpoints, including a **paginated** trade list so the client never
  downloads the full history.

## Files

| File | Purpose |
|------|---------|
| `__init__.py` | Defines `dashboard_bp` and imports `routes`. |
| `routes.py` | New v2 endpoints: paginated `/trades`, aggregated `/stats`, `/by-strategy`, `/by-symbol`. |
| `queries.py` | SQL-aggregation helpers (reuse existing filters; aggregate in the DB). |
| `cache.py` | Optional Redis cache + `data_version` invalidation (graceful no-op if Redis absent). |

## How to enable (when you're ready — not done automatically)

1. **Register the blueprint** in `routes/blueprint_setup.py`:
   ```python
   from dashboard import dashboard_bp
   # inside register_all_blueprints(app), mirror the journal guard:
   register_paid_journal_guard(dashboard_bp, required_module="journal")
   app.register_blueprint(dashboard_bp, url_prefix="/api/journal/dashboard")
   ```
2. **Verify parity** — call `/api/journal/dashboard/stats` and compare to `/api/journal/stats`.
   Numbers must match before switching anything.
3. **Invalidate cache on write** — in `routes/journal/trades.py` `add_entry` / `update_entry` /
   `delete_entry` and `import_export.py`, call `dashboard.cache.bump_data_version(user_id)`.
4. **Switch the frontend** — point `useV16LiveBootstrap` / `v16JournalMappers` at the v2 endpoints
   and the paginated `/trades`. Add table virtualization (frontend task).
5. **Index the DB** — add `(user_id, profile_id, date)` / `strategy` / `symbol` indexes via a
   migration in `migrations/versions/` so the aggregate queries are fast.

## Known limitation to design around

`apply_variables_filter` currently filters a **Python list after** `query.all()`, so it can't be
pushed into SQL as-is. For the v2 path, either (a) store filterable variables in indexed columns /
a JSONB column with a GIN index, or (b) keep a row-loading fallback only for variable-filtered
requests. `queries.py` is written for the common (no-variables) case first.

## Guardrail

Keep `@jwt_required`, profile/group scoping (`build_group_aware_query`), and the paid-journal guard
intact. Cache keys **must** include `user_id` + `profile_id` so one user can never receive another's
cached metrics.

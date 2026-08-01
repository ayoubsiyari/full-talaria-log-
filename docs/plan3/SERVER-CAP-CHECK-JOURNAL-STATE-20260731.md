# Server Cap Check — Journal State Hydration

**Date:** 2026-07-31  
**Manager:** D  
**Scope:** `/api/journal` substring finding vs actual chart hydrate path

## Verdict

`/api/journal-trades` is paginated. The chart's session hydrate path is not paginated.

The actual chart startup path is:

1. `chart.js` calls `GET /api/sessions/{session_id}/state`.
2. `api_server.py:get_trading_session_state()` calls `sjs.resolve_session_journal(...)`.
3. `session_journal_store.py:resolve_session_journal()` calls `load_journal_trades_from_sql(...)`.
4. `load_journal_trades_from_sql()` executes `.all()` for the session's journal rows and decodes every
   row's `payload_json`.
5. `apply_journal_to_state_for_response()` puts the full list back into `state["journal"]`.
6. `chart.js:loadTradingSessionStateIfNeeded()` maps the full `state.journal` into `serverJournal`,
   merges it, and commits the full array as `session-state-hydrate`.

There is no `limit`, `offset`, page size, or client bounding parameter on that hydrate path.

## What Is Capped

There is an admission cap on writes:

- `session_journal_store.py:max_journal_trades_per_session()` defaults to `5000`.
- `api_server.py` calls `sjs.enforce_journal_trade_limit(...)` on append/import/PATCH paths.

That cap prevents infinite per-session growth, but it is not a startup memory cap. A 301-trade session is
well below 5000 and still returns every full payload. Even the default cap permits a payload much larger
than the PO's 500 MB total-memory bar if rows carry screenshots.

## What Was A False Positive

The generic `/api/journal` substring does not identify the chart hydrate route. The dashboard
`/api/journal-trades` endpoint is explicitly bounded:

- `limit: Query(3000, ge=1, le=5000)`
- `.offset(offset).limit(min(limit, _LIST_USER_JOURNAL_TRADES_MAX))`

The unbounded read path is `/api/sessions/{id}/state`, not `/api/journal-trades`.

## Required Fix Shape

A real startup cap needs a partial-hydrate contract, not just `.limit(3000)`.

Today `_m19CommitJournalArray(..., 'session-state-hydrate')` marks the journal as complete enough to
permit durable writes. Returning only page 1 while preserving that provenance would authorize a future
durable write from an incomplete journal. The fix needs a distinct "partial hydrate, never vouches for
durable write" provenance state or a split endpoint that the chart treats as read-only/paged until the
full journal is explicitly requested.

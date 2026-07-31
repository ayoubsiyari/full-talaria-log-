# M8 — State Bound Guard

**Date:** 2026-07-31  
**Manager:** D  
**Guard:** `scripts/m8-state-bound-guard.mjs`  
**Report:** `docs/plan3/M8-STATE-BOUND-GUARD-20260731.json`

## Verdict

`IMPLEMENTED_PENDING_LIVE_MEASURE`

M8 now bounds the `/api/sessions/{id}/state` journal supply line without allowing a failed, partial, or heavy-slim fetch to mean "this user has no trades."

## Motivating Case

- Endpoint: `GET /api/sessions/936/state`
- B stamp at measurement: 6,242 bars, 182 trades, 395 screenshots in payload
- M1 load transient lower bound: 141.57 MB at app-ready

## Guard Shape

- Backend state hydrate uses a bounded journal contract with `journal_complete`, `journal_count`, `journal_returned_count`, `journal_hydrate_mode`, `journal_heavy_fields_omitted`, and `journal_omitted_heavy_fields`.
- Startup state strips screenshot-heavy fields by default, while preserving the SQL truth and trade count.
- Client hydrate uses durable `session-state-hydrate` only for complete full payloads.
- Partial or heavy-slim hydrate uses non-delete-authority provenance and cannot clear a known non-empty server journal.
- The client guard is present in both mirrors: `chart v 1.4/chart/chart.js` and `homepage/public/chart/chart.js`, with matching `modules/order-manager.js` provenance handling.

## Serving Evidence

Production `/chart` assets are served by `chart v 1.4/chart/api_server.py`. The `GET /chart/{file_name}` route sets `_CHART_ROOT_PATH = Path(__file__).resolve().parent` and serves `/chart/index.html` from `_CHART_ROOT_PATH / "dist-v9" / "index.html"` when present before falling back to `dist/` or the root chart HTML. That makes `chart v 1.4/chart` the serving mirror for `/chart` assets in this FastAPI app; `homepage/public/chart` is a source mirror and is now kept identical for the guarded client files.

## Safety Proof

The safety proof is provenance-based: missing rows or omitted heavy fields from state hydrate never upgrade `OrderManager` to durable replace/delete authority. Therefore a failed or partial fetch cannot be interpreted as an empty journal and cannot authorize a later write that deletes omitted SQL rows.

## Validation

Run:

```
python -m pytest "chart v 1.4/chart/tests/test_session_journal_store.py"
npm run test:m8-state-bound
npm run preflight:m8-state-bound
```

The product-memory verdict remains pending until the M1 load-transient harness is rerun against a deployed build containing this guard.

# Scalable Data Loading Implementation Plan

This document defines how to implement TradingView/FXReplay-style performance patterns in this project.

## Objective

Make loading, panning, replay, and timeframe switching smooth for very large datasets (multi-year 1m candles) while keeping replay accuracy.

## Current Baseline in This Repository

- Backtest initial data load:
  - `autoLoadBacktestingData(session)` in `chart.js`
  - Current fetch path uses `/api/file/{id}/smart`
- Timeframe switching:
  - `setTimeframe(timeframe)` and `setTimeframeServerSide(timeframe)` in `chart.js`
- Smart backend endpoint:
  - `GET /api/file/{file_id}/smart` in `api_server.py`

---

## 1) Viewport-Based Loading (Lazy + Prefetch)

### Why
Do not keep full history in browser memory. Only keep what is visible + a buffer.

### Backend Changes
Create a new endpoint focused on visible ranges:

`GET /api/file/{file_id}/candles?timeframe=1m&start_ts=...&end_ts=...&limit=...&cursor=...`

Response contract:

```json
{
  "timeframe": "1m",
  "start_ts": 1710000000000,
  "end_ts": 1710086400000,
  "returned": 2000,
  "has_more_left": true,
  "has_more_right": true,
  "next_cursor": "...",
  "prev_cursor": "...",
  "data": [
    {"t":1710000000000,"o":1.09,"h":1.10,"l":1.08,"c":1.095,"v":1100}
  ]
}
```

### Frontend Changes
Add a `ViewportDataManager` module that:

1. Calculates visible timestamp range from chart scale.
2. Expands with a buffer (e.g. 1.5x visible width).
3. Requests only missing ranges.
4. Stores chunks in an LRU cache.
5. Prefetches previous/next chunks in background.

### Acceptance Criteria
- Initial chart appears without waiting for entire dataset.
- Pan/zoom does not freeze main thread.
- Visible-data cache stays under a fixed memory budget.

---

## 2) Pre-Aggregated Timeframe Storage

### Why
Runtime aggregation on every request is expensive.

### Backend Changes
At upload time, generate and store aggregates for:

- `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`

Add table `csv_aggregates` (or equivalent metadata):

- `file_id`
- `timeframe`
- `path`
- `row_count`
- `start_ts`
- `end_ts`
- `created_at`

Serve aggregate directly when `timeframe` is requested.

### Implementation Notes
- Keep 1m as source of truth.
- Build aggregates in background job right after upload.
- Show processing status in UI if job is still running.

### Acceptance Criteria
- Timeframe change should not trigger full CSV scan.
- Switching between common timeframes is consistently fast.

---

## 3) Binary Transport (Replace CSV Strings)

### Why
CSV parsing in JS is expensive for large payloads.

### Migration Path
1. **Phase 1:** JSON arrays with gzip.
2. **Phase 2:** MessagePack.
3. **Phase 3:** Apache Arrow (best throughput).

Suggested shape (columnar):

```json
{
  "t": [1710000000000, 1710000060000],
  "o": [1.09, 1.091],
  "h": [1.10, 1.094],
  "l": [1.08, 1.089],
  "c": [1.095, 1.093],
  "v": [1100, 900]
}
```

### Frontend
- Decode in a Web Worker.
- Convert to typed arrays.
- Transfer to main thread with minimal copying.

### Acceptance Criteria
- Parse/decode time significantly reduced vs CSV path.
- Main thread remains responsive during loading.

---

## 4) Chunking + Cursor Pagination

### Why
Large single responses block network, parsing, and rendering.

### Rules
- Hard cap per request (e.g. 1k to 5k candles).
- Cursor-based pagination (`next_cursor`, `prev_cursor`), not deep offset scans.
- Keep payload size bounded.

### API Behavior
- Every response returns continuation tokens.
- Client requests additional chunks only when needed.

### Acceptance Criteria
- Stable latency regardless of deep history position.
- No very large responses that block UI.

---

## 5) WebSocket Incremental Updates

### Why
Do not re-fetch large data for every new candle.

### Endpoint
`/ws/chart/{file_id}/{timeframe}`

Event types:

- `candle_update` (current open candle changed)
- `candle_close` (new candle closed)

### Replay Compatibility
- Replay can use same event schema from local simulated feed.
- Keep one rendering path for both live and replay events.

### Acceptance Criteria
- New candles append smoothly.
- No full reload for live updates.

---

## 6) Strict Server-Side Date Range Filtering

### Why
Prevent over-fetching. Respect backtest period exactly.

### Backend Requirements
- All candle endpoints accept `start_ts` and `end_ts`.
- Filtering is done server-side before transformation.
- If truncation occurs, include explicit flags (`truncated`, `available_start`, `available_end`).

### Frontend Requirements
- Backtesting session start/end must always be sent in data requests.
- Avoid loading full history unless user explicitly asks.

### Acceptance Criteria
- Returned candle timestamps always stay inside selected period.
- Date range behavior is deterministic across timeframes.

---

## Execution Plan (Project-Specific)

## Phase A - Foundation (1 to 2 days)

1. Add `/api/file/{id}/candles` range endpoint with timeframe and cursor.
2. Enforce date-range filters in backend query flow.
3. Update chart loading to send session `start_ts`/`end_ts`.

## Phase B - Performance Core (3 to 5 days)

1. Implement `ViewportDataManager` module.
2. Add cache, prefetch, chunk eviction.
3. Move decode/parse to Web Worker.

## Phase C - Scale (4 to 7 days)

1. Build upload-time aggregation pipeline.
2. Serve precomputed timeframe files by default.
3. Add websocket stream path for incremental candles.

## Phase D - Optimization (optional)

1. Migrate payload format from JSON arrays to MessagePack/Arrow.
2. Add profiling dashboard and alerts for slow endpoints.

---

## File-Level Integration Map

### Backend
- `api_server.py`
  - Keep `/api/file/{id}/smart` as fallback
  - Add `/api/file/{id}/candles`
  - Add aggregate metadata model and precompute pipeline

### Frontend
- `chart.js`
  - Initial load and timeframe switch should use viewport/range endpoints
- `modules/viewport-data-manager.js` (new)
  - Chunked loading and cache orchestration
- `workers/candle-decode.worker.js` (new)
  - Payload decode off main thread

### Backtest Setup UI
- `backtesting.html`
  - Ensure selected start/end is always persisted and passed to chart session

---

## Observability and SLO Targets

Track:

- API p50/p95 latency per endpoint and timeframe
- Payload size
- Decode/parse/render time
- Cache hit rate
- Long tasks and dropped frames

Suggested targets:

- Initial visible chart paint: < 1.5s
- Timeframe switch: < 400ms perceived
- No long UI stalls during pan/zoom

---

## Rollout Safety

1. Ship behind feature flag (`USE_VIEWPORT_LOADING=true`).
2. Keep current smart endpoint as fallback.
3. Canary with one large dataset first.
4. Compare latency and replay correctness before full rollout.

---

## Definition of Done

- [ ] 1m replay on large dataset is smooth
- [ ] Timeframe switching changes data correctly and quickly
- [ ] Date-range requests are respected exactly
- [ ] Browser memory remains bounded
- [ ] No full-dataset fetches during normal navigation

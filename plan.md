# Scalable Data Loading Plan (TradingView / FXReplay Style)

## Goal

Make chart loading and timeframe switching smooth for very large datasets (1m data over years), without browser freeze, while preserving replay accuracy.

---

## Current State (in this codebase)

- Initial backtest load uses smart endpoint with limit/timeframe from chart:
  - [autoLoadBacktestingData()](cci:1://file:///Users/hades/Documents/full%20talaria-log/chart%20v%201.4/chart/chart.js:592:4-703:5) → `/api/file/{fileId}/smart?...`
  - Reference: @chart.js#596-704
- Timeframe switching already has server-side path for large datasets:
  - [setTimeframe()](cci:1://file:///Users/hades/Documents/full%20talaria-log/chart%20v%201.4/chart/chart.js:7340:4-7412:5) + [setTimeframeServerSide()](cci:1://file:///Users/hades/Documents/full%20talaria-log/chart%20v%201.4/chart/chart.js:7414:4-7489:5)
  - Reference: @chart.js#7345-7490
- Smart API endpoint parses CSV and resamples:
  - `/api/file/{file_id}/smart`
  - Reference: @api_server.py#1449-1616

---

## Target Architecture (6 pillars)

## 1) Viewport-Based Loading (Lazy + Prefetch)

### What to build
- Load only candles needed for visible chart range + buffer.
- Add cache by `{fileId}:{timeframe}:{chunkKey}`.
- Fetch missing chunks when user pans/zooms.
- Prefetch next/prev chunks in background.

### Backend
- Add endpoint:
  - `GET /api/file/{id}/candles?timeframe=1m&start_ts=...&end_ts=...&limit=...&cursor=...`
- Response:
  ```json
  {
    "timeframe": "1m",
    "data": [...],
    "next_cursor": "...",
    "prev_cursor": "...",
    "has_more": true
  }

Frontend
New ViewportDataManager:
computes visible range from x-scale
requests missing chunks
merges sorted candles
evicts old chunks (LRU, memory cap)
Acceptance
Pan/zoom never blocks >100ms main thread.
Initial chart visible <1.5s on 700k+ rows.
2) Pre-Aggregated Timeframe Storage
What to build
On upload, generate and store pre-aggregated datasets:
1m, 5m, 15m, 30m, 1h, 4h, 1d
Serve directly for selected timeframe (no heavy runtime regrouping).
Storage options
Good: compressed CSV per timeframe
Better: Parquet/Arrow files
Best: columnar DB/object storage
Backend additions
New table: csv_aggregates
file_id, timeframe, path, row_count, start_ts, end_ts, created_at
Upload pipeline triggers background aggregation job.
Acceptance
Timeframe switch request p95 <250ms (server compute mostly eliminated).
3) Binary Transport (Not CSV/JSON strings)
Why
CSV/string parse is expensive in browser for large responses.

Plan
Phase 1: JSON arrays + gzip
Phase 2: MessagePack
Phase 3: Apache Arrow (best for large columnar candles)
Suggested payload
json
{
  "t":[...],
  "o":[...],
  "h":[...],
  "l":[...],
  "c":[...],
  "v":[...]
}
Frontend
Decode in Web Worker (not main thread).
Transfer typed arrays to chart renderer.
Acceptance
Parse/decode time reduced by >60% vs current CSV path.
4) Chunking + Cursor Pagination
What to build
Never send giant blocks.
Fixed chunk sizes (e.g. 1000–5000 candles/chunk depending timeframe).
Use cursor-based pagination, not offset for deep history scans.
API contract
limit max guarded server-side.
next_cursor and prev_cursor.
Cursor includes (timeframe, ts, direction).
Acceptance
No endpoint response >2–3 MB uncompressed.
Consistent latency when scrolling deep history.
5) WebSocket Incremental Updates
What to build
ws://.../ws/chart/{file_id}/{timeframe}
Push:
candle_update (current open candle changes)
candle_close (new completed candle)
Replay mode
Replay should use local deterministic stream (not live WS), but same event shape.
Acceptance
No full refetch per tick.
Smooth updates at 1s cadence without re-rendering full dataset.
6) Strict Server-Side Date Range Filtering
What to build
Every data request must include selected test window.
Session start/end from backtesting form always propagated.
If range not provided, return default recent window + metadata warning.
API behavior
start_ts, end_ts are first-class query params on all candle endpoints.
Enforce bounds at server before any transform/resample.
Acceptance
Requested date range matches returned min/max timestamps exactly.
No silent clipping unless explicitly flagged (truncated=true).
Execution Roadmap
Phase A (Immediate stability, 1–2 days)
Add unified candles endpoint with timeframe + start_ts + end_ts + cursor.
Ensure chart always sends selected date range from session.
Keep current smart endpoint as fallback only.
Phase B (Performance, 3–5 days)
Build ViewportDataManager + chunk cache + prefetch.
Move parsing/decoding to Web Worker.
Add telemetry: fetch latency, parse time, dropped frames.
Phase C (Scale, 4–7 days)
Background pre-aggregation at upload.
Serve precomputed timeframe files first.
Add WS streaming endpoint for incremental updates.
Phase D (Optimization, optional)
Migrate payload to Arrow/MessagePack.
Add CDN/object storage for static aggregate files.
File-Level Implementation Map
Backend
@api_server.py#1449-1616 (smart endpoint baseline)
Add new /api/file/{id}/candles endpoint
Add aggregation job + metadata endpoints
Frontend
@chart.js#596-704 (initial load path)
@chart.js#7345-7490 (timeframe switching path)
Add modules/viewport-data-manager.js
Add workers/candle-decode.worker.js
Backtest setup
Ensure selected start/end is mandatory and passed to chart URL/session config
Reference: backtesting session flow in backtesting.html
Observability & SLOs
Track:

API p50/p95 latency by endpoint/timeframe
Payload size
Client parse time
FPS / long tasks
Cache hit rate (viewport chunk cache)
Target SLO:

Initial paint <1.5s
Timeframe switch <400ms perceived
Pan/zoom no UI freeze
Risks & Mitigations
Risk: Too much memory in browser
Mitigation: LRU cache + hard cap (e.g., 50k candles in memory for active view).
Risk: Upload-time aggregation delay
Mitigation: async background jobs + status endpoint.
Risk: Data mismatch between timeframes
Mitigation: deterministic resample tests (OHLCV invariants).
Definition of Done
1m on large file no freeze
Timeframe switch changes actual candle density correctly
Date range strictly respected
Replay works with viewport loading
Load/perf metrics visible in logs/dashboard
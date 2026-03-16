# Backtesting Load Tests (k6)

This folder contains k6 scenarios to stress the scalable backtesting APIs:

- `/api/file/{id}/candles` (pan/cursor flow)
- `/api/file/{id}/tile/{tf}/{tile}` (tile streaming)

## Prerequisites

1. k6 installed locally.
2. Trading chart API running and reachable.
3. At least one dataset fully converted to binary/tile format.

## Script

- `k6-backtesting.js`

## Quick start

```bash
k6 run \
  -e BASE_URL=http://localhost:8000 \
  -e FILE_ID=1 \
  -e TIMEFRAME=1m \
  load-tests/k6-backtesting.js
```

## Tunable env vars

- `BASE_URL` (default: `http://localhost:3000`)
- `FILE_ID` (default: `1`)
- `TIMEFRAME` (default: `1m`)
- `CANDLE_LIMIT` (default: `3000`)
- `DURATION` (default: `2m`)
- `CANDLES_RPS` / `CANDLES_VUS` / `CANDLES_MAX_VUS`
- `TILES_RPS` / `TILES_VUS` / `TILES_MAX_VUS`

## Current thresholds (inside script)

- `http_req_failed < 1%`
- candles p95 `< 450ms`, p99 `< 900ms`
- tiles p95 `< 200ms`, p99 `< 500ms`

Tune these values as infra capacity and SLOs evolve.

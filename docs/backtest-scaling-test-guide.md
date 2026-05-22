# Backtest scaling — test guide (Track A & B)

How to verify debounce, rate limits, async what-if, and cache behavior. Use this after deploy or on local Docker.

---

## Prerequisites

| Requirement | Check |
|-------------|--------|
| Logged-in user with **backtest** module (paid) | Dashboard opens backtest / analytics |
| At least one **backtest session** with a few journal trades | Session list not empty |
| **Redis** running | `GET /api/status` → `"redis": "ok"` |
| Services up | `trading-chart`, `trading-chart-worker` (optional but recommended), `homepage` |

**Local Docker (from repo root):**

```bash
docker compose up -d db redis journal-backend trading-chart trading-chart-worker homepage
```

**Status check:**

```bash
curl -s http://localhost:3000/api/status
```

**Expected:**

```json
{
  "message": "Trading Chart API is running",
  "version": "1.0",
  "redis": "ok"
}
```

If `"redis": "not_configured"` or `"unavailable"`, Track B runs **synchronous** what-if only (no 202 jobs).

---

## Test structure overview

```
1. Automated (CI / dev machine)     → pytest, no browser
2. API manual (curl / DevTools)     → headers, status codes, JSON shape
3. UI manual (browser)              → Network tab, analytics panel, chart pan
4. Load / stress (optional)         → many parallel requests
```

---

## 1. Automated tests

**Where:** `chart v 1.4/chart/tests/`

| File | What it proves |
|------|----------------|
| `test_chart_redis.py` | Sliding-window rate limit + binary wake |
| `test_whatif_redis.py` | What-if enqueue, pop, cache read/write |
| `test_backtest_rate_limits.py` | Per-user what-if limit (needs FastAPI installed) |

**Run (from `chart v 1.4/chart`):**

```bash
py -m pytest tests/test_chart_redis.py tests/test_whatif_redis.py -q
```

**Expected output:**

```text
.....                                                                    [100%]
5 passed in ~1s
```

With chart venv + dependencies:

```bash
py -m pytest tests/test_backtest_rate_limits.py -q
```

**Expected:** `2 passed` (blocks 3rd request when limit=2; admin exempt).

---

## 2. Track A — API & behavior

### A1 — Session PATCH debounce (chart)

**Steps:**

1. Open backtest chart with an active session.
2. Open DevTools → **Network** → filter `state`.
3. Add several journal trades quickly or move replay / edit drawings.

**Expected:**

| Observation | Pass? |
|-------------|--------|
| Not one `PATCH /api/sessions/{id}/state` per tiny action | |
| PATCHs batched ~**1.5s** apart during rapid edits | |
| On tab switch away / close: one final PATCH (flush) | |
| Response **200** with saved state (or 429 retry, not endless 503) | |

**Failure signals:** Many PATCHs per second; nginx **503**; journal missing after refresh.

---

### A2 — What-if debounce (analytics panel)

**Steps:**

1. Open **Backtest analytics** for a session.
2. Network → filter `whatif`.
3. Rapidly change pair filter, TP/SL sliders, playbook.

**Expected:**

| Observation | Pass? |
|-------------|--------|
| ~**one** `POST .../whatif` (or job flow) per ~450ms burst, not per mousemove | |
| Cancelled requests show as canceled when you change filter again | |

---

### A3 — `/smart` client cache

**Steps:**

1. Open backtest chart (loads `GET /api/file/{id}/smart?...`).
2. Note the same URL (same `file_id`, `timeframe`, `anchor`, `start_ts`, `end_ts`).
3. Change symbol away and back, or reload same view without hard refresh.

**Expected:**

| Observation | Pass? |
|-------------|--------|
| Second identical `/smart` may be **from memory** (no network) or very fast 200 | |
| Chart data still correct vs candles | |

*(Hard to see in Network if served from in-memory cache — optional test.)*

---

### A4 — Per-user rate limits

**Tune down for testing (trading-chart env):**

```env
BACKTEST_WHATIF_RATE_PER_MINUTE=3
BACKTEST_SMART_RATE_PER_MINUTE=5
BACKTEST_SESSION_PATCH_RATE_PER_MINUTE=5
```

Restart `trading-chart`, then exceed limit (e.g. 4 what-if POSTs in 1 minute).

**Expected HTTP response:**

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
Content-Type: application/json

{"detail":"Too many requests. Please try again in a minute."}
```

| Endpoint | When limited |
|----------|----------------|
| `POST /api/analytics/backtest/whatif` | > N/min per user |
| `GET /api/file/{id}/smart` | > N/min per user |
| `PATCH /api/sessions/{id}/state` | > N/min per user |

**Admin users:** should **not** be limited.

---

## 3. Track B — Async what-if & cache

### B1 — POST what-if: three paths

Use DevTools or curl with session cookie.

**Request body (example):**

```json
{
  "session_id": 123,
  "pair_filter": "ALL",
  "playbook_filter": "ALL",
  "strategy_filter": "ALL",
  "outcome_filter": "ALL",
  "heatmap_pair": "ALL",
  "tp_r": 1.5,
  "sl_r": 1.0
}
```

#### Path 1 — Cache miss → async job

**When:** Redis OK, `BACKTEST_WHATIF_ASYNC=true`, first time for this filter set.

**Expected:**

```http
HTTP/1.1 202 Accepted
Content-Type: application/json

{"job_id":"<url-safe-token>","status":"queued"}
```

Then poll:

```http
GET /api/analytics/backtest/whatif/jobs/{job_id}
```

**While running:**

```json
{"job_id":"...","status":"queued"}
```

or

```json
{"job_id":"...","status":"running"}
```

**When done:**

```json
{
  "job_id": "...",
  "status": "done",
  "result": {
    "meta": { "session_id": 123, "tp_r": 1.5, "sl_r": 1.0, "trades_in_scope": 42, ... },
    "equity_curve": [ ... ],
    "heatmap": { "flat": [ ... ] },
    "per_instrument": [ ... ],
    "mae_distribution": { ... },
    "mfe_distribution": { ... },
    "stats": { ... },
    "playbook_breakdown": [ ... ],
    "recent_trades": [ ... ],
    "equity_summary": { ... },
    "session_analytics": { ... }
  }
}
```

**UI:** Analytics charts populate after polling finishes (may take 0.5–3s depending on journal size).

---

#### Path 2 — Cache hit → immediate 200

**When:** Same session + same filters + same `tp_r`/`sl_r` + journal **not** changed since last compute.

**Expected:**

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

Body is the **full result object** directly (same shape as `result` above), **not** wrapped in `{ job_id }`.

**No** `GET .../jobs/...` calls in Network tab.

---

#### Path 3 — Sync fallback

**When:** `BACKTEST_WHATIF_ASYNC=false` **or** Redis down.

**Expected:**

```http
HTTP/1.1 200 OK
```

Full JSON body immediately (no 202, no polling).

---

### B2 — Cache invalidation after journal change

**Steps:**

1. Run what-if with filters A → wait for result (cache warm).
2. Repeat same filters → **200** cache hit (fast).
3. Add or edit a journal trade on chart (PATCH session).
4. Run same what-if again.

**Expected:**

| Step | HTTP |
|------|------|
| After journal change | **202** + poll again (new `journal_version` in cache key) |
| Same filters, no new trades | **200** cache hit |

---

### B3 — Job failure shape

Force failure (e.g. invalid `session_id` in job record — only for dev debugging).

**Expected:**

```json
{
  "job_id": "...",
  "status": "failed",
  "error": "Session not found"
}
```

**UI:** Analytics panel shows error text (not empty charts).

---

### B4 — Frontend polling (browser)

**Steps:**

1. Analytics open, throttle Network to **Fast 3G** (optional).
2. Change filter to force new what-if.

**Expected sequence:**

```text
POST /api/analytics/backtest/whatif     → 202
GET  .../whatif/jobs/{id}               → status queued|running
GET  .../whatif/jobs/{id}               → status queued|running  (repeat)
GET  .../whatif/jobs/{id}               → status done + result
```

Poll interval: ~280ms → up to ~1s backoff (see `fetchBacktestWhatIf` in `SessionAnalyticsPanel.tsx`).

**Timeout:** After ~90 polls, UI error: `What-if analysis timed out`.

---

## 4. Chart overlay pan (not Track A/B, related fix)

**Steps:**

1. Draw a rectangle or take a trade (markers on chart).
2. **Drag** chart horizontally (pan).

**Expected:**

| During drag | On mouse release |
|-------------|------------------|
| Drawings and trade marks move **with** candles | No visible “snap” correction |
| No floating shapes in empty grid area | Positions stay aligned |

**Failure:** Shapes/markers lag, then jump back on release → pan sync regression.

---

## 5. Optional load smoke test

**Goal:** API stays responsive under many what-if requests.

**Example (replace cookie and session id):**

```bash
# 10 parallel what-if POSTs — expect mix of 202 and eventually 429 if rate limit low
for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:3000/api/analytics/backtest/whatif \
    -H "Content-Type: application/json" \
    -b "chart_session_id=YOUR_SESSION_COOKIE" \
    -d '{"session_id":123,"pair_filter":"ALL","playbook_filter":"ALL","strategy_filter":"ALL","outcome_filter":"ALL","heatmap_pair":"ALL","tp_r":1.5,"sl_r":1.0}' &
done
wait
```

**Healthy output:** Mostly `202` or `200`; some `429` if limits tuned low; **not** mostly `503`.

---

## 6. Track C — Journal-first (SQL)

### C1 — GET state hydrates journal from SQL

**Steps:**

1. Open backtest chart (loads `GET /api/sessions/{id}/state`).
2. In DB or admin tools, confirm `trading_session_journal_trades` has rows for that session.

**Expected JSON (excerpt):**

```json
{
  "state": {
    "journal": [ { "tradeId": "...", "ticker": "EURUSD", ... } ],
    "journal_storage": "sql",
    "journal_count": 42,
    "drawings": [ ... ]
  }
}
```

After a PATCH that saves trades, `state_json` in Postgres should **not** contain a large `journal` array (when `SESSION_STRIP_JOURNAL_FROM_STATE_JSON=true`). GET still returns full `journal` for the chart.

---

### C2 — PATCH response size

**Steps:**

1. Save journal from chart (PATCH).
2. Note response: `{ "success": true, "size_bytes": N }`.

**Expected:** `size_bytes` much smaller than before Track C when journal had screenshots (often **&lt; 500 KB** for typical sessions without embedding journal in blob).

---

### C3 — Backfill script (one-time / staging)

```bash
cd "chart v 1.4/chart"
set DATABASE_URL=postgresql://user:pass@host:5432/talaria
py scripts/backfill_session_journal_sql.py --dry-run
py scripts/backfill_session_journal_sql.py --strip
```

**Expected output:**

```text
scanned=120 backfill_candidates=45 stripped=45 dry_run=False
```

---

### C4 — Trade limit

Set `MAX_JOURNAL_TRADES_PER_SESSION=3`, restart API, PATCH a journal with 4 trades.

**Expected:**

```http
HTTP/1.1 413
{"detail":"Too many journal trades (4). Maximum per session is 3. ..."}
```

---

## 7. Sign-off checklist

Copy into your release notes when staging passes:

| # | Test | Pass |
|---|------|------|
| 1 | `pytest` redis + whatif tests | ☐ |
| 2 | `/api/status` redis ok | ☐ |
| 3 | What-if: 202 → poll → done with `equity_curve` | ☐ |
| 4 | What-if: repeat → 200 cache (no poll) | ☐ |
| 5 | What-if: after journal edit → 202 again | ☐ |
| 6 | Rapid analytics filters → debounced POSTs | ☐ |
| 7 | Session save → debounced PATCH, flush on tab hide | ☐ |
| 8 | Chart pan → drawings + marks stay aligned | ☐ |
| 9 | 429 returns `Retry-After` when over limit (optional) | ☐ |

---

## Quick reference — env vars

| Variable | Default | Effect |
|----------|---------|--------|
| `BACKTEST_WHATIF_ASYNC` | `true` | 202 jobs vs always sync |
| `BACKTEST_WHATIF_CACHE_TTL_SEC` | `900` | Result cache TTL |
| `BACKTEST_WHATIF_DRAIN_ON_API` | `true` | API process runs job worker thread |
| `BACKTEST_WHATIF_RATE_PER_MINUTE` | `30` | Per-user what-if limit |
| `BACKTEST_SMART_RATE_PER_MINUTE` | `90` | Per-user `/smart` limit |
| `BACKTEST_SESSION_PATCH_RATE_PER_MINUTE` | `25` | Per-user PATCH limit |

---

## QuestDB historical data (bar-budget architecture)

After enabling QuestDB in Docker (`questdb` service + `QUESTDB_*` env on `trading-chart`):

**Status check:**

```bash
curl -s http://localhost:3000/api/status
```

**Expected (when QuestDB is up):**

```json
{
  "message": "Trading Chart API is running",
  "redis": "ok",
  "questdb": "ok",
  "questdb_read_primary": false
}
```

**Backfill existing CSV datasets:**

```bash
docker compose exec trading-chart-worker python3 scripts/migrate_csv_to_questdb.py
```

**Seek test (doc §5):** request a 2022 window — should return in ms, not scan from 2010:

```bash
curl -s "http://localhost:3000/api/file/FILE_ID/bars?from=1640995200000&to=1643673600000&resolution=auto"
```

**Rollout flags:**

| Variable | Default | Effect |
|----------|---------|--------|
| `QUESTDB_ENABLED` | `true` (compose) | Dual-write on binary build |
| `QUESTDB_READ_PRIMARY` | `false` | Serve reads from QuestDB first |
| `QUESTDB_TILES_FALLBACK` | `true` | Fall back to tile/CSV when QuestDB empty |

**Admin single-dataset sync:** `POST /api/admin/datasets/{file_id}/questdb-sync?force=false`

**If `talaria-questdb-1 is unhealthy`:** older compose used `curl` in the healthcheck, but the QuestDB image has no `curl`. Pull latest `docker-compose.yml` (bash `/dev/tcp` check on port 8812), then:

```bash
docker compose up -d questdb
docker compose ps questdb
docker compose logs questdb --tail 50
# Once questdb is up:
docker compose up -d trading-chart trading-chart-worker
docker compose exec trading-chart-worker python3 scripts/migrate_csv_to_questdb.py
```

To run without QuestDB temporarily: `QUESTDB_ENABLED=false docker compose up -d trading-chart trading-chart-worker`

---

## Related files

- Checklist: [backtest-scaling-checklist.md](./backtest-scaling-checklist.md)
- Backend: `homepage/src/app/dashboard/analytics/backend/backtest_whatif.py`, `api_server.py`, `chart_redis.py`
- Frontend: `homepage/src/app/dashboard/backtest/SessionAnalyticsPanel.tsx`

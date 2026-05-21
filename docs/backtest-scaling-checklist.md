# Backtest scaling — implementation checklist

Plan to support many concurrent backtest users: stable chart loads, reliable session saves, fair usage, and room to grow.

**Recommended order:** Track A → Track B → Track C (use Phase 0 metrics to confirm each step).

**How to test:** see [backtest-scaling-test-guide.md](./backtest-scaling-test-guide.md) (steps + expected HTTP/UI output).

| Track | Focus | Main win |
|-------|--------|----------|
| **A** | Debounce + rate limits + client cache | Fewer request storms, fair usage |
| **B** | Async what-if + Redis result cache | API stays responsive under analytics load |
| **C** | Journal in SQL, lean `state_json` | Smaller/faster PATCH, healthier Postgres |

**Powerful long-term shape:** shared immutable market data (tiles/CDN) + async cached analytics + debounced small session writes + per-user rate limits + horizontal API/worker replicas — replay stays in the browser.

---

## Phase 0 — Baseline (before or parallel with Track A)

- [ ] Define SLO (e.g. 50 concurrent backtest users, p95 `/smart` &lt; 500ms, p95 PATCH &lt; 2s, max 503 rate)
- [ ] Log duration + `user_id` + route + response size on hot endpoints
- [ ] Log binary job queue depth and time-to-ready
- [ ] Run simple load test (20–50 parallel `/smart` + PATCH) and save baseline numbers
- [ ] Document current deploy: API workers, worker replicas, Redis/Postgres disk

---

## Track A — Debounce + rate limits (stability first)

### A1 — Frontend: session saves

- [x] Find all callers of `PATCH /api/sessions/{id}/state` (chart `scheduleSessionStateSave`, `propfirm-tracker.js`, replay sync)
- [x] Increase debounce to **4s** trailing (`_sessionStateSaveDebounceMs`) — was 1.5s / 800ms
- [x] Replay PATCH throttled (`scheduleReplaySessionStateSave`, 8s interval while playing; flush on pause/exit)
- [x] Add flush on `pagehide` + **`visibilitychange` (hidden)** with timer cancel
- [ ] Add flush before navigation away from backtest route (Next.js dashboard)
- [ ] Show subtle “Saving…” / “Saved” UI so users know state is pending
- [x] Chart already serializes PATCH (single-flight); 429 backoff retries pending patch
- [ ] Verify no duplicate PATCH storms when replay adds many journal entries quickly

### A2 — Frontend: what-if analytics

- [x] Locate what-if `useEffect` in `SessionAnalyticsPanel`
- [x] Debounce filter changes (**450ms**)
- [x] Cancel in-flight fetch (`AbortController`)
- [ ] Avoid refetch on unrelated `dataReloadKey` unless journal actually changed
- [ ] Manual test: drag sliders fast → at most ~1 request per debounce window

### A3 — Frontend: chart `/smart` cache (optional but recommended)

- [x] Cache key via `_smartCacheKeyFromParams` (`file_id|query`)
- [x] TTL **120s**, LRU max **8** entries; non-destructive read in `_fetchSmartWindowWithParams`
- [x] Used by all `_fetchSmartWindowWithParams` callers (incl. backtest load)
- [ ] Verify backtest open doesn’t refetch identical window on remount

### A4 — Backend: per-user rate limits (Redis)

- [x] Env: `BACKTEST_SMART_RATE_PER_MINUTE` (90), `BACKTEST_WHATIF_RATE_PER_MINUTE` (30), `BACKTEST_SESSION_PATCH_RATE_PER_MINUTE` (60)
- [x] `_backtest_user_rate_allow` / `_enforce_backtest_user_rate` in `api_server.py`
- [x] Limit on `GET /api/file/{file_id}/smart`
- [x] Limit on `POST /api/analytics/backtest/whatif`
- [x] Limit on `PATCH /api/sessions/{id}/state`
- [x] Return `429` + `Retry-After: 60`
- [x] Exempt `admin` role
- [x] Fallback to in-memory limiter when Redis down
- [x] Tests: `chart v 1.4/chart/tests/test_backtest_rate_limits.py`

### A5 — Track A verification

- [ ] Load test again; compare p95 PATCH and what-if vs Phase 0 baseline
- [ ] Confirm no increase in 503 from nginx on `/api/`
- [ ] Document limits in admin or internal runbook
- [ ] Deploy to staging → smoke test backtest open, save journal, analytics panel

---

## Track B — Async what-if + Redis cache (API relief)

### B1 — Design & API contract

- [x] Job model: `job_id`, statuses `queued | running | done | failed`
- [x] `POST /api/analytics/backtest/whatif` → **202** `{ job_id, status }` when async; **200** sync/cache hit
- [x] `GET /api/analytics/backtest/whatif/jobs/{job_id}`
- [x] Sync fallback when `BACKTEST_WHATIF_ASYNC=false` or Redis unavailable
- [x] Cache key: SHA256 of session + filters + `tp_r`/`sl_r` + `journal_version` (`state.updated_at`)
- [x] Cache TTL **900s** (`BACKTEST_WHATIF_CACHE_TTL_SEC`)

### B2 — Backend: job queue

- [x] Redis lists `chart:whatif:queue` + wake (`chart_redis.py`)
- [x] Job payload in `chart:whatif:job:{id}`
- [x] Worker + API drain (`trading-chart-worker` + `BACKTEST_WHATIF_DRAIN_ON_API`)
- [x] Compute in `backtest_whatif.py` / `_execute_whatif_job_record`
- [x] Failures → `status: failed` + `error` on job record
- [ ] Job timeout for huge journals (optional hard limit)

### B3 — Backend: cache layer

- [x] Cache check on POST before enqueue
- [x] Cache write on job complete
- [x] Invalidate via `journal_version` in cache key (PATCH updates `updated_at`)
- [x] Skip cache when result &gt; `BACKTEST_WHATIF_MAX_RESULT_BYTES`

### B4 — Frontend: async client

- [x] `fetchBacktestWhatIf()` polls job endpoint with backoff
- [ ] Dedicated loading skeleton for `queued | running`
- [x] Job `failed` → error message in panel
- [x] Abort on unmount / filter change (Track A debounce + `AbortController`)
- [ ] Optional: WebSocket completion

### B5 — Ops & scale

- [x] Worker processes what-if (same `trading-chart-worker` loop)
- [x] Env vars in `docker-compose.yml`
- [ ] Monitor queue depth + job duration
- [ ] Load test: 50 concurrent what-if jobs
- [x] Rollback: `BACKTEST_WHATIF_ASYNC=false`

### B6 — Track B verification

- [ ] p95 what-if perceived latency acceptable (poll + compute)
- [ ] API CPU drops under what-if-heavy load vs baseline
- [ ] Cache hit rate logged (optional)
- [ ] Staging smoke test

---

## Track C — Journal-first session model (DB relief)

### C1 — Data model & sync rules

- [x] `TradingSessionJournalTrade.payload_json` stores full trade dict (what-if / UI fields)
- [x] Source of truth: **journal → SQL**; **drawings/replay/chart → `state_json`** (`session_journal_store.py`)
- [x] PATCH: upsert SQL from `payload.journal` (idempotent `client_trade_id`)
- [x] GET `/state`: hydrate `journal` from SQL (+ legacy backfill on first read)
- [x] Script: `chart v 1.4/chart/scripts/backfill_session_journal_sql.py`

### C2 — Shrink `state_json`

- [x] `SESSION_STRIP_JOURNAL_FROM_STATE_JSON=true` — journal not persisted in blob after PATCH/import
- [x] Drawings, replay, orders, chart prefs remain in `state_json`
- [ ] Verify PATCH **stored** size drops on staging (Network: response `size_bytes`)
- [x] 4 MB / 16 MB limits unchanged

### C3 — What-if & analytics read from SQL

- [x] `_compute_backtest_whatif_for_session` uses `resolve_session_journal` (SQL first)
- [x] `GET /api/sessions/{id}/analytics` uses SQL journal
- [x] Filters unchanged (same trade payload shape)
- [x] Indexes on `session_id`, `user_id` (existing model)

### C4 — Guardrails & housekeeping

- [x] `MAX_JOURNAL_TRADES_PER_SESSION` (default 5000) → **413** on PATCH/import
- [ ] Max drawings cap (optional, not implemented)
- [ ] Archive stale sessions (existing admin paths — document only)
- [ ] Cron for inactive sessions (not implemented)
- [ ] Monitor table sizes on staging

### C5 — Frontend alignment

- [x] Chart PATCH unchanged; server writes SQL + strips blob journal
- [x] `GET /api/journal-trades` already SQL-backed
- [x] Legacy JSON-only sessions backfill on first GET/what-if

### C6 — Track C verification

- [ ] Compare average PATCH body size before/after
- [ ] p95 PATCH latency improved vs Phase 0
- [ ] what-if results identical on sample sessions (JSON vs SQL path)
- [ ] No data loss on backfill migration (spot-check 10 sessions)
- [ ] Staging soak test: create session → 500+ trades → save → reload → analytics

---

## Cross-track — ship order & final gate

### Recommended order

- [ ] **Track A** complete and verified
- [ ] **Track B** complete and verified
- [ ] **Track C** complete and verified

### Optional Phase 2 (after A–C)

- [ ] Enable `TILE_CDN_REDIRECT` / object storage for tiles
- [ ] Scale `trading-chart` to N replicas + shared volume/S3
- [ ] Add PgBouncer
- [ ] Tier limits in Stripe plans (`max_sessions`, max trades, rate limits per plan)

### Production readiness (all tracks done)

- [ ] SLO met on load test
- [ ] Runbook: rate limits, queue depth, rollback flags
- [ ] Alerts: 429 rate, 503 rate, job failures, disk &gt; 80%
- [ ] Changelog / support note for users (if limits affect UX)

---

## What not to do early

- Don’t duplicate OHLC datasets per user (keep shared `csv_files` + tiles).
- Don’t move chart replay to the server (unless adding automated strategy backtests).
- Don’t add more Gunicorn workers than CPU without measuring.
- Don’t weaken auth, CSRF, or rate limits to fix load (fix config and scope instead).

---

## Key code locations

| Area | Path |
|------|------|
| Chart API, sessions, what-if, tiles | `chart v 1.4/chart/api_server.py` |
| What-if compute + cache keys | `homepage/src/app/dashboard/analytics/backend/backtest_whatif.py` |
| Journal SQL primary + strip blob | `chart v 1.4/chart/session_journal_store.py` |
| Backfill script | `chart v 1.4/chart/scripts/backfill_session_journal_sql.py` |
| Redis rate limits + binary/whatif queues | `chart v 1.4/chart/chart_redis.py` |
| What-if UI | `homepage/src/app/dashboard/backtest/SessionAnalyticsPanel.tsx` |
| Backtest chart load | `homepage/public/chart/chart.js` (`autoLoadBacktestingData`, `_fetchSmartWindow`) |
| Docker / workers | `docker-compose.yml`, `chart v 1.4/chart/Dockerfile.local` |
| Nginx API timeouts | `homepage/nginx.conf` |

---

## Progress summary

| Phase / Track | Status |
|---------------|--------|
| Phase 0 — Baseline | ⬜ Not started |
| Track A | 🟡 In progress (A1–A4 coded; A5 verify pending) |
| Track B | 🟡 In progress (B1–B5 coded; B6 verify pending) |
| Track C | 🟡 In progress (C1–C5 coded; C6 verify pending) |
| Optional Phase 2 | ⬜ Not started |
| Production readiness | ⬜ Not started |

_Update the table above as you complete each section._

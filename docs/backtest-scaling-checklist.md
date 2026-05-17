# Backtest scaling — implementation checklist

Plan to support many concurrent backtest users: stable chart loads, reliable session saves, fair usage, and room to grow.

**Recommended order:** Track A → Track B → Track C (use Phase 0 metrics to confirm each step).

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
- [x] Increase debounce to **1.5s** (`_sessionStateSaveDebounceMs`) — was 800ms
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

- [x] Env: `BACKTEST_SMART_RATE_PER_MINUTE` (90), `BACKTEST_WHATIF_RATE_PER_MINUTE` (30), `BACKTEST_SESSION_PATCH_RATE_PER_MINUTE` (25)
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

- [ ] Decide job model: `job_id`, statuses `queued | running | done | failed`
- [ ] Define `POST /api/analytics/backtest/whatif` → `{ job_id }` (202 Accepted)
- [ ] Define `GET /api/analytics/backtest/whatif/jobs/{job_id}`
- [ ] Keep sync endpoint behind flag OR remove after migration (`WHATIF_ASYNC_ONLY=true`)
- [ ] Define cache key: hash(`session_id`, filters, `tp_r`, `sl_r`, journal version / `updated_at`)
- [ ] Set cache TTL (e.g. 5–15 minutes)

### B2 — Backend: job queue

- [ ] Add Redis list or stream for what-if jobs (mirror `binary_wake` pattern in `chart_redis.py`)
- [ ] Serialize job payload (session_id, filters, user_id, cache key)
- [ ] Worker consumes jobs: `APP_ROLE=analytics` or extend `trading-chart-worker`
- [ ] Run existing what-if logic inside worker; store result in Redis (`SET` + TTL) or Postgres JSON column
- [ ] Handle failures: store error message, mark `failed`, don’t poison queue
- [ ] Job timeout (e.g. 60–120s) for huge journals

### B3 — Backend: cache layer

- [ ] On job submit: check Redis cache → if hit, return `done` + payload immediately (no queue)
- [ ] On job complete: write cache before marking `done`
- [ ] Invalidate cache on session journal PATCH (or bump journal `updated_at` in key)
- [ ] Cap cached payload size; skip cache if result &gt; N MB

### B4 — Frontend: async client

- [ ] Update `SessionAnalyticsPanel` to POST job → poll `GET .../jobs/{id}` every 500ms–1s (with backoff)
- [ ] Show loading skeleton while `queued | running`
- [ ] Surface job `failed` error in UI
- [ ] Cancel polling on unmount / filter change (keep debounce from Track A)
- [ ] Optional: reuse WebSocket for job completion instead of polling

### B5 — Ops & scale

- [ ] Add `trading-chart-analytics` worker replica count in `docker-compose.yml` (or scale existing worker)
- [ ] Monitor queue depth + job duration
- [ ] Load test: 50 concurrent what-if jobs; API workers should stay responsive
- [ ] Document rollback: flip flag to sync what-if if queue breaks

### B6 — Track B verification

- [ ] p95 what-if perceived latency acceptable (poll interval + compute time)
- [ ] API CPU drops under what-if-heavy load vs baseline
- [ ] Cache hit rate logged (optional metric)
- [ ] Staging + production deploy checklist complete

---

## Track C — Journal-first session model (DB relief)

### C1 — Data model & sync rules

- [ ] Confirm `TradingSessionJournalTrade` has all fields what-if / journal UI need
- [ ] Document single source of truth: **journal trades → SQL**; **drawings/UI chrome → `state_json`**
- [ ] On PATCH state: upsert journal rows from `state.journal` (idempotent by `client_trade_id`)
- [ ] On GET session: optionally hydrate `state.journal` from SQL for backward compatibility (transition)
- [ ] Migration script: backfill SQL journal from existing `state_json` for active sessions

### C2 — Shrink `state_json`

- [ ] Stop writing full journal into `state_json` once SQL is authoritative (feature flag)
- [ ] Keep drawings, layout, replay position, chart prefs in `state_json`
- [ ] Verify PATCH payload size drops (target: most PATCHs &lt; 100–500 KB)
- [ ] Soft/hard limits (4 MB / 16 MB) still enforced — should rarely hit now

### C3 — What-if & analytics read from SQL

- [ ] Change what-if handler to load trades from `TradingSessionJournalTrade` (not only `state_json`)
- [ ] Align `/api/sessions/{id}/journal-trades` with chart journal UI
- [ ] Ensure filters (pair, playbook, strategy) work on SQL-backed payloads
- [ ] Index check: `(session_id)`, `(user_id, session_id)` — add if slow queries appear

### C4 — Guardrails & housekeeping

- [ ] Enforce `MAX_JOURNAL_TRADES_PER_SESSION` (env + API 413/400 with clear message)
- [ ] Enforce max drawings count or size in `state_json` (optional)
- [ ] Run/admin document archive stale sessions (`SESSION_ARCHIVE_DIR` in `api_server.py`)
- [ ] Cron or admin endpoint: archive sessions inactive &gt; N days
- [ ] Monitor Postgres table size: `trading_session_states` vs `trading_session_journal_trades`

### C5 — Frontend alignment

- [ ] Chart journal save: PATCH still works but server persists trades to SQL
- [ ] Journal dashboard / `TradesView` uses SQL-backed list APIs where possible
- [ ] Handle migration: old sessions with journal only in JSON still load once (backfill on read)

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
| Redis rate limits + binary wake | `chart v 1.4/chart/chart_redis.py` |
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
| Track B | ⬜ Not started |
| Track C | ⬜ Not started |
| Optional Phase 2 | ⬜ Not started |
| Production readiness | ⬜ Not started |

_Update the table above as you complete each section._

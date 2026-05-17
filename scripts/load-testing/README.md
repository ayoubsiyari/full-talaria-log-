# Talaria k6 load tests

**Start with `load_test.js`** — same structure as your working `C:\Users\user\Desktop\Talaria\load_test.js`, plus `/api/status` and optional `/api/file/{id}/smart`.

Default target: **http://31.97.192.82:3000/**

## Run from your Talaria folder (easiest)

Copy the file:

```powershell
copy C:\Users\user\Desktop\talaria1\full-talaria-log--main\scripts\load-testing\load_test.js C:\Users\user\Desktop\Talaria\load_test.js
cd C:\Users\user\Desktop\Talaria
k6 run load_test.js
```

### 200 or 500 concurrent users (stress)

Copy the updated `load_test.js` to your Talaria folder, then:

**200 VUs (~12 min):**

```powershell
cd C:\Users\user\Desktop\Talaria
$env:K6_VUS_MAX = "200"
$env:K6_FILE_ID = "36"
k6 run load_test.js
```

**500 VUs (~16 min):**

```powershell
$env:K6_VUS_MAX = "500"
$env:K6_FILE_ID = "36"
k6 run load_test.js
```

Ramp is gradual (50 → 100 → 200 → peak), not an instant jump to 500.

At high load, **429** on `/smart` is normal (rate limits). Watch **`http_req_failed`** (&lt; 10–15%) and **p(95)** — not the custom `errors` rate alone.

Optional chart dataset (if auto-discovery fails):

```powershell
$env:K6_FILE_ID = "36"
k6 run load_test.js
```

## Install k6 (Windows)

```powershell
choco install k6
# or: winget install k6 --source winget
```

Verify: `k6 version`

## Quick smoke (5 users, 1 minute)

From repo root:

```powershell
cd C:\Users\user\Desktop\talaria1\full-talaria-log--main

$env:K6_BASE_URL = "http://31.97.192.82:3000"
$env:K6_SCENARIO = "smoke"
k6 run scripts/load-testing/talaria-k6.js
```

**Pass:** `http_req_failed` &lt; 2%, p95 &lt; 3s, few `talaria_server_errors`.

## Realistic launch test (~50 concurrent) — recommended

Matches [docs/backtest-scaling-checklist.md](../../docs/backtest-scaling-checklist.md) SLO (~50 users).

```powershell
$env:K6_BASE_URL = "http://31.97.192.82:3000"
$env:K6_SCENARIO = "realistic"
$env:K6_VUS_MAX = "50"
k6 run scripts/load-testing/talaria-k6.js
```

**Target thresholds (script defaults):**

| Metric | Goal |
|--------|------|
| `http_req_failed` | &lt; 5% |
| `talaria_sla_pass` | &gt; 80% (responses ≤ 5s) |
| `talaria_smart_duration` p95 | &lt; 3s |
| `talaria_rate_limited` | some 429s OK under stress |

## Backtest-heavy (chart API only)

Uses mostly `/api/file/.../smart`. Optional login applies per-user rate limits like production.

```powershell
$env:K6_BASE_URL = "http://31.97.192.82:3000"
$env:K6_SCENARIO = "backtest"
$env:K6_VUS_MAX = "50"
$env:K6_TEST_EMAIL = "your-loadtest-user@example.com"
$env:K6_TEST_PASSWORD = "your-password"
# Optional: force one dataset ID from your VPS
# $env:K6_FILE_ID = "36"
k6 run scripts/load-testing/talaria-k6.js
```

Use a **dedicated test account** (not admin). Expect **429** once you exceed per-user smart limits — that is protection working, not necessarily failure.

## Stress / find breaking point (ramp to 500)

Same style as your previous run, but with **staged ramp** and **separate metrics**:

```powershell
$env:K6_BASE_URL = "http://31.97.192.82:3000"
$env:K6_SCENARIO = "stress"
$env:K6_VUS_MAX = "500"
k6 run scripts/load-testing/talaria-k6.js
```

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `K6_BASE_URL` | `http://31.97.192.82:3000` | Site root |
| `K6_SCENARIO` | `realistic` | `smoke` \| `realistic` \| `backtest` \| `stress` |
| `K6_VUS_MAX` | `50` (realistic/backtest) / `500` (stress) | Peak VUs |
| `K6_TEST_EMAIL` | — | Login email (optional) |
| `K6_TEST_PASSWORD` | — | Login password (optional) |
| `K6_FILE_ID` | auto from `/api/files` | Single dataset for `/smart` |
| `K6_TIMEOUT` | `15s` | Request timeout (avoid clustering at 10s) |
| `K6_THINK_MIN` / `K6_THINK_MAX` | `0.5` / `2` | Pause between iterations (seconds) |

## How to read results (vs your old script)

| Old / confusing | New metric |
|-----------------|------------|
| `errors` 71% | Use **`talaria_sla_pass`** (slow &gt; 5s) + **`http_req_failed`** (real failures) |
| All 429 = fail | **`talaria_rate_limited`** — expected under hammering |
| p95 = 10s | Often k6 **timeout**; this script uses **15s** default so p95 is more honest |

## While the test runs (VPS SSH)

```bash
docker stats --no-stream
docker compose logs -f --tail=50 trading-chart
```

Watch CPU, memory, and Postgres/Redis containers.

## HTML report (optional)

```powershell
k6 run --out json=scripts/load-testing/results.json scripts/load-testing/talaria-k6.js
# k6 cloud or grafana — see k6.io/docs
```

## Security note

Do not commit real passwords. Set env vars only in your shell. Run load tests only on **your** VPS with permission — avoid hammering production during live user hours.

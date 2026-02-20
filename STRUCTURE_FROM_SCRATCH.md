# Talaria - Structure From Scratch (Source of Truth)

This document is the canonical structure to avoid the current "maze".

## 1) Runtime architecture (single entrypoint)

- Public entrypoint: `http://localhost:3000` (homepage nginx)
- Nginx routes traffic by path prefix:
  - `/` -> homepage static export (`homepage/out`)
  - `/api/*` -> `trading-chart` (FastAPI)
  - `/chart/*` -> `trading-chart` static chart assets/pages
  - `/journal/api/*` -> `journal-backend` (Flask)
  - `/journal/*` -> `journal-frontend` (React SPA)

## 2) Service ownership (strict boundaries)

### A. `trading-chart` (`chart v 1.4/chart`)
Owns:
- Chart UI pages and JS modules
- Session/backtesting APIs
- Dataset management APIs
- Chart authentication (`/api/auth/*`) via cookie session
- SQLite (`/app/db/chart_data.db`) and uploads/bin storage (`/app/uploads`)

### B. `homepage` (`/homepage`)
Owns:
- Public marketing pages
- `/login` UI used for chart session login
- Dashboard shell pages (`/dashboard/*`) that call chart auth/API
- Reverse-proxy gateway config (`homepage/nginx.local.conf`)

### C. `journal-frontend` + `journal-backend`
Own only journal product under `/journal/*` and `/journal/api/*`.
Do not mix these APIs with chart dashboard paths.

## 3) Auth model (must stay simple)

- Chart/dashboard auth: `/api/auth/login` + cookie `chart_session_id`
- Chart protected areas:
  - `/dashboard/*`
  - `/chart/*`
  - `/api/*` (except public auth/status endpoints)
- Journal auth is separate and should be used only inside `/journal/*`.

## 4) Request ownership table

| Path | Owner | Notes |
|---|---|---|
| `/` | homepage static | Public landing |
| `/login/` | homepage UI + chart auth API | Login posts to `/api/auth/login` |
| `/dashboard/*` | homepage pages + chart auth checks | Admin links/tabs resolved by role from `/api/auth/me` |
| `/chart/*` | trading-chart | Chart static pages/assets |
| `/api/*` | trading-chart | Sessions, datasets, chart auth |
| `/journal/*` | journal-frontend | Separate SPA |
| `/journal/api/*` | journal-backend | Separate backend/JWT flow |

## 5) Code layout to keep

- `docker-compose.yml` -> orchestration only
- `homepage/nginx.local.conf` -> path router (single source of routing truth)
- `homepage/src/app/**` -> homepage and dashboard UI
- `chart v 1.4/chart/api_server.py` -> chart backend, chart auth, datasets
- `journal-backend/**` -> journal API only
- `journal-frontend/**` -> journal UI only

## 6) Anti-maze rules

1. Never call `/journal/api/*` from `/dashboard/*` unless explicitly building journal-in-dashboard feature.
2. Never use journal JWT localStorage as chart dashboard session source.
3. Any protected chart/dashboard redirect must include `?next=`.
4. Keep admin dataset URL stable:
   - `/dashboard/admin/datasets/` -> `/chart/admin-datasets.html`.
5. Keep one path router source: `homepage/nginx.local.conf`.

## 7) What was corrected now

- Swark diagram replaced with real runtime architecture.
- Legacy `/backtest` nginx hard-redirect to `/chart/sessions.html` removed so Next route can serve session dashboard flow.

If you want, next step I can apply a **phase-2 cleanup** to remove old mixed auth code from remaining homepage pages (`/`, `/bootcamp`, `/register`) and align everything on one chart-session strategy for `/dashboard/*`.

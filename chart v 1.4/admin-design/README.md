# Talaria Admin (HeroUI)

React 19 + HeroUI v3 admin dashboard. Replaces the legacy `admin-dashboard.legacy.html` monolith.

## Development

```bash
cd "chart v 1.4/admin-design"
npm install
npm run dev
```

Open http://localhost:5174 — proxies `/api`, `/journal`, `/ws` to `CHART_BACKEND` (default `http://localhost:8000`).

## Production build

```bash
npm run build
```

Output: `chart/dist-admin/` — served at `/chart/admin-dashboard.html` when the build exists.

## Routes

Hash-compatible paths: `#overview`, `#users`, `#sec-support`, etc.

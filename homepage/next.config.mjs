/**
 * FastAPI trading-chart (same service as `docker-compose` `trading-chart:8000`).
 * Required when running `next dev`: `dist-v9/index.html` loads `/chart/chart.js` and
 * dozens of `/chart/modules/*.js` — those are NOT copied under `public/chart/` (only
 * `dist-v9/` lives there). Without these rewrites every legacy script 404s and the chart
 * never mounts. Production nginx (`homepage/nginx.conf`) already proxies `/chart/` and `/api/`.
 *
 * Override for remote backend: `CHART_BACKEND=http://host:port npm run dev`
 *
 * Kept as `.mjs` so TypeScript can resolve the repo from the parent folder without
 * treating this file as part of a broken `next`/`@types/node` graph when `node_modules`
 * is missing from the IDE snapshot.
 */
const CHART_BACKEND =
  process.env.CHART_BACKEND?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_CHART_BACKEND?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

/** Optional Flask journal API (same mapping as nginx `location ^~ /journal/api/`). */
const JOURNAL_BACKEND =
  process.env.JOURNAL_BACKEND?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_JOURNAL_BACKEND?.replace(/\/$/, "") ||
  "http://127.0.0.1:5000";

const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      { source: "/strategies-lab", destination: "/dashboard/strategies/", permanent: true },
      { source: "/strategies-lab/", destination: "/dashboard/strategies/", permanent: true },
      { source: "/strategy-v8-lab-preview", destination: "/dashboard/strategies/", permanent: true },
      { source: "/strategy-v8-lab-preview/", destination: "/dashboard/strategies/", permanent: true },
      { source: "/dashboard/strategylab-v9", destination: "/dashboard/strategies/", permanent: true },
      { source: "/dashboard/strategylab-v9/", destination: "/dashboard/strategies/", permanent: true },
      /* Legacy journal SPA (removed) → Next dashboard journal */
      { source: "/journal", destination: "/dashboard/journal/", permanent: true },
      { source: "/journal/login", destination: "/login/?next=/dashboard/journal/", permanent: true },
      { source: "/journal/login/", destination: "/login/?next=/dashboard/journal/", permanent: true },
      { source: "/journal/dashboard", destination: "/dashboard/journal/", permanent: true },
      { source: "/journal/dashboard/", destination: "/dashboard/journal/", permanent: true },
      { source: "/journal/admin/feature-flags", destination: "/chart/admin-dashboard.html", permanent: true },
      { source: "/journal/admin/feature-flags/", destination: "/chart/admin-dashboard.html", permanent: true },
      { source: "/journal/trades", destination: "/dashboard/journal/", permanent: true },
      { source: "/journal/trades/", destination: "/dashboard/journal/", permanent: true },
      { source: "/journal/analytics", destination: "/dashboard/journal/", permanent: true },
      { source: "/journal/analytics/", destination: "/dashboard/journal/", permanent: true },
      { source: "/journal/analytics/:path*", destination: "/dashboard/journal/", permanent: true },
      { source: "/journal/settings", destination: "/dashboard/journal/", permanent: true },
      { source: "/journal/settings/", destination: "/dashboard/journal/", permanent: true },
      { source: "/journal/import-trades", destination: "/dashboard/journal/", permanent: true },
      { source: "/journal/import-trades/", destination: "/dashboard/journal/", permanent: true },
      { source: "/journal/verify-email", destination: "/login/", permanent: true },
      { source: "/journal/verify-email/", destination: "/login/", permanent: true },
      { source: "/journal/onboarding", destination: "/dashboard/journal/", permanent: true },
      { source: "/journal/onboarding/", destination: "/dashboard/journal/", permanent: true },
      { source: "/journal/subscription/success", destination: "/pricing/success/", permanent: true },
      { source: "/journal/subscription/success/", destination: "/pricing/success/", permanent: true },
    ];
  },
  async rewrites() {
    if (process.env.NEXT_DISABLE_CHART_REWRITES === "1") {
      return [];
    }
    const b = CHART_BACKEND;
    const afterFiles = [
      { source: "/api/:path*", destination: `${b}/api/:path*` },
        { source: "/auth/:path*", destination: `${b}/auth/:path*` },
        { source: "/chart/chart.js", destination: `${b}/chart/chart.js` },
        { source: "/chart/chart-main.js", destination: `${b}/chart/chart-main.js` },
        { source: "/chart/chart.module.js", destination: `${b}/chart/chart.module.js` },
        { source: "/chart/styles.css", destination: `${b}/chart/styles.css` },
        { source: "/chart/propfirm-styles.css", destination: `${b}/chart/propfirm-styles.css` },
        { source: "/chart/settings-panel.js", destination: `${b}/chart/settings-panel.js` },
        { source: "/chart/settings-panel-ext.js", destination: `${b}/chart/settings-panel-ext.js` },
        { source: "/chart/modules/:path*", destination: `${b}/chart/modules/:path*` },
        { source: "/chart/indicators/:path*", destination: `${b}/chart/indicators/:path*` },
        { source: "/chart/image/:path*", destination: `${b}/chart/image/:path*` },
    ];
    if (JOURNAL_BACKEND) {
      afterFiles.unshift(
        { source: "/journal/api/:path*",    destination: `${JOURNAL_BACKEND}/api/:path*` },
        { source: "/api/journal/:path*",    destination: `${JOURNAL_BACKEND}/api/journal/:path*` },
      );
    }
    return { afterFiles };
  },
};

export default nextConfig;

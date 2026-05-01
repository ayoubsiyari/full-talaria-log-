/**
 * Default chart env (override with chart-env.generated.js from .env via sync-chart-env.mjs).
 */
window.__CHART_ENV = window.__CHART_ENV || {};
if (typeof window.__CHART_ENV.FINNHUB_API_KEY === 'undefined') {
    window.__CHART_ENV.FINNHUB_API_KEY = '';
}

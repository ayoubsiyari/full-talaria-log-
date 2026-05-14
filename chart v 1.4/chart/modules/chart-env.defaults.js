/**
 * Default chart env (override with chart-env.generated.js from .env via sync-chart-env.mjs).
 */
window.__CHART_ENV = window.__CHART_ENV || {};
if (typeof window.__CHART_ENV.FINNHUB_API_KEY === 'undefined') {
    window.__CHART_ENV.FINNHUB_API_KEY = '';
}
/** Hide Entry+/TP+ split controls on chart, pending/open lines, preview, native order panel, and V9 rail. Set to true to disable. */
if (typeof window.__CHART_ENV.DISABLE_ORDER_ENTRY_PLUS_UI === 'undefined') {
    window.__CHART_ENV.DISABLE_ORDER_ENTRY_PLUS_UI = false;
}

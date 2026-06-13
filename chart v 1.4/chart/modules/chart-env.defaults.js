/**
 * Default chart env (override with chart-env.generated.js via sync-chart-env.mjs).
 * API secrets (FINNHUB_API_KEY, etc.) are server-only — see chart/.env + api_server.py.
 */
window.__CHART_ENV = window.__CHART_ENV || {};
/** Skip Finnhub /api/finnhub/calendar/economic fetches (flags + News sidebar). Set false to re-enable. */
if (typeof window.__CHART_ENV.DISABLE_ECONOMIC_CALENDAR_API === 'undefined') {
    window.__CHART_ENV.DISABLE_ECONOMIC_CALENDAR_API = false;
}
/** Hide Entry+/TP+ split controls on chart, pending/open lines, preview, native order panel, and V9 rail. Set to true to disable. */
if (typeof window.__CHART_ENV.DISABLE_ORDER_ENTRY_PLUS_UI === 'undefined') {
    window.__CHART_ENV.DISABLE_ORDER_ENTRY_PLUS_UI = false;
}

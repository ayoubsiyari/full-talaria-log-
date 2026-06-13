#!/usr/bin/env node
/**
 * Writes modules/chart-env.generated.js with client-safe flags only.
 *
 * Secrets (FINNHUB_API_KEY, STRIPE_*, JWT_*, etc.) belong in chart/.env and are
 * read by api_server.py / Docker env — never embedded in JS sent to the browser.
 *
 * Run from the chart directory:
 *   node scripts/sync-chart-env.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chartRoot = path.resolve(__dirname, '..');
const outPath = path.join(chartRoot, 'modules', 'chart-env.generated.js');

const body = `/**
 * AUTO-GENERATED — do not edit. Run: node scripts/sync-chart-env.mjs
 * Server secrets (FINNHUB_API_KEY, etc.) live in chart/.env for api_server.py only.
 */
window.__CHART_ENV = window.__CHART_ENV || {};
window.__CHART_ENV.DISABLE_ECONOMIC_CALENDAR_API = false;
`;

fs.writeFileSync(outPath, body, 'utf8');
console.log('Wrote', outPath, '(no secrets — FINNHUB_API_KEY is server env only)');

#!/usr/bin/env node
/**
 * Reads chart/.env and writes modules/chart-env.generated.js with FINNHUB_API_KEY.
 * Run from repo root or chart directory: node scripts/sync-chart-env.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chartRoot = path.resolve(__dirname, '..');
const envPath = path.join(chartRoot, '.env');
const outPath = path.join(chartRoot, 'modules', 'chart-env.generated.js');

let key = '';
if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const m = trimmed.match(/^FINNHUB_API_KEY\s*=\s*(.*)$/);
        if (m) {
            key = m[1].trim().replace(/^["']|["']$/g, '');
            break;
        }
    }
}

const escaped = JSON.stringify(key);
const body = `/**
 * AUTO-GENERATED — do not edit. Source: chart/.env (run node scripts/sync-chart-env.mjs)
 */
window.__CHART_ENV = window.__CHART_ENV || {};
window.__CHART_ENV.FINNHUB_API_KEY = ${escaped};
`;

fs.writeFileSync(outPath, body, 'utf8');
console.log('Wrote', outPath, key ? '(FINNHUB_API_KEY set)' : '(FINNHUB_API_KEY empty)');

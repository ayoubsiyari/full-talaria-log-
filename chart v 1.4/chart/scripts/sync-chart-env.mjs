#!/usr/bin/env node
/**
 * Writes modules/chart-env.generated.js with FINNHUB_API_KEY for the browser.
 *
 * Key resolution (first match wins):
 *   1. chart/.env
 *   2. chart/.env.local
 *   3. Parent directories: ../.env, ../../.env, ... (up to 6 levels) — for monorepo root .env
 *   4. process.env.FINNHUB_API_KEY (e.g. CI: FINNHUB_API_KEY=xxx node scripts/sync-chart-env.mjs)
 *
 * Run from the chart directory (folder that contains index.html and scripts/):
 *   node scripts/sync-chart-env.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chartRoot = path.resolve(__dirname, '..');
const outPath = path.join(chartRoot, 'modules', 'chart-env.generated.js');

function parseFinnhubKeyFromFile(filePath) {
    if (!fs.existsSync(filePath)) return '';
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const m = trimmed.match(/^FINNHUB_API_KEY\s*=\s*(.*)$/);
        if (m) {
            return m[1].trim().replace(/^["']|["']$/g, '');
        }
    }
    return '';
}

function resolveKey() {
    const tryPaths = [
        path.join(chartRoot, '.env'),
        path.join(chartRoot, '.env.local'),
    ];

    for (const p of tryPaths) {
        const k = parseFinnhubKeyFromFile(p);
        if (k) {
            console.log('Using FINNHUB_API_KEY from', p);
            return k;
        }
    }

    let dir = chartRoot;
    for (let depth = 0; depth < 6; depth++) {
        const parent = path.dirname(dir);
        if (parent === dir) break;
        const p = path.join(parent, '.env');
        const k = parseFinnhubKeyFromFile(p);
        if (k) {
            console.log('Using FINNHUB_API_KEY from', p, '(parent walk)');
            return k;
        }
        dir = parent;
    }

    const fromEnv = (process.env.FINNHUB_API_KEY && String(process.env.FINNHUB_API_KEY).trim()) || '';
    if (fromEnv) {
        console.log('Using FINNHUB_API_KEY from process.env');
        return fromEnv.replace(/^["']|["']$/g, '');
    }

    console.warn(
        'No FINNHUB_API_KEY found. Add to chart/.env next to index.html:\n' +
            '  FINNHUB_API_KEY=your_token\n' +
            'Or set parent .env / .env.local / FINNHUB_API_KEY env var, then re-run this script.'
    );
    return '';
}

const key = resolveKey();
const escaped = JSON.stringify(key);
const body = `/**
 * AUTO-GENERATED — do not edit. Source: chart/.env (run node scripts/sync-chart-env.mjs)
 */
window.__CHART_ENV = window.__CHART_ENV || {};
window.__CHART_ENV.FINNHUB_API_KEY = ${escaped};
`;

fs.writeFileSync(outPath, body, 'utf8');
console.log('Wrote', outPath, key ? '(FINNHUB_API_KEY set)' : '(FINNHUB_API_KEY empty)');

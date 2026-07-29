/**
 * Leak shot (b): cached smart payloads must not retain legacy raw response text.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/leak-b-raw-response-text.test.mjs"
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function findRoot(start) {
  let cursor = path.resolve(start);
  for (;;) {
    const chart = path.join(cursor, 'chart v 1.4', 'chart', 'chart.js');
    if (fs.existsSync(path.join(cursor, '.git')) && fs.existsSync(chart)) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`repository root not found from ${start}`);
    cursor = parent;
  }
}

const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)));
const CHART_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const HOMEPAGE_CHART_JS = path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js');
const SOURCE = fs.readFileSync(CHART_JS, 'utf8');
const CSV = 'time,open,high,low,close,volume\n1700000000000,1,2,0.5,1.5,10\n1700000060000,1.5,3,1,2.5,11\n';

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function methodSource(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `^    ${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  if (!match) throw new Error(`method ${name} missing from chart.js`);
  return match[0];
}

function makeChart(flagSetup = '') {
  const sandbox = { console: { error() {}, warn() {}, info() {}, log() {} } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const body = [
    methodSource(SOURCE, '_smartCacheKeyFromParams'),
    methodSource(SOURCE, '_setSmartCachedPayload'),
    methodSource(SOURCE, '_rawResponseTextDropEnabled'),
    methodSource(SOURCE, '_dropRawResponseTextRetainers'),
    methodSource(SOURCE, '_setSmartPrefetchCacheEntry'),
    methodSource(SOURCE, '_trimSmartPrefetchCache'),
    methodSource(SOURCE, '_smartResponseHasPayload'),
    methodSource(SOURCE, '_ingestSmartWindowResult'),
  ].join('\n');
  vm.runInContext(`
globalThis.window = {};
${flagSetup}
class HarnessChart {
    constructor() {
        this._smartPrefetchCache = new Map();
        this.rawData = [];
        this.data = [];
        this.__parseCalls = [];
    }

${body}

    parseCSVChunk(csv, startIndex, options = {}) {
        this.__parseCalls.push({ length: csv.length, startIndex, options });
        const lines = String(csv).trim().split('\\n').slice(1);
        this.rawData = lines.map((line) => {
            const [t, o, h, l, c, v] = line.split(',').map(Number);
            return { t, o, h, l, c, v };
        });
        this.data = this.rawData.slice();
    }
}
globalThis.__chart = new HarnessChart();
`, sandbox);
  return { sandbox, chart: sandbox.__chart };
}

function firstCachedPayload(chart) {
  const entry = chart._smartPrefetchCache.values().next().value;
  return entry && entry.payload;
}

test('Leak B: legacy smart CSV data string is dropped after parse, not before', () => {
  const { chart } = makeChart();
  const payload = {
    total: 2,
    returned: 2,
    first_cursor: '1700000000000',
    last_cursor: '1700000060000',
    source: 'csv-fallback',
    data: CSV,
    rawText: 'raw-response-body-retainer',
    responseText: 'full-response-copy',
  };
  const params = new URLSearchParams('timeframe=1m&response_format=csv');
  chart._setSmartCachedPayload('7', params, payload);

  const cachedBefore = firstCachedPayload(chart);
  note('pre-extract-keeps-usable-data-string', typeof cachedBefore.data === 'string',
    `dataLen=${cachedBefore.data.length}`);
  assert.equal(typeof cachedBefore.data, 'string');
  assert.equal(Array.isArray(cachedBefore.candles), false);

  const ok = chart._ingestSmartWindowResult(payload, { skipIndicators: true });
  note('legacy-csv-ingested', ok === true && chart.rawData.length === 2,
    `bars=${chart.rawData.length}`);
  assert.equal(ok, true);
  assert.equal(chart.rawData.length, 2);

  const cachedAfter = firstCachedPayload(chart);
  note('raw-response-text-dropped', cachedAfter.data === null && cachedAfter.rawText === null,
    `data=${cachedAfter.data} rawText=${cachedAfter.rawText}`);
  assert.equal(cachedAfter.data, null);
  assert.equal(cachedAfter.rawText, null);
  assert.equal(cachedAfter.responseText, null);
  assert.equal(cachedAfter.candles.length, 2);
  assert.equal(chart._smartResponseHasPayload(cachedAfter), true);
});

test('Leak B: disabling flag is read by truthiness on every call', () => {
  const { sandbox, chart } = makeChart();
  const states = [];
  delete sandbox.window.__TALARIA_DISABLE_RAW_RESPONSE_TEXT_DROP_V1;
  states.push(['absent', chart._rawResponseTextDropEnabled()]);
  sandbox.window.__TALARIA_DISABLE_RAW_RESPONSE_TEXT_DROP_V1 = false;
  states.push(['false', chart._rawResponseTextDropEnabled()]);
  sandbox.window.__TALARIA_DISABLE_RAW_RESPONSE_TEXT_DROP_V1 = 0;
  states.push(['zero', chart._rawResponseTextDropEnabled()]);
  sandbox.window.__TALARIA_DISABLE_RAW_RESPONSE_TEXT_DROP_V1 = true;
  states.push(['true', chart._rawResponseTextDropEnabled()]);
  sandbox.window.__TALARIA_DISABLE_RAW_RESPONSE_TEXT_DROP_V1 = '1';
  states.push(['string', chart._rawResponseTextDropEnabled()]);

  note('four-state-switch', states.map(([k, v]) => `${k}=${v ? 'on' : 'off'}`).join(' '));
  assert.deepEqual(states, [
    ['absent', true],
    ['false', true],
    ['zero', true],
    ['true', false],
    ['string', false],
  ]);
});

test('Leak B: kill-switch preserves legacy raw response text retention', () => {
  const { chart } = makeChart('window.__TALARIA_DISABLE_RAW_RESPONSE_TEXT_DROP_V1 = true;');
  const payload = { data: CSV, rawText: 'keep-for-diagnosis' };
  const ok = chart._ingestSmartWindowResult(payload);
  note('kill-switch-retains-raw-text', ok && typeof payload.data === 'string',
    `dataType=${typeof payload.data}`);
  assert.equal(ok, true);
  assert.equal(typeof payload.data, 'string');
  assert.equal(payload.rawText, 'keep-for-diagnosis');
});

test('Leak B: cached candle payloads are not stripped of bar data', () => {
  const { chart } = makeChart();
  const candles = [{ t: 1, o: 1, h: 2, l: 0, c: 1, v: 3 }];
  const payload = { candles, source: 'tiles', data: null };
  chart._setSmartCachedPayload('9', new URLSearchParams('timeframe=1m&response_format=candles'), payload);
  const cached = firstCachedPayload(chart);
  note('candles-cache-still-usable', cached.candles === candles && chart._smartResponseHasPayload(cached),
    `candles=${cached.candles.length}`);
  assert.equal(cached.candles, candles);
  assert.equal(chart._smartResponseHasPayload(cached), true);
});

test('Leak B: homepage served chart mirror is byte-identical', () => {
  const chartBytes = fs.readFileSync(CHART_JS);
  const mirrorBytes = fs.readFileSync(HOMEPAGE_CHART_JS);
  const chartHash = crypto.createHash('sha256').update(chartBytes).digest('hex');
  const mirrorHash = crypto.createHash('sha256').update(mirrorBytes).digest('hex');
  note('mirror-hash', chartHash === mirrorHash, chartHash);
  assert.equal(mirrorHash, chartHash);
});

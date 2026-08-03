/**
 * Leak shot (f): under multichart, do not idle-warm other session symbols
 * into `_smartPrefetchCache` via `_scheduleSmartPrefetchOthers`.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/leak-f-smart-prefetch-others.test.mjs"
 *
 * MC-only: single-chart keeps prior schedule behaviour.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Walk up to the repo root instead of counting directory levels.
 *
 * This file is mirrored to a tree at a DIFFERENT depth, so a fixed '../../..'
 * resolved to the wrong directory in one of the two locations and the gate there
 * died on load, or failed a cell on a path it built itself. A gate that cannot
 * reach its subject reports a red indistinguishable from a product defect.
 */
function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, 'chart v 1.4')) && fs.existsSync(path.join(dir, 'homepage'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`ANCHOR_BROKEN: repo root not found from ${start}`);
}

const ROOT = findRoot(HERE);
const CHART_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const CHART_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js');
const SWITCH = '__TALARIA_DISABLE_MC_SMART_PREFETCH_OTHERS_V1';
const SOURCE = fs.readFileSync(CHART_JS, 'utf8');

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
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

function replaceOne(text, from, to, label) {
  const count = text.split(from).length - 1;
  assert.equal(count, 1, `${label} anchor count`);
  return text.replace(from, to);
}

const METHOD_NAMES = [
  '_mcSmartPrefetchOthersGateEnabled',
  '_scheduleSmartPrefetchOthers',
];

function chartMethods(text) {
  return METHOD_NAMES.map((name) => methodSource(text, name)).join('\n');
}

function makeRuntime(text = SOURCE, { mc = true } = {}) {
  const sandbox = {
    console: { error() {}, warn() {}, info() {}, log() {} },
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(`
globalThis.window = {
  requestIdleCallback(cb) {
    globalThis.__ricCalls = (globalThis.__ricCalls || 0) + 1;
    if (typeof cb === 'function') cb({ didTimeout: false, timeRemaining: () => 50 });
    return 1;
  },
};
globalThis.__ricCalls = 0;
class HarnessChart {
    constructor(inMc) {
        this.__inMc = !!inMc;
        this._smartPrefetchCache = new Map();
        this.__fetchCalls = [];
    }
    _isMultichartEmbedPanel() { return !!this.__inMc; }
    _isMultichartHostPanel() { return false; }
    getSymbolSwitcherEntries() {
        return [
            { fileId: 'ACTIVE' },
            { fileId: 'OTHER1' },
            { fileId: 'OTHER2' },
        ];
    }
    _isSessionBacktestStyle() { return false; }
    _buildSmartWindowParams(fileId, timeframe, session) {
        return new URLSearchParams('timeframe=' + String(timeframe || '1m'));
    }
    _smartCacheKeyFromParams(fileId, params) {
        return String(fileId) + '|' + String(params && params.toString());
    }
    _fetchSmartWindow(fileId) {
        this.__fetchCalls.push(String(fileId));
        return Promise.resolve({ candles: [{ t: 1 }] });
    }
    _smartResponseHasPayload(data) {
        return !!(data && Array.isArray(data.candles) && data.candles.length);
    }
    _setSmartPrefetchCacheEntry(fileId, key, data) {
        this._smartPrefetchCache.set(key, { fileId: String(fileId), payload: data, at: Date.now() });
    }
    _mcHostCacheSharedWriteOwner() { return null; }
    _retainMcHostCacheFile() {}
    _trimSmartPrefetchCache() {}

${chartMethods(text)}
}
globalThis.__ChartClass = HarnessChart;
`, context);
  // URLSearchParams is needed inside _buildSmartWindowParams stubs via harness,
  // and also if extracted body references it — provide from host.
  context.URLSearchParams = URLSearchParams;
  const chart = new context.__ChartClass(mc);
  return { context, window: context.window, chart };
}

function scheduleAndCount(text, { mc = true, flag, defineFlag = false } = {}) {
  const { context, window, chart } = makeRuntime(text, { mc });
  if (defineFlag) window[SWITCH] = flag;
  const beforeRic = context.__ricCalls || 0;
  const beforeFetch = chart.__fetchCalls.length;
  chart._scheduleSmartPrefetchOthers('ACTIVE', '1m', { id: 's1' });
  return {
    ricDelta: (context.__ricCalls || 0) - beforeRic,
    fetchDelta: chart.__fetchCalls.length - beforeFetch,
    chart,
    window,
    context,
  };
}

function assertDefaultSuppressesUnderMc(text = SOURCE) {
  const r = scheduleAndCount(text, { mc: true, defineFlag: false });
  note('mc-default-suppresses-schedule', r.ricDelta === 0 && r.fetchDelta === 0,
    `ric=${r.ricDelta} fetch=${r.fetchDelta}`);
  assert.equal(r.ricDelta, 0);
  assert.equal(r.fetchDelta, 0);
}

function assertKillRestores(text = SOURCE) {
  const r = scheduleAndCount(text, { mc: true, flag: true, defineFlag: true });
  note('mc-kill-restores-prefetch-others', r.ricDelta === 1 && r.fetchDelta >= 1,
    `ric=${r.ricDelta} fetch=${r.fetchDelta}`);
  assert.equal(r.ricDelta, 1);
  assert.ok(r.fetchDelta >= 1);
}

function assertFlagTruthinessPerCall(text = SOURCE) {
  const { chart, window } = makeRuntime(text, { mc: true });
  const states = [];
  delete window[SWITCH];
  states.push(['absent', chart._mcSmartPrefetchOthersGateEnabled()]);
  window[SWITCH] = false;
  states.push(['false', chart._mcSmartPrefetchOthersGateEnabled()]);
  window[SWITCH] = 0;
  states.push(['zero', chart._mcSmartPrefetchOthersGateEnabled()]);
  window[SWITCH] = true;
  states.push(['true', chart._mcSmartPrefetchOthersGateEnabled()]);
  window[SWITCH] = '1';
  states.push(['string', chart._mcSmartPrefetchOthersGateEnabled()]);

  note('four-state-switch', states.map(([k, v]) => `${k}=${v ? 'on' : 'off'}`).join(' '));
  assert.deepEqual(states, [
    ['absent', true],
    ['false', true],
    ['zero', true],
    ['true', false],
    ['string', false],
  ]);

  // Per-call: flip mid-flight and observe schedule behaviour change.
  window[SWITCH] = false;
  const a = scheduleAndCount(text, { mc: true, flag: false, defineFlag: true });
  assert.equal(a.ricDelta, 0, 'falsy kill still suppresses');
  window[SWITCH] = true;
  const b = scheduleAndCount(text, { mc: true, flag: true, defineFlag: true });
  assert.equal(b.ricDelta, 1, 'truthy kill restores on next call');
  note('per-call-truthiness', true, 'false→suppress then true→schedule');
}

function assertSingleChartStillSchedules(text = SOURCE) {
  const r = scheduleAndCount(text, { mc: false, defineFlag: false });
  note('single-chart-still-schedules', r.ricDelta === 1 && r.fetchDelta >= 1,
    `ric=${r.ricDelta} fetch=${r.fetchDelta}`);
  assert.equal(r.ricDelta, 1);
  assert.ok(r.fetchDelta >= 1);
}

function assertCallSitesGatedInSource(text = SOURCE) {
  // Gate lives inside _scheduleSmartPrefetchOthers so all production call sites
  // (backtest settle, loadFileData, loadPanelFileData→mainChart) share one choke point.
  const body = methodSource(text, '_scheduleSmartPrefetchOthers');
  const hasGate = body.includes('_mcSmartPrefetchOthersGateEnabled()');
  const callSites = (text.match(/_scheduleSmartPrefetchOthers\s*\(/g) || []).length;
  note('schedule-body-gated', hasGate, `definition+calls=${callSites}`);
  assert.equal(hasGate, true);
  assert.ok(callSites >= 4, 'definition + ≥3 call sites');
}

test('Leak F: default suppresses smart prefetch-others under MC', () => {
  assertDefaultSuppressesUnderMc();
});

test('Leak F: kill switch restores prefetch-others under MC', () => {
  assertKillRestores();
});

test('Leak F: flag uses !! truthiness and is read per call', () => {
  assertFlagTruthinessPerCall();
});

test('Leak F: single-chart path still schedules (MC-only gate)', () => {
  assertSingleChartStillSchedules();
});

test('Leak F: gate is inside _scheduleSmartPrefetchOthers (all call sites)', () => {
  assertCallSitesGatedInSource();
});

test('Leak F mirror: homepage chart.js is byte-identical', () => {
  const chart = fs.readFileSync(CHART_JS);
  const mirror = fs.readFileSync(CHART_MIRROR);
  const hash = sha256(chart);
  note('mirror-byte-identical', chart.equals(mirror), `sha256=${hash}`);
  assert.equal(sha256(mirror), hash);
});

test('Leak F mutants: re-enabling schedule under MC goes red', () => {
  const dropGate = replaceOne(
    SOURCE,
    '            if (inMc && this._mcSmartPrefetchOthersGateEnabled()) return;',
    '            if (inMc && this._mcSmartPrefetchOthersGateEnabled()) { /* return; */ }',
    'drop early-return mutant',
  );
  assert.throws(() => assertDefaultSuppressesUnderMc(dropGate));
  note('mutant-killed:drop-early-return', true);

  const alwaysOff = replaceOne(
    SOURCE,
    '            return !(typeof window !== \'undefined\'\n'
      + '                && !!window.__TALARIA_DISABLE_MC_SMART_PREFETCH_OTHERS_V1);',
    '            return !!(typeof window !== \'undefined\'\n'
      + '                && !!window.__TALARIA_DISABLE_MC_SMART_PREFETCH_OTHERS_V1);',
    'invert gate enabled mutant',
  );
  assert.throws(() => assertDefaultSuppressesUnderMc(alwaysOff));
  note('mutant-killed:invert-gate-enabled', true);

  const hasOwnFlag = replaceOne(
    SOURCE,
    '            return !(typeof window !== \'undefined\'\n'
      + '                && !!window.__TALARIA_DISABLE_MC_SMART_PREFETCH_OTHERS_V1);',
    '            return !(typeof window !== \'undefined\'\n'
      + '                && Object.prototype.hasOwnProperty.call(window, "__TALARIA_DISABLE_MC_SMART_PREFETCH_OTHERS_V1"));',
    'hasOwnProperty flag mutant',
  );
  assert.throws(() => assertFlagTruthinessPerCall(hasOwnFlag));
  note('mutant-killed:flag-hasown', true);
});

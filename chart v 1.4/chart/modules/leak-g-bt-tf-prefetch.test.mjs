/**
 * Leak shot (g): under multichart, gate BT TF prefetch schedule (fill-before-spill).
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/leak-g-bt-tf-prefetch.test.mjs"
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const CHART_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const CHART_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js');
const SWITCH = '__TALARIA_DISABLE_MC_BT_TF_PREFETCH_V1';
const PLAYHEAD_COVER = '__TALARIA_DISABLE_BT_TF_CACHE_PLAYHEAD_COVER';
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
  '_mcBtTfPrefetchGateEnabled',
  '_usesMultichartReplayMaster',
  '_scheduleBacktestTimeframePrefetch',
];

function chartMethods(text) {
  return METHOD_NAMES.map((name) => methodSource(text, name)).join('\n');
}

function makeRuntime(text = SOURCE, {
  flagSetup = '',
  host = false,
  embed = false,
} = {}) {
  const timers = [];
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    setTimeout(fn, ms) {
      timers.push({ kind: 'timeout', ms, fn });
      return timers.length;
    },
    clearTimeout() {},
    Math,
    Date,
    String,
    Number,
    Array,
    Object,
    Map,
    Promise,
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(`
globalThis.window = {
  requestIdleCallback(fn, opts) {
    globalThis.__idleCalls = (globalThis.__idleCalls || 0) + 1;
    globalThis.__idleOpts = opts;
    return 1;
  },
};
${flagSetup}
class TestChart {
    constructor() {
        this.isBacktestMode = true;
        this.currentFileId = 'EURUSD';
        this.currentTimeframe = '1m';
        this.backtestingSession = {};
        this._btTfPrefetchScheduled = null;
        this._btTfDataCache = new Map();
        this._timeframeSwitching = false;
        this._pairSwitchLoading = false;
        this.replaySystem = null;
        this.__host = ${host ? 'true' : 'false'};
        this.__embed = ${embed ? 'true' : 'false'};
        this.__fetchCalls = 0;
    }

    _isMultichartEmbedPanel() { return !!this.__embed; }
    _isMultichartHostPanel() { return !!this.__host && !this.__embed; }
    _isIndependentMultichartPair() { return false; }
    _warmBtTfCacheFromParent() { this.__warmed = true; }
    _captureReplayPlayheadMs() { return NaN; }
    _getBacktestSessionEndMs() { return Date.now(); }
    parseTimeframe(tf) {
        const s = String(tf || '').toLowerCase();
        if (s === '1m') return 60000;
        if (s === '5m') return 300000;
        if (s === '1d') return 86400000;
        return 60000;
    }
    _getBacktestTimeframesToPrefetch() { return ['5m', '15m', '1h']; }
    _getBtTfDataCache() { return null; }
    _backtestFetchLimitForTimeframe() { return 800; }
    _getBacktestInitialFetchRange() { return null; }
    _getBacktestSessionEndFetchRange() { return null; }
    _getBacktestReplayFetchRange() { return null; }
    _fetchSmartWindow() {
        this.__fetchCalls += 1;
        return Promise.resolve({ candles: [] });
    }
    _smartResponseHasPayload() { return false; }
    _normalizeCandlesFromApi(rows) { return rows; }
    _storeBtTfDataCacheEntry(fileId, timeframe, rawData) {
        const fid = String(fileId);
        if (!this._btTfDataCache.has(fid)) this._btTfDataCache.set(fid, new Map());
        this._btTfDataCache.get(fid).set(String(timeframe), { rawData });
    }

${chartMethods(text)}
}
globalThis.__ChartClass = TestChart;
`, context);
  const chart = new context.__ChartClass();
  return { context, window: context.window, chart, timers, sandbox };
}

function schedule(chart) {
  chart._scheduleBacktestTimeframePrefetch(chart.currentFileId, chart.backtestingSession);
}

function assertDefaultNoScheduleUnderMc(text = SOURCE) {
  const host = makeRuntime(text, { host: true });
  schedule(host.chart);
  assert.equal(host.chart._btTfPrefetchScheduled, null);
  assert.equal(host.timers.length, 0);
  assert.equal(host.context.__idleCalls || 0, 0);

  const embed = makeRuntime(text, { embed: true });
  schedule(embed.chart);
  assert.equal(embed.chart._btTfPrefetchScheduled, null);
  assert.equal(embed.timers.length, 0);
  assert.equal(embed.context.__idleCalls || 0, 0);
}

function assertKillRestores(text = SOURCE) {
  const host = makeRuntime(text, {
    host: true,
    flagSetup: `window.${SWITCH} = true;`,
  });
  schedule(host.chart);
  assert.equal(host.chart._btTfPrefetchScheduled, 'EURUSD');
  assert.ok(host.timers.length >= 1, 'timeout scheduled');
  assert.ok((host.context.__idleCalls || 0) >= 1, 'idle scheduled');
}

function assertTruthinessPerCall(text = SOURCE) {
  const { chart, window } = makeRuntime(text, { host: true });
  const states = [];

  delete window[SWITCH];
  states.push(['absent', chart._mcBtTfPrefetchGateEnabled()]);
  window[SWITCH] = false;
  states.push(['false', chart._mcBtTfPrefetchGateEnabled()]);
  window[SWITCH] = 0;
  states.push(['zero', chart._mcBtTfPrefetchGateEnabled()]);
  window[SWITCH] = true;
  states.push(['true', chart._mcBtTfPrefetchGateEnabled()]);
  window[SWITCH] = '1';
  states.push(['string', chart._mcBtTfPrefetchGateEnabled()]);
  window[SWITCH] = undefined;
  states.push(['undefined', chart._mcBtTfPrefetchGateEnabled()]);

  assert.deepEqual(states, [
    ['absent', true],
    ['false', true],
    ['zero', true],
    ['true', false],
    ['string', false],
    ['undefined', true],
  ]);

  // Per-call: flip kill mid-flight and observe schedule behavior.
  delete window[SWITCH];
  chart._btTfPrefetchScheduled = null;
  schedule(chart);
  assert.equal(chart._btTfPrefetchScheduled, null, 'fix on → no schedule');
  window[SWITCH] = 'yes';
  schedule(chart);
  assert.equal(chart._btTfPrefetchScheduled, 'EURUSD', 'truthy kill → schedule');
}

function assertStandaloneStillSchedules(text = SOURCE) {
  const solo = makeRuntime(text, { host: false, embed: false });
  schedule(solo.chart);
  assert.equal(solo.chart._btTfPrefetchScheduled, 'EURUSD');
  assert.ok(solo.timers.length >= 1);
}

function assertStorePathUntouched(text = SOURCE) {
  const storeSrc = methodSource(text, '_storeBtTfDataCacheEntry');
  assert.equal(storeSrc.includes(SWITCH), false, 'store must not reference LEAK-G switch');
  assert.equal(storeSrc.includes('_mcBtTfPrefetchGateEnabled'), false);

  const { chart } = makeRuntime(text, { host: true });
  chart._storeBtTfDataCacheEntry('EURUSD', '1m', [{ t: 1 }], {});
  assert.ok(chart._btTfDataCache.get('EURUSD')?.has('1m'));

  // Distinct from playhead-cover kill.
  assert.ok(text.includes(PLAYHEAD_COVER), 'playhead-cover switch still present');
  assert.ok(text.includes(SWITCH), 'LEAK-G switch present');
  assert.notEqual(SWITCH, PLAYHEAD_COVER);
}

function assertCallSitesGated(text = SOURCE) {
  const sched = methodSource(text, '_scheduleBacktestTimeframePrefetch');
  assert.ok(sched.includes('_mcBtTfPrefetchGateEnabled()'), 'schedule reads gate helper');
  assert.ok(sched.includes('_usesMultichartReplayMaster'), 'schedule scopes under MC');

  const callSites = [
    'selfMc._scheduleBacktestTimeframePrefetch(fidMc, selfMc.backtestingSession);',
    'this._scheduleBacktestTimeframePrefetch(this.currentFileId, this.backtestingSession);',
    'this._scheduleBacktestTimeframePrefetch(fid, sess);',
  ];
  for (const site of callSites) {
    assert.ok(text.includes(site), `call site present: ${site}`);
  }
  // All schedule entry points funnel through the gated method (no twin bypass).
  const direct = (text.match(/_scheduleBacktestTimeframePrefetch\s*\(/g) || []).length;
  assert.ok(direct >= 4, `definition + ≥3 call sites, got ${direct}`);
}

test('Leak G: default ON under MC — schedule is a no-op', () => {
  assertDefaultNoScheduleUnderMc();
  note('default-no-schedule-under-mc', true);
});

test('Leak G: kill switch restores BT TF prefetch under MC', () => {
  assertKillRestores();
  note('kill-restores-prefetch', true);
});

test('Leak G: switch is truthiness + per-call (absent/false/0 keep fix)', () => {
  assertTruthinessPerCall();
  note('truthiness-per-call', true);
});

test('Leak G: standalone (non-MC) still schedules with fix ON', () => {
  assertStandaloneStillSchedules();
  note('standalone-still-schedules', true);
});

test('Leak G: store path untouched; distinct from playhead-cover kill', () => {
  assertStorePathUntouched();
  note('store-untouched-distinct-switch', true);
});

test('Leak G: call sites funnel through gated schedule', () => {
  assertCallSitesGated();
  note('sites-gated', true, '3 call sites + method');
});

test('Leak G: homepage chart.js mirror is byte-identical (LF)', () => {
  const chart = fs.readFileSync(CHART_JS);
  const mirror = fs.readFileSync(CHART_MIRROR);
  assert.equal(chart.includes(0x0d), false, 'chart.js must be LF-only');
  assert.equal(mirror.includes(0x0d), false, 'homepage mirror must be LF-only');
  const hash = sha256(chart);
  note('mirror-byte-identical', chart.equals(mirror), `sha256=${hash}`);
  assert.equal(sha256(mirror), hash);
});

test('Leak G: mutants die — neutered gate / hasOwn / strict-true', () => {
  const gateDropped = replaceOne(
    SOURCE,
    '        if (this._mcBtTfPrefetchGateEnabled()\n'
      + '            && typeof this._usesMultichartReplayMaster === \'function\'\n'
      + '            && this._usesMultichartReplayMaster()) {\n'
      + '            return;\n'
      + '        }\n',
    '',
    'drop gate mutant',
  );
  assert.throws(() => assertDefaultNoScheduleUnderMc(gateDropped));
  note('mutant-killed:gate-dropped', true);

  const hasOwn = replaceOne(
    SOURCE,
    'return !(typeof window !== \'undefined\' && window.__TALARIA_DISABLE_MC_BT_TF_PREFETCH_V1);',
    'return !(typeof window !== \'undefined\' && Object.prototype.hasOwnProperty.call(window, "__TALARIA_DISABLE_MC_BT_TF_PREFETCH_V1"));',
    'hasOwnProperty flag mutant',
  );
  assert.throws(() => assertTruthinessPerCall(hasOwn));
  note('mutant-killed:flag-hasown', true);

  const strictTrue = replaceOne(
    SOURCE,
    'return !(typeof window !== \'undefined\' && window.__TALARIA_DISABLE_MC_BT_TF_PREFETCH_V1);',
    'return !(typeof window !== \'undefined\' && window.__TALARIA_DISABLE_MC_BT_TF_PREFETCH_V1 === true);',
    'strict-true flag mutant',
  );
  assert.throws(() => assertTruthinessPerCall(strictTrue));
  note('mutant-killed:flag-strict-true', true);

  const mcScopeDropped = replaceOne(
    SOURCE,
    '        if (this._mcBtTfPrefetchGateEnabled()\n'
      + '            && typeof this._usesMultichartReplayMaster === \'function\'\n'
      + '            && this._usesMultichartReplayMaster()) {\n'
      + '            return;\n'
      + '        }\n',
    '        if (this._mcBtTfPrefetchGateEnabled()) {\n'
      + '            return;\n'
      + '        }\n',
    'drop MC scope mutant',
  );
  assert.throws(() => assertStandaloneStillSchedules(mcScopeDropped));
  note('mutant-killed:mc-scope-dropped', true);
});

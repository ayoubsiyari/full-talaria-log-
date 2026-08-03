/**
 * LEAK-I (wave-2 retainer): default-ON gate suppresses ~100k-bar high-limit
 * bulk / lazy replay master hydrates.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/leak-i-high-limit-bulk.test.mjs"
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
const SWITCH = '__TALARIA_DISABLE_MC_HIGH_LIMIT_BULK_V1';
const SOURCE = fs.readFileSync(CHART_JS, 'utf8');

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}\n`);
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
  '_mcHighLimitBulkGateEnabled',
  '_lazyReplayMasterSmartLimit',
  '_highLimitBulkHistoryDisabled',
  '_highLimitBulkHistorySmartLimit',
  '_shouldUseHighLimitBulkHistory',
];

function chartMethods(text) {
  return METHOD_NAMES.map((name) => methodSource(text, name)).join('\n');
}

function makeEnv(text = SOURCE) {
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    Math,
    Number,
    String,
    Array,
    Object,
    Date,
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(`
globalThis.window = {};
class Chart {
    constructor() {
        this.isBacktestMode = true;
        this.currentTimeframe = '1m';
    }

${chartMethods(text)}

    _isMultichartEmbedPanel() { return false; }
    _normalizeBacktestTimeframe(tf) {
        return String(tf || this.currentTimeframe || '1m').toLowerCase().trim();
    }
    parseTimeframe(tf) {
        const s = String(tf || '').toLowerCase().trim();
        if (s === '1m') return 60000;
        if (s === '1h') return 3600000;
        if (s === '1d') return 86400000;
        return 60000;
    }
}
globalThis.Chart = Chart;
globalThis.__chart = new Chart();
`, context);
  return { context, window: context.window, chart: context.__chart };
}

function setSwitch(window, value) {
  if (value === undefined) {
    delete window[SWITCH];
    return;
  }
  window[SWITCH] = value;
}

function assertDefaultDisables(text = SOURCE) {
  const { window, chart } = makeEnv(text);
  setSwitch(window, undefined);
  assert.equal(chart._mcHighLimitBulkGateEnabled(), true, 'gate ON when flag absent');
  assert.equal(chart._highLimitBulkHistoryDisabled(), true, 'high-limit disabled by default');
  assert.equal(chart._shouldUseHighLimitBulkHistory('1m'), false, 'shouldUse false by default');
  assert.equal(chart._highLimitBulkHistorySmartLimit(), 2000, 'bulk smart limit clamped');
  assert.equal(chart._lazyReplayMasterSmartLimit(), 2000, 'lazy smart limit clamped');
}

function assertKillRestores(text = SOURCE, flagValue = true) {
  const { window, chart } = makeEnv(text);
  setSwitch(window, flagValue);
  assert.equal(chart._mcHighLimitBulkGateEnabled(), false, 'gate OFF under kill');
  assert.equal(chart._highLimitBulkHistoryDisabled(), false, 'high-limit enabled under kill');
  assert.equal(chart._shouldUseHighLimitBulkHistory('1m'), true, 'shouldUse true under kill');
  assert.equal(chart._highLimitBulkHistorySmartLimit(), 100000, 'bulk smart limit restored');
  assert.equal(chart._lazyReplayMasterSmartLimit(), 100000, 'lazy smart limit restored');
}

function assertTruthinessPerCall(text = SOURCE) {
  const { window, chart } = makeEnv(text);
  const states = [];

  setSwitch(window, undefined);
  states.push(['absent', chart._mcHighLimitBulkGateEnabled(), chart._shouldUseHighLimitBulkHistory('1h')]);

  setSwitch(window, false);
  states.push(['false', chart._mcHighLimitBulkGateEnabled(), chart._shouldUseHighLimitBulkHistory('1h')]);

  setSwitch(window, 0);
  states.push(['zero', chart._mcHighLimitBulkGateEnabled(), chart._shouldUseHighLimitBulkHistory('1h')]);

  setSwitch(window, true);
  states.push(['true', chart._mcHighLimitBulkGateEnabled(), chart._shouldUseHighLimitBulkHistory('1h')]);

  setSwitch(window, '1');
  states.push(['string', chart._mcHighLimitBulkGateEnabled(), chart._shouldUseHighLimitBulkHistory('1h')]);

  // Per-call: flip back to falsy mid-session.
  setSwitch(window, 0);
  states.push(['refalsy', chart._mcHighLimitBulkGateEnabled(), chart._shouldUseHighLimitBulkHistory('1h')]);

  assert.deepEqual(states, [
    ['absent', true, false],
    ['false', true, false],
    ['zero', true, false],
    ['true', false, true],
    ['string', false, true],
    ['refalsy', true, false],
  ]);
}

function assertInformalDisableUnderKill(text = SOURCE) {
  const { window, chart } = makeEnv(text);
  setSwitch(window, true);
  window.__TALARIA_MC_DISABLE_HIGH_LIMIT_BULK = true;
  assert.equal(chart._mcHighLimitBulkGateEnabled(), false, 'V1 kill still off-gate');
  assert.equal(chart._highLimitBulkHistoryDisabled(), true, 'informal disable honored under kill');
  assert.equal(chart._shouldUseHighLimitBulkHistory('1m'), false, 'shouldUse false under informal');
  // Smart limits remain at legacy 100k under V1 kill (informal only gates shouldUse).
  assert.equal(chart._highLimitBulkHistorySmartLimit(), 100000);
  assert.equal(chart._lazyReplayMasterSmartLimit(), 100000);
}

function assertSourceShape(text = SOURCE) {
  assert.ok(text.includes(SWITCH), 'reserved switch is wired');
  assert.ok(text.includes('_mcHighLimitBulkGateEnabled'), 'gate helper present');
  const gate = methodSource(text, '_mcHighLimitBulkGateEnabled');
  assert.equal(gate.includes('hasOwnProperty'), false, 'switch must not use hasOwnProperty');
  assert.equal(gate.includes('=== true'), false, 'switch must use truthiness, not === true');
  assert.ok(gate.includes(`!!window.${SWITCH}`) || gate.includes(`!!window['${SWITCH}']`)
    || /!!window\.__TALARIA_DISABLE_MC_HIGH_LIMIT_BULK_V1/.test(gate),
  'gate reads V1 switch with !!');
}

function acceptanceOracle(text = SOURCE) {
  assertSourceShape(text);
  assertDefaultDisables(text);
  assertKillRestores(text, true);
  assertKillRestores(text, 'legacy');
  assertTruthinessPerCall(text);
  assertInformalDisableUnderKill(text);
}

test('Leak I: default-ON disables high-limit bulk and clamps smart limits', () => {
  assertDefaultDisables();
  note('default-disables-high-limit-bulk', true, 'shouldUse=false limits=2000');
});

test('Leak I: kill-switch restores high-limit bulk / lazy 100k path', () => {
  assertKillRestores(SOURCE, true);
  assertKillRestores(SOURCE, 'on');
  note('kill-restores-100k-path', true);
});

test('Leak I: V1 switch is four-state, truthy, and per-call', () => {
  assertTruthinessPerCall();
  note('switch-four-state-truthiness', true);
});

test('Leak I: informal __TALARIA_MC_DISABLE_HIGH_LIMIT_BULK remains disable under kill', () => {
  assertInformalDisableUnderKill();
  note('informal-disable-under-kill', true);
});

test('Leak I: structural gate + mutant coverage', () => {
  acceptanceOracle();

  const mutants = [
    {
      name: 'gate-always-off',
      source: replaceOne(
        SOURCE,
        'return !(typeof window !== \'undefined\'\n                && !!window.__TALARIA_DISABLE_MC_HIGH_LIMIT_BULK_V1);',
        'return false;',
        'gate-always-off mutant',
      ),
    },
    {
      name: 'strict-true-switch',
      source: replaceOne(
        SOURCE,
        'return !(typeof window !== \'undefined\'\n                && !!window.__TALARIA_DISABLE_MC_HIGH_LIMIT_BULK_V1);',
        'return !(typeof window !== \'undefined\'\n                && window.__TALARIA_DISABLE_MC_HIGH_LIMIT_BULK_V1 === true);',
        'strict switch mutant',
      ),
    },
    {
      name: 'bulk-limit-not-clamped',
      source: replaceOne(
        SOURCE,
        '    _highLimitBulkHistorySmartLimit() {\n        // LEAK-I: clamp even if a caller bypasses _shouldUseHighLimitBulkHistory.\n        if (this._mcHighLimitBulkGateEnabled()) return 2000;\n        const fallback = 100000;',
        '    _highLimitBulkHistorySmartLimit() {\n        const fallback = 100000;',
        'bulk-limit mutant',
      ),
    },
    {
      name: 'lazy-limit-not-clamped',
      source: replaceOne(
        SOURCE,
        '    _lazyReplayMasterSmartLimit() {\n        // LEAK-I: clamp lazy master windows to the normal smart page size.\n        if (this._mcHighLimitBulkGateEnabled()) return 2000;\n        const fallback = 100000;',
        '    _lazyReplayMasterSmartLimit() {\n        const fallback = 100000;',
        'lazy-limit mutant',
      ),
    },
    {
      name: 'disabled-ignores-v1-gate',
      source: replaceOne(
        SOURCE,
        '            // V1 product switch: fix ON (absent/falsy kill) forces high-limit bulk off.\n            if (this._mcHighLimitBulkGateEnabled()) return true;\n            // Kill path: informal disable remains an additional disable (already wired).\n            return typeof window !== \'undefined\'\n                && !!window.__TALARIA_MC_DISABLE_HIGH_LIMIT_BULK;',
        '            return typeof window !== \'undefined\'\n                && !!window.__TALARIA_MC_DISABLE_HIGH_LIMIT_BULK;',
        'disabled-ignores-v1 mutant',
      ),
    },
  ];

  for (const mutant of mutants) {
    assert.throws(() => acceptanceOracle(mutant.source), undefined, `${mutant.name} must be killed`);
    note(`mutant-killed:${mutant.name}`, true);
  }
});

test('Leak I: homepage chart.js mirror is byte-identical', () => {
  const chart = fs.readFileSync(CHART_JS);
  const mirror = fs.readFileSync(CHART_MIRROR);
  const hash = sha256(chart);
  note('mirror-byte-identical', chart.equals(mirror), `sha256=${hash}`);
  assert.equal(sha256(chart), sha256(mirror));
  assert.equal(chart.includes(0x0d), false, 'chart.js must be LF-only');
  assert.equal(mirror.includes(0x0d), false, 'homepage mirror must be LF-only');
});

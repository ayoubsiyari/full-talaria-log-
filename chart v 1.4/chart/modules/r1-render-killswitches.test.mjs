/**
 * R1 render-path runtime kill-switches.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/r1-render-killswitches.test.mjs"
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const EV = 'talariaMcHostDataCommit';
const M23_SWITCH = '__TALARIA_DISABLE_M23_HOST_COMMIT_TEARDOWN_V1';
const M20_Q9_SWITCH = '__TALARIA_DISABLE_M20_Q9_MCDIAG_COUNTERS_V1';
const Q9_DISABLED_FIELDS = ['replayTicks', 'fullResamples'];
const Q9_LIVE_FIELDS = ['incrementalResamples'];

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
const SOURCE = fs.readFileSync(CHART_JS, 'utf8');

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

function helperBlock(text) {
  const from = text.indexOf('const MC_DIAG_COUNTER_FIELDS = [');
  const to = text.indexOf('\nclass Chart {\n', from);
  assert.ok(from >= 0 && to > from, 'mcDiag helper block must precede class Chart');
  return text.slice(from, to);
}

function replaceAllChecked(text, from, to, expected, label) {
  const count = text.split(from).length - 1;
  assert.equal(count, expected, `${label} mutant anchor count`);
  return text.split(from).join(to);
}

function replaceOneChecked(text, from, to, label) {
  return replaceAllChecked(text, from, to, 1, label);
}

const HARNESS = `
class FakeWindow {
  constructor(name) {
    this.__name = name;
    this.__listeners = new Map();
  }
  addEventListener(type, fn) {
    if (!this.__listeners.has(type)) this.__listeners.set(type, []);
    this.__listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const list = this.__listeners.get(type);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
  dispatchEvent(ev) {
    for (const fn of [...(this.__listeners.get(ev.type) || [])]) fn.call(this, ev);
    return true;
  }
  count(type) { return (this.__listeners.get(type) || []).length; }
}
`;

function makePanel({ kill = false, flagPresent = true, source = SOURCE } = {}) {
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, table() {} },
    URLSearchParams,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${helperBlock(source)}\n${HARNESS}`, sandbox);
  vm.runInContext(`
    globalThis.__host = new FakeWindow('host');
    globalThis.window = new FakeWindow('panel');
    globalThis.window.parent = globalThis.__host;
    if (${flagPresent ? 'true' : 'false'}) {
      globalThis.window.${M23_SWITCH} = ${kill ? 'true' : 'false'};
    }
  `, sandbox);
  sandbox.document = {
    documentElement: {
      classList: { contains: (c) => c === 'multichart-embed' },
    },
  };

  const body = [
    methodSource(source, '_isMultichartEmbedPanel'),
    methodSource(source, '_installFinerPanelSelfOwnerHostCommitListener'),
    methodSource(source, '_removeFinerPanelSelfOwnerHostCommitListener'),
  ].join('\n');

  vm.runInContext(`
class PanelChart {
    constructor() {
        this._mcFinerPanelHostCommitGeneration = 0;
        this._mcFinerPanelHostCommitListenerInstalled = false;
        this._mcFinerPanelHostCommitHandler = null;
        this._mcFinerPanelHostCommitTarget = null;
        this._mcFinerPanelHostCommitUnloadHandler = null;
        this.__commits = [];
        this._installFinerPanelSelfOwnerHostCommitListener();
    }

${body}

    _applyFinerPanelHostCommit(detail) { this.__commits.push(detail); }
}
globalThis.__chart = new PanelChart();
`, sandbox);

  return {
    sandbox,
    host: sandbox.__host,
    panel: sandbox.window,
    chart: sandbox.__chart,
    hostCount: () => sandbox.__host.count(EV),
    pagehideCount: () => sandbox.window.count('pagehide'),
    commit: (generation) => sandbox.__host.dispatchEvent({
      type: EV,
      detail: { generation },
    }),
  };
}

function simulateFrameRemove(env, { persisted = false } = {}) {
  env.panel.dispatchEvent({ type: 'pagehide', persisted });
}

function makeDiagChart({ kill = false, flagPresent = true, source = SOURCE } = {}) {
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, table() {} },
    URLSearchParams,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${helperBlock(source)}
globalThis.window = {};
if (${flagPresent ? 'true' : 'false'}) {
    globalThis.window.${M20_Q9_SWITCH} = ${kill ? 'true' : 'false'};
}
class McDiagChart {
    constructor() {
        this._mcDiag = {
            panelId: 'HOST',
            fetches: 0,
            fetchedBars: 0,
            extendsFromParent: 0,
            resamples: 0,
            replayTicks: 0,
            fullResamples: 0,
            incrementalResamples: 0,
            renders: 0,
            seams: 0,
            ownerFetches: 0,
            ownerBars: 0,
            boundedMisses: 0,
            handovers: 0,
            lastFetchMs: 0,
        };
        this.currentFileId = 'file-a';
        this.currentTimeframe = '1m';
        this.replaySystem = {
            updateChartData(autoScroll) {
                globalThis.__slowCalls.push(autoScroll);
                return 'slow';
            },
            updateChartDataFast() {
                globalThis.__fastCalls += 1;
                return 'fast';
            },
        };
    }

${methodSource(source, '_mcDiagWrapReplaySystem')}
${methodSource(source, '_resampleDataFull')}

    _installLazyReplayMasterGuards() {}
    _prepareBarsForResampling() { return []; }
}
globalThis.__slowCalls = [];
globalThis.__fastCalls = 0;
globalThis.__chart = new McDiagChart();
globalThis.__originalFast = globalThis.__chart.replaySystem.updateChartDataFast;
globalThis.__originalSlow = globalThis.__chart.replaySystem.updateChartData;
`, sandbox);
  return {
    sandbox,
    chart: sandbox.__chart,
    originalFast: sandbox.__originalFast,
    originalSlow: sandbox.__originalSlow,
    setKill(value) {
      sandbox.window[M20_Q9_SWITCH] = value;
    },
    snapshot() {
      return vm.runInContext('_talariaMcDiagSnapshot(globalThis.__chart)', sandbox);
    },
  };
}

test('R1 M23 default keeps current teardown behaviour active', () => {
  const env = makePanel();
  note('m23-default-host-listener-installed', env.hostCount() === 1, `host=${env.hostCount()}`);
  note('m23-default-pagehide-installed', env.pagehideCount() === 1, `pagehide=${env.pagehideCount()}`);
  assert.equal(env.hostCount(), 1);
  assert.equal(env.pagehideCount(), 1);

  simulateFrameRemove(env);
  note('m23-default-pagehide-removes-host-listener', env.hostCount() === 0, `host=${env.hostCount()}`);
  assert.equal(env.hostCount(), 0);
});

test('R1 M23 production default with absent flag behaves as flag-off', () => {
  const env = makePanel({ flagPresent: false });
  assert.equal(Object.prototype.hasOwnProperty.call(env.panel, M23_SWITCH), false);
  assert.equal(env.hostCount(), 1);
  assert.equal(env.pagehideCount(), 1);
  simulateFrameRemove(env);
  note('m23-absent-default-removes-host-listener', env.hostCount() === 0, `host=${env.hostCount()}`);
  assert.equal(env.hostCount(), 0);
});

test('R1 M23 kill-switch restores prior permanent host listener exactly', () => {
  const env = makePanel({ kill: true });
  note('m23-kill-host-listener-installed', env.hostCount() === 1, `host=${env.hostCount()}`);
  note('m23-kill-no-pagehide-handler', env.pagehideCount() === 0, `pagehide=${env.pagehideCount()}`);
  assert.equal(env.hostCount(), 1, 'prior behaviour registered on the host');
  assert.equal(env.pagehideCount(), 0, 'prior behaviour installed no panel pagehide teardown');
  assert.equal(env.chart._mcFinerPanelHostCommitTarget, null);
  assert.equal(env.chart._mcFinerPanelHostCommitUnloadHandler, null);

  env.chart._removeFinerPanelSelfOwnerHostCommitListener();
  simulateFrameRemove(env);
  env.commit(1);
  note('m23-kill-removal-has-no-effect', env.hostCount() === 1, `host=${env.hostCount()}`);
  note('m23-kill-commit-still-delivers', env.chart.__commits.length === 1, `commits=${env.chart.__commits.length}`);
  assert.equal(env.hostCount(), 1);
  assert.equal(env.chart.__commits.length, 1);
});

test('R1 M23 mid-session flip is read by teardown call, not stranded at install', () => {
  const env = makePanel();
  assert.equal(env.hostCount(), 1);
  assert.equal(env.pagehideCount(), 1);

  env.panel[M23_SWITCH] = true;
  simulateFrameRemove(env);
  env.commit(7);

  note('m23-mid-session-flip-keeps-host-listener', env.hostCount() === 1, `host=${env.hostCount()}`);
  note('m23-mid-session-flip-still-delivers', env.chart.__commits.length === 1, `commits=${env.chart.__commits.length}`);
  assert.equal(env.hostCount(), 1);
  assert.equal(env.chart.__commits.length, 1);
});

test('R1 M23 ON→OFF resumes teardown without a reload', () => {
  const env = makePanel();
  env.panel[M23_SWITCH] = true;
  env.chart._removeFinerPanelSelfOwnerHostCommitListener();
  assert.equal(env.hostCount(), 1, 'ON phase must preserve the prior permanent listener');

  env.panel[M23_SWITCH] = false;
  env.chart._removeFinerPanelSelfOwnerHostCommitListener();
  note('m23-on-off-removes-after-off', env.hostCount() === 0, `host=${env.hostCount()}`);
  assert.equal(env.hostCount(), 0);
});

test('R1 M20-Q9 default keeps current mcDiag counters active', () => {
  const env = makeDiagChart();
  const { chart } = env;
  chart._mcDiagWrapReplaySystem();
  assert.notEqual(chart.replaySystem.updateChartDataFast, env.originalFast);

  assert.equal(chart.replaySystem.updateChartData(false), 'slow');
  assert.equal(chart.replaySystem.updateChartDataFast(), 'fast');
  chart._resampleDataFull([{ t: 1, o: 1, h: 1, l: 1, c: 1 }], '1m');

  note('m20q9-default-replayTicks', chart._mcDiag.replayTicks === 2, `replayTicks=${chart._mcDiag.replayTicks}`);
  note('m20q9-default-fullResamples', chart._mcDiag.fullResamples === 1, `fullResamples=${chart._mcDiag.fullResamples}`);
  assert.equal(chart._mcDiag.resamples, 1, 'legacy resamples wrapper remains unchanged');
  assert.equal(chart._mcDiag.replayTicks, 2);
  assert.equal(chart._mcDiag.fullResamples, 1);
});

test('R1 M20-Q9 production default with absent flag behaves as flag-off', () => {
  const env = makeDiagChart({ flagPresent: false });
  const { chart } = env;
  assert.equal(Object.prototype.hasOwnProperty.call(env.sandbox.window, M20_Q9_SWITCH), false);
  chart._mcDiagWrapReplaySystem();
  chart.replaySystem.updateChartData(false);
  chart.replaySystem.updateChartDataFast();
  chart._resampleDataFull([{ t: 1, o: 1, h: 1, l: 1, c: 1 }], '1m');
  note('m20q9-absent-default-counts', chart._mcDiag.replayTicks === 2 && chart._mcDiag.fullResamples === 1,
    `replayTicks=${chart._mcDiag.replayTicks} fullResamples=${chart._mcDiag.fullResamples}`);
  assert.equal(chart._mcDiag.replayTicks, 2);
  assert.equal(chart._mcDiag.fullResamples, 1);
});

test('R1 M20-Q9 kill-switch installs no updateChartDataFast wrapper and reports only switched counters as null', () => {
  const env = makeDiagChart({ kill: true });
  const { chart } = env;
  chart._mcDiagWrapReplaySystem();

  note('m20q9-kill-no-fast-wrapper', chart.replaySystem.updateChartDataFast === env.originalFast);
  assert.equal(chart.replaySystem.updateChartDataFast, env.originalFast);
  assert.notEqual(chart.replaySystem.updateChartData, env.originalSlow, 'legacy resamples wrapper is not part of Q9');

  chart.replaySystem.updateChartData(false);
  chart.replaySystem.updateChartDataFast();
  chart._resampleDataFull([{ t: 1, o: 1, h: 1, l: 1, c: 1 }], '1m');
  chart._mcDiag.incrementalResamples++;
  assert.equal(chart._mcDiag.resamples, 1, 'legacy resamples counter remains prior behaviour');
  assert.equal(chart._mcDiag.replayTicks, 0);
  assert.equal(chart._mcDiag.fullResamples, 0);
  assert.equal(chart._mcDiag.incrementalResamples, 1, 'unowned pipeline counter remains live');

  const row = env.snapshot();
  for (const field of Q9_DISABLED_FIELDS) {
    assert.equal(row[field], null, `${field} is null when the Q9 counter packet is disabled`);
  }
  for (const field of Q9_LIVE_FIELDS) {
    assert.equal(row[field], chart._mcDiag[field], `${field} remains reported because it is still measured`);
  }
  note('m20q9-kill-report-honest-fields', true,
    [...Q9_DISABLED_FIELDS, ...Q9_LIVE_FIELDS].map((field) => `${field}=${row[field]}`).join(', '));
});

test('R1 M20-Q9 ON→OFF resumes fast-path counting without a reload', () => {
  const env = makeDiagChart();
  const { chart } = env;
  chart._mcDiagWrapReplaySystem();
  assert.notEqual(chart.replaySystem.updateChartDataFast, env.originalFast);

  chart.replaySystem.updateChartDataFast();
  assert.equal(chart._mcDiag.replayTicks, 1);

  env.setKill(true);
  chart.replaySystem.updateChartData(false);
  chart.replaySystem.updateChartDataFast();
  chart._resampleDataFull([{ t: 1, o: 1, h: 1, l: 1, c: 1 }], '1m');

  note('m20q9-mid-session-no-new-q9-counts', chart._mcDiag.replayTicks === 1 && chart._mcDiag.fullResamples === 0,
    `replayTicks=${chart._mcDiag.replayTicks} fullResamples=${chart._mcDiag.fullResamples}`);
  assert.equal(chart._mcDiag.resamples, 1, 'legacy resamples counter still moves');
  assert.equal(chart._mcDiag.replayTicks, 1);
  assert.equal(chart._mcDiag.fullResamples, 0);
  assert.notEqual(chart.replaySystem.updateChartDataFast, env.originalFast, 'mid-session disabled wrapper stays reversible');

  const row = env.snapshot();
  for (const field of Q9_DISABLED_FIELDS) assert.equal(row[field], null);

  env.setKill(false);
  chart.replaySystem.updateChartDataFast();
  chart._resampleDataFull([{ t: 2, o: 1, h: 1, l: 1, c: 1 }], '1m');
  note('m20q9-on-off-fast-counting-resumes', chart._mcDiag.replayTicks === 2 && chart._mcDiag.fullResamples === 1,
    `replayTicks=${chart._mcDiag.replayTicks} fullResamples=${chart._mcDiag.fullResamples}`);
  assert.equal(chart._mcDiag.replayTicks, 2);
  assert.equal(chart._mcDiag.fullResamples, 1);
  assert.notEqual(chart.replaySystem.updateChartDataFast, env.originalFast);
});

function m23DefaultTeardownPass(source) {
  const env = makePanel({ flagPresent: false, source });
  simulateFrameRemove(env);
  return env.hostCount() === 0;
}

function m23KillPriorPass(source) {
  const env = makePanel({ kill: true, source });
  env.chart._removeFinerPanelSelfOwnerHostCommitListener();
  simulateFrameRemove(env);
  env.commit(1);
  return env.hostCount() === 1
    && env.pagehideCount() === 0
    && env.chart.__commits.length === 1;
}

function m23MidFlipPass(source) {
  const env = makePanel({ source });
  env.panel[M23_SWITCH] = true;
  simulateFrameRemove(env);
  env.commit(2);
  return env.hostCount() === 1 && env.chart.__commits.length === 1;
}

function m23OnOffPass(source) {
  const env = makePanel({ source });
  env.panel[M23_SWITCH] = true;
  env.chart._removeFinerPanelSelfOwnerHostCommitListener();
  if (env.hostCount() !== 1) return false;
  env.panel[M23_SWITCH] = false;
  env.chart._removeFinerPanelSelfOwnerHostCommitListener();
  return env.hostCount() === 0;
}

function m20DefaultPass(source) {
  const env = makeDiagChart({ flagPresent: false, source });
  const { chart } = env;
  chart._mcDiagWrapReplaySystem();
  chart.replaySystem.updateChartData(false);
  chart.replaySystem.updateChartDataFast();
  chart._resampleDataFull([{ t: 1, o: 1, h: 1, l: 1, c: 1 }], '1m');
  return chart.replaySystem.updateChartDataFast !== env.originalFast
    && chart._mcDiag.replayTicks === 2
    && chart._mcDiag.fullResamples === 1;
}

function m20KillPriorPass(source) {
  const env = makeDiagChart({ kill: true, source });
  const { chart } = env;
  chart._mcDiagWrapReplaySystem();
  chart.replaySystem.updateChartData(false);
  chart.replaySystem.updateChartDataFast();
  chart._resampleDataFull([{ t: 1, o: 1, h: 1, l: 1, c: 1 }], '1m');
  chart._mcDiag.incrementalResamples++;
  const row = env.snapshot();
  return chart.replaySystem.updateChartDataFast === env.originalFast
    && chart._mcDiag.replayTicks === 0
    && chart._mcDiag.fullResamples === 0
    && chart._mcDiag.incrementalResamples === 1
    && Q9_DISABLED_FIELDS.every((field) => row[field] === null)
    && Q9_LIVE_FIELDS.every((field) => row[field] === 1);
}

function m20MidFlipPass(source) {
  const env = makeDiagChart({ source });
  const { chart } = env;
  chart._mcDiagWrapReplaySystem();
  chart.replaySystem.updateChartDataFast();
  env.setKill(true);
  chart.replaySystem.updateChartData(false);
  chart.replaySystem.updateChartDataFast();
  chart._resampleDataFull([{ t: 1, o: 1, h: 1, l: 1, c: 1 }], '1m');
  if (chart._mcDiag.replayTicks !== 1 || chart._mcDiag.fullResamples !== 0) return false;
  env.setKill(false);
  chart.replaySystem.updateChartDataFast();
  chart._resampleDataFull([{ t: 2, o: 1, h: 1, l: 1, c: 1 }], '1m');
  return chart.replaySystem.updateChartDataFast !== env.originalFast
    && chart._mcDiag.replayTicks === 2
    && chart._mcDiag.fullResamples === 1;
}

function m23DeletedReadMutant() {
  return replaceAllChecked(
    SOURCE,
    `&& window.${M23_SWITCH} === true`,
    '&& false',
    2,
    'M23 deleted read',
  );
}

function m23InvertedReadMutant() {
  return replaceAllChecked(
    SOURCE,
    `&& window.${M23_SWITCH} === true`,
    `&& window.${M23_SWITCH} !== true`,
    2,
    'M23 inverted read',
  );
}

function m23InvertedDefaultingMutant() {
  return replaceAllChecked(
    SOURCE,
    `&& window.${M23_SWITCH} === true`,
    `&& window.${M23_SWITCH} !== false`,
    2,
    'M23 inverted defaulting read',
  );
}

function m23SampledOnceMutant() {
  const installNeedle = `            this._mcFinerPanelHostCommitListenerInstalled = true;
            if (typeof window !== 'undefined'
                && window.${M23_SWITCH} === true) {`;
  const installReplacement = `            this._mcFinerPanelHostCommitListenerInstalled = true;
            this.__r1M23TeardownDisabledAtInstall = typeof window !== 'undefined'
                && window.${M23_SWITCH} === true;
            if (this.__r1M23TeardownDisabledAtInstall) {`;
  let mutated = replaceOneChecked(SOURCE, installNeedle, installReplacement, 'M23 sampled install');
  const removeNeedle = `            if (typeof window !== 'undefined'
                && window.${M23_SWITCH} === true) {`;
  mutated = replaceOneChecked(mutated, removeNeedle, '            if (this.__r1M23TeardownDisabledAtInstall === true) {', 'M23 sampled remove');
  return mutated;
}

function m20DeletedReadMutant() {
  const oldFn = `function _talariaM20Q9McDiagCountersDisabled() {
    try {
        return typeof window !== 'undefined'
            && window.${M20_Q9_SWITCH} === true;
    } catch (_e) {
        return false;
    }
}`;
  const newFn = `function _talariaM20Q9McDiagCountersDisabled() {
    return false;
}`;
  return replaceOneChecked(SOURCE, oldFn, newFn, 'M20-Q9 deleted read');
}

function m20InvertedReadMutant() {
  const oldFn = `function _talariaM20Q9McDiagCountersDisabled() {
    try {
        return typeof window !== 'undefined'
            && window.${M20_Q9_SWITCH} === true;
    } catch (_e) {
        return false;
    }
}`;
  const newFn = `function _talariaM20Q9McDiagCountersDisabled() {
    try {
        return typeof window === 'undefined'
            || window.${M20_Q9_SWITCH} !== true;
    } catch (_e) {
        return true;
    }
}`;
  return replaceOneChecked(SOURCE, oldFn, newFn, 'M20-Q9 inverted read');
}

function m20InvertedDefaultingMutant() {
  const oldFn = `function _talariaM20Q9McDiagCountersDisabled() {
    try {
        return typeof window !== 'undefined'
            && window.${M20_Q9_SWITCH} === true;
    } catch (_e) {
        return false;
    }
}`;
  const newFn = `function _talariaM20Q9McDiagCountersDisabled() {
    try {
        return typeof window === 'undefined'
            || window.${M20_Q9_SWITCH} !== false;
    } catch (_e) {
        return true;
    }
}`;
  return replaceOneChecked(SOURCE, oldFn, newFn, 'M20-Q9 inverted defaulting read');
}

function m20SampledOnceMutant() {
  const oldFn = `function _talariaM20Q9McDiagCountersDisabled() {
    try {
        return typeof window !== 'undefined'
            && window.${M20_Q9_SWITCH} === true;
    } catch (_e) {
        return false;
    }
}`;
  const newFn = `let __r1M20Q9DisabledAtInit;
function _talariaM20Q9McDiagCountersDisabled() {
    if (__r1M20Q9DisabledAtInit !== undefined) return __r1M20Q9DisabledAtInit;
    try {
        __r1M20Q9DisabledAtInit = typeof window !== 'undefined'
            && window.${M20_Q9_SWITCH} === true;
    } catch (_e) {
        __r1M20Q9DisabledAtInit = false;
    }
    return __r1M20Q9DisabledAtInit;
}`;
  return replaceOneChecked(SOURCE, oldFn, newFn, 'M20-Q9 sampled once');
}

test('R1 mutation guards: M23 flag read deleted, inverted, or sampled once is caught', () => {
  assert.equal(m23KillPriorPass(SOURCE), true, 'unmutated M23 kill oracle must pass before mutation score');
  assert.equal(m23DefaultTeardownPass(SOURCE), true, 'unmutated M23 absent-default oracle must pass before mutation score');
  assert.equal(m23MidFlipPass(SOURCE), true, 'unmutated M23 mid-session oracle must pass before mutation score');
  assert.equal(m23OnOffPass(SOURCE), true, 'unmutated M23 ON→OFF oracle must pass before mutation score');

  assert.equal(m23KillPriorPass(m23DeletedReadMutant()), false, 'deleted M23 read must fail kill oracle');
  assert.equal(m23DefaultTeardownPass(m23InvertedReadMutant()), false, 'inverted M23 read must fail default oracle');
  assert.equal(m23DefaultTeardownPass(m23InvertedDefaultingMutant()), false, 'inverted-defaulting M23 read must fail absent-default oracle');
  assert.equal(m23MidFlipPass(m23SampledOnceMutant()), false, 'sampled-once M23 read must fail mid-session oracle');
  note('m23-mutation-guards', true, 'deleted, inverted, inverted-defaulting, sampled-once mutants rejected');
});

test('R1 mutation guards: M20-Q9 flag read deleted, inverted, or sampled once is caught', () => {
  assert.equal(m20KillPriorPass(SOURCE), true, 'unmutated M20-Q9 kill oracle must pass before mutation score');
  assert.equal(m20DefaultPass(SOURCE), true, 'unmutated M20-Q9 absent-default oracle must pass before mutation score');
  assert.equal(m20MidFlipPass(SOURCE), true, 'unmutated M20-Q9 ON→OFF oracle must pass before mutation score');

  assert.equal(m20KillPriorPass(m20DeletedReadMutant()), false, 'deleted M20-Q9 read must fail kill oracle');
  assert.equal(m20DefaultPass(m20InvertedReadMutant()), false, 'inverted M20-Q9 read must fail default oracle');
  assert.equal(m20DefaultPass(m20InvertedDefaultingMutant()), false, 'inverted-defaulting M20-Q9 read must fail absent-default oracle');
  assert.equal(m20MidFlipPass(m20SampledOnceMutant()), false, 'sampled-once M20-Q9 read must fail ON→OFF oracle');
  note('m20q9-mutation-guards', true, 'deleted, inverted, inverted-defaulting, sampled-once mutants rejected');
});

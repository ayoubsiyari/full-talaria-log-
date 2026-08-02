/**
 * ORPHAN-L1 — MultichartManager.removeChart unregisters finer host-commit
 * listener on the parent window BEFORE iframe death.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/orphan-l1-finer-host-commit-unregister.test.mjs"
 *
 * Defect: Chart._installFinerPanelSelfOwnerHostCommitListener registers
 * `talariaMcHostDataCommit` on window.parent with a closure over the panel
 * Chart. M23 pagehide teardown is not enough — orphans remain when pagehide
 * does not run (or runs too late). Manager removeChart must unregister first.
 *
 * Kill-switch (frozen): __TALARIA_DISABLE_MC_FINER_HOST_COMMIT_UNREGISTER_V1
 *   - absent / falsy → fix ON (default)
 *   - truthy → kill (legacy orphan may survive removeChart)
 *   - read per call on the manager realm only
 *   - MUST NOT gate `_removeFinerPanelSelfOwnerHostCommitListener` (pagehide)
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const EV = 'talariaMcHostDataCommit';
const SWITCH = '__TALARIA_DISABLE_MC_FINER_HOST_COMMIT_UNREGISTER_V1';
const M23_SWITCH = '__TALARIA_DISABLE_M23_HOST_COMMIT_TEARDOWN_V1';

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
const CHART_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js');
const MANAGER_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'multichart-prod', 'multichart-manager.js');
const MANAGER_MIRROR = path.join(
  ROOT, 'homepage', 'public', 'chart', 'multichart-prod', 'multichart-manager.js',
);
const CHART_SOURCE = fs.readFileSync(CHART_JS, 'utf8');
const MANAGER_SOURCE = fs.readFileSync(MANAGER_JS, 'utf8');

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function methodSource(text, name, { optional = false } = {}) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `^    ${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  if (!match) {
    if (optional) return '';
    throw new Error(`method ${name} missing from chart.js`);
  }
  return match[0];
}

function replaceOne(text, from, to, label) {
  const count = text.split(from).length - 1;
  assert.equal(count, 1, `${label}: expected exactly one anchor`);
  return text.replace(from, to);
}

// ── panel realm (product install/remove methods) ───────────────────────────

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

function makePanel({ chartSource = CHART_SOURCE, panelKill = undefined } = {}) {
  const sandbox = { console: { log() {}, warn() {}, error() {} } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(HARNESS, sandbox);
  vm.runInContext(`
    globalThis.__host = new FakeWindow('host');
    globalThis.window = new FakeWindow('panel');
    globalThis.window.parent = globalThis.__host;
  `, sandbox);
  sandbox.document = {
    documentElement: {
      classList: { contains: (c) => c === 'multichart-embed' },
    },
  };
  if (panelKill !== undefined) {
    sandbox.window[SWITCH] = panelKill;
  }

  const body = [
    methodSource(chartSource, '_isMultichartEmbedPanel'),
    methodSource(chartSource, '_installFinerPanelSelfOwnerHostCommitListener'),
    methodSource(chartSource, '_removeFinerPanelSelfOwnerHostCommitListener'),
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
  };
}

// ── manager realm (product removeChart) ────────────────────────────────────

function loadManager({ managerSource = MANAGER_SOURCE, kill = undefined } = {}) {
  const context = {
    console,
    setTimeout,
    clearTimeout,
  };
  context.window = context;
  context.globalThis = context;
  context.MultichartGuards = {};
  context.addEventListener = () => {};
  context.removeEventListener = () => {};
  if (kill !== undefined) context[SWITCH] = kill;
  vm.createContext(context);
  vm.runInContext(managerSource, context, { filename: MANAGER_JS });
  return { MultichartManager: context.MultichartManager, global: context };
}

function makeManager(opts = {}) {
  const { MultichartManager } = loadManager(opts);
  return new MultichartManager({
    container: {},
    onLog: () => {},
    onState: () => {},
    onAssertion: () => {},
  });
}

/**
 * Wire a live panel chart into a manager entry. frame.remove does NOT fire
 * pagehide — that is the ORPHAN-L1 gap M23 alone cannot close.
 */
function installPanel(manager, chart, calls = []) {
  const host = chart._mcFinerPanelHostCommitTarget;
  const frame = {
    contentWindow: { chart },
    remove: () => { calls.push('frame.remove'); },
  };
  manager.charts.set('B', { id: 'B', frame, ready: true });
  return { calls, host, hostCount: () => host.count(EV) };
}

// ── acceptance ─────────────────────────────────────────────────────────────

test('ORPHAN-L1: removeChart clears parent talariaMcHostDataCommit before iframe death', () => {
  const env = makePanel();
  assert.equal(env.hostCount(), 1, 'precondition: panel registered on host');
  assert.ok(env.chart._mcFinerPanelHostCommitHandler, 'precondition: handler ref set');

  const manager = makeManager();
  const { calls, hostCount } = installPanel(manager, env.chart);
  const order = [];
  const origRemove = env.chart._removeFinerPanelSelfOwnerHostCommitListener.bind(env.chart);
  env.chart._removeFinerPanelSelfOwnerHostCommitListener = function wrapped() {
    order.push('unregister');
    return origRemove();
  };
  const frame = manager.charts.get('B').frame;
  const origFrameRemove = frame.remove;
  frame.remove = () => {
    order.push('frame.remove');
    origFrameRemove();
  };

  manager.removeChart('B');

  note('host-listeners-zero-after-removeChart', hostCount() === 0, `host=${hostCount()}`);
  assert.equal(hostCount(), 0, 'parent must have 0 host-commit listeners after removeChart');
  note('handler-refs-nulled', env.chart._mcFinerPanelHostCommitHandler === null
    && env.chart._mcFinerPanelHostCommitTarget === null
    && env.chart._mcFinerPanelHostCommitUnloadHandler === null);
  assert.equal(env.chart._mcFinerPanelHostCommitHandler, null);
  assert.equal(env.chart._mcFinerPanelHostCommitTarget, null);
  assert.equal(env.chart._mcFinerPanelHostCommitUnloadHandler, null);
  note('unregister-before-iframe-death',
    order[0] === 'unregister' && order.includes('frame.remove'),
    `order=${order.join(',')}`);
  assert.deepEqual(order, ['unregister', 'frame.remove']);
  assert.equal(manager.charts.has('B'), false);
  assert.deepEqual(calls, ['frame.remove']);
});

test('ORPHAN-L1: kill switch restores legacy orphan (listener may survive removeChart)', () => {
  const env = makePanel();
  assert.equal(env.hostCount(), 1);
  const handler = env.chart._mcFinerPanelHostCommitHandler;

  const manager = makeManager({ kill: true });
  const { hostCount } = installPanel(manager, env.chart);

  manager.removeChart('B');

  note('kill-leaves-host-listener', hostCount() === 1, `host=${hostCount()}`);
  assert.equal(hostCount(), 1, 'kill must leave the parent listener registered');
  note('kill-preserves-handler-ref', env.chart._mcFinerPanelHostCommitHandler === handler);
  assert.equal(env.chart._mcFinerPanelHostCommitHandler, handler);
});

test('ORPHAN-L1: kill is truthiness (not === true only)', () => {
  for (const truthy of [true, 1, '1', 'yes', {}]) {
    const env = makePanel();
    const manager = makeManager({ kill: truthy });
    const { hostCount } = installPanel(manager, env.chart);
    manager.removeChart('B');
    note(`truthy-kill-${String(truthy)}`, hostCount() === 1, `host=${hostCount()}`);
    assert.equal(hostCount(), 1, `truthy kill value ${JSON.stringify(truthy)} must disable unregister`);
  }

  for (const falsy of [false, 0, '', null]) {
    const env = makePanel();
    const manager = makeManager({ kill: falsy });
    const { hostCount } = installPanel(manager, env.chart);
    manager.removeChart('B');
    note(`falsy-kill-${String(falsy)}`, hostCount() === 0, `host=${hostCount()}`);
    assert.equal(hostCount(), 0, `falsy ${JSON.stringify(falsy)} must keep fix ON`);
  }
});

test('ORPHAN-L1: manager kill ON + pagehide still clears host listener to 0', () => {
  // Manager kill must not strand pagehide: L1 gate lives on removeChart only.
  const env = makePanel({ panelKill: true });
  assert.equal(env.hostCount(), 1, 'precondition: panel registered');
  assert.equal(!!env.panel[SWITCH], true, 'precondition: panel-realm L1 kill truthy');

  const manager = makeManager({ kill: true });
  const { hostCount } = installPanel(manager, env.chart);
  manager.removeChart('B');
  note('manager-kill-leaves-orphan-after-removeChart', hostCount() === 1, `host=${hostCount()}`);
  assert.equal(hostCount(), 1, 'manager kill must skip removeChart unregister');

  // pagehide backup must still sever — panel SWITCH must not gate the helper.
  env.panel.dispatchEvent({ type: 'pagehide', persisted: false });
  note('pagehide-clears-under-manager-kill', env.hostCount() === 0, `host=${env.hostCount()}`);
  assert.equal(env.hostCount(), 0, 'pagehide must clear host listener even when L1 kill is ON');
  assert.equal(env.chart._mcFinerPanelHostCommitHandler, null);
});

test('ORPHAN-L1: manager kill is read per removeChart call', () => {
  const env = makePanel();
  const { MultichartManager, global } = loadManager({ kill: true });
  const manager = new MultichartManager({
    container: {},
    onLog: () => {},
    onState: () => {},
    onAssertion: () => {},
  });
  const { hostCount } = installPanel(manager, env.chart);

  // Still killed at call time → orphan.
  assert.equal(!!global[SWITCH], true);
  // Do not remove yet — flip OFF on the same realm, then removeChart.
  delete global[SWITCH];
  assert.equal(Object.prototype.hasOwnProperty.call(global, SWITCH), false);

  manager.removeChart('B');
  note('manager-mid-session-off-clears', hostCount() === 0, `host=${hostCount()}`);
  assert.equal(hostCount(), 0, 'per-call read must see the cleared switch');
});

test('ORPHAN-L1: pagehide backup still unregisters when manager path is unused', () => {
  const env = makePanel();
  assert.equal(env.hostCount(), 1);
  env.panel.dispatchEvent({ type: 'pagehide', persisted: false });
  note('pagehide-backup-clears-host', env.hostCount() === 0, `host=${env.hostCount()}`);
  assert.equal(env.hostCount(), 0);
  assert.equal(env.chart._mcFinerPanelHostCommitHandler, null);
});

test('ORPHAN-L1: structural — removeChart calls _removeFinerPanelSelfOwnerHostCommitListener before frame.remove', () => {
  const removeChart = MANAGER_SOURCE.match(
    /MultichartManager\.prototype\.removeChart\s*=\s*function\s*\([^)]*\)\s*\{[\s\S]*?\n    \};/,
  );
  assert.ok(removeChart, 'removeChart method must exist');
  const body = removeChart[0];
  const unregIdx = body.indexOf('_removeFinerPanelSelfOwnerHostCommitListener');
  const frameIdx = body.indexOf('c.frame.remove()');
  note('structural-unregister-before-frame-remove',
    unregIdx >= 0 && frameIdx >= 0 && unregIdx < frameIdx,
    `unreg@${unregIdx} frame@${frameIdx}`);
  assert.ok(unregIdx >= 0, 'removeChart must call panel unregister');
  assert.ok(frameIdx >= 0, 'removeChart must still remove the iframe');
  assert.ok(unregIdx < frameIdx, 'unregister must precede iframe removal');
  assert.ok(
    body.includes('mcFinerHostCommitUnregisterV1Enabled')
      || body.includes(SWITCH),
    'removeChart path must be gated by the frozen kill-switch',
  );
  assert.ok(
    MANAGER_SOURCE.includes(SWITCH),
    'manager must mention the frozen kill-switch name',
  );

  const removeHelper = methodSource(CHART_SOURCE, '_removeFinerPanelSelfOwnerHostCommitListener');
  note('helper-no-l1-kill-gate', !removeHelper.includes(SWITCH));
  assert.equal(
    removeHelper.includes(SWITCH),
    false,
    'panel helper must not gate on L1 kill (would no-op pagehide)',
  );
  assert.ok(
    removeHelper.includes(M23_SWITCH),
    'panel helper must still honor M23 teardown kill',
  );
});

test('ORPHAN-L1: mutant that skips unregister fails the census', () => {
  const mutant = replaceOne(
    MANAGER_SOURCE,
    'panelChart._removeFinerPanelSelfOwnerHostCommitListener();',
    '/* mutant: skip unregister */;',
    'unregister call',
  );
  const env = makePanel();
  const { MultichartManager } = loadManager({ managerSource: mutant });
  const manager = new MultichartManager({
    container: {},
    onLog: () => {},
    onState: () => {},
    onAssertion: () => {},
  });
  const { hostCount } = installPanel(manager, env.chart);
  manager.removeChart('B');

  const leaked = hostCount() === 1;
  note('mutant-skip-unregister-leaks', leaked, `host=${hostCount()}`);
  assert.equal(hostCount(), 1, 'mutant must leave the host listener (proves the gate is real)');

  // Production (non-mutant) still clears — discrimination.
  const env2 = makePanel();
  const manager2 = makeManager();
  const wired2 = installPanel(manager2, env2.chart);
  manager2.removeChart('B');
  note('production-clears-against-mutant', wired2.hostCount() === 0, `host=${wired2.hostCount()}`);
  assert.equal(wired2.hostCount(), 0);
});

test('ORPHAN-L1: mirrors are byte-identical LF', () => {
  const chart = fs.readFileSync(CHART_JS);
  const chartMirror = fs.readFileSync(CHART_MIRROR);
  const mgr = fs.readFileSync(MANAGER_JS);
  const mgrMirror = fs.readFileSync(MANAGER_MIRROR);

  note('chart-lf', !chart.includes(0x0d));
  note('chart-mirror-lf', !chartMirror.includes(0x0d));
  note('manager-lf', !mgr.includes(0x0d));
  note('manager-mirror-lf', !mgrMirror.includes(0x0d));
  assert.equal(chart.includes(0x0d), false, 'chart.js must be LF-only');
  assert.equal(chartMirror.includes(0x0d), false, 'homepage chart.js must be LF-only');
  assert.equal(mgr.includes(0x0d), false, 'multichart-manager.js must be LF-only');
  assert.equal(mgrMirror.includes(0x0d), false, 'homepage manager must be LF-only');

  note('chart-mirror-identical', chart.equals(chartMirror), `sha256=${sha256(chart)}`);
  note('manager-mirror-identical', mgr.equals(mgrMirror), `sha256=${sha256(mgr)}`);
  assert.ok(chart.equals(chartMirror), 'homepage chart.js must be a plain byte copy');
  assert.ok(mgr.equals(mgrMirror), 'homepage multichart-manager.js must be a plain byte copy');
});

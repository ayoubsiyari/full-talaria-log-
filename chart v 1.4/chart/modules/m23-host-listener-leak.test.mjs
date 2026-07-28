/**
 * M23 — multichart panel leaks a permanent listener on the HOST window.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m23-host-listener-leak.test.mjs"
 *
 * Defect: `_installFinerPanelSelfOwnerHostCommitListener()` (chart.js) runs for
 * every multichart embed panel and does
 *
 *     parentWin.addEventListener('talariaMcHostDataCommit', handler)
 *
 * on `window.parent` — the HOST realm — with a handler closing over the panel's
 * `Chart`. Nothing ever removes it, so every panel boot strands a listener on a
 * window that outlives the panel, retaining that Chart's rawData, indicator
 * caches and canvases for the life of the session.
 *
 * This suite is STRUCTURAL, not performance: it asserts listener census on the
 * host, never timings. It executes the real product method text extracted from
 * chart.js in a fresh VM realm, so it cannot pass against a re-implementation.
 *
 * Teardown modelling is grounded in measured Chromium behaviour (Edge
 * headless=new): removing a panel iframe fires `pagehide` (persisted=false)
 * and then `unload` in the panel realm, synchronously, while `window.parent`
 * still resolves to the host. `simulateFrameRemove()` replays exactly that.
 *
 * Scope: canonical tree only. The homepage/public mirror is a separate packet,
 * so no dual-tree parity row here by design.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const EV = 'talariaMcHostDataCommit';

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

/** Extract one class method's exact product text from chart.js. */
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

// ── two-realm harness ──────────────────────────────────────────────────────

const HARNESS = `
class FakeWindow {
  constructor(name) {
    this.__name = name;
    this.__listeners = new Map();
    this.__removeFault = null;
  }
  addEventListener(type, fn) {
    if (!this.__listeners.has(type)) this.__listeners.set(type, []);
    this.__listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    if (this.__removeFault) throw this.__removeFault;
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

/** Build the panel realm; `window` must exist before the constructor runs. */
function makePanel({ embed = true, parentOf = null } = {}) {
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
      classList: { contains: (c) => embed && c === 'multichart-embed' },
    },
  };
  if (parentOf === 'self') {
    vm.runInContext('globalThis.window.parent = globalThis.window;', sandbox);
  }

  const body = [
    methodSource(SOURCE, '_isMultichartEmbedPanel'),
    methodSource(SOURCE, '_installFinerPanelSelfOwnerHostCommitListener'),
    methodSource(SOURCE, '_removeFinerPanelSelfOwnerHostCommitListener', { optional: true }),
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
    commit: (generation) => sandbox.__host.dispatchEvent({
      type: EV,
      detail: { generation },
    }),
  };
}

/**
 * Replay the measured Chromium teardown of `frame.remove()`: pagehide with
 * persisted=false, then unload, both in the panel realm.
 */
function simulateFrameRemove(env, { persisted = false } = {}) {
  env.panel.dispatchEvent({ type: 'pagehide', persisted });
  if (!persisted) env.panel.dispatchEvent({ type: 'unload' });
}

// ── the RED assertion ──────────────────────────────────────────────────────

test('M23: a removed multichart panel leaves ZERO talariaMcHostDataCommit listeners on the host', () => {
  const env = makePanel();

  const booted = env.hostCount();
  note('panel-boot-registers-on-host', booted === 1, `hostListeners=${booted}`);
  assert.equal(booted, 1, 'precondition: panel must register exactly one host listener');

  simulateFrameRemove(env);

  const after = env.hostCount();
  note('host-listener-census-zero-after-teardown', after === 0, `hostListeners=${after}`);
  assert.equal(
    after,
    0,
    `LEAK: ${after} '${EV}' listener(s) still registered on the host window after the `
    + 'panel was torn down; the handler closure retains the destroyed panel Chart.',
  );
});

test('M23: repeated panel boot/teardown cycles do not accumulate host listeners', () => {
  const counts = [];
  for (let i = 0; i < 25; i += 1) {
    const env = makePanel();
    simulateFrameRemove(env);
    counts.push(env.hostCount());
  }
  const worst = Math.max(...counts);
  note('repeated-cycles-flat', worst === 0, `maxResidualPerCycle=${worst}`);
  assert.equal(worst, 0);
});

// ── guards against the opposite failure: removing too eagerly ──────────────

test('M23: a LIVE panel still receives host data commits (no eager removal)', () => {
  const env = makePanel();
  env.commit(1);
  env.commit(2);
  note('live-panel-receives-commits', env.chart.__commits.length === 2,
    `commits=${env.chart.__commits.length}`);
  note('live-panel-listener-retained', env.hostCount() === 1, `hostListeners=${env.hostCount()}`);
  assert.equal(env.chart.__commits.length, 2);
  assert.equal(env.hostCount(), 1);
});

test('M23: bfcache pagehide (persisted=true) must NOT remove the listener', () => {
  const env = makePanel();
  simulateFrameRemove(env, { persisted: true });

  const kept = env.hostCount();
  note('bfcache-pagehide-keeps-listener', kept === 1, `hostListeners=${kept}`);
  assert.equal(kept, 1, 'persisted pagehide means the document is cached, not destroyed');

  env.commit(1);
  note('bfcache-restore-still-delivers', env.chart.__commits.length === 1,
    `commits=${env.chart.__commits.length}`);
  assert.equal(env.chart.__commits.length, 1);
});

test('M23: generation de-duplication still holds after the listener lifecycle change', () => {
  const env = makePanel();
  env.commit(5);
  env.commit(3); // stale generation — must be dropped
  env.commit(6);
  // Join rather than deep-compare: __commits is an Array from the VM realm,
  // so its prototype is not reference-equal to this realm's Array.prototype.
  const gens = Array.from(env.chart.__commits, (d) => d.generation).join(',');
  note('generation-dedup-preserved', gens === '5,6', `gens=${gens}`);
  assert.equal(gens, '5,6');
});

// ── realm-correctness guards ───────────────────────────────────────────────

test('M23: removal targets the captured host window, not a re-read window.parent', () => {
  const env = makePanel();
  // A re-read of window.parent at teardown could resolve to something other
  // than the window that received addEventListener. Removal must not be
  // fooled into cleaning the wrong realm and reporting success.
  vm.runInContext(`
    globalThis.__decoy = new FakeWindow('decoy');
    globalThis.window.parent = globalThis.__decoy;
  `, env.sandbox);

  simulateFrameRemove(env);

  const hostLeft = env.hostCount();
  const decoyTouched = env.sandbox.__decoy.count(EV);
  note('removal-uses-captured-host-ref', hostLeft === 0 && decoyTouched === 0,
    `host=${hostLeft} decoy=${decoyTouched}`);
  assert.equal(hostLeft, 0, 'removal must clean the window that actually holds the listener');
});

test('M23: teardown never throws, even if the host removeEventListener throws', () => {
  const env = makePanel();
  env.host.__removeFault = new Error('cross-origin-ish removal failure');
  assert.doesNotThrow(() => simulateFrameRemove(env));
  note('teardown-throw-contained', true);
});

test('M23: a non-embed chart registers nothing and tears down cleanly', () => {
  const env = makePanel({ embed: false });
  note('non-embed-registers-nothing', env.hostCount() === 0, `hostListeners=${env.hostCount()}`);
  assert.equal(env.hostCount(), 0);
  assert.doesNotThrow(() => simulateFrameRemove(env));
});

test('M23: a top-level chart (window.parent === window) registers nothing', () => {
  const env = makePanel({ parentOf: 'self' });
  note('top-level-registers-nothing', env.hostCount() === 0, `hostListeners=${env.hostCount()}`);
  assert.equal(env.hostCount(), 0);
});

// ── structural: cross-realm registrations in chart.js must be paired ───────

test('M23: chart.js pairs every talariaMcHostDataCommit registration with a removal', () => {
  const adds = (SOURCE.match(new RegExp(`addEventListener\\(\\s*'${EV}'`, 'g')) || []).length;
  const removes = (SOURCE.match(new RegExp(`removeEventListener\\(\\s*'${EV}'`, 'g')) || []).length;
  note('event-registration-balanced', adds >= 1 && removes >= adds,
    `addEventListener=${adds} removeEventListener=${removes}`);
  assert.ok(adds >= 1, 'the registration site should still exist');
  assert.ok(
    removes >= adds,
    `unpaired cross-realm registration: ${adds} addEventListener('${EV}') site(s) `
    + `but only ${removes} removeEventListener('${EV}') site(s) in chart.js`,
  );
});

test('M23: every window.parent.addEventListener site in chart.js has a matching removal', () => {
  const addTypes = [...SOURCE.matchAll(/window\.parent\.addEventListener\(\s*'([^']+)'/g)]
    .map((m) => m[1]);
  const removeTypes = new Set(
    [...SOURCE.matchAll(/window\.parent\.removeEventListener\(\s*'([^']+)'/g)].map((m) => m[1]),
  );
  const unpaired = [...new Set(addTypes)].filter((t) => !removeTypes.has(t));
  note('window-parent-registrations-paired', unpaired.length === 0,
    unpaired.length ? `unpaired=${unpaired.join(',')}` : `paired=${[...new Set(addTypes)].join(',')}`);
  assert.deepEqual(unpaired, []);
});

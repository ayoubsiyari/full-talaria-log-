/**
 * M25 — `renderPending` becomes a per-instance accessor that counts frame demands.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m25-render-pending-accessor.test.mjs"
 *
 * Instrumentation only. `animate()` stays unconditional and no render behaviour
 * changes; the point is to make the next loop-guard packet provable by letting a
 * real session answer "which code paths actually demand frames".
 *
 * WHAT THIS SUITE EXECUTES, AND WHAT IT CANNOT
 *
 * The real `Chart` constructor calls `init()`, `animate()`, `resize()`, d3, the
 * drawing-tool manager and the data pipeline — it is not constructible under
 * `node --test` without a DOM. So the harness lifts the *product bytes* of the
 * `renderPending` initialisation straight out of chart.js and runs them as the
 * body of a real constructor, reached through `new`. Every instance under test
 * therefore had the accessor installed by product text, never by a copy of it
 * living in this file, and never by `Object.create(Chart.prototype)` — that
 * pattern (b70-indicator-pure-paint.test.mjs:216,266) bypasses a per-instance
 * accessor entirely and would make the arming assertions vacuous.
 *
 * Arming sites are covered at two tiers, declared per site in the output:
 *   TIER-A  the real enclosing chart.js method text is executed against an
 *           instance driven to the state that reaches the write.
 *   TIER-B  the enclosing function cannot run without instantiating
 *           ReplaySystem / OrderManager / the panel command bridge, so the exact
 *           assignment bytes at that source line are executed with the receiver
 *           bound to the instance. Still behavioural: a broken setter fails it,
 *           and a deleted site fails the census.
 * No site is asserted to merely exist. A static assertion passes any mutant.
 *
 * chart-main.js is deliberately excluded: it holds a second, complete, dead
 * `Chart` class (class at :14, its own `renderPending = false` at :116, its own
 * rAF, `window.Chart = Chart` at :225) that no HTML loads. Its :212 write is not
 * on the accessor-bearing class.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

/** Base of this packet. Criterion 4 compares object shape against it, not against a hand-written expectation. */
const BASE_COMMIT = 'e572a140cda9c8e7ccf3e7ced210332471c5ef5a';

const CANONICAL = ['chart v 1.4', 'chart', 'chart.js'];
const MIRROR = ['homepage', 'public', 'chart', 'chart.js'];

function findRoot(start) {
  let cursor = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(cursor, '.git')) && fs.existsSync(path.join(cursor, ...CANONICAL))) {
      return cursor;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`repository root not found from ${start}`);
    cursor = parent;
  }
}

const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)));
const CHART_JS = path.join(ROOT, ...CANONICAL);
const SOURCE = fs.readFileSync(CHART_JS, 'utf8');

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

function gitShow(relPosix) {
  return execFileSync('git', ['-C', ROOT, 'show', `${BASE_COMMIT}:${relPosix}`], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

// ── product-text extraction ────────────────────────────────────────────────

/** Exact text of one chart.js class method, as in m23-host-listener-leak.test.mjs. */
function methodSource(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `^    ${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  if (!match) throw new Error(`method ${name} missing from chart.js`);
  return match[0];
}

const START_ANCHOR = '        this.bufferSize = 1000; // Buffer size for smooth scrolling\n';
const END_ANCHOR = '        this.renderThrottleTimer = null;\n';

/**
 * The `renderPending` initialisation exactly as it appears in the product, sliced
 * between two anchors that occur once each in chart.js. Both must sit inside the
 * `Chart` constructor or the harness is testing the wrong code.
 */
function installText(source) {
  const occurrences = (needle) => source.split(needle).length - 1;
  assert.equal(occurrences(START_ANCHOR), 1, 'start anchor must be unique in chart.js');
  assert.equal(occurrences(END_ANCHOR), 1, 'end anchor must be unique in chart.js');

  const from = source.indexOf(START_ANCHOR) + START_ANCHOR.length;
  const to = source.indexOf(END_ANCHOR);
  assert.ok(to > from, 'anchors must be in order');

  const lineOf = (index) => source.slice(0, index).split('\n').length;
  const classAt = source.indexOf('\nclass Chart {\n');
  assert.ok(classAt >= 0, 'class Chart must exist');
  const classLine = lineOf(classAt + 1);
  const firstMethod = source.slice(classAt).match(/\n    [A-Za-z_$][\w$]*\s*\([^\n]*\)\s*\{/g);
  assert.ok(firstMethod, 'Chart must declare methods');
  const ctorEnd = lineOf(classAt + source.slice(classAt).indexOf(firstMethod[1]));
  const region = { start: lineOf(from), end: lineOf(to) };
  assert.ok(
    region.start > classLine && region.end < ctorEnd,
    `renderPending init must live inside the Chart constructor (lines ${classLine}..${ctorEnd}), got ${region.start}..${region.end}`,
  );
  return { text: source.slice(from, to), ...region };
}

const INSTALL = installText(SOURCE);
const BASE_SOURCE = gitShow('chart v 1.4/chart/chart.js');
const BASE_INSTALL = installText(BASE_SOURCE);

// ── realm ──────────────────────────────────────────────────────────────────

/**
 * A realm holding a class whose constructor body *is* the product install text.
 * `_mcDiag` is seeded because the product guarantees it: chart.js:965 runs
 * `_ensureMcDiag()` hundreds of lines before the renderPending init.
 */
function makeRealm(install, { killSwitch = false, noWindow = false, mcDiag = true } = {}) {
  const sandbox = { console: { log() {}, warn() {}, error() {} } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  if (!noWindow) {
    vm.runInContext('globalThis.window = {};', sandbox);
    if (killSwitch) {
      vm.runInContext(
        'window.__TALARIA_DISABLE_M25_RENDER_PENDING_ACCESSOR_V1 = true;',
        sandbox,
      );
    }
  }
  vm.runInContext(`
globalThis.__HarnessChart = class HarnessChart {
    constructor() {
        this._mcDiag = ${mcDiag ? '{ renders: 0, resamples: 0 }' : 'null'};
        this.isLoadingChunk = false;
${install.text}
        this.renderThrottleTimer = null;
    }
};
globalThis.__makeChart = () => new globalThis.__HarnessChart();
`, sandbox, { filename: 'm25-product-install-extract.js' });
  return sandbox;
}

const armed = (chart) => (chart._mcDiag ? chart._mcDiag.m25FramesArmed : undefined);

/** Execute an assignment's verbatim product bytes with its receiver bound to `chart`. */
function runAssignment(sandbox, chart, site) {
  sandbox.__m25Receiver = site.receiver === 'this.chart' ? { chart } : chart;
  const root = site.receiver.split('.')[0];
  const body = root === 'this'
    ? `(function(){ ${site.statement} }).call(globalThis.__m25Receiver);`
    : `(function(${root}){ ${site.statement} })(globalThis.__m25Receiver);`;
  vm.runInContext(body, sandbox, { filename: `${site.file}:${site.line}` });
}

/** Install the real text of chart.js methods onto a harness instance. */
function withMethods(sandbox, chart, names) {
  const body = names.map((n) => methodSource(SOURCE, n)).join('\n');
  sandbox.__m25Receiver = chart;
  vm.runInContext(`
{
  const holder = { ${'\n'}${body}${'\n'} };
  for (const key of Object.getOwnPropertyNames(holder)) {
    if (typeof holder[key] === 'function') globalThis.__m25Receiver[key] = holder[key];
  }
}
`, sandbox, { filename: 'm25-product-method-extract.js' });
  return chart;
}

// ── site census, discovered from the real files ────────────────────────────

const SITE_FILES = [
  { rel: ['chart v 1.4', 'chart', 'chart.js'], arming: 4, clearing: 17, tier: 'A' },
  { rel: ['chart v 1.4', 'chart', 'multichart-prod', 'panel-cmd-bridge.js'], arming: 3, clearing: 4, tier: 'B', why: 'panel command bridge is an IIFE bound to a live panel window' },
  { rel: ['chart v 1.4', 'chart', 'modules', 'replay-system.js'], arming: 11, clearing: 2, tier: 'B', why: 'requires instantiating ReplaySystem' },
  { rel: ['chart v 1.4', 'chart', 'modules', 'order-manager.js'], arming: 10, clearing: 0, tier: 'B', why: "requires instantiating OrderManager (Manager B's file — untouched by this packet)" },
  { rel: ['chart v 1.4', 'chart', 'modules', 'chart-indicators-full.js'], arming: 0, clearing: 3, tier: 'B', why: 'prototype patch module' },
  { rel: ['chart v 1.4', 'chart', 'multichart', 'sync-bridge.js'], arming: 0, clearing: 1, tier: 'B', why: 'bridge IIFE' },
  { rel: ['chart v 1.4', 'chart', 'multichart-prod', 'sync-bridge.js'], arming: 0, clearing: 1, tier: 'B', why: 'bridge IIFE' },
];

const ASSIGNMENT = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.renderPending\s*=\s*(true|false)\s*;/g;

function discoverSites() {
  const sites = [];
  for (const entry of SITE_FILES) {
    const file = entry.rel.join('/');
    const text = fs.readFileSync(path.join(ROOT, ...entry.rel), 'utf8');
    text.split('\n').forEach((line, index) => {
      for (const match of line.matchAll(ASSIGNMENT)) {
        sites.push({
          file,
          line: index + 1,
          receiver: match[1],
          literal: match[2],
          statement: match[0],
          tier: entry.tier,
          why: entry.why || '',
        });
      }
    });
  }
  return sites;
}

const SITES = discoverSites();
const ARMING = SITES.filter((s) => s.literal === 'true');
const CLEARING = SITES.filter((s) => s.literal === 'false');

// ── 1 / 2. the accessor exists on a constructed instance and arms ──────────

test('M25: renderPending is a per-instance accessor, not a data property', () => {
  const sandbox = makeRealm(INSTALL);
  const chart = sandbox.__makeChart();

  const own = Object.getOwnPropertyDescriptor(chart, 'renderPending');
  const proto = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(chart), 'renderPending');
  note('accessor-is-own-property', typeof own?.get === 'function',
    `get=${typeof own?.get} set=${typeof own?.set} onPrototype=${proto ? 'yes' : 'no'}`);
  assert.equal(typeof own?.get, 'function', 'renderPending must be an own accessor');
  assert.equal(typeof own?.set, 'function', 'renderPending must have a setter');
  assert.equal(proto, undefined,
    'the accessor must be per-instance: an own data property at this site would shadow a prototype accessor, '
    + 'and sibling modules patch Chart.prototype');
  assert.equal(chart.renderPending, false, 'initial value must still be false');
});

test('M25: a falsy→true write arms exactly one frame in _mcDiag.m25FramesArmed', () => {
  const sandbox = makeRealm(INSTALL);
  const chart = sandbox.__makeChart();

  assert.equal(chart.renderPending, false);
  const before = armed(chart);
  chart.renderPending = true;
  const after = armed(chart);
  note('single-write-arms-once', after === (before || 0) + 1, `${before} → ${after}`);
  assert.equal(before, 0, 'counter must be initialised at construction');
  assert.equal(after, 1);
  assert.equal(chart.renderPending, true);
});

// ── 2. every arming site, behaviourally ────────────────────────────────────

test('M25: TIER-A — the four chart.js arming sites arm through their real product methods', () => {
  const cases = [
    {
      site: 'chart.js:scheduleRender (arming tail)',
      methods: ['scheduleRender'],
      drive: (chart) => {
        chart._isAxisZoomDragging = () => false;
        chart._isSeparatePanelResizing = () => false;
        chart.replaySystem = null;
        chart.inertia = null;
        chart._isWheelZoomBurst = () => false;
        chart.render = () => {};
      },
      run: (chart) => chart.scheduleRender(),
    },
    {
      site: 'chart.js:_multichartClampCoarseAcquireViewport (right-edge path)',
      methods: ['_multichartClampCoarseAcquireViewport'],
      drive: (chart) => {
        chart.replaySystem = {
          isActive: true,
          userHasPanned: false,
          autoScrollEnabled: true,
          _isUserInteractingWithChart: () => false,
          syncReplayViewportToPlayhead: () => true,
        };
        chart.data = [{ t: 1 }, { t: 2 }];
        chart.getCandleSpacing = () => 6;
        chart.margin = { l: 60, r: 60 };
        chart.w = 800;
        chart.offsetX = 0;
        chart.render = () => {};
      },
      run: (chart) => {
        assert.equal(chart._multichartClampCoarseAcquireViewport({}), true);
        assert.equal(chart._mcCoarseAcquireClampDiag.mode, 'right-edge');
      },
    },
    {
      site: 'chart.js:_multichartClampCoarseAcquireViewport (clamp-bounds path)',
      methods: ['_multichartClampCoarseAcquireViewport'],
      drive: (chart) => {
        chart.replaySystem = {
          isActive: true,
          userHasPanned: false,
          autoScrollEnabled: true,
          _isUserInteractingWithChart: () => false,
          syncReplayViewportToPlayhead: () => false,
        };
        chart.data = [{ t: 1 }, { t: 2 }];
        chart.getCandleSpacing = () => 6;
        chart.margin = { l: 60, r: 60 };
        chart.w = 800;
        chart.offsetX = 0;
        chart.render = () => {};
      },
      run: (chart) => {
        assert.equal(chart._multichartClampCoarseAcquireViewport({}), true);
        assert.equal(chart._mcCoarseAcquireClampDiag.mode, 'clamp-bounds');
      },
    },
    {
      site: 'chart.js:_snapReplayViewportAfterTfSwitch (arming tail)',
      methods: ['_snapReplayViewportAfterTfSwitch'],
      drive: (chart) => {
        chart._tfSwitchAnchorLock = null;
        chart._chartViewRestored = false;
        chart.data = [{ t: 1 }, { t: 2 }];
        chart.getCandleSpacing = () => 6;
        chart.margin = { l: 60, r: 60 };
        chart.w = 800;
        chart.offsetX = 0;
        chart._serverCursors = null;
        chart.render = () => {};
      },
      run: (chart) => chart._snapReplayViewportAfterTfSwitch(
        { isActive: true, userHasPanned: false, autoScrollEnabled: true },
        {},
      ),
    },
  ];

  for (const testCase of cases) {
    const sandbox = makeRealm(INSTALL);
    const chart = withMethods(sandbox, sandbox.__makeChart(), testCase.methods);
    testCase.drive(chart);

    assert.equal(chart.renderPending, false, `${testCase.site}: precondition renderPending === false`);
    const before = armed(chart);
    testCase.run(chart);
    const after = armed(chart);

    note(`TIER-A ${testCase.site}`, after === before + 1 && chart.renderPending === true,
      `armed ${before} → ${after}, renderPending=${chart.renderPending}`);
    assert.equal(after, before + 1, `${testCase.site} must arm exactly one frame`);
    assert.equal(chart.renderPending, true, `${testCase.site} must leave renderPending true`);
  }
});

test('M25: every discovered arming site increments the counter by exactly 1', () => {
  for (const site of ARMING) {
    const sandbox = makeRealm(INSTALL);
    const chart = sandbox.__makeChart();

    assert.equal(chart.renderPending, false, `${site.file}:${site.line}: precondition`);
    const before = armed(chart);
    runAssignment(sandbox, chart, site);
    const after = armed(chart);

    const tier = site.file.endsWith('chart/chart.js') ? 'TIER-A (also covered by method execution)' : `TIER-B — ${site.why}`;
    note(`arming ${site.file}:${site.line}`, after === before + 1,
      `${site.statement.trim()} | ${tier} | armed ${before} → ${after}`);
    assert.equal(after, before + 1, `${site.file}:${site.line} must arm exactly one frame`);
    assert.equal(chart.renderPending, true);
  }
  assert.equal(ARMING.length, 28, 'the blast radius is 28 arming sites');
});

test('M25: arming-site census matches the declared blast radius', () => {
  for (const entry of SITE_FILES) {
    const file = entry.rel.join('/');
    const arming = ARMING.filter((s) => s.file === file).length;
    const clearing = CLEARING.filter((s) => s.file === file).length;
    note(`census ${file}`, arming === entry.arming && clearing === entry.clearing,
      `arming=${arming}/${entry.arming} clearing=${clearing}/${entry.clearing}`);
    assert.equal(arming, entry.arming, `${file}: arming-site count drifted`);
    assert.equal(clearing, entry.clearing, `${file}: clearing-site count drifted`);
  }
  note('census total', SITES.length === 56, `${SITES.length} writes across ${SITE_FILES.length} files`);
  assert.equal(SITES.length, 56);
  assert.equal(CLEARING.length, 28);
});

test('M25: chart-main.js holds a second dead Chart class and is out of scope', () => {
  const text = fs.readFileSync(path.join(ROOT, 'chart v 1.4', 'chart', 'chart-main.js'), 'utf8');
  const writes = [...text.matchAll(ASSIGNMENT)].length + (text.match(/this\.renderPending = false;/g) || []).length;
  note('chart-main-excluded', writes > 0, `${writes} renderPending write(s) on a class no HTML loads`);
  assert.ok(/\bclass Chart\b/.test(text), 'chart-main.js still declares its own Chart');
  assert.ok(/window\.Chart = Chart/.test(text), 'and still self-registers');
  assert.ok(
    !SITES.some((s) => s.file.endsWith('chart-main.js')),
    'chart-main.js must not be counted in the blast radius',
  );
});

// ── 3. the inverse criterion ───────────────────────────────────────────────

test('M25: no clearing site increments the counter, armed or not', () => {
  const byFile = new Map();
  for (const site of CLEARING) {
    if (!byFile.has(site.file)) byFile.set(site.file, []);
    byFile.get(site.file).push(site);
  }
  assert.equal(byFile.size, 6,
    'clearing writes live in six files (the brief itemises four; panel-cmd-bridge.js ×4 and replay-system.js ×2 are also clearing sites)');

  for (const site of CLEARING) {
    const sandbox = makeRealm(INSTALL);
    const chart = sandbox.__makeChart();

    // Non-vacuity: without a live counter this whole test would pass by comparing
    // undefined with undefined.
    assert.equal(typeof armed(chart), 'number', 'a counter must exist for this criterion to mean anything');

    // from cleared
    let before = armed(chart);
    runAssignment(sandbox, chart, site);
    assert.equal(armed(chart), before, `${site.file}:${site.line} incremented from a cleared state`);
    assert.equal(chart.renderPending, false);

    // from armed
    chart.renderPending = true;
    before = armed(chart);
    runAssignment(sandbox, chart, site);
    const after = armed(chart);
    note(`clearing ${site.file}:${site.line}`, after === before,
      `${site.statement.trim()} | armed ${before} → ${after}`);
    assert.equal(after, before, `${site.file}:${site.line} must never arm`);
    assert.equal(chart.renderPending, false);
  }
});

test('M25: true→true does not increment, and re-arming after a clear does', () => {
  const sandbox = makeRealm(INSTALL);
  const chart = sandbox.__makeChart();

  chart.renderPending = true;
  assert.equal(armed(chart), 1);
  chart.renderPending = true;
  chart.renderPending = true;
  note('true-to-true-inert', armed(chart) === 1, `armed=${armed(chart)} after three true writes`);
  assert.equal(armed(chart), 1, 'a redundant true must not arm a second frame');

  chart.renderPending = false;
  assert.equal(armed(chart), 1, 'clearing must not arm');
  chart.renderPending = true;
  note('rearm-after-clear', armed(chart) === 2, `armed=${armed(chart)}`);
  assert.equal(armed(chart), 2, 'a genuine falsy→true transition after a clear must arm');
});

test('M25: only a falsy→true transition arms, across the whole truthiness matrix', () => {
  const sandbox = makeRealm(INSTALL);
  const chart = sandbox.__makeChart();
  // [write, expected increment] — falsy writes never arm; truthy writes arm only
  // when the previous value was falsy.
  const script = [
    [false, 0], [0, 0], [null, 0], [undefined, 0], [NaN, 0], ['', 0],
    [true, 1], [true, 0], [1, 0], ['yes', 0],
    [0, 0], [true, 1], [false, 0], [1, 1], [true, 0],
  ];
  let expected = 0;
  for (const [value, delta] of script) {
    chart.renderPending = value;
    expected += delta;
    assert.equal(armed(chart), expected, `after writing ${String(value)}`);
  }
  note('truthiness-matrix', armed(chart) === expected, `armed=${expected} over ${script.length} writes`);
});

// ── 4. behaviour identity against the base commit ──────────────────────────

test('M25: renderPending reads back exactly what was written, identically to base', () => {
  const head = makeRealm(INSTALL).__makeChart();
  const base = makeRealm(BASE_INSTALL).__makeChart();

  const values = [false, true, 0, 1, '', 'x', null, undefined, NaN, -0, [], {}, true, false];
  for (const value of values) {
    head.renderPending = value;
    base.renderPending = value;
    assert.equal(
      Object.is(head.renderPending, base.renderPending), true,
      `read-back diverged for ${String(value)}: head=${String(head.renderPending)} base=${String(base.renderPending)}`,
    );
    assert.equal(Object.is(head.renderPending, value), true, `head did not read back ${String(value)}`);
  }
  note('read-back-identical-to-base', true, `${values.length} values incl. NaN, -0, objects`);
});

test('M25: object shape is unchanged versus the base commit', () => {
  const shapeOf = (chart) => ({
    keys: Object.keys(chart).join(','),
    descriptor: (() => {
      const d = Object.getOwnPropertyDescriptor(chart, 'renderPending');
      return `enumerable=${d.enumerable} configurable=${d.configurable}`;
    })(),
    json: JSON.stringify(chart),
    inOperator: 'renderPending' in chart,
    hasOwn: Object.prototype.hasOwnProperty.call(chart, 'renderPending'),
    spread: JSON.stringify({ ...chart }),
    forIn: (() => { const out = []; for (const k in chart) out.push(k); return out.join(','); })(),
  });

  for (const writes of [[], [true], [true, false, true]]) {
    const head = makeRealm(INSTALL).__makeChart();
    const base = makeRealm(BASE_INSTALL).__makeChart();
    for (const value of writes) { head.renderPending = value; base.renderPending = value; }

    const headShape = shapeOf(head);
    const baseShape = shapeOf(base);
    note(`shape-identical after [${writes.join(',')}]`,
      JSON.stringify(headShape) === JSON.stringify(baseShape),
      `keys=${headShape.keys}`);
    assert.deepEqual(headShape, baseShape,
      `observable object shape changed versus ${BASE_COMMIT.slice(0, 9)}`);
  }

  // The one deliberate, non-enumerable addition, named so nobody has to guess.
  const head = makeRealm(INSTALL).__makeChart();
  const base = makeRealm(BASE_INSTALL).__makeChart();
  const added = Object.getOwnPropertyNames(head)
    .filter((k) => !Object.getOwnPropertyNames(base).includes(k));
  note('non-enumerable-additions', added.join(',') === '_m25RenderPendingBacking', `added=[${added.join(',')}]`);
  assert.deepEqual(added, ['_m25RenderPendingBacking']);
  assert.equal(Object.getOwnPropertyDescriptor(head, '_m25RenderPendingBacking').enumerable, false);

  head.renderPending = true;
  const diagAdded = Object.getOwnPropertyNames(head._mcDiag)
    .filter((k) => !Object.getOwnPropertyNames(base._mcDiag).includes(k));
  assert.deepEqual(diagAdded, ['m25FramesArmed']);
  assert.equal(Object.getOwnPropertyDescriptor(head._mcDiag, 'm25FramesArmed').enumerable, false,
    'the counter must not appear in JSON.stringify or __mcDiagReport output');
});

// ── 5. kill switch ─────────────────────────────────────────────────────────

test('M25: the kill switch restores a plain data property with no counter', () => {
  const off = makeRealm(INSTALL, { killSwitch: true }).__makeChart();
  const on = makeRealm(INSTALL).__makeChart();

  const offDescriptor = Object.getOwnPropertyDescriptor(off, 'renderPending');
  const onDescriptor = Object.getOwnPropertyDescriptor(on, 'renderPending');

  // Structural difference between the two arms, stated rather than implied:
  //   kill switch ON  → { value, writable }        data property, no backing field, no counter
  //   kill switch OFF → { get, set }               accessor over _m25RenderPendingBacking
  note('killswitch-data-property',
    'value' in offDescriptor && !('get' in offDescriptor && offDescriptor.get),
    `off={${Object.keys(offDescriptor).join(',')}} on={${Object.keys(onDescriptor).join(',')}}`);
  assert.equal(offDescriptor.get, undefined, 'kill switch must remove the getter');
  assert.equal(offDescriptor.set, undefined, 'kill switch must remove the setter');
  assert.equal(offDescriptor.writable, true, 'kill switch must leave a writable data property');
  assert.equal(offDescriptor.value, false);
  assert.equal(typeof onDescriptor.get, 'function');

  assert.equal(
    Object.prototype.hasOwnProperty.call(off, '_m25RenderPendingBacking'), false,
    'the disabled arm must not carry a backing field',
  );

  off.renderPending = true;
  off.renderPending = true;
  off.renderPending = false;
  assert.equal(armed(off), undefined, 'no counter may exist while the kill switch is set');
  assert.equal(off.renderPending, false);

  // and the enabled arm is byte-identical in shape to base, so the switch is the only difference
  const base = makeRealm(BASE_INSTALL).__makeChart();
  assert.deepEqual(Object.keys(off), Object.keys(base));
  assert.deepEqual(
    Object.getOwnPropertyNames(off), Object.getOwnPropertyNames(base),
    'the disabled arm must be indistinguishable from base',
  );
});

test('M25: the accessor installs with no window object at all', () => {
  const chart = makeRealm(INSTALL, { noWindow: true }).__makeChart();
  note('no-window-realm-installs', typeof Object.getOwnPropertyDescriptor(chart, 'renderPending').get === 'function');
  assert.equal(typeof Object.getOwnPropertyDescriptor(chart, 'renderPending').get, 'function');
  chart.renderPending = true;
  assert.equal(armed(chart), 1);
});

test('M25: a missing _mcDiag never throws on the render path', () => {
  const chart = makeRealm(INSTALL, { mcDiag: false }).__makeChart();
  assert.doesNotThrow(() => { chart.renderPending = true; });
  assert.equal(chart.renderPending, true);
  chart.renderPending = false;
  assert.equal(chart.renderPending, false);
  note('mcdiag-absent-safe', true, 'setter degrades to a plain write');
});

// ── 7. animate() is untouched ──────────────────────────────────────────────

test('M25: animate() is byte-identical to the base commit', () => {
  const head = methodSource(SOURCE, 'animate');
  const base = methodSource(BASE_SOURCE, 'animate');
  note('animate-unchanged', head === base, `${head.length} chars`);
  assert.equal(head, base, 'animate() must not change: this packet adds no render behaviour');
  assert.ok(/if \(this\.renderPending\) \{/.test(head), 'animate() still reads renderPending unconditionally');
  assert.ok(!/m25|_m25RenderPendingBacking/i.test(head), 'no M25 token may appear inside animate()');

  // m20-q1-q2-q8-idle-drains.test.mjs scans the first 2200 characters of animate()
  // for _tickBarCloseCountdown. Report the headroom so a future edit here is loud.
  const needle = head.indexOf('_tickBarCloseCountdown');
  note('m20-q1-headroom', needle >= 0 && needle < 2200,
    `_tickBarCloseCountdown at offset ${needle}, headroom ${2200 - needle} chars`);
  assert.ok(needle >= 0 && needle < 2200);
});

test('M25: no line inside animate() differs, and no other chart.js region changed', () => {
  const headLines = SOURCE.split('\n');
  const baseLines = BASE_SOURCE.split('\n');
  const headInstall = INSTALL;
  // Everything outside the install region must be identical, line for line.
  const strip = (lines, region) => [
    ...lines.slice(0, region.start),
    ...lines.slice(region.end - 1),
  ].join('\n');
  note('single-region-change', strip(headLines, headInstall) === strip(baseLines, BASE_INSTALL),
    `install region head ${headInstall.start}..${headInstall.end}, base ${BASE_INSTALL.start}..${BASE_INSTALL.end}`);
  assert.equal(
    strip(headLines, headInstall), strip(baseLines, BASE_INSTALL),
    'chart.js changed outside the renderPending initialisation',
  );
});

// ── 6. mirror parity ───────────────────────────────────────────────────────

test('M25: canonical and homepage mirror chart.js are byte-identical', () => {
  const canonical = fs.readFileSync(path.join(ROOT, ...CANONICAL));
  const mirror = fs.readFileSync(path.join(ROOT, ...MIRROR));
  const a = sha256(canonical);
  const b = sha256(mirror);
  note('mirror-parity', a === b, `${a.slice(0, 16)}… (${canonical.length} bytes) vs ${b.slice(0, 16)}… (${mirror.length} bytes)`);
  assert.equal(a, b, 'the mirror is a plain byte copy of canonical');
  assert.equal(canonical.length, mirror.length);
});

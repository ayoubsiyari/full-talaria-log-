/**
 * M25 — `renderPending` becomes a per-instance accessor that counts frame demands,
 * and (packet m25-attribution) that count becomes visible, resettable, and
 * attributable to the individual arming site.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m25-render-pending-accessor.test.mjs"
 *
 * Instrumentation only. `animate()` stays unconditional and no render behaviour
 * changes; the point is to make the next loop-guard packet provable by letting a
 * real session answer "which code paths actually demand frames".
 *
 * WHY THE ACCESSOR PACKET ALONE WAS NOT ENOUGH
 * `_mcDiag.m25FramesArmed` is one scalar and animate() clears `renderPending`
 * every frame, so it saturates at one increment per animation frame however many
 * of the 28 arming sites fired. A site that reliably fires immediately after
 * another site inside the same frame therefore takes the true→true path and
 * records 0 for a whole session — and 0 reads as "this path is dead". The
 * attribution map exists to make that erasure impossible; the erasure case is
 * asserted directly, not argued (see "erasure case" below).
 *
 * WHAT THIS SUITE EXECUTES, AND WHAT IT CANNOT
 *
 * The real `Chart` constructor calls `init()`, `animate()`, `resize()`, d3, the
 * drawing-tool manager and the data pipeline — it is not constructible under
 * `node --test` without a DOM. So the harness lifts the *product bytes* of the
 * `renderPending` initialisation, of the whole `_mcDiag` helper block, and of the
 * `_ensureMcDiag()` object literal straight out of chart.js and runs them as a
 * real constructor body, reached through `new`. Every instance under test
 * therefore had the accessor installed by product text, never by a copy of it
 * living in this file, and never by `Object.create(Chart.prototype)` — that
 * pattern (b70-indicator-pure-paint.test.mjs:216,266) bypasses a per-instance
 * accessor entirely and would make the arming assertions vacuous. The reporter
 * cells call the product's own `__mcDiagReport()` / `__mcDiagReset()`.
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

/** Base of the M25 accessor packet. Chart-instance shape is compared against it. */
const BASE_COMMIT = 'e572a140cda9c8e7ccf3e7ced210332471c5ef5a';
/** Base of THIS packet — the accessor as shipped, before visibility + attribution. */
const ATTRIBUTION_BASE_COMMIT = 'ba2d30e5729d680d04742fb23847f6d5cb510e69';

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

function gitShow(commit, relPosix) {
  return execFileSync('git', ['-C', ROOT, 'show', `${commit}:${relPosix}`], {
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

function uniqueIndexOf(source, anchor, label) {
  assert.equal(source.split(anchor).length - 1, 1, `${label} must occur exactly once in chart.js`);
  return source.indexOf(anchor);
}

const START_ANCHOR = '        this.bufferSize = 1000; // Buffer size for smooth scrolling\n';
const END_ANCHOR = '        this.renderThrottleTimer = null;\n';

/**
 * Every region this packet family is allowed to touch, declared by anchors that
 * are unique in each commit compared. The anchor text itself is never inside the
 * region, so an edit that widened a region past its anchor would be caught.
 */
const REGIONS = [
  {
    name: 'mcDiag helper block — MC_DIAG_COUNTER_FIELDS, attribution helpers, zeroCounters',
    from: 'const MC_DIAG_COUNTER_FIELDS = [',
    to: '\nclass Chart {\n',
  },
  {
    name: '_ensureMcDiag() field initialisation',
    from: '    _ensureMcDiag() {\n',
    to: '\n        _talariaInstallMcDiagReporter();',
  },
  {
    name: 'renderPending initialisation inside the Chart constructor',
    from: START_ANCHOR,
    to: END_ANCHOR,
  },
];

/**
 * The `renderPending` initialisation exactly as it appears in the product, sliced
 * between two anchors that occur once each in chart.js. Both must sit inside the
 * `Chart` constructor or the harness is testing the wrong code.
 */
function installText(source) {
  const startAt = uniqueIndexOf(source, START_ANCHOR, 'renderPending start anchor');
  const to = uniqueIndexOf(source, END_ANCHOR, 'renderPending end anchor');
  const from = startAt + START_ANCHOR.length;
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

/**
 * The whole module-scope `_mcDiag` support block: the counter allow-list, the
 * M25 attribution helpers, the zeroing/snapshot functions and the reporter
 * installer. Executed verbatim, so the reporter cells exercise product code.
 */
function helperBlock(source) {
  const from = uniqueIndexOf(source, REGIONS[0].from, 'MC_DIAG_COUNTER_FIELDS');
  const to = uniqueIndexOf(source, REGIONS[0].to, 'class Chart');
  assert.ok(to > from, 'the mcDiag helper block must precede class Chart');
  return source.slice(from, to);
}

/**
 * The object literal `_ensureMcDiag()` assigns to `this._mcDiag`. Used as the
 * harness seed so each realm's diagnostics bag is the one that commit really
 * builds — chart.js:965 runs `_ensureMcDiag()` hundreds of lines before the
 * renderPending init, so the product guarantees it is already there.
 */
function mcDiagSeed(source) {
  const method = methodSource(source, '_ensureMcDiag');
  const open = method.indexOf('this._mcDiag = {');
  const close = method.indexOf('\n        };', open);
  assert.ok(open >= 0 && close > open, '_ensureMcDiag must build _mcDiag from one object literal');
  return method.slice(open + 'this._mcDiag = '.length, close + '\n        }'.length);
}

function versionBundle(label, source) {
  return { label, source, install: installText(source), helpers: helperBlock(source), seed: mcDiagSeed(source) };
}

const HEAD = versionBundle('HEAD', SOURCE);
const BASE_SOURCE = gitShow(BASE_COMMIT, 'chart v 1.4/chart/chart.js');
const BASE = versionBundle(BASE_COMMIT.slice(0, 9), BASE_SOURCE);
const ATTR_BASE_SOURCE = gitShow(ATTRIBUTION_BASE_COMMIT, 'chart v 1.4/chart/chart.js');
const ATTR_BASE = versionBundle(ATTRIBUTION_BASE_COMMIT.slice(0, 9), ATTR_BASE_SOURCE);

// ── realm ──────────────────────────────────────────────────────────────────

const ATTRIBUTION_FLAG = '__TALARIA_ENABLE_M25_ARMING_ATTRIBUTION_V1';

/**
 * A realm holding a class whose constructor body *is* the product install text,
 * over the product's own mcDiag helper block and `_ensureMcDiag()` seed.
 */
function makeRealm(bundle, { killSwitch = false, noWindow = false, mcDiag = true, attribution = false } = {}) {
  const sandbox = { console: { log() {}, warn() {}, error() {}, table() {} } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  if (!noWindow) {
    vm.runInContext('globalThis.window = {}; window.top = window;', sandbox);
    if (killSwitch) {
      vm.runInContext(
        'window.__TALARIA_DISABLE_M25_RENDER_PENDING_ACCESSOR_V1 = true;',
        sandbox,
      );
    }
    if (attribution) {
      vm.runInContext(`window.${ATTRIBUTION_FLAG} = true;`, sandbox);
    }
  }
  vm.runInContext(bundle.helpers, sandbox, { filename: 'm25-product-mcdiag-extract.js' });
  vm.runInContext(`
globalThis.__HarnessChart = class HarnessChart {
    constructor() {
        this._mcDiag = ${mcDiag ? bundle.seed : 'null'};
        this.isLoadingChunk = false;
${bundle.install.text}
        this.renderThrottleTimer = null;
    }
};
globalThis.__makeChart = () => new globalThis.__HarnessChart();
`, sandbox, { filename: 'm25-product-install-extract.js' });
  return sandbox;
}

const armed = (chart) => (chart._mcDiag ? chart._mcDiag.m25FramesArmed : undefined);
const sitesOf = (chart) => (chart._mcDiag ? chart._mcDiag.m25ArmingSites : undefined);

/** Execute an assignment's verbatim product bytes with its receiver bound to `chart`. */
function runAssignment(sandbox, chart, site) {
  sandbox.__m25Receiver = site.receiver === 'this.chart' ? { chart } : chart;
  const root = site.receiver.split('.')[0];
  const body = root === 'this'
    ? `(function(){ ${site.statement} }).call(globalThis.__m25Receiver);`
    : `(function(${root}){ ${site.statement} })(globalThis.__m25Receiver);`;
  vm.runInContext(body, sandbox, { filename: `${site.file}:${site.line}` });
}

/**
 * Compile several product arming statements into one script, one per line, so
 * they become genuinely distinct call sites for stack-based attribution. Returns
 * the callables plus the `file:line:col` key each one is expected to produce.
 */
function compileCoFiringSites(sandbox, chart, sites, filename) {
  sandbox.__m25Receivers = sites.map((s) => (s.receiver === 'this.chart' ? { chart } : chart));
  const body = sites.map((site, i) => {
    const root = site.receiver.split('.')[0];
    const call = root === 'this'
      ? `(function(){ ${site.statement} }).call(globalThis.__m25Receivers[${i}])`
      : `(function(${root}){ ${site.statement} })(globalThis.__m25Receivers[${i}])`;
    return `globalThis.__m25Fire${i} = function fire${i}(){ ${call}; };`;
  }).join('\n');
  vm.runInContext(body, sandbox, { filename });
  return sites.map((_, i) => sandbox[`__m25Fire${i}`]);
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

/** One arming site from each of three different product files — the co-firing case. */
const THREE_FILE_SITES = ['chart v 1.4/chart/chart.js',
  'chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js',
  'chart v 1.4/chart/modules/replay-system.js']
  .map((file) => ARMING.find((s) => s.file === file));

// ── 1 / 2. the accessor exists on a constructed instance and arms ──────────

test('M25: renderPending is a per-instance accessor, not a data property', () => {
  const sandbox = makeRealm(HEAD);
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
  const sandbox = makeRealm(HEAD);
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
    const sandbox = makeRealm(HEAD);
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
    const sandbox = makeRealm(HEAD);
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
    const sandbox = makeRealm(HEAD);
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
  const sandbox = makeRealm(HEAD);
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
  const sandbox = makeRealm(HEAD);
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
  const head = makeRealm(HEAD).__makeChart();
  const base = makeRealm(BASE).__makeChart();

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

/**
 * Criterion 6 is scoped to the `Chart` instance. `_mcDiag` is explicitly exempt —
 * it is a diagnostics bag and gaining counters is its job — so it is excluded
 * from the JSON/spread views rather than silently hidden by non-enumerability,
 * which is the corner the previous revision of this criterion pushed us into.
 */
const OMIT_MC_DIAG = (key, value) => (key === '_mcDiag' ? undefined : value);

function chartShape(chart) {
  return {
    keys: Object.keys(chart).join(','),
    descriptor: (() => {
      const d = Object.getOwnPropertyDescriptor(chart, 'renderPending');
      return `enumerable=${d.enumerable} configurable=${d.configurable}`;
    })(),
    json: JSON.stringify(chart, OMIT_MC_DIAG),
    inOperator: 'renderPending' in chart,
    hasOwn: Object.prototype.hasOwnProperty.call(chart, 'renderPending'),
    spread: JSON.stringify({ ...chart }, OMIT_MC_DIAG),
    forIn: (() => { const out = []; for (const k in chart) out.push(k); return out.join(','); })(),
  };
}

test('M25: Chart-instance shape is unchanged versus the base commit, attribution off AND on', () => {
  for (const attribution of [false, true]) {
    for (const writes of [[], [true], [true, false, true]]) {
      const head = makeRealm(HEAD, { attribution }).__makeChart();
      const base = makeRealm(BASE).__makeChart();
      for (const value of writes) { head.renderPending = value; base.renderPending = value; }

      const headShape = chartShape(head);
      const baseShape = chartShape(base);
      note(`shape-identical attribution=${attribution} after [${writes.join(',')}]`,
        JSON.stringify(headShape) === JSON.stringify(baseShape),
        `keys=${headShape.keys}`);
      assert.deepEqual(headShape, baseShape,
        `observable Chart shape changed versus ${BASE_COMMIT.slice(0, 9)} (attribution=${attribution})`);
    }
  }

  // The one deliberate, non-enumerable addition, named so nobody has to guess.
  const head = makeRealm(HEAD).__makeChart();
  const base = makeRealm(BASE).__makeChart();
  const added = Object.getOwnPropertyNames(head)
    .filter((k) => !Object.getOwnPropertyNames(base).includes(k));
  note('non-enumerable-additions', added.join(',') === '_m25RenderPendingBacking', `added=[${added.join(',')}]`);
  assert.deepEqual(added, ['_m25RenderPendingBacking']);
  assert.equal(Object.getOwnPropertyDescriptor(head, '_m25RenderPendingBacking').enumerable, false);
});

// ── 5. kill switch ─────────────────────────────────────────────────────────

test('M25: the kill switch restores a plain data property with no counter', () => {
  const off = makeRealm(HEAD, { killSwitch: true }).__makeChart();
  const on = makeRealm(HEAD).__makeChart();

  const offDescriptor = Object.getOwnPropertyDescriptor(off, 'renderPending');
  const onDescriptor = Object.getOwnPropertyDescriptor(on, 'renderPending');

  // Structural difference between the two arms, stated rather than implied:
  //   kill switch ON  → { value, writable }        data property, no backing field
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
  // _ensureMcDiag() now seeds the field for every instance, so the kill-switch
  // arm carries a counter that never moves — that, not its absence, is the
  // observable: the accessor is gone, so nothing can increment it.
  assert.equal(armed(off), 0, 'no arming may be recorded while the kill switch is set');
  assert.equal(off.renderPending, false);

  // and the enabled arm is identical in Chart shape to base, so the switch is the only difference
  const base = makeRealm(BASE).__makeChart();
  assert.deepEqual(Object.keys(off), Object.keys(base));
  assert.deepEqual(
    Object.getOwnPropertyNames(off), Object.getOwnPropertyNames(base),
    'the disabled arm must be indistinguishable from base',
  );
});

test('M25: the accessor installs with no window object at all', () => {
  const chart = makeRealm(HEAD, { noWindow: true }).__makeChart();
  note('no-window-realm-installs', typeof Object.getOwnPropertyDescriptor(chart, 'renderPending').get === 'function');
  assert.equal(typeof Object.getOwnPropertyDescriptor(chart, 'renderPending').get, 'function');
  chart.renderPending = true;
  assert.equal(armed(chart), 1);
});

test('M25: a missing _mcDiag never throws on the render path', () => {
  const chart = makeRealm(HEAD, { mcDiag: false }).__makeChart();
  assert.doesNotThrow(() => { chart.renderPending = true; });
  assert.equal(chart.renderPending, true);
  chart.renderPending = false;
  assert.equal(chart.renderPending, false);
  note('mcdiag-absent-safe', true, 'setter degrades to a plain write');

  // Same, with attribution on: the installer must not throw when there is no bag.
  const attributed = makeRealm(HEAD, { mcDiag: false, attribution: true }).__makeChart();
  assert.doesNotThrow(() => { attributed.renderPending = true; });
  assert.equal(attributed.renderPending, true);
});

// ── 7. animate() is untouched ──────────────────────────────────────────────

test('M25: animate() is byte-identical to the base commit', () => {
  const head = methodSource(SOURCE, 'animate');
  const base = methodSource(BASE_SOURCE, 'animate');
  note('animate-unchanged', head === base, `${head.length} chars`);
  assert.equal(head, base, 'animate() must not change: this packet adds no render behaviour');
  assert.equal(head, methodSource(ATTR_BASE_SOURCE, 'animate'),
    `animate() must also be identical to ${ATTRIBUTION_BASE_COMMIT.slice(0, 9)}`);
  assert.ok(/if \(this\.renderPending\) \{/.test(head), 'animate() still reads renderPending unconditionally');
  assert.ok(!/m25|_m25RenderPendingBacking/i.test(head), 'no M25 token may appear inside animate()');

  // m20-q1-q2-q8-idle-drains.test.mjs scans the first 2200 characters of animate()
  // for _tickBarCloseCountdown. Report the headroom so a future edit here is loud.
  const needle = head.indexOf('_tickBarCloseCountdown');
  note('m20-q1-headroom', needle >= 0 && needle < 2200,
    `_tickBarCloseCountdown at offset ${needle}, headroom ${2200 - needle} chars`);
  assert.ok(needle >= 0 && needle < 2200);
});

/**
 * Everything outside the three declared regions must be identical to base. The
 * regions are located by anchors in each commit separately, so this survives the
 * line-number drift the added text causes and still fails on any stray edit.
 */
function stripDeclaredRegions(source) {
  const cuts = REGIONS.map(({ name, from, to }) => {
    const start = uniqueIndexOf(source, from, `region "${name}" start anchor`) + from.length;
    const end = source.indexOf(to, start);
    assert.ok(end > start, `region "${name}" anchors out of order`);
    assert.equal(source.split(to).length - 1, 1, `region "${name}" end anchor must be unique`);
    return { start, end };
  }).sort((a, b) => a.start - b.start);

  let out = '';
  let cursor = 0;
  for (const cut of cuts) {
    assert.ok(cut.start >= cursor, 'declared regions must not overlap');
    out += `${source.slice(cursor, cut.start)}\n/* DECLARED REGION ELIDED */\n`;
    cursor = cut.end;
  }
  return out + source.slice(cursor);
}

test('M25: no chart.js region outside the three declared ones changed', () => {
  for (const other of [BASE, ATTR_BASE]) {
    const same = stripDeclaredRegions(SOURCE) === stripDeclaredRegions(other.source);
    note(`single-region-change vs ${other.label}`, same, `${REGIONS.length} declared regions`);
    assert.equal(
      stripDeclaredRegions(SOURCE), stripDeclaredRegions(other.source),
      `chart.js changed outside the ${REGIONS.length} declared regions, versus ${other.label}`,
    );
  }
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

// ═══════════════════════════════════════════════════════════════════════════
// packet m25-attribution
// ═══════════════════════════════════════════════════════════════════════════

// ── change 1: the counter becomes visible and resettable ───────────────────

/** Boot the product reporter in a realm and expose one chart to it as window.chart. */
function bootReporter(sandbox, chart) {
  sandbox.__m25Chart = chart;
  vm.runInContext(
    'window.chart = globalThis.__m25Chart; _talariaInstallMcDiagReporter();',
    sandbox, { filename: 'm25-reporter-boot.js' },
  );
  return sandbox.window;
}

test('M25: __mcDiagReport() shows m25FramesArmed and __mcDiagReset() zeroes it', () => {
  const sandbox = makeRealm(HEAD);
  const chart = sandbox.__makeChart();
  const win = bootReporter(sandbox, chart);

  // three separate frames' worth of arming
  for (let i = 0; i < 3; i += 1) { chart.renderPending = true; chart.renderPending = false; }
  assert.equal(armed(chart), 3, 'precondition: the counter really moved');

  const [row] = win.__mcDiagReport();
  note('report-includes-counter', Object.prototype.hasOwnProperty.call(row, 'm25FramesArmed'),
    `row keys=${Object.keys(row).length}, m25FramesArmed=${row.m25FramesArmed}`);
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'm25FramesArmed'),
    '__mcDiagReport() must emit a m25FramesArmed column');
  assert.equal(row.m25FramesArmed, 3);

  assert.equal(win.__mcDiagReset(), 1, '__mcDiagReset() must have found the chart');
  note('reset-zeroes-counter', armed(chart) === 0, `armed=${armed(chart)} after reset`);
  assert.equal(armed(chart), 0, '__mcDiagReset() must zero m25FramesArmed');
  assert.equal(win.__mcDiagReport()[0].m25FramesArmed, 0);

  // RED-state witness: at ba2d30e57 the identical product reporter emitted no
  // such column and the identical reset left the counter alone. This is the
  // whole content of change 1, and it is the allow-list that carries it.
  const baseSandbox = makeRealm(ATTR_BASE);
  const baseChart = baseSandbox.__makeChart();
  const baseWin = bootReporter(baseSandbox, baseChart);
  baseChart.renderPending = true;
  const [baseRow] = baseWin.__mcDiagReport();
  note('red-witness-at-attribution-base',
    !Object.prototype.hasOwnProperty.call(baseRow, 'm25FramesArmed'),
    `${ATTRIBUTION_BASE_COMMIT.slice(0, 9)} row keys=${Object.keys(baseRow).length}`);
  assert.equal(Object.prototype.hasOwnProperty.call(baseRow, 'm25FramesArmed'), false);
  baseWin.__mcDiagReset();
  assert.equal(armed(baseChart), 1, `${ATTRIBUTION_BASE_COMMIT.slice(0, 9)} reset could not zero it`);
});

test('M25: the counter is a plain enumerable field of _mcDiag, initialised by _ensureMcDiag()', () => {
  const chart = makeRealm(HEAD).__makeChart();
  const descriptor = Object.getOwnPropertyDescriptor(chart._mcDiag, 'm25FramesArmed');

  note('counter-enumerable', descriptor?.enumerable === true,
    `enumerable=${descriptor?.enumerable} value=${descriptor?.value} accessor=${typeof descriptor?.get}`);
  assert.equal(descriptor.enumerable, true,
    'the counter must be enumerable: _talariaMcDiagZeroCounters assigns diag[field] = 0, so a field that '
    + 'is only created on first reset would be a late, nondeterministic shape change');
  assert.equal(descriptor.writable, true);
  assert.equal(descriptor.value, 0, '_ensureMcDiag() must seed it at 0, not leave it undefined');

  // Seeded by _ensureMcDiag(), not by the constructor's install block.
  const method = methodSource(SOURCE, '_ensureMcDiag');
  assert.ok(/^\s+m25FramesArmed: 0,$/m.test(method), '_ensureMcDiag() must initialise m25FramesArmed');
  // The setter still *increments* m25FramesArmed there — untouched. What must be
  // gone is the defineProperty that used to create it non-enumerably.
  assert.ok(!/defineProperty\([^)]*m25FramesArmed/.test(HEAD.install.text)
    && !/'m25FramesArmed',\s*\{/.test(HEAD.install.text),
    'the renderPending install block must no longer define the counter — _ensureMcDiag() owns it');
  assert.ok(/defineProperty\(this\._mcDiag, 'm25FramesArmed'/.test(ATTR_BASE.install.text),
    `non-vacuity: ${ATTRIBUTION_BASE_COMMIT.slice(0, 9)} did define it there`);

  // All three parts of change 1 landed together: allow-list, seed, no defineProperty.
  assert.ok(/^\s+'m25FramesArmed',$/m.test(HEAD.helpers), 'MC_DIAG_COUNTER_FIELDS must list the counter');
  note('change-1-all-three', true, 'allow-list + _ensureMcDiag seed + defineProperty removed');
});

test('M25: the counter is not hidden from the Chart, only scoped to the diagnostics bag', () => {
  const chart = makeRealm(HEAD).__makeChart();
  chart.renderPending = true;
  // Criterion 6 exempts _mcDiag; this states positively what the exemption buys.
  assert.ok(Object.keys(chart._mcDiag).includes('m25FramesArmed'));
  assert.ok(JSON.stringify(chart._mcDiag).includes('"m25FramesArmed":1'));
  assert.equal(Object.keys(chart).includes('m25FramesArmed'), false,
    'the Chart itself must not gain the field');
  note('counter-visible-on-bag-only', true, `_mcDiag keys=${Object.keys(chart._mcDiag).length}`);
});

// ── change 2: per-site attribution ─────────────────────────────────────────

test('M25 attribution: three arming sites co-firing in one frame yield three attributions', () => {
  const sandbox = makeRealm(HEAD, { attribution: true });
  const chart = sandbox.__makeChart();
  const fires = compileCoFiringSites(sandbox, chart, THREE_FILE_SITES, 'm25-cofire-sites.js');
  assert.equal(fires.length, 3);
  assert.deepEqual(
    THREE_FILE_SITES.map((s) => s.file.split('/').pop()),
    ['chart.js', 'panel-cmd-bridge.js', 'replay-system.js'],
    'the three statements must come from three different product files',
  );

  // One frame: nothing clears renderPending between the three writes, exactly as
  // animate() would not until its next tick.
  for (const fire of fires) fire();

  const sites = sitesOf(chart);
  const keys = Object.keys(sites);
  note('cofire-three-distinct', keys.length === 3 && armed(chart) === 1,
    `m25FramesArmed=${armed(chart)} (saturated), m25ArmingSites=${JSON.stringify(sites)}`);

  assert.equal(armed(chart), 1,
    'the scalar counter is expected to saturate at 1 — that is the defect being compensated for');
  assert.equal(keys.length, 3, 'three co-firing sites must produce three distinct attributions');
  for (const key of keys) {
    assert.equal(sites[key], 1, `${key} must be counted exactly once`);
    assert.match(key, /^m25-cofire-sites\.js:\d+:\d+$/,
      'keys must be file:line:column source positions');
  }
});

test('M25 attribution: the erasure case — a site that only ever fires second is still attributed', () => {
  const sandbox = makeRealm(HEAD, { attribution: true });
  const chart = sandbox.__makeChart();
  const [first, second] = compileCoFiringSites(
    sandbox, chart, [THREE_FILE_SITES[0], THREE_FILE_SITES[1]], 'm25-erasure-sites.js',
  );

  const FRAMES = 5;
  for (let frame = 0; frame < FRAMES; frame += 1) {
    first();            // falsy→true: the only write the scalar can see
    second();           // true→true, always immediately after `first`, same frame
    chart.renderPending = false;   // what animate() does at chart.js:28771
  }

  const sites = sitesOf(chart);
  const keys = Object.keys(sites).sort();
  const [firstKey, secondKey] = keys;

  note('erasure-case-attributed',
    keys.length === 2 && sites[secondKey] === FRAMES && armed(chart) === FRAMES,
    `m25FramesArmed=${armed(chart)} for ${FRAMES * 2} arming writes; sites=${JSON.stringify(sites)}`);

  // The scalar cannot tell this session apart from one in which `second` does not
  // exist at all — that is the "reads as dead" failure this packet exists to fix.
  assert.equal(armed(chart), FRAMES,
    'the scalar counts frames, so the second site contributed exactly 0 to it');
  assert.equal(keys.length, 2, 'both sites must be attributed');
  assert.equal(sites[firstKey], FRAMES);
  assert.equal(sites[secondKey], FRAMES,
    'a site that never once caused an increment must still be attributed every time it fired');
});

test('M25 attribution: every one of the 28 arming sites is attributed when it fires', () => {
  const sandbox = makeRealm(HEAD, { attribution: true });
  const chart = sandbox.__makeChart();
  const fires = compileCoFiringSites(sandbox, chart, ARMING, 'm25-all-arming-sites.js');

  // No clears at all: 27 of the 28 writes are true→true and invisible to the scalar.
  for (const fire of fires) fire();

  const sites = sitesOf(chart);
  const total = Object.values(sites).reduce((a, b) => a + b, 0);
  note('all-28-attributed', Object.keys(sites).length === 28 && total === 28,
    `m25FramesArmed=${armed(chart)}, distinct attributions=${Object.keys(sites).length}, total=${total}`);
  assert.equal(armed(chart), 1, 'the scalar sees one frame for all 28');
  assert.equal(Object.keys(sites).length, 28, 'no arming site may read as dead');
  assert.equal(total, 28);
});

test('M25 attribution: __mcDiagReset() empties the site map in place', () => {
  const sandbox = makeRealm(HEAD, { attribution: true });
  const chart = sandbox.__makeChart();
  const win = bootReporter(sandbox, chart);
  const [fire] = compileCoFiringSites(sandbox, chart, [THREE_FILE_SITES[0]], 'm25-reset-sites.js');

  fire(); fire();
  const identity = sitesOf(chart);
  assert.equal(Object.keys(identity).length, 1);

  win.__mcDiagReset();
  note('reset-empties-site-map', Object.keys(sitesOf(chart)).length === 0 && sitesOf(chart) === identity,
    'emptied in place, same object identity the setter captured');
  assert.equal(Object.keys(sitesOf(chart)).length, 0, 'reset must start a fresh attribution window');
  assert.equal(sitesOf(chart), identity,
    'the map must be emptied, not replaced: the accessor closes over the diag bag, not the map');

  fire();
  assert.equal(Object.keys(sitesOf(chart)).length, 1, 'attribution must survive a reset');
});

test('M25 attribution: overflow is announced, never dropped', () => {
  const sandbox = makeRealm(HEAD, { attribution: true });
  const chart = sandbox.__makeChart();
  const MAX = 256;
  const EXTRA = 8;
  const lines = [];
  for (let i = 0; i < MAX + EXTRA; i += 1) {
    lines.push(`globalThis.__m25Many[${i}] = function s${i}(){ globalThis.__m25Chart.renderPending = true; };`);
  }
  sandbox.__m25Many = [];
  sandbox.__m25Chart = chart;
  vm.runInContext(lines.join('\n'), sandbox, { filename: 'm25-overflow-sites.js' });
  for (const fire of sandbox.__m25Many) fire();

  const sites = sitesOf(chart);
  const overflowKey = Object.keys(sites).find((k) => k.startsWith('(overflow'));
  const total = Object.values(sites).reduce((a, b) => a + b, 0);
  note('overflow-announced', !!overflowKey && total === MAX + EXTRA,
    `distinct=${Object.keys(sites).length}, overflow=${sites[overflowKey]}, total writes accounted=${total}`);
  assert.ok(overflowKey, 'passing the distinct-key cap must add a visible overflow key, not silently drop');
  assert.equal(sites[overflowKey], EXTRA);
  assert.equal(total, MAX + EXTRA, 'every truthy write must be accounted for somewhere');
  assert.equal(Object.keys(sites).length, MAX + 1);
});

test('M25 attribution: default off — the flag must be exactly true', () => {
  for (const value of [undefined, false, 0, 1, 'true', null, {}]) {
    const sandbox = makeRealm(HEAD);
    if (value !== undefined) {
      sandbox.__m25FlagValue = value;
      vm.runInContext(`window.${ATTRIBUTION_FLAG} = globalThis.__m25FlagValue;`, sandbox);
    }
    const chart = sandbox.__makeChart();
    chart.renderPending = true;
    assert.equal(sitesOf(chart), undefined,
      `flag=${String(value)} must not enable attribution`);
    assert.equal(armed(chart), 1, 'the counter must still work with attribution off');
  }
  note('default-off', true, 'undefined, false, 0, 1, "true", null, {} — none enable it');

  const on = makeRealm(HEAD, { attribution: true }).__makeChart();
  assert.notEqual(sitesOf(on), undefined, 'and exactly true does enable it');
});

test('M25 attribution: with the flag off, the render path is identical to the attribution base', () => {
  const head = makeRealm(HEAD).__makeChart();
  const base = makeRealm(ATTR_BASE).__makeChart();

  const headDescriptor = Object.getOwnPropertyDescriptor(head, 'renderPending');
  const baseDescriptor = Object.getOwnPropertyDescriptor(base, 'renderPending');

  // The strongest available statement about cost: the bytes executed on every
  // write are the same function text as at ba2d30e57. Nothing was added to the
  // hot path — the opt-in wrapper is simply never installed.
  note('setter-text-identical',
    headDescriptor.set.toString() === baseDescriptor.set.toString(),
    `${headDescriptor.set.toString().length} chars`);
  assert.equal(headDescriptor.set.toString(), baseDescriptor.set.toString(),
    `the setter must be textually identical to ${ATTRIBUTION_BASE_COMMIT.slice(0, 9)} when attribution is off`);
  assert.equal(headDescriptor.get.toString(), baseDescriptor.get.toString());
  assert.equal(headDescriptor.enumerable, baseDescriptor.enumerable);
  assert.equal(headDescriptor.configurable, baseDescriptor.configurable);

  // No property added to the Chart, and none added to the diagnostics bag either:
  // m25ArmingSites is created by the installer, which did not run.
  assert.deepEqual(Object.getOwnPropertyNames(head), Object.getOwnPropertyNames(base));
  assert.deepEqual(
    Object.getOwnPropertyNames(head._mcDiag).sort(),
    Object.getOwnPropertyNames(base._mcDiag).sort(),
    'attribution off must add no field to _mcDiag (change 1 only moved m25FramesArmed, it did not add it)',
  );
  assert.equal(Object.prototype.hasOwnProperty.call(head._mcDiag, 'm25ArmingSites'), false);

  // …and the observable behaviour over a mixed write script is identical.
  const script = [true, true, false, 1, 0, 'x', '', true, NaN, false, true];
  for (const value of script) {
    head.renderPending = value;
    base.renderPending = value;
    assert.equal(Object.is(head.renderPending, base.renderPending), true, `read-back diverged for ${String(value)}`);
    assert.equal(armed(head), armed(base), `counter diverged after ${String(value)}`);
  }
  note('behaviour-identical-to-attribution-base', true,
    `${script.length} writes, final m25FramesArmed=${armed(head)} on both`);
});

test('M25 attribution: stands down under the renderPending kill switch', () => {
  const chart = makeRealm(HEAD, { killSwitch: true, attribution: true }).__makeChart();
  const descriptor = Object.getOwnPropertyDescriptor(chart, 'renderPending');

  note('killswitch-beats-attribution',
    descriptor.get === undefined && sitesOf(chart) === undefined,
    `descriptor={${Object.keys(descriptor).join(',')}}, m25ArmingSites=${String(sitesOf(chart))}`);
  assert.equal(descriptor.get, undefined,
    'attribution must not resurrect an accessor the kill switch was set to remove');
  assert.equal(descriptor.set, undefined);
  assert.equal(descriptor.writable, true);

  chart.renderPending = true;
  assert.equal(sitesOf(chart), undefined, 'and it must not create the site map either');
  assert.equal(armed(chart), 0);

  // The flag alone, with the accessor present, does install it — so the cell above
  // is not passing merely because attribution is broken everywhere.
  const live = makeRealm(HEAD, { attribution: true }).__makeChart();
  live.renderPending = true;
  assert.equal(Object.keys(sitesOf(live)).length, 1, 'non-vacuity: attribution works when the accessor exists');
});

test('M25 attribution: keys are source positions, and the deployed surface is unminified', () => {
  const v9 = fs.readFileSync(path.join(ROOT, 'chart v 1.4', 'chart', 'dist-v9', 'index.html'), 'utf8');
  const legacy = fs.readFileSync(path.join(ROOT, 'chart v 1.4', 'chart', 'legacy-index.html'), 'utf8');
  const bundler = fs.readFileSync(
    path.join(ROOT, 'chart v 1.4', 'chart', 'scripts', 'build-chart-client-bundle.mjs'), 'utf8',
  );

  // Both deployed pages load chart.js as its own <script>, so stack frames carry
  // real chart.js line numbers.
  assert.match(v9, /<script[^>]*\ssrc="\/chart\/chart\.js\?v=[^"]+"><\/script>/,
    'dist-v9/index.html must load chart.js as its own script');
  assert.match(legacy, /<script[^>]*\ssrc="chart\.js\?v=[^"]+"><\/script>/,
    'legacy-index.html must load chart.js as its own script');
  assert.equal(v9.includes('chart-app-part1.min.js'), false);
  assert.equal(legacy.includes('chart-app-part1.min.js'), false);

  // The optional bundle DOES exist and DOES swallow chart.js. Stated, not hidden:
  // if it were ever deployed, keys collapse to one file and one line, and only the
  // column tells sites apart.
  assert.ok(bundler.includes("'chart.js',"), 'npm run build:chart-client does include chart.js');
  assert.match(bundler, /mangle:\s*true/);
  assert.match(bundler, /sourceMap:\s*false/);
  note('deployed-surface-unminified', true,
    'dist-v9 + legacy-index load /chart/chart.js directly; the terser bundle exists but neither page references it');
});

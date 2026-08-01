/**
 * A/SR-03 — input-routing conversion gate.
 *
 * Behavioural gate for the four routing policies implemented in this packet.
 * Every cell drives REAL engine source extracted from the shipping files and
 * evaluated in a vm sandbox against a fake window; nothing here re-implements
 * production logic. The two cells that assert on source text are labelled
 * [SOURCE-PIN] and pin a design choice rather than verifying behaviour.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/a-sr03-focus-routing.test.mjs"
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SWITCH = '__TALARIA_DISABLE_FOCUS_ROUTING_V1';
const RESOLVER = '__talariaActiveChartV1';

function findRoot(start) {
  let cursor = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(cursor, '.git'))
      && fs.existsSync(path.join(cursor, 'chart v 1.4', 'chart', 'chart.js'))) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`repository root not found from ${start}`);
    cursor = parent;
  }
}

const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)));
const CHART_DIR = path.join(ROOT, 'chart v 1.4', 'chart');
const read = (rel) => fs.readFileSync(path.join(CHART_DIR, rel), 'utf8');

const CHART_JS = read('chart.js');
const ECON = read(path.join('modules', 'economic-news-sidebar.js'));
const FAVS = read(path.join('modules', 'favorites-manager.js'));
const INDUI = read(path.join('modules', 'indicator-ui.js'));

/* ─────────────────────── source extraction helpers ─────────────────────── */

/** Class method at four-space indent inside `class Chart {` (house pattern). */
function methodSource(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `^    ${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  if (!match) throw new Error(`method ${name} missing`);
  return match[0];
}

/** Brace-balanced block starting at `headerRe`, closing at `indent`-aligned `}`. */
function blockAt(text, headerRe, indent) {
  const m = headerRe.exec(text);
  if (!m) return null;
  const close = `\n${' '.repeat(indent)}}`;
  const end = text.indexOf(close, m.index);
  if (end === -1) return null;
  return text.slice(m.index, end + close.length);
}

/**
 * The idempotent resolver installer, if the file carries one. Absent on the
 * unmodified base — which is exactly why the routing cells are RED there.
 */
function installerBlock(text) {
  const re = new RegExp(`if \\(typeof window !== 'undefined' && typeof window\\.${RESOLVER} !== 'function'\\) \\{`);
  return blockAt(text, re, 0) || '';
}

/* ───────────────────────────── sandbox plumbing ───────────────────────── */

/**
 * @param {object} o
 * @param {'A'|'B'|null} o.focus   which chart the provider reports as focused
 * @param {*} o.killValue          value written to the kill-switch (omit for absent)
 * @param {boolean} o.killPresent
 * @param {*} o.hostChart          value for window.chart
 * @param {*} o.mainChartValue     value for window.mainChart
 */
function makeEnv({
  focus = 'B', killPresent = false, killValue = undefined,
  provider = true, hostIsA = true, mainChartDistinct = false,
} = {}) {
  const sandbox = { console: { log() {}, warn() {}, error() {}, info() {} } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  // Minimal DOM: chrome surfaces touch the document after they have chosen a
  // chart, and the choice is what these cells are about.
  vm.runInContext(`
    globalThis.document = {
      querySelectorAll() { return []; },
      querySelector() { return null; },
      getElementById() { return null; },
      createElement() { return { classList: { add() {}, remove() {}, contains() { return false; } }, style: {}, dataset: {} }; },
      body: { appendChild() {} },
      addEventListener() {},
    };
  `, sandbox);

  vm.runInContext(`
    globalThis.window = {};
    globalThis.__calls = [];
    function mkChart(id) {
      return {
        __id: id,
        isPanel: false,
        data: [1, 2, 3],
        offsetX: 0,
        priceOffset: 0,
        chartSettings: {},
        drag: { active: false, type: null },
        drawingManager: { setTool(t) { globalThis.__calls.push(id + ':setTool:' + t); } },
        scheduleRender() { globalThis.__calls.push(id + ':scheduleRender'); },
        render() { globalThis.__calls.push(id + ':render'); },
        constrainOffset() { globalThis.__calls.push(id + ':constrainOffset'); },
        addIndicator() { globalThis.__calls.push(id + ':addIndicator'); },
        loadPanelFileData(f) { globalThis.__calls.push(id + ':loadPanelFileData:' + f); return 'panelLoad'; },
        loadFileData(f) { globalThis.__calls.push(id + ':loadFileData:' + f); return 'hostLoad'; },
        settingsModal: { style() {} },
        showSettingsCategory() {},
        _settingsSourceChart: undefined,
      };
    }
    globalThis.A = mkChart('A');
    globalThis.B = mkChart('B');
    globalThis.Z = mkChart('Z');
  `, sandbox);

  vm.runInContext(`
    window.chart = ${hostIsA ? 'globalThis.A' : 'null'};
    window.mainChart = ${mainChartDistinct ? 'globalThis.Z' : (hostIsA ? 'globalThis.A' : 'null')};
    globalThis.__focus = ${focus === null ? 'null' : `globalThis.${focus}`};
    if (${provider ? 'true' : 'false'}) {
      window.getActiveChart = function () { return globalThis.__focus; };
    }
  `, sandbox);

  if (killPresent) {
    sandbox.__kv = killValue;
    vm.runInContext(`window.${SWITCH} = globalThis.__kv;`, sandbox);
  }
  return sandbox;
}

/** Copied into the host realm: a vm-realm Array fails deepStrictEqual on prototype. */
const calls = (sb) => Array.from(vm.runInContext('globalThis.__calls', sb));
const setFocus = (sb, id) => vm.runInContext(`globalThis.__focus = ${id === null ? 'null' : `globalThis.${id}`};`, sb);
const setKill = (sb, v) => { sb.__kv = v; vm.runInContext(`window.${SWITCH} = globalThis.__kv;`, sb); };

/** Evaluate a module's installer + one extracted function, return its value. */
function runModuleFn(sb, moduleText, fnBlock, invocation) {
  vm.runInContext(`${installerBlock(moduleText)}\n${fnBlock}\n`, sb);
  return vm.runInContext(invocation, sb);
}

/* ───────────────── extracted production units under test ───────────────── */

const ECON_MAINCHART = blockAt(ECON, /^ {4}function mainChart\(\) \{/m, 4);
const ECON_REDRAW = blockAt(ECON, /^ {4}function requestChartMarkerRedraw\(\) \{/m, 4);
const FAVS_ACTIVATE = blockAt(FAVS, /^ {4}activateTool\(toolId\) \{/m, 4);
const INDUI_TRYINIT = blockAt(INDUI, /^function _tryInitIndicatorUI\(\) \{/m, 0);

assert.ok(ECON_MAINCHART, 'economic-news-sidebar mainChart() must be extractable');
assert.ok(ECON_REDRAW, 'economic-news-sidebar requestChartMarkerRedraw() must be extractable');
assert.ok(FAVS_ACTIVATE, 'favorites-manager activateTool() must be extractable');
assert.ok(INDUI_TRYINIT, 'indicator-ui _tryInitIndicatorUI() must be extractable');

/** A Chart stand-in whose methods ARE the real chart.js sources. */
function makeChartClass(sb, methodNames, extra = '') {
  const body = methodNames.map((n) => methodSource(CHART_JS, n)).join('\n');
  vm.runInContext(`
${installerBlock(CHART_JS)}
class RealChart {
    constructor(id) {
        this.__id = id;
        this.isPanel = false;
        this.offsetX = 0;
        this.priceOffset = 0;
        this.drag = { active: false, type: null };
        this.canvas = {
            __captures: [],
            setPointerCapture(pid) { this.__captures.push(pid); },
            releasePointerCapture(pid) { this.__captures = this.__captures.filter((x) => x !== pid); },
        };
        this._settingsSourceChart = undefined;
        this.settingsModal = { style() {} };
        this._pendingTemplate = 'stale';
        this.h = 400;
        this.margin = { t: 0, b: 0 };
    }
    showSettingsCategory() {}
    render() { globalThis.__calls.push(this.__id + ':render'); }
    constrainOffset() { globalThis.__calls.push(this.__id + ':constrainOffset'); }
${body}
${extra}
}
globalThis.RealChart = RealChart;
`, sb);
}

/* ══════════════════════════════ POLICY 1 ══════════════════════════════ */

test('SR03-C01 econ sidebar mainChart() resolves the FOCUSED chart, not the host', () => {
  const sb = makeEnv({ focus: 'B' });
  const got = runModuleFn(sb, ECON, ECON_MAINCHART, 'mainChart()');
  assert.equal(got && got.__id, 'B', 'news sidebar must resolve the chart the user last clicked');
});

test('SR03-C02 econ sidebar marker redraw renders the FOCUSED chart', () => {
  const sb = makeEnv({ focus: 'B' });
  runModuleFn(sb, ECON, `${ECON_MAINCHART}\n${ECON_REDRAW}`, 'requestChartMarkerRedraw()');
  assert.deepEqual(calls(sb), ['B:scheduleRender'], 'redraw must hit the focused chart only');
});

test('SR03-C03 favourites applies a tool to the FOCUSED chart', () => {
  const sb = makeEnv({ focus: 'B' });
  vm.runInContext(`${installerBlock(FAVS)}
class Favs {
    constructor() { this.favorites = []; }
    updateActiveState() {}
    getOriginalButtonId() { return 'none'; }
${FAVS_ACTIVATE}
}
new Favs().activateTool('trendline');
`, sb);
  assert.deepEqual(calls(sb), ['B:setTool:trendline'], 'tool must land on the focused chart');
});

test('SR03-C04 indicator UI binds the FOCUSED chart at init', () => {
  const sb = makeEnv({ focus: 'B' });
  vm.runInContext(`
globalThis.__boundTo = null;
function setupIndicatorUI(ch) { globalThis.__boundTo = ch; }
globalThis.setTimeout = function () {};
let _indicatorUIReady = false;
`, sb);
  runModuleFn(sb, INDUI, INDUI_TRYINIT, '_tryInitIndicatorUI()');
  const bound = vm.runInContext('globalThis.__boundTo', sb);
  assert.equal(bound && bound.__id, 'B', 'indicator chrome must bind the focused chart');
});

test('SR03-C05 hideSettingsMenu clears the settings source on the FOCUSED chart', () => {
  const sb = makeEnv({ focus: 'B' });
  makeChartClass(sb, ['showSettingsMenu', 'hideSettingsMenu']);
  vm.runInContext(`
globalThis.A = new RealChart('A');
globalThis.B = new RealChart('B');
window.chart = globalThis.A;
window.mainChart = globalThis.A;
globalThis.__focus = globalThis.B;
globalThis.B.showSettingsMenu(0, 0);
globalThis.B.hideSettingsMenu();
`, sb);
  const bSrc = vm.runInContext('globalThis.B._settingsSourceChart', sb);
  assert.equal(bSrc, null,
    'B opened settings so B carries _settingsSourceChart; hide must clear it on B, not on the host');
});

test('SR03-C06 the window.mainChart chain no longer competes with the provider', () => {
  // window.chart empty, a stale window.mainChart present, provider names B.
  // Base resolves the stale chain (Z); the collapse must resolve the provider (B).
  const sb = makeEnv({ focus: 'B', hostIsA: false, mainChartDistinct: true });
  const got = runModuleFn(sb, ECON, ECON_MAINCHART, 'mainChart()');
  assert.equal(got && got.__id, 'B',
    'the provider is the single notion of "the chart"; window.mainChart must not win');

  // Nothing focused and no host chart: the answer is "no chart", not a stale
  // global. A surviving chain would resurrect Z here.
  const sb2 = makeEnv({ focus: null, hostIsA: false, mainChartDistinct: true });
  const none = runModuleFn(sb2, ECON, ECON_MAINCHART, 'mainChart()');
  assert.equal(none, null,
    'with no focus and no host, the stale window.mainChart must not be resurrected');
});

/* ══════════════════════════════ POLICY 2 ══════════════════════════════ */

function makePanEnv(sb) {
  makeChartClass(sb, ['_findActivePanChart', '_tryCaptureDragPointer',
    '_releaseDragPointerCapture', '_releasePanPointerCapture', 'panBy']);
  vm.runInContext(`
globalThis.A = new RealChart('A');
globalThis.B = new RealChart('B');
globalThis.C = new RealChart('C');
window.chart = globalThis.A;
window.mainChart = globalThis.A;
window.panelManager = null;
`, sb);
}

test('SR03-C07 the pointerdown owner wins over the inferred drag scan', () => {
  const sb = makeEnv({ focus: 'B' });
  makePanEnv(sb);
  vm.runInContext(`
// B receives pointerdown and takes capture: B owns the gesture.
globalThis.B.drag.active = true; globalThis.B.drag.type = 'pan';
globalThis.B._tryCaptureDragPointer({ pointerId: 7, currentTarget: globalThis.B.canvas });
// The host also looks like it is panning (pointer crossed it / stale flag).
globalThis.A.drag.active = true; globalThis.A.drag.type = 'pan';
globalThis.__found = globalThis.C._findActivePanChart();
`, sb);
  const found = vm.runInContext('globalThis.__found', sb);
  assert.equal(found && found.__id, 'B',
    'ownership is explicit from pointer capture, not inferred from whoever also looks active');
});

test('SR03-C08 gesture ownership survives a focus change mid-drag', () => {
  const sb = makeEnv({ focus: 'B' });
  makePanEnv(sb);
  vm.runInContext(`
globalThis.B.drag.active = true; globalThis.B.drag.type = 'pan';
globalThis.B._tryCaptureDragPointer({ pointerId: 3, currentTarget: globalThis.B.canvas });
globalThis.A.drag.active = true; globalThis.A.drag.type = 'pan';
`, sb);
  setFocus(sb, 'A'); // focus moves to the host mid-drag
  vm.runInContext('globalThis.__found = globalThis.C._findActivePanChart();', sb);
  const found = vm.runInContext('globalThis.__found', sb);
  assert.equal(found && found.__id, 'B',
    'a focus change during a drag must not hand the gesture to another instance');
});

test('SR03-C09 ownership ends at pointerup and a released instance cannot win on a stale flag', () => {
  const sb = makeEnv({ focus: 'B' });
  makePanEnv(sb);
  vm.runInContext(`
// B takes the gesture, then the pointer is released. Release runs before the
// drag flags are reset, so B still LOOKS like it is panning afterwards.
globalThis.B.drag.active = true; globalThis.B.drag.type = 'pan';
globalThis.B._tryCaptureDragPointer({ pointerId: 5, currentTarget: globalThis.B.canvas });
globalThis.B._releaseDragPointerCapture();
// A now starts a genuine new pan.
globalThis.A.drag.active = true; globalThis.A.drag.type = 'pan';
globalThis.__found = globalThis.C._findActivePanChart();
`, sb);
  const found = vm.runInContext('globalThis.__found', sb);
  assert.equal(found && found.__id, 'A',
    'once B has released the pointer its stale drag flag must not keep the gesture pinned to B');

  // The handle itself must be dropped, so a finished chart is not retained.
  assert.equal(vm.runInContext('window.__talariaGestureOwnerV1 || null', sb), null,
    'the ownership handle must be cleared on release, not left pointing at B');
});

/* ═══════════════════════ FLAG-01 / FLAG-02 kill-switch ═══════════════════ */

const TRUTHY = [
  ['true', true], ['1', 1], ["'yes'", 'yes'], ["'true'", 'true'],
  ['{}', {}], ['[]', []], ["'0'", '0'],
];
const FALSY = [
  ['undefined', undefined], ['null', null], ['false', false],
  ['0', 0], ["''", ''], ['NaN', NaN],
];

test('SR03-C10 truthy kill-switch values DISABLE the fix (base routing returns)', () => {
  for (const [label, value] of TRUTHY) {
    const sb = makeEnv({ focus: 'B', killPresent: true, killValue: value });
    const got = runModuleFn(sb, ECON, ECON_MAINCHART, 'mainChart()');
    assert.equal(got && got.__id, 'A',
      `kill-switch=${label} must disable focus routing and resolve the host`);
  }
});

test('SR03-C11 falsy kill-switch values KEEP the fix', () => {
  for (const [label, value] of FALSY) {
    const sb = makeEnv({ focus: 'B', killPresent: true, killValue: value });
    const got = runModuleFn(sb, ECON, ECON_MAINCHART, 'mainChart()');
    assert.equal(got && got.__id, 'B',
      `kill-switch=${label} is falsy and must keep focus routing on`);
  }
});

test('SR03-C12 kill-switch is read per call and flips MID-RUN on one live instance', () => {
  const sb = makeEnv({ focus: 'B' });
  vm.runInContext(`${installerBlock(ECON)}\n${ECON_MAINCHART}\nglobalThis.probe = mainChart;`, sb);
  const probe = () => { const r = vm.runInContext('probe()', sb); return r && r.__id; };

  assert.equal(probe(), 'B', 'switch absent: fix on');
  setKill(sb, true);
  assert.equal(probe(), 'A', 'flipped ON mid-run: same live instance must now bypass the provider');
  setKill(sb, false);
  assert.equal(probe(), 'B', 'flipped back OFF mid-run: routing must return without a reload');
  setKill(sb, 'yes');
  assert.equal(probe(), 'A', "non-boolean truthy mid-run must disable (rules out `=== true`)");
  setKill(sb, undefined);
  assert.equal(probe(), 'B', 'cleared mid-run: routing returns');
});

/* ═════════════════════ FLAG-03 OFF arm is a WORKING product ═════════════ */

test('SR03-C13 FLAG-03 OFF arm still resolves chrome to a USABLE chart', () => {
  for (const [label, value] of TRUTHY) {
    const sb = makeEnv({ focus: 'B', killPresent: true, killValue: value });
    const got = runModuleFn(sb, ECON, ECON_MAINCHART, 'mainChart()');
    assert.ok(got, `kill-switch=${label}: chrome must still get a chart, not null`);
    assert.equal(typeof got.scheduleRender, 'function',
      `kill-switch=${label}: the resolved chart must be usable chrome-side`);
  }
  // and the favourites surface still actually applies a tool with the fix OFF
  const sb2 = makeEnv({ focus: 'B', killPresent: true, killValue: 1 });
  vm.runInContext(`${installerBlock(FAVS)}
class Favs { constructor() { this.favorites = []; } updateActiveState() {}
    getOriginalButtonId() { return 'none'; }
${FAVS_ACTIVATE}
}
new Favs().activateTool('ray');
`, sb2);
  assert.deepEqual(calls(sb2), ['A:setTool:ray'], 'OFF arm must still apply the tool somewhere real');
});

test('SR03-C14 FLAG-03 a pan still MOVES A VIEWPORT with the fix off and on', () => {
  for (const [label, value, expectOwner] of [['disabled', 1, 'A'], ['enabled', undefined, 'B']]) {
    const sb = makeEnv({ focus: 'B', killPresent: value !== undefined, killValue: value });
    makePanEnv(sb);
    vm.runInContext(`
globalThis.B.drag.active = true; globalThis.B.drag.type = 'pan';
globalThis.B._tryCaptureDragPointer({ pointerId: 9, currentTarget: globalThis.B.canvas });
globalThis.A.drag.active = true; globalThis.A.drag.type = 'pan';
globalThis.__found = globalThis.C._findActivePanChart();
globalThis.__before = globalThis.__found ? globalThis.__found.offsetX : null;
if (globalThis.__found) globalThis.__found.panBy(40, 0);
globalThis.__after = globalThis.__found ? globalThis.__found.offsetX : null;
`, sb);
    const found = vm.runInContext('globalThis.__found', sb);
    assert.ok(found, `${label}: a pan in flight must still resolve to a chart`);
    assert.equal(found.__id, expectOwner, `${label}: expected owner ${expectOwner}`);
    assert.equal(vm.runInContext('globalThis.__before', sb), 0, `${label}: viewport starts at 0`);
    assert.equal(vm.runInContext('globalThis.__after', sb), 40,
      `${label}: real panBy() must have moved the viewport`);
    assert.ok(calls(sb).includes(`${found.__id}:render`), `${label}: pan must repaint`);
  }
});

/* ════════════════ POLICY 4 — the reads that must NOT be routed ═══════════ */

test('SR03-C15 [SOURCE-PIN] host-identity discriminators still compare against window.chart', () => {
  // Not a behavioural cell: this pins a design choice at two sites whose
  // enclosing methods are too entangled to drive end-to-end here.
  assert.match(CHART_JS,
    /const isMainAppChart = typeof window !== 'undefined' && window\.chart && targetChart === window\.chart;/,
    'chart.js:17248 is an identity test ("am I the host"); routing it inverts its meaning');
  assert.match(CHART_JS,
    /if \(typeof window !== 'undefined' && window\.chart\) return window\.chart; \/\/ idempotent/,
    'chart.js:42890 is the _talariaInitializeChart idempotent early return and belongs to registry work');
  assert.ok(!new RegExp(`isMainAppChart[^\\n]*${RESOLVER}`).test(CHART_JS),
    'the identity test must not be rewritten to a focus read');
});

test('SR03-C16 [SOURCE-PIN] order-manager.js carries no routing edit in either mirror', () => {
  for (const rel of [
    path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'order-manager.js'),
    path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'order-manager.js'),
  ]) {
    const src = fs.readFileSync(rel, 'utf8');
    assert.ok(!src.includes(RESOLVER), `${rel} must not be touched by this packet`);
    assert.ok(!src.includes(SWITCH), `${rel} must not carry the SR-03 kill-switch`);
  }
});

test('SR03-C17 symbol switcher still routes a secondary panel to loadPanelFileData', () => {
  // Behavioural guard for chart.js:18419. `targetChart !== window.chart` is a
  // host-identity discriminator, NOT a target lookup: targetChart is already
  // resolved through the provider one line earlier. Routing 18419 collapses the
  // test to `x !== x` and loadPanelFileData would never run again.
  const sb = makeEnv({ focus: 'B' });
  vm.runInContext(`
window.innerWidth = 1400;
const mkClassList = () => { const s = new Set(); return {
  add(...c) { c.forEach((x) => s.add(x)); }, remove(...c) { c.forEach((x) => s.delete(x)); },
  contains(c) { return s.has(c); } }; };
globalThis.__dropdown = {
  classList: mkClassList(), style: {}, dataset: {},
  addEventListener(t, fn) { if (t === 'click') globalThis.__ddClick = fn; },
  querySelector() { return null; }, querySelectorAll() { return []; },
  getBoundingClientRect() { return { left: 0, bottom: 0 }; },
};
globalThis.__group = { addEventListener() {}, getBoundingClientRect() { return { left: 0, bottom: 0 }; } };
document = {
  getElementById(id) { return id === 'symbolSearchGroup' ? globalThis.__group
    : (id === 'symbolSwitcherDropdown' ? globalThis.__dropdown : null); },
  createElement() { return { classList: mkClassList(), style: {}, dataset: {} }; },
  body: { appendChild() {} },
  addEventListener() {},
};
`, sb);
  makeChartClass(sb, ['setupSymbolSearchSwitcher'], `
    renderSymbolSwitcherOptions() {}
    loadFileData(f) { globalThis.__calls.push(this.__id + ':loadFileData:' + f); return { then() { return this; }, catch() { return this; }, finally() { return this; } }; }
    loadPanelFileData(f) { globalThis.__calls.push(this.__id + ':loadPanelFileData:' + f); return { then() { return this; }, catch() { return this; }, finally() { return this; } }; }
`);
  vm.runInContext(`
globalThis.A = new RealChart('A');
globalThis.B = new RealChart('B');
window.chart = globalThis.A;
window.mainChart = globalThis.A;
globalThis.B.isPanel = true;          // B is a secondary panel, and is focused
globalThis.B.currentFileId = 'old';
globalThis.__focus = globalThis.B;
globalThis.A.setupSymbolSearchSwitcher();
globalThis.__ddClick({
  stopPropagation() {},
  target: { closest: (sel) => (sel === '.ssd-item[data-file-id]'
    ? { dataset: { fileId: 'next' }, classList: mkClassList() } : null) },
});
`, sb);
  assert.deepEqual(calls(sb), ['B:loadPanelFileData:next'],
    'a focused secondary panel must load through loadPanelFileData, not the host path');
});

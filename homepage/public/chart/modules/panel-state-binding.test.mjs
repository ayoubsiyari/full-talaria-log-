/**
 * TAL-01865 per-panel slice — BINDING.
 *
 * The round-trip gate proves the store is correct. It says nothing about
 * whether anything calls it, which is the RESOLVER_PRESENT_BUT_UNCALLED state.
 * This gate covers the other half: the capture actually assembles a panel's
 * slice from a live engine, the write is coalesced rather than per-frame, and
 * every call site exists in the product.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

console.log('SEAL-EVIDENCE-01 EVIDENCE CLASS: SANDBOX_SIM — product source is executed here in a synthetic realm against stubs this gate wrote. Green means the logic behaves against those stubs, NOT that the shipped product does. A row can be green here and inert in the browser.');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Walk up to the repo root instead of counting directory levels — the mirrored
 * copy sits at a different depth, where a fixed `../../..` resolved to
 * `homepage/` and killed the gate on load. See the note in the round-trip gate.
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

const ROOT = findRoot(__dirname);
const GRID = path.join(ROOT, 'chart v 1.4/talaria-design/src/MultichartGrid.jsx');
const SHELL = path.join(ROOT, 'chart v 1.4/talaria-design/src/TalariaV8bLive.jsx');

const gridSrc = fs.readFileSync(GRID, 'utf8');
const shellSrc = fs.readFileSync(SHELL, 'utf8');

/** Lift a top-level function declaration by name, brace-matched. */
function liftFn(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) {
    const state = source.includes(name) ? 'ANCHOR_BROKEN' : 'RESOLVER_ABSENT_FROM_TREE';
    assert.fail(`${state}: ${name}`);
  }
  const open = source.indexOf('{', source.indexOf(')', start));
  let d = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') d += 1;
    else if (source[i] === '}') { d -= 1; if (d === 0) return source.slice(start, i + 1); }
  }
  assert.fail(`ANCHOR_BROKEN: ${name} — unbalanced braces`);
  return null;
}

const CAPTURE_FNS = [
  'panelStatePersistV1Enabled',
  'liveChartForPanel',
  'capturePanelZoomAndScale',
  'capturePanelStateSnapshot',
  'schedulePanelStatePersist',
  'cancelPanelStatePersistTimers',
];

function makeSandbox({ chart = null } = {}) {
  const saved = [];
  const timers = [];
  const ctx = vm.createContext({
    Number, String, Object, JSON, Boolean, Array, console,
    window: { chart },
    __saved: saved,
    __timers: timers,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: (h) => { if (h && timers[h - 1]) timers[h - 1].cancelled = true; },
  });
  const body = `
    const HOST_PANEL_ID = "A";
    const panelStateWriteTimers = Object.create(null);
    const panelStateLastKey = Object.create(null);
    const PANEL_STATE_WRITE_DEBOUNCE_MS = 700;
    function panelStateSessionId() { return "sess-1"; }
    function savePanelState(id, patch, sid) { __saved.push({ id, patch, sid }); return true; }
    ${CAPTURE_FNS.map((n) => liftFn(gridSrc, n)).join('\n')}
    globalThis.__api = {
      capture: capturePanelStateSnapshot,
      schedule: schedulePanelStatePersist,
      cancel: cancelPanelStatePersistTimers,
      timerCount: () => Object.keys(panelStateWriteTimers).length,
    };
  `;
  vm.runInContext(body, ctx);
  const api = vm.runInContext('__api', ctx);
  return {
    api,
    saved,
    /** Run every armed, uncancelled timer. */
    flush: () => { timers.forEach((t) => { if (!t.cancelled) { t.cancelled = true; t.fn(); } }); },
    armed: () => timers.filter((t) => !t.cancelled).length,
    ctx,
  };
}

const plain = (v) => JSON.parse(JSON.stringify(v));

function fakeManager(entries) {
  return { charts: { get: (id) => entries[id] || null } };
}

test('PANELBIND: the host tile is captured from the live engine', () => {
  const hostChart = {
    currentFileId: 'f-eurusd',
    currentSymbol: 'EURUSD',
    currentTimeframe: '5m',
    chartSettings: { chartType: 'candles' },
    candleWidth: 9,
    priceScale: { mode: 'log', autoScale: false, min: 1.05, max: 1.09 },
  };
  const s = makeSandbox({ chart: hostChart });
  const mgr = fakeManager({ A: { state: { visibleStartSec: 100, visibleEndSec: 900 } } });

  const patch = plain(s.api.capture(mgr, 'A'));
  assert.deepEqual(patch, {
    fileId: 'f-eurusd',
    symbol: 'EURUSD',
    timeframe: '5m',
    chartType: 'candles',
    viewStartSec: 100,
    viewEndSec: 900,
    candleWidth: 9,
    priceScaleMode: 'log',
    priceScaleAuto: false,
    priceScaleMin: 1.05,
    priceScaleMax: 1.09,
  });
});

test('PANELBIND: an iframe tile is captured from the manager cache and its own engine', () => {
  const s = makeSandbox({ chart: { currentSymbol: 'HOSTPAIR' } });
  const mgr = fakeManager({
    B: {
      state: {
        fileId: 'f-gbpusd', symbol: 'GBPUSD', timeframe: '1H', chartType: 'line',
        visibleStartSec: 10, visibleEndSec: 20,
      },
      iframe: { contentWindow: { chart: { candleWidth: 4, priceScale: { mode: 'linear', autoScale: true } } } },
    },
  });

  const patch = plain(s.api.capture(mgr, 'B'));
  assert.equal(patch.symbol, 'GBPUSD', 'the iframe inherited the host symbol');
  assert.equal(patch.chartType, 'line');
  assert.equal(patch.candleWidth, 4, 'zoom came from the wrong engine');
  assert.equal(patch.priceScaleAuto, true);
});

test('PANELBIND: a torn-down iframe still yields identity, minus its zoom', () => {
  // Reaching into a dead or cross-origin frame throws. That must cost the
  // caller the zoom it could not read, not the symbol it already had.
  const s = makeSandbox();
  const mgr = fakeManager({
    B: {
      state: { symbol: 'GBPUSD', timeframe: '1H' },
      get iframe() { throw new Error('cross-origin'); },
    },
  });
  const patch = plain(s.api.capture(mgr, 'B'));
  assert.deepEqual(patch, { symbol: 'GBPUSD', timeframe: '1H' });
});

test('PANELBIND: nothing to report yields null rather than an empty write', () => {
  const s = makeSandbox();
  assert.equal(s.api.capture(fakeManager({}), 'B'), null);
});

test('PANELBIND: auto-scaled bounds are not captured even when the engine exposes them', () => {
  const s = makeSandbox({
    chart: { priceScale: { mode: 'linear', autoScale: true, min: 1, max: 2 } },
  });
  const patch = plain(s.api.capture(fakeManager({}), 'A'));
  assert.equal(patch.priceScaleAuto, true);
  assert.equal('priceScaleMin' in patch, false, 'a derived readout was captured as configuration');
});

test('PANELBIND: an inverted viewport from the manager is not captured', () => {
  const s = makeSandbox({ chart: { currentSymbol: 'EURUSD' } });
  const mgr = fakeManager({ A: { state: { visibleStartSec: 900, visibleEndSec: 100 } } });
  const patch = plain(s.api.capture(mgr, 'A'));
  assert.equal('viewStartSec' in patch, false);
});

test('PANELBIND: writes are coalesced, not one per scroll frame', () => {
  const s = makeSandbox({ chart: { currentSymbol: 'EURUSD' } });
  const mgr = fakeManager({});

  for (let i = 0; i < 60; i += 1) s.api.schedule(mgr, 'A');
  assert.equal(s.armed(), 1, 'sixty scroll frames armed more than one write');
  assert.equal(s.saved.length, 0, 'a write landed before the debounce elapsed');

  s.flush();
  assert.equal(s.saved.length, 1);
  assert.equal(s.saved[0].id, 'A');
  assert.equal(s.saved[0].sid, 'sess-1', 'the write was not session-scoped');
});

test('PANELBIND: an unchanged panel is not rewritten', () => {
  const s = makeSandbox({ chart: { currentSymbol: 'EURUSD' } });
  const mgr = fakeManager({});
  s.api.schedule(mgr, 'A');
  s.flush();
  assert.equal(s.saved.length, 1);

  s.api.schedule(mgr, 'A');
  s.flush();
  assert.equal(s.saved.length, 1, 'an identical snapshot was written twice');
});

test('PANELBIND: a real change after an identical one still writes', () => {
  const chart = { currentSymbol: 'EURUSD' };
  const s = makeSandbox({ chart });
  const mgr = fakeManager({});
  s.api.schedule(mgr, 'A');
  s.flush();

  chart.currentSymbol = 'GBPUSD';
  s.api.schedule(mgr, 'A');
  s.flush();
  assert.equal(s.saved.length, 2, 'the dirty check swallowed a real change');
  assert.equal(s.saved[1].patch.symbol, 'GBPUSD');
});

test('PANELBIND: immediate bypasses the debounce and cancels the armed write', () => {
  const s = makeSandbox({ chart: { currentSymbol: 'EURUSD' } });
  const mgr = fakeManager({});
  s.api.schedule(mgr, 'A');
  s.api.schedule(mgr, 'A', { immediate: true });
  assert.equal(s.saved.length, 1);
  s.flush();
  assert.equal(s.saved.length, 1, 'the superseded timer still fired');
});

test('PANELBIND: teardown clears pending writes', () => {
  const s = makeSandbox({ chart: { currentSymbol: 'EURUSD' } });
  s.api.schedule(fakeManager({}), 'A');
  assert.equal(s.api.timerCount(), 1);
  s.api.cancel();
  assert.equal(s.api.timerCount(), 0, 'a pending write outlived the grid');
  s.flush();
  assert.equal(s.saved.length, 0, 'a cancelled write still landed');
});

test('PANELBIND: the kill switch stops every write', () => {
  const s = makeSandbox({ chart: { currentSymbol: 'EURUSD' } });
  vm.runInContext('window.__TALARIA_DISABLE_PANEL_STATE_PERSIST_V1 = true;', s.ctx);
  s.api.schedule(fakeManager({}), 'A');
  s.api.schedule(fakeManager({}), 'A', { immediate: true });
  s.flush();
  assert.equal(s.saved.length, 0, 'the kill switch did not stop the writer');
});

// ─── Call sites: present in the product, not just in this harness ───────────

test('PANELBIND: bound — chart-state persists every tile including the host', () => {
  assert.match(
    gridSrc,
    /onStateAnyRef\.current = \(id, state\) => \{\s*(?:\/\/[^\n]*\n\s*)*schedulePanelStatePersist\(managerRef\.current, id\);/,
    'the capture does not run before the host-echo return, so tile A never persists',
  );
});

test('PANELBIND: bound — focus changes are written', () => {
  assert.match(gridSrc, /saveFocusedPanelId\(focusedPanelId, panelStateSessionId\(\)\)/, 'focus is never persisted');
});

test('PANELBIND: bound — boot reads the stored timeframe and file', () => {
  assert.match(gridSrc, /let bootTf = resolveBootTimeframeForPanel\(tile\.id, effTf\)/, 'boot ignores the stored timeframe');
  assert.match(gridSrc, /tf:\s*bootTf \|\| effTf/, 'the resolved timeframe never reaches addChart');
  assert.match(
    liftFn(gridSrc, 'resolveBootFileIdForPanel'),
    /loadPanelState\(panelId, panelStateSessionId\(\)\)/,
    'boot does not fall back to the persisted file id',
  );
});

test('PANELBIND: bound — a retired slot does not inherit the previous tenant', () => {
  const at = gridSrc.indexOf('if (retiredPanelIdsRef.current.has(tile.id)) {');
  assert.ok(at > 0, 'ANCHOR_BROKEN: recycled-id heal block');
  const block = gridSrc.slice(at, at + 900);
  assert.match(block, /bootFileId = effFile;/, 'ANCHOR_BROKEN: heal no longer resets the file id');
  assert.match(block, /bootTf = effTf;/, 'a recycled id would boot on the retired tile\'s timeframe');
});

test('PANELBIND: bound — chart type is restored once the bridge is ready', () => {
  assert.match(gridSrc, /sendCommand\(pid, "setChartType", \{ chartType: ct \}\)/, 'chart type is never restored');
});

test('PANELBIND: bound — shrinking the layout prunes retired slots', () => {
  assert.match(gridSrc, /prunePanelStates\(layout\.tiles\.map\(\(t\) => t\.id\)\)/, 'retired slots are never pruned');
});

test('PANELBIND: bound — the shell restores the focused tile on boot', () => {
  assert.match(
    shellSrc,
    /useState\(\(\) => \{[\s\S]{0,240}loadPanelStates\(v9CurrentChartSessionId\(\)\)\.focusedPanelId \|\| "A"/,
    'the focused tile is not restored on boot',
  );
  assert.match(
    shellSrc,
    /import \{[^}]*\bloadPanelStates\b[^}]*\} from "\.\/panelStateStorage\.js"/,
    'the shell does not import the store',
  );
});

test('PANELBIND: bound — the blob has exactly one owner', () => {
  // The layout id and the per-panel slices share this blob. A second reader on
  // raw localStorage would sit on the unscoped key while the store sits on the
  // user-scoped one, and a layout would drift away from its own panels.
  const strays = shellSrc.match(/(?:localStorage|sessionStorage)\s*\.\s*(?:get|set|remove)Item\(\s*["']chart_panel_state["']/g);
  assert.equal(strays, null, `a second reader of the blob reappeared: ${strays}`);
  assert.match(shellSrc, /const state = readPanelStateBlob\(\);/, 'the layout hydrate no longer reads through the store');
  assert.match(shellSrc, /updatePanelStateBlob\(\(blob\) => \{\s*blob\.layout = id;/, 'the layout write no longer goes through the store');
});

test('PANELBIND: bound — a session change drops the per-panel slices with the layout', () => {
  const at = shellSrc.indexOf('if (savedSid && curSid && savedSid !== curSid) {');
  assert.ok(at > 0, 'ANCHOR_BROKEN: session-mismatch reset');
  const block = shellSrc.slice(at, at + 500);
  assert.match(block, /blob\.panelsById = \{\};/, 'a new session inherits the previous session\'s panels');
  assert.match(block, /blob\.focusedPanelId = null;/, 'a new session inherits the previous session\'s focus');
});

/**
 * The viewport half of the row. `multichart-manager` has read
 * `cfg.restoreStartSec` / `cfg.restoreEndSec` since Phase 6.4 and nothing ever
 * set them — a reader with no writer, so zoom persisted and never came back.
 * These cells hold that writer in place.
 */
function driveResolveViewport({ enabled = true, stored = null } = {}) {
  const ctx = vm.createContext({ Number, String, Object, console, window: {} });
  const body = `
    ${liftFn(gridSrc, 'resolveBootViewportForPanel')}
    function panelStatePersistV1Enabled() { return ${enabled ? 'true' : 'false'}; }
    function panelStateSessionId() { return 'sess-1'; }
    function loadPanelState() { return ${JSON.stringify(stored)}; }
    ({ resolveBootViewportForPanel })
  `;
  return vm.runInContext(body, ctx).resolveBootViewportForPanel('B');
}

test('PANELBIND: viewport — a stored market-time window becomes the boot pair', () => {
  const got = driveResolveViewport({ stored: { viewStartSec: 1000, viewEndSec: 2000 } });
  assert.deepEqual(
    got ? { restoreStartSec: got.restoreStartSec, restoreEndSec: got.restoreEndSec } : null,
    { restoreStartSec: 1000, restoreEndSec: 2000 },
    'the stored window did not become the manager cfg pair',
  );
});

test('PANELBIND: viewport — anti-vacuity, nothing to restore yields nothing', () => {
  // If these returned a pair anyway, the cell above would pass on a constant.
  assert.equal(driveResolveViewport({ stored: null }), null, 'a panel with no stored slice invented a window');
  assert.equal(driveResolveViewport({ stored: {} }), null, 'an empty slice invented a window');
  assert.equal(
    driveResolveViewport({ stored: { viewStartSec: 2000, viewEndSec: 1000 } }),
    null,
    'an inverted window was accepted',
  );
  assert.equal(
    driveResolveViewport({ stored: { viewStartSec: 1000 } }),
    null,
    'a half-present window was accepted — a start alone cannot position a viewport',
  );
  assert.equal(
    driveResolveViewport({ enabled: false, stored: { viewStartSec: 1000, viewEndSec: 2000 } }),
    null,
    'the kill switch does not stop the restore',
  );
});

test('PANELBIND: viewport — bound, the boot cfg actually carries the pair', () => {
  // Present is not bound: the resolver could be perfect and never reach addChart.
  const at = gridSrc.indexOf('const cfg = {');
  assert.ok(at > 0, 'ANCHOR_BROKEN: boot cfg literal');
  const block = gridSrc.slice(at, at + 400);
  assert.match(block, /\.\.\.\(bootViewport \|\| \{\}\)/, 'the boot cfg does not carry the restored window');
  assert.match(
    gridSrc,
    /let bootViewport = resolveBootViewportForPanel\(tile\.id\)/,
    'nothing resolves the window at boot',
  );
  assert.match(gridSrc, /m\.addChart\(cfg, cellEl\)/, 'ANCHOR_BROKEN: addChart call site');
});

test('PANELBIND: viewport — a recycled slot does not open on the previous tenant\'s zoom', () => {
  const at = gridSrc.indexOf('if (retiredPanelIdsRef.current.has(tile.id)) {');
  assert.ok(at > 0, 'ANCHOR_BROKEN: recycled-panel heal');
  const block = gridSrc.slice(at, at + 900);
  assert.match(block, /bootViewport = null;/, 'a retired id inherits the previous tenant\'s window');
});

/** Lift a `case "name": { ... }` block body and drive it. */
function driveSetPriceScale(priceScale, args) {
  const marker = 'case "setPriceScale": {';
  const at = gridSrc.indexOf(marker);
  assert.ok(at > 0, 'RESOLVER_ABSENT_FROM_TREE: setPriceScale command');
  const open = at + marker.length - 1;
  let d = 0;
  let end = -1;
  for (let i = open; i < gridSrc.length; i += 1) {
    if (gridSrc[i] === '{') d += 1;
    else if (gridSrc[i] === '}') { d -= 1; if (d === 0) { end = i; break; } }
  }
  assert.ok(end > 0, 'ANCHOR_BROKEN: setPriceScale — unbalanced braces');
  const body = gridSrc.slice(open + 1, end);
  const ch = { priceScale, render() { this.__rendered = true; }, saveSettings() { this.__saved = true; } };
  const ctx = vm.createContext({ Number, String, Promise, Error, console, ch, args });
  vm.runInContext(`(function () {${body}})()`, ctx);
  return ch;
}

test('PANELBIND: scale — mode and manual bounds are restored', () => {
  const ch = driveSetPriceScale(
    { mode: 'linear', autoScale: true, min: 0, max: 0 },
    { mode: 'log', autoScale: false, min: 1.1, max: 1.9 },
  );
  assert.equal(ch.priceScale.mode, 'log', 'scale mode was not restored');
  assert.equal(ch.priceScale.autoScale, false, 'auto-scale flag was not restored');
  assert.equal(ch.priceScale.min, 1.1, 'manual lower bound was not restored');
  assert.equal(ch.priceScale.max, 1.9, 'manual upper bound was not restored');
  assert.equal(ch.__rendered, true, 'the panel was not redrawn after the scale changed');
});

test('PANELBIND: scale — under auto-scale, stale bounds are NOT written back', () => {
  // The manifest rule: derived state reloads fresh. Under auto-scale min/max are
  // a readout of whichever bars were loaded, so restoring them would pin the
  // scale to yesterday's data.
  const ch = driveSetPriceScale(
    { mode: 'linear', autoScale: false, min: 5, max: 6 },
    { mode: 'linear', autoScale: true, min: 1.1, max: 1.9 },
  );
  assert.equal(ch.priceScale.autoScale, true, 'the auto-scale mode itself must restore');
  assert.equal(ch.priceScale.min, 5, 'a stale auto-scale readout was written back');
  assert.equal(ch.priceScale.max, 6, 'a stale auto-scale readout was written back');
});

test('PANELBIND: scale — anti-vacuity, an unchanged scale does not redraw', () => {
  const ch = driveSetPriceScale(
    { mode: 'log', autoScale: true, min: 0, max: 0 },
    { mode: 'log', autoScale: true, min: null, max: null },
  );
  assert.notEqual(ch.__rendered, true, 'a no-op restore still forced a redraw every boot');
});

test('PANELBIND: scale — bound, the restore effect sends the command', () => {
  assert.match(
    gridSrc,
    /mgr\.sendCommand\(pid, "setPriceScale", \{/,
    'the price scale is never sent to a panel — persisted but unbound',
  );
  assert.match(
    gridSrc,
    /const hasScale = stored[\s\S]{0,160}priceScaleAuto === "boolean"\);/,
    'the restore effect does not consider a panel with scale but no chart type',
  );
  // The ref gates BOTH restores now, so a name claiming only chart type would
  // mislead the next reader exactly as it misled me.
  assert.doesNotMatch(gridSrc, /chartTypeRestoredRef/, 'the once-per-panel ref still claims to cover only chart type');
});

/**
 * PARSE — the hole this gate had until it was pointed out.
 *
 * Every other cell here reads the shell as a STRING. A stray brace in
 * `MultichartGrid.jsx` would leave all of them green while the product failed
 * to build, because a regex does not care whether its haystack compiles. So the
 * source is put through the same compiler the shell is actually built with.
 *
 * esbuild is taken from the design tree, where it is vite's own dependency, and
 * not from the repo root (where it is not installed) or an npx cache (which is
 * a property of one laptop, not the repo). If it cannot be resolved the cells
 * FAIL with a named state rather than skipping: a parse check that quietly
 * opts out is the hole again, wearing a reassuring tick.
 */
function loadEsbuild() {
  const pkg = path.join(ROOT, 'chart v 1.4/talaria-design/node_modules/esbuild/package.json');
  if (!fs.existsSync(pkg)) {
    assert.fail(
      'PARSE_CHECKER_ABSENT: esbuild is not installed in the design tree '
      + '(chart v 1.4/talaria-design/node_modules/esbuild). It arrives with vite, so if this '
      + 'is missing the V9 shell cannot be built either. Run npm install there.',
    );
  }
  return createRequire(pathToFileURL(pkg))('esbuild');
}

function parseJsx(esbuild, source, label) {
  try {
    esbuild.transformSync(source, { loader: 'jsx', sourcefile: label });
    return null;
  } catch (err) {
    return (err && err.message) || String(err);
  }
}

test('PANELBIND: parse — the shell sources actually compile', () => {
  const esbuild = loadEsbuild();
  for (const [label, src] of [['MultichartGrid.jsx', gridSrc], ['TalariaV8bLive.jsx', shellSrc]]) {
    const err = parseJsx(esbuild, src, label);
    assert.equal(err, null, `${label} does not compile:\n${err}`);
  }
});

test('PANELBIND: parse — anti-vacuity, a real syntax error is caught', () => {
  // Without this the cell above passes if transformSync silently tolerates
  // anything, or if the loader is wrong and it is parsing nothing at all.
  const esbuild = loadEsbuild();
  const broken = gridSrc.replace('const cfg = {', 'const cfg = {{{');
  assert.notEqual(broken, gridSrc, 'ANCHOR_BROKEN: no site to corrupt');
  const err = parseJsx(esbuild, broken, 'MultichartGrid.jsx');
  assert.notEqual(err, null, 'the parse check accepts source that does not compile — it is decoration');

  // And it must be discriminating about WHERE, not just noisy.
  const stillFine = parseJsx(esbuild, gridSrc, 'MultichartGrid.jsx');
  assert.equal(stillFine, null, 'the checker rejects the unmodified product source');
});

test('PANELBIND: host — the only tile in layout "1" is restored too', () => {
  // The command path needs a bridge and the host has none, so it was skipped.
  // In layout "1" the host is the ONLY tile, which means single-chart users
  // restored nothing at all — the common case, not a corner case.
  const at = gridSrc.indexOf('if (!panelConfigRestoredRef.current.has(HOST_PANEL_ID)) {');
  assert.ok(at > 0, 'RESOLVER_ABSENT_FROM_TREE: host-tile restore');
  const block = gridSrc.slice(at, at + 2900);
  assert.match(block, /loadPanelState\(HOST_PANEL_ID, sid\)/, 'the host does not read its stored slice');
  assert.match(block, /window\.chart/, 'the host restore does not reach the engine in this realm');
  assert.match(block, /chartSettings\.chartType = String\(hostStored\.chartType\)/, 'host chart type is not restored');
  assert.match(block, /ps\.mode = mode;/, 'host scale mode is not restored');
  assert.match(block, /hostStored\.priceScaleAuto === false/, 'host manual bounds are not gated on auto-scale being off');
  assert.match(block, /if \(dirty && typeof hostCh\.render === "function"\) hostCh\.render\(\);/, 'the host is not redrawn');

  const unwired = gridSrc.replace('loadPanelState(HOST_PANEL_ID, sid)', 'null');
  assert.notEqual(unwired, gridSrc, 'ANCHOR_BROKEN: host read not found to mutate');
  assert.doesNotMatch(
    unwired.slice(at, at + 2900),
    /loadPanelState\(HOST_PANEL_ID, sid\)/,
    'the host cell would pass with the read removed',
  );
});

test('PANELBIND: mutants — unwiring either restore is caught', () => {
  // The two binding cells above read the product source. A source assertion
  // that would also pass on unwired source is decoration, so each is re-run
  // here against a deliberately unwired copy and must fail.
  const unwiredViewport = gridSrc.replace('...(bootViewport || {}),', '');
  assert.notEqual(unwiredViewport, gridSrc, 'ANCHOR_BROKEN: viewport spread not found to mutate');
  assert.doesNotMatch(
    unwiredViewport.slice(unwiredViewport.indexOf('const cfg = {'), unwiredViewport.indexOf('const cfg = {') + 400),
    /\.\.\.\(bootViewport \|\| \{\}\)/,
    'the viewport binding cell would pass with the wiring removed',
  );

  const unwiredScale = gridSrc.replace('mgr.sendCommand(pid, "setPriceScale", {', 'noop(');
  assert.notEqual(unwiredScale, gridSrc, 'ANCHOR_BROKEN: setPriceScale send not found to mutate');
  assert.doesNotMatch(
    unwiredScale,
    /mgr\.sendCommand\(pid, "setPriceScale", \{/,
    'the scale binding cell would pass with the send removed',
  );

  const unwiredHeal = gridSrc.replace('bootViewport = null;', '');
  assert.notEqual(unwiredHeal, gridSrc, 'ANCHOR_BROKEN: recycled-slot reset not found to mutate');
  const at = unwiredHeal.indexOf('if (retiredPanelIdsRef.current.has(tile.id)) {');
  assert.doesNotMatch(
    unwiredHeal.slice(at, at + 900),
    /bootViewport = null;/,
    'the recycled-slot cell would pass with the reset removed',
  );
});

test('PANELBIND: bound — the grid imports the store rather than reimplementing it', () => {
  assert.match(
    gridSrc,
    /import \{[\s\S]{0,200}savePanelState,[\s\S]{0,80}\} from "\.\/panelStateStorage\.js"/,
    'the grid does not import the shared store',
  );
});

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
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
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

test('PANELBIND: bound — the grid imports the store rather than reimplementing it', () => {
  assert.match(
    gridSrc,
    /import \{[\s\S]{0,200}savePanelState,[\s\S]{0,80}\} from "\.\/panelStateStorage\.js"/,
    'the grid does not import the shared store',
  );
});

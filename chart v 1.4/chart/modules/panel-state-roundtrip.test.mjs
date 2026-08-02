/**
 * TAL-01865 per-panel slice — round-trip identity for every persisted item.
 *
 * A round-trip gate is the easiest kind to write vacuously: save something,
 * load it, compare, green. It passes just as happily when the writer stores
 * nothing and the loader returns nothing, or when the fixture only exercises
 * two of the eleven fields it claims to cover. So the identity assertion here
 * carries three anti-vacuity arms:
 *
 *   1. COVERAGE — the fixture must contain every field the module declares in
 *      PERSISTED_PANEL_FIELDS, so the list cannot grow past the fixture.
 *   2. NON-EMPTY — the loaded entry must be non-empty and must have travelled
 *      through real serialised bytes, so {} === {} cannot be the green.
 *   3. PER-FIELD DISCRIMINATION — for each field independently, dropping it
 *      must change what loads back. This is what proves the comparison is
 *      load-bearing for all eleven rather than for whichever one happens to
 *      differ first.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const MODULE_PATH = path.join(ROOT, 'chart v 1.4/talaria-design/src/panelStateStorage.js');

/** Installs a fake user-scoped storage and returns a handle on the raw bytes. */
function installStorage({ throwOnWrite = false, seed = null } = {}) {
  const store = new Map();
  if (seed != null) store.set('chart_panel_state', seed);
  globalThis.window = {
    userStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => {
        if (throwOnWrite) throw new Error('QuotaExceededError');
        store.set(k, v);
      },
      removeItem: (k) => { store.delete(k); },
    },
  };
  return {
    raw: () => store.get('chart_panel_state') ?? null,
    blob: () => JSON.parse(store.get('chart_panel_state') ?? '{}'),
    set: (v) => store.set('chart_panel_state', v),
  };
}

const mod = await import(pathToFileURL(MODULE_PATH).href);
const {
  PERSISTED_PANEL_FIELDS,
  savePanelState,
  loadPanelState,
  loadPanelStates,
  saveFocusedPanelId,
  clearPanelState,
  prunePanelStates,
  readPanelStateBlob,
  normalizePanelEntry,
} = mod;

const SESSION = 'sess-42';

/** Every field, with priceScaleAuto false so the manual bounds are in scope. */
const FULL = {
  fileId: 'eurusd-2024',
  symbol: 'EURUSD',
  timeframe: '5m',
  chartType: 'candles',
  candleWidth: 8.5,
  viewStartSec: 1700000000,
  viewEndSec: 1700086400,
  priceScaleMode: 'log',
  priceScaleAuto: false,
  priceScaleMin: 1.0512,
  priceScaleMax: 1.0987,
};

test('PANELSTATE: anti-vacuity 1 — the fixture covers every declared field', () => {
  assert.ok(PERSISTED_PANEL_FIELDS.length >= 11, 'the field list shrank; the gate below would cover less than it claims');
  const missing = PERSISTED_PANEL_FIELDS.filter((f) => !Object.prototype.hasOwnProperty.call(FULL, f));
  assert.deepEqual(missing, [], 'declared fields absent from the round-trip fixture');
  const undeclared = Object.keys(FULL).filter((f) => !PERSISTED_PANEL_FIELDS.includes(f));
  assert.deepEqual(undeclared, [], 'fixture tests fields the module does not declare');
});

test('PANELSTATE: round-trip identity for a full panel entry', () => {
  const s = installStorage();
  assert.equal(savePanelState('B', FULL, SESSION), true);

  // Anti-vacuity 2: real bytes, and the loaded object is not the input object.
  const raw = s.raw();
  assert.ok(typeof raw === 'string' && raw.length > 0, 'nothing was written to storage');
  const loaded = loadPanelState('B', SESSION);
  assert.ok(loaded && Object.keys(loaded).length > 0, 'loaded an empty entry — {} === {} is not a round trip');
  assert.notEqual(loaded, FULL, 'loader handed back the input object rather than stored bytes');

  assert.deepEqual(loaded, FULL, 'a persisted field did not survive the round trip');
});

test('PANELSTATE: anti-vacuity 3 — every field is individually load-bearing', () => {
  for (const field of PERSISTED_PANEL_FIELDS) {
    installStorage();
    const partial = { ...FULL };
    delete partial[field];
    savePanelState('B', partial, SESSION);
    const loaded = loadPanelState('B', SESSION);

    // Dropping any single field must be visible in what loads back, otherwise
    // the identity assertion above is not actually testing that field.
    assert.notDeepEqual(
      loaded,
      FULL,
      `dropping ${field} produced an identical round trip — the gate cannot see ${field}`,
    );
  }
});

test('PANELSTATE: each panel keeps its own state', () => {
  installStorage();
  savePanelState('A', { symbol: 'EURUSD', timeframe: '1m' }, SESSION);
  savePanelState('B', { symbol: 'GBPUSD', timeframe: '1H' }, SESSION);
  savePanelState('C', { symbol: 'USDJPY', timeframe: '4H' }, SESSION);

  const { panelsById } = loadPanelStates(SESSION);
  assert.deepEqual(panelsById.A, { symbol: 'EURUSD', timeframe: '1m' });
  assert.deepEqual(panelsById.B, { symbol: 'GBPUSD', timeframe: '1H' });
  assert.deepEqual(panelsById.C, { symbol: 'USDJPY', timeframe: '4H' });
});

test('PANELSTATE: focused panel round-trips', () => {
  installStorage();
  saveFocusedPanelId('C', SESSION);
  assert.equal(loadPanelStates(SESSION).focusedPanelId, 'C');
});

test('PANELSTATE: a partial update does not erase the rest of the panel', () => {
  installStorage();
  savePanelState('B', FULL, SESSION);
  // chart-state messages report a subset; this is the shape of a live update.
  savePanelState('B', { timeframe: '15m' }, SESSION);
  const loaded = loadPanelState('B', SESSION);
  assert.equal(loaded.timeframe, '15m', 'the update did not apply');
  assert.equal(loaded.symbol, 'EURUSD', 'a subset update wiped the symbol');
  assert.equal(loaded.priceScaleMin, 1.0512, 'a subset update wiped the price scale');
});

test('PANELSTATE: an explicit null clears one field only', () => {
  installStorage();
  savePanelState('B', FULL, SESSION);
  savePanelState('B', { chartType: null }, SESSION);
  const loaded = loadPanelState('B', SESSION);
  assert.equal('chartType' in loaded, false, 'null did not clear the field');
  assert.equal(loaded.symbol, 'EURUSD', 'null cleared more than its own field');
});

test('PANELSTATE: the legacy panels array and unknown keys survive a write', () => {
  const s = installStorage({
    seed: JSON.stringify({
      layout: '2v',
      selectedPanelIndex: 0,
      panels: [{ index: 0, isMainChart: true, timeframe: '1m' }],
      sessionId: SESSION,
      someOtherLanesField: { keep: true },
    }),
  });
  savePanelState('B', { symbol: 'GBPUSD' }, SESSION);
  const blob = s.blob();
  assert.equal(blob.layout, '2v', 'layout id was lost');
  assert.ok(Array.isArray(blob.panels), 'the legacy panels array stopped being an array');
  assert.deepEqual(blob.panels, [{ index: 0, isMainChart: true, timeframe: '1m' }], 'legacy panel entries were dropped');
  assert.deepEqual(blob.someOtherLanesField, { keep: true }, 'another lane\'s field was clobbered');
  assert.equal(blob.panelsById.B.symbol, 'GBPUSD', 'our own field did not land');
});

test('PANELSTATE: another session\'s panel state does not bleed through', () => {
  installStorage();
  savePanelState('B', FULL, SESSION);
  saveFocusedPanelId('B', SESSION);

  const other = loadPanelStates('sess-99');
  assert.deepEqual(other.panelsById, {}, 'a different session inherited these panels');
  assert.equal(other.focusedPanelId, null, 'a different session inherited the focus');

  // Same session still restores.
  assert.equal(loadPanelState('B', SESSION).symbol, 'EURUSD');
});

test('PANELSTATE: writing under a new session starts that session clean', () => {
  const s = installStorage();
  savePanelState('B', FULL, SESSION);
  savePanelState('C', { symbol: 'GBPUSD' }, 'sess-99');
  const blob = s.blob();
  assert.equal(blob.sessionId, 'sess-99');
  assert.equal('B' in blob.panelsById, false, 'the previous session\'s panel survived into the new one');
  assert.equal(blob.panelsById.C.symbol, 'GBPUSD');
});

test('PANELSTATE: zoom is market time, never a bar index', () => {
  // DEF-04's mechanism: an index-pinned viewport reappears in the wrong place
  // once bars reload. Only a market-time window is accepted.
  const entry = normalizePanelEntry({ offsetX: 1200, viewStartSec: 100, viewEndSec: 200 });
  assert.equal('offsetX' in entry, false, 'a bar-index pan offset was persisted');
  assert.equal(entry.viewStartSec, 100);
  assert.equal(entry.viewEndSec, 200);
});

test('PANELSTATE: an inverted or half-present viewport is refused whole', () => {
  assert.equal(normalizePanelEntry({ viewStartSec: 500, viewEndSec: 100 }), null);
  assert.equal(normalizePanelEntry({ viewStartSec: 500 }), null);
  const kept = normalizePanelEntry({ symbol: 'EURUSD', viewStartSec: 500, viewEndSec: 100 });
  assert.deepEqual(kept, { symbol: 'EURUSD' }, 'a bad viewport cost the user their symbol');
});

test('PANELSTATE: auto-scaled price bounds are derived and are not persisted', () => {
  const auto = normalizePanelEntry({
    priceScaleAuto: true, priceScaleMin: 1.05, priceScaleMax: 1.09,
  });
  assert.deepEqual(auto, { priceScaleAuto: true }, 'a readout of the loaded bars was persisted as configuration');

  const manual = normalizePanelEntry({
    priceScaleAuto: false, priceScaleMin: 1.05, priceScaleMax: 1.09,
  });
  assert.equal(manual.priceScaleMin, 1.05, 'manual bounds are user configuration and must persist');
});

test('PANELSTATE: only real layout slots are accepted', () => {
  installStorage();
  assert.equal(savePanelState('panel-x9f2', { symbol: 'EURUSD' }, SESSION), false, 'a generated fallback id was stored');
  assert.equal(savePanelState('Z', { symbol: 'EURUSD' }, SESSION), false);
  assert.equal(savePanelState('', { symbol: 'EURUSD' }, SESSION), false);
  assert.equal(savePanelState('B', { symbol: 'EURUSD' }, SESSION), true);
});

test('PANELSTATE: unknown fields are not smuggled into storage', () => {
  const s = installStorage();
  savePanelState('B', { symbol: 'EURUSD', barCount: 200000, rawBars: [1, 2, 3] }, SESSION);
  const stored = s.blob().panelsById.B;
  assert.deepEqual(stored, { symbol: 'EURUSD' }, 'price data or an undeclared field reached storage');
});

test('PANELSTATE: corrupt storage degrades to no restore rather than throwing', () => {
  installStorage({ seed: '{not json' });
  assert.deepEqual(readPanelStateBlob(), {});
  assert.deepEqual(loadPanelStates(SESSION), { panelsById: {}, focusedPanelId: null });
  assert.equal(savePanelState('B', { symbol: 'EURUSD' }, SESSION), true, 'a corrupt blob blocked all future writes');
});

test('PANELSTATE: a panels map stored as an array does not crash the loader', () => {
  installStorage({ seed: JSON.stringify({ panelsById: ['nope'], sessionId: SESSION }) });
  assert.deepEqual(loadPanelStates(SESSION).panelsById, {});
});

test('PANELSTATE: a full disk reports failure instead of throwing', () => {
  installStorage({ throwOnWrite: true });
  assert.equal(savePanelState('B', FULL, SESSION), false, 'a quota failure must be reported, not thrown');
});

test('PANELSTATE: absent storage restores nothing and does not invent a panel', () => {
  installStorage();
  assert.deepEqual(loadPanelStates(SESSION), { panelsById: {}, focusedPanelId: null });
  assert.equal(loadPanelState('B', SESSION), null);
});

test('PANELSTATE: removing a tile drops its state and releases focus', () => {
  installStorage();
  savePanelState('B', FULL, SESSION);
  saveFocusedPanelId('B', SESSION);
  clearPanelState('B');
  const { panelsById, focusedPanelId } = loadPanelStates(SESSION);
  assert.equal('B' in panelsById, false);
  assert.equal(focusedPanelId, null, 'focus still points at a removed tile');
});

test('PANELSTATE: shrinking the layout prunes the tiles that went away', () => {
  installStorage();
  ['A', 'B', 'C', 'D'].forEach((id) => savePanelState(id, { symbol: `SYM${id}` }, SESSION));
  saveFocusedPanelId('D', SESSION);

  prunePanelStates(['A', 'B']);

  const { panelsById, focusedPanelId } = loadPanelStates(SESSION);
  assert.deepEqual(Object.keys(panelsById).sort(), ['A', 'B'], 'retired tiles kept their state');
  assert.equal(focusedPanelId, null, 'focus survived on a tile that no longer exists');
});

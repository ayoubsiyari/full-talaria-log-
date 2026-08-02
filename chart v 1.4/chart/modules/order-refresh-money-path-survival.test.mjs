/**
 * Money-path refresh oracle: runtime order sessionStorage is not derived state.
 *
 * A fresh OrderManager must restore open positions, pending orders, journal rows
 * and account runtime from the patch written to sessionStorage mid-session.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(String(k)); },
    clear: () => { m.clear(); },
    entries: () => [...m.entries()],
  };
}

global.window = {};
global.sessionStorage = makeStorage();
global.userStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

const OrderManager = require('./order-manager.js');

function makeOm(sessionId) {
  const om = Object.create(OrderManager.prototype);
  om.chart = { getActiveTradingSessionId: () => sessionId };
  om.pendingOrders = [];
  om.openPositions = [];
  om.closedPositions = [];
  om.orders = [];
  om.tradeJournal = [];
  om.balance = 10000;
  om.equity = 10000;
  om.initialBalance = 10000;
  om.orderIdCounter = 1;
  om.tradeGroupIdCounter = 1;
  om.orderLines = [];
  om.splitGroupAvgLines = [];
  om.multiTPAvgLines = [];
  om.slLines = [];
  om.tpLines = [];
  om.beLines = [];
  om.pendingTargetLines = [];
  om.orderService = {
    multiInstrumentSession: { current_time: 1710000000000 },
    balance: null,
    equity: null,
    recomputeSharedMarginState() {},
  };
  om._m19NoteJournalStructuralMutation = () => {};
  om._m20A1ScheduleRetainedSweep = () => {};
  om._invalidateM19MarkerDeltaCache = () => {};
  om._collectLayoutCharts = () => [];
  om._stripOrderDrawingLayersFromChart = () => {};
  om.drawOrderLine = () => {};
  om.drawSLTPLines = () => {};
  om.drawEntryMarker = () => {};
  om.drawPendingOrderLine = () => {};
  om.drawPendingOrderTargets = () => {};
  om._rebuildSplitGroupAvgLines = () => {};
  om._rebuildMultiTPAvgLines = () => {};
  om._redrawMfeMaeMarkersFromState = () => {};
  om.updateOrderLines = () => {};
  om.updatePositionsPanel = () => {};
  om._redrawClosedJournalTradeMarkers = () => {};
  return om;
}

test('sessionStorage runtime patch restores money path after refresh', () => {
  const sessionId = 'refresh-money-path';
  const writer = makeOm(sessionId);
  writer.pendingOrders = [{ id: 11, orderType: 'limit', ticker: 'EURUSD', entryPrice: 1.101, quantity: 0.2 }];
  writer.openPositions = [{ id: 12, ticker: 'EURUSD', entryPrice: 1.1, quantity: 0.1, unrealizedPnL: 7.5 }];
  writer.tradeJournal = [{ id: 31, tradeId: 31, ticker: 'EURUSD', netPnL: 125, entryPrice: 1.09, exitPrice: 1.102 }];
  writer.initialBalance = 10000;
  writer.balance = 10125;
  writer.equity = 10132.5;
  writer.orderIdCounter = 40;
  writer.tradeGroupIdCounter = 9;

  const patch = writer._buildRuntimeOrderPersistPatch();
  writer._writeRuntimeOrderStateToSessionStorage(patch);

  const stored = JSON.parse(global.sessionStorage.entries()[0][1]);
  assert.equal(stored.journal.length, 1, 'hot sessionStorage patch must carry journal rows');
  assert.equal(stored.journal_complete, true, 'journal restore must not be classed as derived/partial');

  const reader = makeOm(sessionId);
  reader._bootstrapRuntimeOrderPersistenceV1();

  assert.equal(reader.pendingOrders.length, 1);
  assert.equal(reader.openPositions.length, 1);
  assert.equal(reader.tradeJournal.length, 1);
  assert.equal(reader.tradeJournal[0].tradeId, 31);
  assert.equal(reader.balance, 10125);
  assert.equal(reader.equity, 10132.5);
  assert.equal(reader.initialBalance, 10000);
  assert.equal(reader.orderIdCounter, 32, 'M24 reconciles restored counter to max observed id + 1');
  assert.equal(reader.tradeGroupIdCounter, 9);
});

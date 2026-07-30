import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

function makeOm() {
  const om = Object.create(OrderManager.prototype);
  const orderService = { pendingOrders: [] };
  om.chart = {};
  om.orderService = orderService;
  Object.defineProperty(om, 'pendingOrders', {
    configurable: true,
    enumerable: true,
    get: () => orderService.pendingOrders,
    set: (value) => { orderService.pendingOrders = value; return value; },
  });
  om.removePendingSLTPLines = () => {};
  om.drawPendingOrderTargets = () => {};
  om._drawExecutedOrderConnectors = () => {};
  om.showNotification = () => {};
  om.removeMultiTPAvgLine = () => {};
  om._destroyMultiTPAvgEntry = () => {};
  om._schedulePendingOrdersPanelRefresh = () => {};
  om.emitted = [];
  om._emitPendingMirrorSync = (order) => {
    om.emitted.push(JSON.parse(JSON.stringify(order)));
  };
  om.multiTPAvgLines = [];
  return om;
}

{
  const om = makeOm();
  const local = { id: 7, stopLoss: 90, takeProfit: 110, tpTargets: [{ id: 'tp1', price: 110 }] };
  om.pendingOrders = [local];
  assert.equal(om.pendingOrders, om.orderService.pendingOrders, 'test uses the product alias shape, not a fabricated mirror array');

  om.removePendingStopLoss(7);
  assert.equal(local.stopLoss, null, 'local pending SL is cleared');
  assert.equal(om.emitted.at(-1).stopLoss, null, 'emitted peer snapshot clears SL so another panel cannot resurrect it');

  om.removePendingTakeProfit(7);
  assert.equal(local.takeProfit, null, 'local pending TP is cleared');
  assert.equal(local.tpTargets, null, 'local pending multi-TP targets are cleared');
  assert.equal(om.emitted.at(-1).takeProfit, null, 'emitted peer snapshot clears TP');
  assert.equal(om.emitted.at(-1).tpTargets, null, 'emitted peer snapshot clears tpTargets');
}

{
  const om = makeOm();
  const leg1 = { id: 1, isSplitEntry: true, splitGroupId: 'g1', stopLoss: 90, takeProfit: 110, tpTargets: [{ id: 'tp1' }] };
  const leg2 = { id: 2, isSplitEntry: true, splitGroupId: 'g1', stopLoss: 90, takeProfit: 110, tpTargets: [{ id: 'tp1' }] };
  om.pendingOrders = [leg1, leg2];

  om.removePendingStopLoss(1);
  assert.deepEqual([leg1.stopLoss, leg2.stopLoss], [null, null], 'split-group SL clears local legs');
  assert.deepEqual(om.emitted.slice(-2).map((row) => row.stopLoss), [null, null], 'split-group SL emits every cleared leg');

  om.removePendingTakeProfit(1);
  assert.deepEqual([leg1.takeProfit, leg2.takeProfit], [null, null], 'split-group TP clears local legs');
  assert.deepEqual([leg1.tpTargets, leg2.tpTargets], [null, null], 'split-group tpTargets clear local legs');
  assert.deepEqual(om.emitted.slice(-2).map((row) => row.takeProfit), [null, null], 'split-group TP emits every cleared leg');
  assert.deepEqual(om.emitted.slice(-2).map((row) => row.tpTargets), [null, null], 'split-group tpTargets emit every cleared leg');
}

{
  global.window = { __TALARIA_DISABLE_ORDER_PENDING_PROTECTION_CLEAR_V1: true };
  const om = makeOm();
  const local = { id: 9, stopLoss: 90, takeProfit: 110, tpTargets: [{ id: 'tp1' }] };
  om.pendingOrders = [local];

  om.removePendingStopLoss(9);
  om.removePendingTakeProfit(9);
  assert.deepEqual(om.emitted, [], 'kill-switch restores legacy no-peer-sync behavior for clear');
  delete global.window;
}

// CONF-01 / class-3 polish: peer OM on a different symbol must adopt cleared protection
// from the host emit (four-symbol identity — host EURUSD, peer GBPUSD).
{
  const host = makeOm();
  const peer = makeOm();
  host.chart = { currentSymbol: 'EURUSD', currentFileId: 'FILE_EUR' };
  peer.chart = { currentSymbol: 'GBPUSD', currentFileId: 'FILE_GBP' };
  const hostRow = {
    id: 21, ticker: 'EURUSD', stopLoss: 90, takeProfit: 110,
    tpTargets: [{ id: 'tp1', price: 110 }],
  };
  const peerMirror = {
    id: 21, ticker: 'EURUSD', stopLoss: 90, takeProfit: 110,
    tpTargets: [{ id: 'tp1', price: 110 }],
  };
  host.pendingOrders = [hostRow];
  peer.pendingOrders = [peerMirror];
  host._emitPendingMirrorSync = (order) => {
    host.emitted.push(JSON.parse(JSON.stringify(order)));
    const snap = host.emitted.at(-1);
    const target = peer.pendingOrders.find((r) => r.id === snap.id);
    if (target) {
      target.stopLoss = snap.stopLoss;
      target.takeProfit = snap.takeProfit;
      target.tpTargets = snap.tpTargets;
    }
  };

  host.removePendingStopLoss(21);
  host.removePendingTakeProfit(21);
  assert.equal(peerMirror.stopLoss, null, 'CONF-01: GBPUSD peer adopts cleared SL from EURUSD host emit');
  assert.equal(peerMirror.takeProfit, null, 'CONF-01: GBPUSD peer adopts cleared TP from EURUSD host emit');
  assert.equal(peerMirror.tpTargets, null, 'CONF-01: GBPUSD peer adopts cleared tpTargets');
}

console.log('GREEN - pending protection clear reaches service mirrors');

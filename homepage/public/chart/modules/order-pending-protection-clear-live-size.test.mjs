/**
 * PO Band 1 / pending protection clear rows.
 * GREEN: node order-pending-protection-clear-live-size.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_PENDING_PROTECTION_CLEAR=1 node order-pending-protection-clear-live-size.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const disableClear = process.env.TALARIA_TEST_DISABLE_ORDER_PENDING_PROTECTION_CLEAR === '1';

global.window = {
  __TALARIA_DISABLE_ORDER_PENDING_PROTECTION_CLEAR_V1: disableClear,
};
global.document = {
  getElementById() { return null; },
  querySelector() { return null; },
  addEventListener() {},
};
global.requestAnimationFrame = (fn) => {
  if (typeof fn === 'function') fn();
  return 1;
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

function makeManager() {
  const om = Object.create(OrderManager.prototype);
  om.pendingTargetLines = [];
  om.multiTPAvgLines = [];
  om.pendingOrders = [];
  om.orderService = { pendingOrders: [] };
  om.chart = null;
  om._collectLayoutCharts = () => [];
  om.removePendingSLTPLines = OrderManager.prototype.removePendingSLTPLines;
  om.removePendingStopLoss = OrderManager.prototype.removePendingStopLoss;
  om.removePendingTakeProfit = OrderManager.prototype.removePendingTakeProfit;
  om._findPendingOrderById = OrderManager.prototype._findPendingOrderById;
  om._allPendingOrderRecordsForId = OrderManager.prototype._allPendingOrderRecordsForId;
  om._clearPendingProtectionMirrors = OrderManager.prototype._clearPendingProtectionMirrors;
  om.drawPendingOrderTargets = () => {};
  om._drawExecutedOrderConnectors = () => {};
  om.showNotification = () => {};
  om._destroyMultiTPAvgEntry = () => {};
  om.mirrorSyncs = [];
  om.panelRefreshes = 0;
  om._emitPendingMirrorSync = (po) => { om.mirrorSyncs.push({ ...po }); };
  om._schedulePendingOrdersPanelRefresh = () => { om.panelRefreshes += 1; };
  return om;
}

{
  const om = makeManager();
  const local = { id: 7, status: 'PENDING', stopLoss: 95, takeProfit: 110, tpTargets: [{ id: 1, price: 110 }] };
  const mirror = local;
  om.pendingOrders = [local];
  om.orderService.pendingOrders = [mirror];

  om.removePendingStopLoss(7);
  om.removePendingTakeProfit(7);

  assert.equal(local.stopLoss, null, 'local pending SL clears');
  assert.equal(local.takeProfit, null, 'local pending TP clears');
  assert.equal(local.tpTargets, null, 'local pending TP ladder clears');
  assert.equal(mirror.stopLoss, null, 'orderService mirror pending SL clears');
  assert.equal(mirror.takeProfit, null, 'orderService mirror pending TP clears');
  assert.equal(mirror.tpTargets, null, 'orderService mirror pending TP ladder clears');
  assert.equal(om.mirrorSyncs.length, 2, 'pending protection clear emits peer mirror snapshots');
  assert.equal(om.mirrorSyncs[0].stopLoss, null, 'SL clear mirror snapshot carries null SL');
  assert.equal(om.mirrorSyncs[1].takeProfit, null, 'TP clear mirror snapshot carries null TP');
  assert.equal(om.panelRefreshes, 2, 'pending protection clear refreshes pending panel state');
}

{
  const om = makeManager();
  const primary = { id: 21, status: 'PENDING', isSplitEntry: true, splitGroupId: 900, stopLoss: 95, takeProfit: 110, tpTargets: [{ id: 1, price: 110 }] };
  const sibling = { id: 22, status: 'PENDING', isSplitEntry: true, splitGroupId: '900', stopLoss: 95, takeProfit: 110, tpTargets: [{ id: 1, price: 110 }] };
  om.pendingOrders = [primary, sibling];
  om.orderService.pendingOrders = om.pendingOrders;
  om._getSplitGroupPendingOrders = OrderManager.prototype._getSplitGroupPendingOrders;

  om.removePendingStopLoss(21);

  assert.equal(primary.stopLoss, null, 'split primary SL clears');
  assert.equal(sibling.stopLoss, null, 'split sibling SL clears');
  assert.deepEqual(
    om.mirrorSyncs.map((row) => row.id).sort((a, b) => a - b),
    [21, 22],
    'split pending protection clear emits each affected leg',
  );
}

{
  const om = Object.create(OrderManager.prototype);
  om._getPendingPlacedQuantity = OrderManager.prototype._getPendingPlacedQuantity;

  assert.equal(
    om._getPendingPlacedQuantity({ quantity: 4, placedQuantity: 7 }),
    7,
    'placed pending quantity is preferred when present',
  );
  assert.equal(
    om._getPendingPlacedQuantity({ quantity: 4, placedQuantity: null }),
    4,
    'quantity is fallback when placed quantity is absent',
  );
}

console.log(disableClear
  ? 'RED - switch OFF leaves stale pending SL/TP mirrors'
  : 'GREEN - pending protection clears mirrors');
process.exit(0);

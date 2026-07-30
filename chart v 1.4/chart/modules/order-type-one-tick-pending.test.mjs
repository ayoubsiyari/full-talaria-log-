/**
 * Cluster G / TAL-01904 order type classification via place path.
 * GREEN: node order-type-one-tick-pending.test.mjs
 * RED:   TALARIA_ORDER_TYPE_ONE_TICK_PENDING_V1=0 node order-type-one-tick-pending.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_ORDER_TYPE_ONE_TICK_PENDING_V1 === '0';

global.window = {
    __TALARIA_DISABLE_ORDER_TYPE_ONE_TICK_PENDING_V1: disabled,
};
global.alert = () => {};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

const tick = 0.0001;
const market = 1.1;
const entryOneTickAbove = market + tick;
const barT = 1_721_600_000_000;

const dom = {
    orderEntryPrice: { value: String(entryOneTickAbove) },
    orderQuantity: { value: '1' },
    enableTP: { checked: false },
    enableSL: { checked: false },
    orderValidation: null,
    trailingSLToggle: { checked: false },
    multipleTPToggle: { checked: false },
    autoBreakevenToggle: { checked: false },
};
global.document = {
    getElementById: (id) => dom[id] ?? null,
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {} }),
};

const replay = { isActive: true, replayTimestamp: barT };
const chart = {
    currentSymbol: 'EURUSD',
    currentFileId: 'FILE_EUR',
    getTickSize: () => tick,
    replaySystem: replay,
};
const candle = { t: barT, o: market, h: market + tick, l: market - tick, c: market };

const om = Object.create(OrderManager.prototype);
om.replaySystem = replay;
om.chart = chart;
om.pendingOrders = [];
om.openPositions = [];
om.orders = [];
om.orderSide = 'BUY';
om.orderType = 'market';
om.pipSize = tick;
om.pipValuePerLot = 10;
om.positionSizeMode = 'lot-size';
om.isMultiEntryMode = false;
om.multiEntryLevels = [];
om.splitEntriesEnabled = false;
om.splitEntries = [];
om.balance = 10_000;
om.initialBalance = 10_000;
om.equity = 10_000;
om._orderProvisionalEdit = { phase: 'idle' };
om._getActiveTicker = () => 'EURUSD';
om._getActiveInstrumentSettings = () => ({});
om._chartSourceFileId = () => 'FILE_EUR';
om._getOrderContextChart = () => chart;
om._getCurrentTickSnapshot = () => ({ tick: 0 });
om._allocateOrderId = () => 101;
om._isAdvancedOrderAllowed = () => false;
om._capQtyByAvailableMargin = (q) => q;
om._snapOrderPriceToTick = (p) => p;
om._marketFillOpenTimeMs = () => barT;
om.syncPipFromActiveSymbol = () => {};
om.validateOrder = () => [];
om._getTrailingStepRiskError = () => null;
om.removePreviewLines = () => {};
om.showNotification = () => {};
om.drawPendingOrderLine = () => {};
om.drawPendingOrderTargets = () => {};
om.positionPendingOrderTargets = () => {};
om.updatePositionsPanel = () => {};
om.showPositionsPanel = () => {};
om._renderAllLayoutCharts = () => {};
om._finalizeOrderPanelAfterPlace = () => {};
om.updatePlaceButtonText = () => {};
om.updatePreviewLines = () => {};
om._dispatchRrOrderPrefilledEvent = () => {};
om._schedulePersistAfterOrderMutation = () => {};
om._consumeV9RailDraftForOrder = () => {};
om._applyPreTradeVariablesFromOrderPanel = () => {};
om._freezePlannedRRAtEntry = () => {};
om._seedOrderLifecycleEvent = () => {};
om.showTradeJournalModal = () => {};
om.formatPrice = (p) => String(p);
om.getCurrentCandle = () => candle;

om._autoDetectOrderTypeFromEntry({ skipPreviewUpdate: true });
assert.equal(om.orderType, 'stop', 'entry one tick above market must reclassify before place');

const result = om.placeAdvancedOrder({ keepPanelOpen: true });
assert.equal(result.ok, true, 'place must succeed for pending path');
assert.equal(om.pendingOrders.length, 1, 'user place must enqueue stop pending, not market fill');
assert.equal(om.pendingOrders[0].orderType, 'stop');
assert.equal(om.openPositions.length, 0, 'must not market-fill one tick away');

console.log(disabled
    ? 'RED — switch OFF reproduces one-tick pending entries as market'
    : 'GREEN — one-tick-away entries classify as pending orders through place');

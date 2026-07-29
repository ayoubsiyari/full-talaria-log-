/**
 * Cluster G / drag family residual: risk quantity follows live preview SL.
 * GREEN: node order-risk-qty-live-preview-sl.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_RISK_QTY_LIVE_PREVIEW_SL=1 node order-risk-qty-live-preview-sl.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_ORDER_RISK_QTY_LIVE_PREVIEW_SL === '1';

function el(initial = {}) {
  return {
    value: initial.value ?? '',
    checked: initial.checked ?? false,
    style: {},
    textContent: '',
    classList: { toggle() {}, add() {}, remove() {} },
  };
}

const elements = {
  orderEntryPrice: el({ value: '100' }),
  slPrice: el({ value: '95' }), // stale committed input; drag is at 90
  enableSL: el({ checked: true }),
  riskAmountUSD: el({ value: '50' }),
  orderQuantity: el({ value: '10' }),
  placeOrderButton: el(),
  multipleTPToggle: el({ checked: false }),
  tpPrice: el({ value: '' }),
  rewardAmount: el(),
  riskAmount: el(),
  totalAmount: el(),
};

global.window = {
  __TALARIA_DISABLE_ORDER_RISK_QTY_LIVE_PREVIEW_SL_V1: disabled,
  marketCalcEngine: null,
};
global.document = {
  getElementById(id) {
    return elements[id] || null;
  },
  querySelector() {
    return null;
  },
};
global.requestAnimationFrame = (fn) => {
  if (typeof fn === 'function') fn();
  return 1;
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

const om = Object.create(OrderManager.prototype);
om._orderPlacedAwaitingReset = false;
om.positionSizeMode = 'risk-usd';
om.isMultiEntryMode = false;
om.multiEntryLevels = [];
om.orderSide = 'BUY';
om.pipSize = 1;
om.pipValuePerLot = 1;
om.marketType = 'forex';
om.balance = 100000;
om.initialBalance = 100000;
om.isDraggingPreviewLine = true;
om.previewLines = {
  entry: { price: 100 },
  sl: { price: 90 },
};
om._orderProvisionalEdit = {
  phase: 'preview',
  lineKind: 'sl',
  provisionalPrice: 90,
  committedPrice: 95,
};
om._oiResolveProvisionalPreviewPrice = OrderManager.prototype._oiResolveProvisionalPreviewPrice;
om._resolveLivePreviewPanelPrices = OrderManager.prototype._resolveLivePreviewPanelPrices;
om.calculatePositionFromRisk = OrderManager.prototype.calculatePositionFromRisk;
om.calculateAdvancedRiskReward = () => {};
om.updatePlaceButtonText = () => {};
om.updatePreviewLines = () => {};
om.syncPipFromActiveSymbol = () => {};
om._enginePositionSize = (riskAmount, entryPrice, slPrice) => riskAmount / Math.abs(entryPrice - slPrice);
om._roundQtyToStep = (qty) => qty;
om._capQtyByAvailableMargin = (qty) => qty;
om._formatQty = (qty) => Number(qty).toFixed(2);
om._applyCalculatedReadout = () => {};
om._getCalculatedReadoutParts = () => ({});

om.calculatePositionFromRisk();

assert.equal(elements.orderQuantity.value, '5.00', 'fixed-risk quantity uses live provisional SL distance');
assert.equal(elements.slPrice.value, '95', 'apply-on-release still withholds hidden SL input commit');

console.log(disabled
  ? 'RED — switch OFF sizes fixed risk from stale committed SL input'
  : 'GREEN — fixed-risk quantity follows live preview SL before commit');
process.exit(0);

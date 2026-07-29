/**
 * Cluster G / TAL-01697: provisional TP drag feeds panel PnL before input commit.
 * GREEN: node order-preview-live-recalc.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_PREVIEW_LIVE_RECALC=1 node order-preview-live-recalc.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_ORDER_PREVIEW_LIVE_RECALC === '1';
const require = createRequire(import.meta.url);

function el(initial = {}) {
  return {
    value: initial.value ?? '',
    checked: initial.checked ?? false,
    textContent: initial.textContent ?? '',
    style: {},
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute(name, value) { this[name] = String(value); },
    removeAttribute(name) { delete this[name]; },
  };
}

const els = {
  orderQuantity: el({ value: '1' }),
  orderEntryPrice: el({ value: '100' }),
  enableTP: el({ checked: true }),
  enableSL: el({ checked: true }),
  tpPrice: el({ value: '' }), // apply-on-release withholds commit
  slPrice: el({ value: '95' }),
  riskAmountUSD: el({ value: '50' }),
  rewardAmount: el({ textContent: '$0' }),
  riskAmount: el(),
  totalAmount: el(),
  tpDistanceDisplay: el(),
  tpProfitDisplay: el(),
  tpRRInput: el(),
  slPipsDisplay: el(),
  slQuantityDisplay: el(),
  slRiskUsdDisplay: el(),
  slRiskPctDisplay: el(),
  tpSummaryPctRisk: el(),
  tpSummaryPctReward: el(),
  tpSummaryRRDisplay: el(),
  tpRiskRewardBarRisk: el(),
  tpRiskRewardBarReward: el(),
  placeOrderButton: el(),
  multipleTPToggle: el({ checked: false }),
};

global.document = {
  getElementById(id) {
    return els[id] || null;
  },
  querySelector() {
    return null;
  },
};

global.window = {
  __TALARIA_DISABLE_ORDER_PREVIEW_LIVE_RECALC_V1: disabled,
  marketCalcEngine: null,
};

const OrderManager = require('./order-manager.js');
const om = Object.create(OrderManager.prototype);
om._orderPlacedAwaitingReset = false;
om.isMultiEntryMode = false;
om.multiEntryLevels = [];
om.tpTargets = [];
om.orderSide = 'BUY';
om.positionSizeMode = 'lot-size';
om.pipSize = 1;
om.pipValuePerLot = 1;
om.marketType = 'forex';
om.balance = 100000;
om.initialBalance = 100000;
om.isDraggingPreviewLine = true;
om.previewLines = {
  entry: { price: 100 },
  sl: { price: 95 },
  tp: { price: 110 },
};
om._orderProvisionalEdit = {
  phase: 'preview',
  lineKind: 'tp',
  provisionalPrice: 110,
  committedPrice: 0,
};
om._syncPipFromActiveSymbolIfNeeded = () => {};
om._parseSltpInputPrice = OrderManager.prototype._parseSltpInputPrice;
om._oiResolveProvisionalPreviewPrice = OrderManager.prototype._oiResolveProvisionalPreviewPrice;
om._oiIsProvisionalEditActive = () => true;
om._getOrderPanelSlRiskContext = OrderManager.prototype._getOrderPanelSlRiskContext;
om._resolveLivePreviewPanelPrices = OrderManager.prototype._resolveLivePreviewPanelPrices;
om._estimateNetPnLPreview = (side, entry, exit, qty) => {
  // BUY: profit = (exit - entry) * qty with pipSize=1 pipValue=1
  return (exit - entry) * qty;
};
om.updateMarginLevelBadge = () => {};
om._applyCalculatedReadout = () => {};
om._getCalculatedReadoutParts = () => ({});
om._formatQty = (q) => String(q);
om._getSymbol = () => 'TEST';
om.getMarketConfig = () => ({ positionLabel: 'Lots', minSize: 0.01 });
om._multiEntryAnyLevelBelowMinLot = () => false;
om._futuresMultiTpAllocationErrors = () => [];
om._computeEffectiveTPPercentages = () => [];

assert.equal(typeof om._resolveLivePreviewPanelPrices, 'function');
const live = om._resolveLivePreviewPanelPrices();
assert.equal(live.tpPrice, 110, 'provisional TP is visible to panel price resolve');
assert.equal(live.slPrice, 95, 'SL remains available during TP drag');

om.isDraggingPreviewLine = false;
om._orderProvisionalEdit = { phase: 'idle' };
els.tpPrice.value = '120';
om.previewLines.tp.price = 110;
assert.equal(om._resolveLivePreviewPanelPrices().tpPrice, 120, 'typed panel TP wins at rest');

om._orderProvisionalEdit = { phase: 'open', lineKind: 'tp', provisionalPrice: 111 };
assert.equal(om._resolveLivePreviewPanelPrices().tpPrice, 120, 'open-position drag does not override draft TP panel math');

els.tpPrice.value = '';
om.isDraggingPreviewLine = true;
om._orderProvisionalEdit = { phase: 'preview', lineKind: 'tp', tpTargetIndex: 1, provisionalPrice: 115 };
assert.equal(om._resolveLivePreviewPanelPrices().tpPrice, 0, 'multi-TP rung provisional does not masquerade as single TP');

om._orderProvisionalEdit = {
  phase: 'preview',
  lineKind: 'tp',
  provisionalPrice: 110,
  committedPrice: 0,
};
om.previewLines.tp.price = 110;

om.calculateAdvancedRiskReward = OrderManager.prototype.calculateAdvancedRiskReward;
om.calculateAdvancedRiskReward();

const rewardText = String(els.rewardAmount.textContent || '');
const rewardNum = parseFloat(rewardText.replace(/[^0-9.+-]/g, ''));
assert.ok(Number.isFinite(rewardNum) && rewardNum > 0,
  `panel reward must be live during TP drag, got ${rewardText}`);
assert.notEqual(rewardText.trim(), '$0');
assert.notEqual(rewardText.trim(), '∞');

console.log(disabled
  ? 'RED — switch OFF leaves panel PnL blind to provisional TP drag'
  : 'GREEN — provisional TP drag feeds panel PnL before input commit');
process.exit(0);

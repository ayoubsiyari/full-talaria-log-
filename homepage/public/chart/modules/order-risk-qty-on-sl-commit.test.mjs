/**
 * Cluster G / TAL-01683: fixed-risk quantity recalculates after SL drag commit.
 * GREEN: node order-risk-qty-on-sl-commit.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_RISK_QTY_ON_SL_COMMIT=1 node order-risk-qty-on-sl-commit.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_ORDER_RISK_QTY_ON_SL_COMMIT === '1';

const elements = {
    slPrice: { value: '1.09500' },
    orderQuantity: { value: '2.00' },
};

global.window = {
    __TALARIA_DISABLE_ORDER_RISK_QTY_ON_SL_COMMIT_V1: disabled,
};
global.document = {
    getElementById(id) {
        return elements[id] || null;
    },
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

const om = Object.create(OrderManager.prototype);
om.positionSizeMode = 'risk-usd';
om._orderProvisionalEdit = { phase: 'preview' };
om._oiCommitProvisionalEdit = () => 1.09;
om.formatPrice = (v) => Number(v).toFixed(5);
om.recalcCalls = 0;
om.calculatePositionFromRisk = () => {
    om.recalcCalls += 1;
    elements.orderQuantity.value = '1.00';
};

const lineData = { label: 'SL', price: 1.095 };
om._oiCommitPreviewSltpFromDragEnd(lineData);

assert.equal(elements.slPrice.value, '1.09000', 'SL commit writes the released SL to the hidden input');
assert.equal(lineData.price, 1.09, 'SL preview line stores the committed release price');
assert.equal(om.recalcCalls, 1, 'risk-based sizing recalculates after SL commit');
assert.equal(elements.orderQuantity.value, '1.00', 'fixed-risk quantity reflects the new SL distance');

console.log(disabled
    ? 'RED — switch OFF commits SL but leaves fixed-risk quantity stale'
    : 'GREEN — SL commit recalculates fixed-risk quantity');

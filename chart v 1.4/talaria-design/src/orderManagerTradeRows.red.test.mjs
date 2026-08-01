/**
 * TAL-01896 GATE-01 reverse — duration norm kill must restore wall-clock closed-row bleed.
 * GREEN product proof lives in orderManagerTradeRows.test.mjs.
 * This file must exit ≠ 0 (RED) while the kill-switch is forced ON.
 *
 * Run: node orderManagerTradeRows.red.test.mjs
 */
import assert from 'node:assert/strict';
import { buildLiveTradeRowsFromOrderManager } from './orderManagerTradeRows.js';

const realNow = Date.now;
const openTime = Date.UTC(2017, 7, 29, 7, 33);
global.window = { __TALARIA_DISABLE_TRADE_DURATION_NORM_V1: true };
Date.now = () => openTime + 139_271 * 60 * 60_000;
try {
  const om = {
    replaySystem: { replayTimestamp: openTime + 2 * 60 * 60_000 },
    openPositions: [],
    pendingOrders: [],
    closedPositions: [{
      id: 4,
      ticker: 'GBPUSD',
      type: 'BUY',
      status: 'CLOSED',
      openTime,
      closePrice: 1.296,
      openPrice: 1.295,
      quantity: 1,
      pnl: 10,
    }],
    tradeJournal: [],
    formatPrice: (value) => Number(value).toFixed(5),
    formatQuantity: (value) => Number(value).toFixed(2),
  };
  const [row] = buildLiveTradeRowsFromOrderManager(
    om,
    { gn: '#0f0', rd: '#f00', tm: '#888' },
  );
  assert.equal(
    row.dur,
    '—',
    'TAL-01896 reverse: closed row without closeTime must not show wall-clock mega-duration',
  );
} finally {
  Date.now = realNow;
  global.window = {};
}

console.log('UNEXPECTED GREEN — kill did not restore Date.now bleed');

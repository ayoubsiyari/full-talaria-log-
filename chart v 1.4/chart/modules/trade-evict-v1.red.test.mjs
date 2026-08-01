/**
 * TRADE-EVICT-V1 RED — kill-switch restores pre-eviction retain-forever hot bytes.
 * GATE-01: this file must exit ≠ 0 when __TALARIA_DISABLE_TRADE_EVICT_V1 = true.
 *
 * RED: node trade-evict-v1.red.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);

global.window = { __TALARIA_DISABLE_TRADE_EVICT_V1: true };
const OrderManager = require('./order-manager.js');

const om = Object.create(OrderManager.prototype);
om.tradeJournal = [];
om.closedPositions = [];
om.mfeMaeTrackingPositions = [];
om.postExitTrackingMode = 'candles';
om.postExitTrackingCandles = 50;

const shot = `data:image/png;base64,${'B'.repeat(4000)}`;
const closed = {
  id: 77,
  tradeId: 77,
  status: 'CLOSED',
  closeTime: 1_100_000,
  entryScreenshot: shot,
  exitScreenshot: shot,
  bar_close_r: [0, 0.1, 0.2],
  post_exit_bar_close_r: [0.2, 0.21],
};
om.closedPositions = [closed];
om.tradeJournal = [{ ...closed, bar_close_r: closed.bar_close_r.slice() }];

const result = om._tradeEvictV1OnBoundComplete(closed, 1_200_000);

// Product claim under kill: eviction must still run (GREEN behaviour).
// With kill ON it does not — this assertion fails ⇒ RED exit ≠ 0.
assert.equal(
  result.released,
  true,
  'GATE-01 RED: kill-switch ON must fail the eviction-released product claim',
);

console.log('unexpected GREEN under kill');

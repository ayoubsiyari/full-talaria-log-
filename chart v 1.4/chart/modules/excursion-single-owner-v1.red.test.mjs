/**
 * GATE-01 reverse: kill-switch OFF (disabled) must restore sliced dual copies
 * and must NOT hard-cap oversized live tails.
 *
 * RED expected: TALARIA_TEST_DISABLE_EXCURSION_SINGLE_OWNER=1 node ...red.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

if (process.env.TALARIA_TEST_DISABLE_EXCURSION_SINGLE_OWNER !== '1') {
  console.error('Set TALARIA_TEST_DISABLE_EXCURSION_SINGLE_OWNER=1 to run RED cell');
  process.exit(2);
}

global.window = { __TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1: true };
const om = Object.create(OrderManager.prototype);

const hot = {
  id: 1,
  bar_close_r: [1, 2, 3],
  bar_high_r: [1, 2, 3],
  bar_low_r: [1, 2, 3],
  post_exit_bar_close_r: [],
  post_exit_bar_high_r: [],
  post_exit_bar_low_r: [],
};
const journal = {};
assert.equal(om._excursionSingleOwnerV1ShareFromHot(journal, hot), false);
om._m19AssignCanonicalExcursionStorage(journal, hot);
assert.notEqual(journal.bar_close_r, hot.bar_close_r);

const oversize = { bar_close_r: Array.from({ length: 319 }, (_, i) => i) };
assert.equal(om._excursionSingleOwnerV1HardCapLiveTails(oversize), 0);
assert.equal(oversize.bar_close_r.length, 319, 'disabled flag must leave oversize intact');

// Force GREEN path assertion to fail under kill — proves reverse lever.
assert.equal(journal.bar_close_r, hot.bar_close_r, 'RED: dual-copy path must not share identity');

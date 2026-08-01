/**
 * M24 #5→#942 — b103 escape class / CONF-01 display id stability on hydrate.
 * GREEN: node m24-order-id-restore-stability.test.mjs
 * RED (legacy renumber path): node m24-order-id-restore-stability.red.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

const om = Object.create(OrderManager.prototype);
om.tradeJournal = [{ id: 5, tradeId: 5, client_trade_id: '5', ticker: 'EURUSD', pnl: 1 }];
om._m19NoteJournalStructuralMutation = () => {};
om._m20A1ScheduleRetainedSweep = () => {};
om._invalidateM19MarkerDeltaCache = () => {};

const displayedId = (trade, fallbackId = null) => {
  if (typeof om._resolveJournalDisplayTradeId === 'function') {
    return om._resolveJournalDisplayTradeId(trade, fallbackId);
  }
  return trade.tradeId || trade.id;
};

const before = String(displayedId(om.tradeJournal[0]));

om._m19CommitJournalArray([
  {
    id: 5,
    tradeId: 5,
    client_trade_id: '5',
    user_trade_id: 942,
    display_trade_id: 942,
    journal_trade_id: 120001,
    ticker: 'EURUSD',
    pnl: 1,
  },
], 'session-state-hydrate');

const after = String(displayedId(om.tradeJournal[0]));

assert.equal(before, '5', 'pre-refresh row displayed as #5');
assert.equal(after, before, 'refresh hydrate must not change the displayed trade id');

assert.equal(
  String(displayedId({ id: 1, tradeId: 1, client_trade_id: '1', user_trade_id: 1, journal_trade_id: 1 })),
  '1',
  'first-session equal client/user/journal values must not render null'
);
assert.equal(
  displayedId({ id: 5, user_trade_id: 0, display_trade_id: 0, journal_trade_id: 99 }),
  5,
  'zero display/user ids are ignored in favor of a valid legacy id'
);
assert.equal(
  String(displayedId({ id: 5, tradeId: 942, client_trade_id: '5', user_trade_id: 942, journal_trade_id: 942 })),
  '5',
  'client/session id wins over backend user/global ids on hydrate'
);
assert.equal(
  String(om._resolveJournalExportTradeId({ id: 5, tradeId: 5, client_trade_id: '5', user_trade_id: 942, journal_trade_id: 120001 })),
  '5',
  'CSV/export keeps client trade id and does not switch to display/user id'
);

// CONF-01: mixed-symbol journal hydrate — each row keeps client display id.
const mixedSeed = [
  { id: 5, tradeId: 5, client_trade_id: '5', ticker: 'EURUSD', pnl: 1 },
  { id: 6, tradeId: 6, client_trade_id: '6', ticker: 'GBPUSD', pnl: 2 },
  { id: 7, tradeId: 7, client_trade_id: '7', ticker: 'USDJPY', pnl: 3 },
];
const beforeMixed = mixedSeed.map((row) => String(displayedId(row)));
om.tradeJournal = mixedSeed.map((row) => ({ ...row }));
om._m19CommitJournalArray([
  {
    id: 5, tradeId: 5, client_trade_id: '5', user_trade_id: 942, display_trade_id: 942,
    journal_trade_id: 120001, ticker: 'EURUSD', pnl: 1,
  },
  {
    id: 6, tradeId: 6, client_trade_id: '6', user_trade_id: 601, display_trade_id: 601,
    journal_trade_id: 120002, ticker: 'GBPUSD', pnl: 2,
  },
  {
    id: 7, tradeId: 7, client_trade_id: '7', user_trade_id: 701, display_trade_id: 701,
    journal_trade_id: 120003, ticker: 'USDJPY', pnl: 3,
  },
], 'session-state-hydrate');
const afterMixed = om.tradeJournal.map((row) => String(displayedId(row)));
assert.deepEqual(afterMixed, beforeMixed, 'CONF-01 mixed-symbol hydrate keeps each display id stable');

global.window = { __TALARIA_DISABLE_M24_DISPLAY_ID_STABILITY_V1: true };
assert.equal(
  displayedId({ id: 5, tradeId: 942, client_trade_id: '5', user_trade_id: 942, journal_trade_id: 942 }),
  942,
  'kill-switch restores legacy tradeId display'
);
delete global.window;

console.log('GREEN - session hydrate preserves displayed trade id');

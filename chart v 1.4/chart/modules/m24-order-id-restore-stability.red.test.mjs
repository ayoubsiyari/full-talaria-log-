/**
 * M24 / b103 escape: refresh hydrate must not renumber a closed trade row.
 * RED: node m24-order-id-restore-stability.red.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

const om = Object.create(OrderManager.prototype);
om.tradeJournal = [{ id: 5, ticker: 'EURUSD', pnl: 1 }];
om._m19NoteJournalStructuralMutation = () => {};
om.recomputeAccountFromJournal = () => {};
om.chart = { getActiveTradingSessionId: () => 'session-1' };

const displayedId = (trade) => trade.tradeId || trade.id;
const before = displayedId(om.tradeJournal[0]);

om._m19CommitJournalArray([
  { id: 5, tradeId: 942, ticker: 'EURUSD', pnl: 1 },
], 'session-state-hydrate');

const after = displayedId(om.tradeJournal[0]);

assert.equal(before, 5, 'pre-refresh row displayed as #5');
assert.equal(after, before, 'refresh hydrate must not change the displayed trade id');

console.log('RED - session hydrate can renumber a closed trade row');

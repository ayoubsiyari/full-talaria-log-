/**
 * M24 #5→#942 — b103 escape class / CONF-01 display id stability on hydrate.
 * GREEN: node m24-order-id-restore-stability.test.mjs
 * RED (legacy renumber path): node m24-order-id-restore-stability.red.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(MODULE_DIR, '..', '..', '..');
const CHART_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const CHART_SOURCE = fs.readFileSync(CHART_JS, 'utf8');

function chartMethodSource(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = CHART_SOURCE.match(new RegExp(
    `^    ${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  if (!match) throw new Error(`method ${name} missing from chart.js`);
  return match[0].replace(/\n+$/, '\n');
}

function makeQuotaBackupHarness() {
  const writes = [];
  const quota = new Error('quota full');
  quota.name = 'QuotaExceededError';
  global.userStorage = {
    setItem(key, value) {
      if (writes.length === 0) {
        writes.push({ key, quota: true });
        throw quota;
      }
      writes.push({ key, value: JSON.parse(value) });
    },
    removeItem() {},
  };
  const source = `
class ChartHarness {
  getActiveTradingSessionId() { return 'session-m24'; }
  _getOrderManagerForSessionPersistence() { return this.orderManager; }
  _normalizeBacktestTimeframe(tf) { return tf || null; }
  _tradingSessionLocalBackupKey(sessionId) { return 'legacy:' + sessionId; }
  _tradingSessionLocalBackupHotKey(sessionId) { return 'hot:' + sessionId; }
  _tradingSessionLocalBackupDurableKey(sessionId) { return 'durable:' + sessionId; }
  _snapshotIndicatorsForSessionBackup() { return []; }
${chartMethodSource('_writeTradingSessionLocalBackup')}
}
globalThis.__M24ChartHarness = ChartHarness;
`;
  // eslint-disable-next-line no-new-func
  Function(source)();
  const chart = new globalThis.__M24ChartHarness();
  chart.orderManager = {
    balance: 10025,
    equity: 10030,
    initialBalance: 10000,
    orderIdCounter: 188,
    tradeGroupIdCounter: 9,
    _m19PersistTrimV1Enabled: () => true,
  };
  chart.currentTimeframe = '1m';
  chart.currentFileId = 'EURUSD';
  chart.replaySystem = null;
  return { chart, writes };
}

{
  const { chart, writes } = makeQuotaBackupHarness();
  chart._writeTradingSessionLocalBackup({ slim: true });
  assert.equal(writes.length, 2, 'QuotaExceededError must retry once with minimal backup');
  assert.deepEqual(
    writes[1].value.order_counters,
    { orderIdCounter: 188, tradeGroupIdCounter: 9 },
    'quota retry minimal backup must preserve counters so restore cannot re-mint an existing order id',
  );
  assert.deepEqual(
    writes[1].value.account_runtime,
    { balance: 10025, equity: 10030, initialBalance: 10000 },
    'quota retry still preserves account snapshot',
  );
  assert.equal(writes[1].value.journal, undefined, 'quota retry remains minimal');
  assert.equal(writes[1].value.pending_orders, undefined, 'quota retry remains minimal');
  assert.equal(writes[1].value.open_positions, undefined, 'quota retry remains minimal');
  assert.equal(writes[1].value.closed_positions, undefined, 'quota retry remains minimal');
  delete global.userStorage;
  delete globalThis.__M24ChartHarness;
}

console.log('GREEN - session hydrate preserves displayed trade id');

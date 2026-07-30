/**
 * TRADE-EVICT-V1 — cold-read proof (before any eviction deletes hot copies).
 *
 * Doctrine: history + analytics must render a complete trade (MAE, MFE, path,
 * screenshots) sourced from the journal when the hot closedPositions / tracking
 * copy is already absent.
 *
 * GREEN: node chart\ v\ 1.4/talaria-design/src/trade-evict-v1-cold-read.test.mjs
 * RED:   TALARIA_TEST_DISABLE_TRADE_EVICT_COLD_READ=1 (forces hot-only path → fail)
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLiveTradeRowsFromOrderManager } from './orderManagerTradeRows.js';
import {
  extractPathFieldsFromJournal,
  tradeHasPathData,
  buildTradeCloudPath,
} from './tradePathCloudUtils.js';

const kill = process.env.TALARIA_TEST_DISABLE_TRADE_EVICT_COLD_READ === '1';

const THEME = { gn: '#0f0', rd: '#f00', tm: '#888' };

function makeJournalOnlyTrade() {
  const openTime = Date.UTC(2017, 7, 29, 7, 33);
  const closeTime = openTime + 45 * 60_000;
  return {
    id: 942,
    tradeId: 942,
    ticker: 'EURUSD',
    type: 'BUY',
    status: 'CLOSED',
    openTime,
    closeTime,
    openPrice: 1.1,
    closePrice: 1.105,
    quantity: 0.25,
    pnl: 125.5,
    mae: 1.098,
    mfe: 1.107,
    mae_r: -0.4,
    mfe_r: 1.2,
    rMultiple: 0.85,
    entryScreenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    exitScreenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    bar_close_r: [0, 0.2, 0.5, 0.8, 1.0],
    bar_high_r: [0.1, 0.3, 0.6, 0.9, 1.1],
    post_exit_bar_close_r: [1.0, 0.9, 0.85],
    trail_sl_path: [0, -0.1, 0.2],
  };
}

function collectScreenshots(journal, order) {
  const shots = [];
  const push = (v) => {
    if (typeof v === 'string' && v.startsWith('data:image')) shots.push(v);
  };
  if (journal?.entryScreenshot) push(journal.entryScreenshot);
  if (journal?.exitScreenshot) push(journal.exitScreenshot);
  if (order?.entryScreenshot) push(order.entryScreenshot);
  if (order?.exitScreenshot) push(order.exitScreenshot);
  for (const ent of Array.isArray(journal?.entryScreenshots) ? journal.entryScreenshots : []) {
    push(ent?.screenshot);
  }
  return shots;
}

/** Mirror TalariaV8bLive analytics local list construction for one journal-only trade. */
function analyticsListFromOm(om) {
  const closedRows = buildLiveTradeRowsFromOrderManager(om, THEME).filter((r) => r.status === 'closed');
  const journalById = new Map();
  for (const j of om.tradeJournal || []) {
    const tid = Number(j.tradeId ?? j.id);
    if (Number.isFinite(tid)) journalById.set(tid, j);
  }
  const out = [];
  for (const row of closedRows) {
    const j = journalById.get(Number(row.omId));
    if (!j) continue;
    out.push({
      trade_id: Number(row.omId),
      mae: row.mae,
      mfe: row.mfe,
      ...extractPathFieldsFromJournal(j),
      screenshots: collectScreenshots(j, null),
    });
  }
  return out;
}

test('TRADE-EVICT-V1 cold-read: history+analytics complete from journal with hot copy absent', () => {
  globalThis.window = {};
  const journalTrade = makeJournalOnlyTrade();

  const om = {
    openPositions: [],
    pendingOrders: [],
    // Hot copy intentionally absent — eviction destination state.
    closedPositions: [],
    // RED kill clears journal so cold-read has no source → must fail.
    tradeJournal: kill ? [] : [journalTrade],
    mfeMaeTrackingPositions: [],
    formatPrice: (v) => Number(v).toFixed(5),
    formatQuantity: (v) => Number(v).toFixed(2),
  };

  const rows = buildLiveTradeRowsFromOrderManager(om, THEME).filter((r) => r.status === 'closed');
  assert.equal(rows.length, 1, 'history must surface the journal-only closed trade');
  const row = rows[0];
  assert.equal(Number(row.omId), 942);
  assert.ok(row.mae, 'MAE must come from journal when hot closedPositions is empty');
  assert.ok(row.mfe, 'MFE must come from journal when hot closedPositions is empty');

  const path = extractPathFieldsFromJournal(journalTrade);
  assert.ok(tradeHasPathData(journalTrade), 'full path series must live on the journal row');
  assert.ok(buildTradeCloudPath(journalTrade), 'analytics cloud path builds from journal alone');
  assert.ok((path.bar_close_r || []).length >= 3, 'in-trade path retained on journal');

  const shots = collectScreenshots(journalTrade, null);
  assert.equal(shots.length, 2, 'entry+exit screenshots readable from journal without hot order');

  const analytics = analyticsListFromOm(om);
  assert.equal(analytics.length, 1, 'analytics list includes journal-only trade');
  assert.ok(analytics[0].mae, 'analytics sees MAE');
  assert.ok(analytics[0].mfe, 'analytics sees MFE');
  assert.equal(analytics[0].screenshots.length, 2, 'analytics can collect screenshots from journal');

  console.log('GREEN — TRADE-EVICT-V1 cold-read: journal alone serves history MAE/MFE + path + screenshots');
});

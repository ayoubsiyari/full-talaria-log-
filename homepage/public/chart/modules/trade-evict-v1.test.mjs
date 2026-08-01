/**
 * TRADE-EVICT-V1 — playhead-bound eviction + EVICT-01/02 + FLAG-01/02/03.
 *
 * GREEN: node chart\ v\ 1.4/chart/modules/trade-evict-v1.test.mjs
 * RED:   node chart\ v\ 1.4/chart/modules/trade-evict-v1.red.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

function makeOm() {
  const om = Object.create(OrderManager.prototype);
  om.tradeJournal = [];
  om.closedPositions = [];
  om.mfeMaeTrackingPositions = [];
  om.mfeMaeTrackingEnabled = true;
  om.postExitTrackingMode = 'candles';
  om.postExitTrackingCandles = 50;
  om.persistJournal = () => {};
  om.updateJournalTab = () => {};
  om.drawMfeMaeMarkers = () => {};
  om.showNotification = () => {};
  om._finalizeExcursionScalars = () => {};
  om._m19MaxExcursionR = () => 0;
  return om;
}

function fatClosed(id = 942) {
  const shot = `data:image/png;base64,${'A'.repeat(8000)}`;
  return {
    id,
    tradeId: id,
    ticker: 'EURUSD',
    type: 'BUY',
    status: 'CLOSED',
    openTime: 1_000_000,
    closeTime: 1_100_000,
    openPrice: 1.1,
    closePrice: 1.105,
    quantity: 0.25,
    pnl: 12,
    mfe: 1.107,
    mae: 1.098,
    entryScreenshot: shot,
    exitScreenshot: shot,
    screenshotBase64: shot,
    chartImage: shot,
    thumbnail: shot,
    railScreenshots: [shot],
    bar_close_r: Array.from({ length: 40 }, (_, i) => i * 0.01),
    bar_high_r: Array.from({ length: 40 }, (_, i) => i * 0.012),
    bar_low_r: Array.from({ length: 40 }, (_, i) => -i * 0.005),
    post_exit_bar_close_r: Array.from({ length: 50 }, (_, i) => 0.4 + i * 0.001),
    post_exit_bar_high_r: Array.from({ length: 50 }, (_, i) => 0.5 + i * 0.001),
    post_exit_bar_low_r: Array.from({ length: 50 }, (_, i) => 0.3 - i * 0.001),
    post_checkpoints: [{ bar: 50, t: 1_200_000 }],
    trail_sl_path: [1.1, 1.101, 1.102],
    postExitTrackingMode: 'candles',
    postExitTrackingCandles: 50,
    post_exit_anchor_time: 1_100_000,
    mfeMaeTrackingEndTime: 1_200_000,
  };
}

function seedJournalFromClosed(closed) {
  const j = { ...closed, tradeId: closed.id };
  for (const k of Object.keys(j)) {
    if (Array.isArray(j[k])) j[k] = j[k].slice();
  }
  return j;
}

// --- FLAG-01: ABSENT ⇒ enabled ---
{
  delete global.window;
  global.window = {};
  const om = makeOm();
  const closed = fatClosed(1);
  om.closedPositions = [closed];
  om.tradeJournal = [seedJournalFromClosed(closed)];
  const before = om._tradeEvictV1ApproxHotBytes(closed);
  assert.ok(before > 10_000, 'fixture carries measurable hot bytes');
  const result = om._tradeEvictV1OnBoundComplete(closed, 1_200_000);
  assert.equal(result.released, true, 'FLAG-01 ABSENT: eviction runs');
  assert.ok(result.bytesAfter < result.bytesBefore, 'EVICT-01 memory: bytes fall');
  assert.equal(closed.entryScreenshot, null, 'entryScreenshot released from hot closedPositions');
  assert.equal(closed.bar_close_r, null, 'excursion array released from hot closedPositions');
  assert.ok(om.tradeJournal[0].entryScreenshot, 'journal cold copy keeps screenshot');
  assert.ok(om.tradeJournal[0].bar_close_r?.length > 0, 'journal cold copy keeps path');
}

// --- FLAG-02: runtime kill, no reload ---
{
  global.window = { __TALARIA_DISABLE_TRADE_EVICT_V1: true };
  const om = makeOm();
  const closed = fatClosed(2);
  om.closedPositions = [closed];
  om.tradeJournal = [seedJournalFromClosed(closed)];
  const result = om._tradeEvictV1OnBoundComplete(closed, 1_200_000);
  assert.equal(result.released, false, 'FLAG-02: kill-switch true disables without reload');
  assert.ok(closed.entryScreenshot, 'FLAG-02: hot screenshot retained when kill ON');
  delete global.window.__TALARIA_DISABLE_TRADE_EVICT_V1;
}

// --- FLAG-03: OFF vs working product ---
{
  global.window = {};
  const om = makeOm();
  const closed = fatClosed(3);
  om.closedPositions = [closed];
  om.tradeJournal = [seedJournalFromClosed(closed)];
  global.window.__TALARIA_DISABLE_TRADE_EVICT_V1 = true;
  assert.equal(om._tradeEvictV1OnBoundComplete(closed, 1_200_000).released, false);
  delete global.window.__TALARIA_DISABLE_TRADE_EVICT_V1;
  assert.equal(
    om._tradeEvictV1OnBoundComplete(closed, 1_200_000).released,
    true,
    'FLAG-03: working product asserts eviction when kill absent',
  );
}

// --- EVICT-02: rewind behind T restores + may re-queue sampling ---
{
  global.window = {};
  const om = makeOm();
  const closed = fatClosed(4);
  om.closedPositions = [closed];
  om.tradeJournal = [seedJournalFromClosed(closed)];
  const boundT = 1_200_000;
  assert.equal(om._tradeEvictV1OnBoundComplete(closed, boundT).released, true);
  assert.equal(closed.entryScreenshot, null);

  const stay = om._tradeEvictV1SyncPlayhead(boundT);
  assert.equal(stay.restored, 0, 'at T remains evicted');
  assert.equal(closed.entryScreenshot, null);

  const mid = om._tradeEvictV1SyncPlayhead(1_150_000);
  assert.equal(mid.restored, 1, 'EVICT-02: rewind behind T restores hot fields');
  assert.ok(closed.entryScreenshot, 'screenshot rehydrated from journal');
  assert.ok(closed.bar_close_r?.length > 0, 'path rehydrated from journal');
  assert.equal(mid.requeued, 1, 'EVICT-02: re-queued for post-exit sampling');
  assert.equal(om.mfeMaeTrackingPositions.length, 1, 'sampling collection has the trade again');
  assert.equal(closed._tradeEvictV1.released, false);

  om.mfeMaeTrackingPositions = [];
  om._tradeEvictV1OnBoundComplete(closed, boundT);
  assert.equal(closed._tradeEvictV1.released, true);
}

// --- CPU term: after eviction, trade is not in sampling collection ---
{
  global.window = {};
  const om = makeOm();
  const closed = fatClosed(5);
  om.closedPositions = [closed];
  om.tradeJournal = [seedJournalFromClosed(closed)];
  om.mfeMaeTrackingPositions = [{ ...closed, postExitProcessedCandles: 50 }];
  om._tradeEvictV1OnBoundComplete(closed, 1_200_000);
  om.mfeMaeTrackingPositions = om.mfeMaeTrackingPositions.filter((p) => p.id !== closed.id);
  assert.equal(om.mfeMaeTrackingPositions.length, 0, 'CPU: evicted trade cannot be sampled');
  assert.equal(closed.entryScreenshot, null, 'memory: screenshots released');
}

// --- updateMfeMaeTracking integration: bound complete releases ---
{
  global.window = {};
  const om = makeOm();
  const closed = fatClosed(6);
  om.closedPositions = [closed];
  om.tradeJournal = [seedJournalFromClosed(closed)];
  om.mfeMaeTrackingPositions = [{
    ...closed,
    postExitTrackingMode: 'candles',
    postExitTrackingCandles: 50,
    postExitProcessedCandles: 50,
    post_exit_anchor_time: closed.closeTime,
  }];
  const before = om._tradeEvictV1ApproxHotBytes(closed);
  om.updateMfeMaeTracking({ t: 1_200_000, h: 1.11, l: 1.09, c: 1.1 }, 1.11, 1.09);
  assert.equal(om.mfeMaeTrackingPositions.length, 0, 'tracking removed on bound complete');
  const after = om._tradeEvictV1ApproxHotBytes(om.closedPositions[0]);
  assert.ok(after < before, `EVICT-01 bytes-down: before=${before} after=${after}`);
  assert.ok(om.tradeJournal[0].entryScreenshot, 'analytics cold path: journal still has screenshot');
}

console.log('GREEN — TRADE-EVICT-V1 playhead eviction, EVICT-01 bytes-down, EVICT-02 rewind restore, FLAG-01/02/03');

/**
 * EXCURSION-SINGLE-OWNER-V1 — journal authoritative; closed/service released;
 * live-tail hard-cap ≤256; FLAG-01/02/03.
 *
 * GREEN: node "chart v 1.4/chart/modules/excursion-single-owner-v1.test.mjs"
 * RED:   TALARIA_TEST_DISABLE_EXCURSION_SINGLE_OWNER=1 node .../.red.test.mjs
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
  om.persistJournal = () => {};
  om.updateJournalTab = () => {};
  om.drawMfeMaeMarkers = () => {};
  om.showNotification = () => {};
  om._finalizeExcursionScalars = () => {};
  om._m19MaxExcursionR = () => 0;
  return om;
}

function mkSeries(n) {
  return Array.from({ length: n }, (_, i) => i * 0.01);
}

function fatHot(id = 1, n = 80) {
  return {
    id,
    tradeId: id,
    status: 'CLOSED',
    closeTime: 1_100_000,
    bar_close_r: mkSeries(n),
    bar_high_r: mkSeries(n),
    bar_low_r: mkSeries(n),
    post_exit_bar_close_r: mkSeries(n),
    post_exit_bar_high_r: mkSeries(n),
    post_exit_bar_low_r: mkSeries(n),
  };
}

// FLAG-01: ABSENT ⇒ enabled
{
  delete global.window;
  global.window = {};
  const om = makeOm();
  const hot = fatHot(1);
  const journal = { id: 1, tradeId: 1 };
  assert.equal(om._excursionSingleOwnerV1ShareFromHot(journal, hot), true);
  assert.equal(journal.bar_close_r, hot.bar_close_r, 'must share array identity');
}

// FLAG-02: runtime flip disables without reload
{
  global.window = { __TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1: true };
  const om = makeOm();
  const hot = fatHot(2);
  const journal = { id: 2, tradeId: 2 };
  assert.equal(om._excursionSingleOwnerV1ShareFromHot(journal, hot), false);
  om._m19AssignCanonicalExcursionStorage(journal, hot);
  assert.notEqual(journal.bar_close_r, hot.bar_close_r, 'kill-switch restores slice copies');
  assert.deepEqual(journal.bar_close_r, hot.bar_close_r);
}

// FLAG-03 / product: share then TRADE-EVICT leaves journal as sole owner
{
  global.window = {};
  const om = makeOm();
  const closed = fatHot(3);
  const journal = { id: 3, tradeId: 3 };
  om._excursionSingleOwnerV1ShareFromHot(journal, closed);
  om.closedPositions = [closed];
  om.tradeJournal = [journal];
  // serviceClosed is the same array as managerClosed under bindServiceProp —
  // simulate the alias explicitly for the harness.
  const serviceClosed = om.closedPositions;
  const bytesDualNaive = om._excursionSingleOwnerV1ApproxBytes(closed)
    + om._excursionSingleOwnerV1ApproxBytes(journal)
    + om._excursionSingleOwnerV1ApproxBytes(serviceClosed[0]);
  const r = om._tradeEvictV1OnBoundComplete(closed, 2_000_000);
  assert.equal(r.released, true);
  assert.equal(closed.bar_close_r, null, 'managerClosed released');
  assert.equal(serviceClosed[0].bar_close_r, null, 'serviceClosed alias released with it');
  assert.ok(Array.isArray(journal.bar_close_r) && journal.bar_close_r.length === 80,
    'tradeJournal remains authoritative');
  const bytesAfter = om._excursionSingleOwnerV1ApproxBytes(closed)
    + om._excursionSingleOwnerV1ApproxBytes(journal)
    + om._excursionSingleOwnerV1ApproxBytes(serviceClosed[0]);
  assert.ok(bytesAfter > 0 && bytesAfter < bytesDualNaive,
    'sole owner retains bytes; released lists add zero');
  assert.equal(journal._excursionSingleOwnerV1?.authoritative, 'tradeJournal');
}

// Hard-cap: live series planted above 256 are forced back to max
{
  global.window = {};
  const om = makeOm();
  const pos = {
    bar_close_r: mkSeries(319),
    bar_high_r: mkSeries(319),
    bar_low_r: mkSeries(319),
    post_exit_bar_close_r: mkSeries(319),
    post_exit_bar_high_r: mkSeries(10),
    post_exit_bar_low_r: mkSeries(10),
  };
  const trimmed = om._excursionSingleOwnerV1HardCapLiveTails(pos);
  assert.ok(trimmed >= 3, 'oversize live series must trim');
  assert.equal(pos.bar_close_r.length, om._m19ExcursionTailMaxV1());
  assert.equal(pos.bar_high_r.length, 256);
  assert.equal(pos.bar_low_r.length, 256);
  assert.equal(pos.post_exit_bar_close_r.length, 256);
  assert.equal(pos.post_exit_bar_high_r.length, 10);
}

// AssignCanonical shares under flag ON
{
  global.window = {};
  const om = makeOm();
  const src = fatHot(9, 12);
  const dst = {};
  om._m19AssignCanonicalExcursionStorage(dst, src);
  assert.equal(dst.bar_close_r, src.bar_close_r);
}

console.log('excursion-single-owner-v1.test.mjs: PASS');

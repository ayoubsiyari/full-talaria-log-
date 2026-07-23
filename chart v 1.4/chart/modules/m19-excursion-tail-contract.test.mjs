/**
 * M19-B — excursion-array tail bound contract (D-030 / I16) — revision.
 *
 * GREEN:
 *   node --test --test-concurrency=1 "chart v 1.4/chart/modules/m19-excursion-tail-contract.test.mjs"
 *
 * Kill (OFF — today's unbounded append / persist bytes @ 250086d7c):
 *   TALARIA_DISABLE_M19_EXCURSION_TAIL_V1=1 node --test --test-concurrency=1 ...
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

function installDom() {
  global.window = {
    __TALARIA_DISABLE_M19_EXCURSION_TAIL_V1: false,
    __TALARIA_CHART_BUILD_ID: 'm19-fix-b-contract',
    addEventListener() {},
    removeEventListener() {},
    location: { href: 'http://local.test/chart?sessionId=m19-b' },
  };
  global.document = {
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
    addEventListener() {},
  };
}

function makeCandle(i, { mfeBar = -1, maeBar = -1 } = {}) {
  let h = 1.10010;
  let l = 1.09990;
  let c = 1.10000;
  if (i === mfeBar) {
    h = 1.10500;
    c = 1.10400;
  }
  if (i === maeBar) {
    l = 1.09500;
    c = 1.09600;
  }
  return {
    t: 1_720_000_000_000 + i * 60_000,
    o: 1.10000, h, l, c,
    open: 1.10000, high: h, low: l, close: c,
  };
}

function makePos() {
  return {
    id: 42,
    type: 'BUY',
    openPrice: 1.10000,
    array_base_price: 1.10000,
    stopLoss: 1.09000,
    initialStopLoss: 1.09000,
    initial_sl: 1.09000,
    quantity: 1,
    riskAmount: 100,
    bar_close_r: [],
    bar_high_r: [],
    bar_low_r: [],
    post_exit_bar_close_r: [],
    post_exit_bar_high_r: [],
    post_exit_bar_low_r: [],
  };
}

/** Pure pre-Fix-B / 250086d7c append (today's bytes). */
function appendUnbounded(om, position, candle, isPostExit = false) {
  const rValues = om._calculateExcursionRValues(position, candle);
  if (!rValues) return;
  if (!Array.isArray(position.bar_close_r)) position.bar_close_r = [];
  if (!Array.isArray(position.bar_high_r)) position.bar_high_r = [];
  if (!Array.isArray(position.bar_low_r)) position.bar_low_r = [];
  position.bar_close_r.push(rValues.bar_close_r);
  position.bar_high_r.push(rValues.bar_high_r);
  position.bar_low_r.push(rValues.bar_low_r);
  if (isPostExit) {
    if (!Array.isArray(position.post_exit_bar_close_r)) position.post_exit_bar_close_r = [];
    if (!Array.isArray(position.post_exit_bar_high_r)) position.post_exit_bar_high_r = [];
    if (!Array.isArray(position.post_exit_bar_low_r)) position.post_exit_bar_low_r = [];
    position.post_exit_bar_close_r.push(rValues.bar_close_r);
    position.post_exit_bar_high_r.push(rValues.bar_high_r);
    position.post_exit_bar_low_r.push(rValues.bar_low_r);
  }
}

/** Persist-shaped close→post-exit record (fields a journal row carries). */
function persistExcursionRecord(pos) {
  return JSON.parse(JSON.stringify({
    id: pos.id,
    type: pos.type,
    bar_close_r: pos.bar_close_r,
    bar_high_r: pos.bar_high_r,
    bar_low_r: pos.bar_low_r,
    post_exit_bar_close_r: pos.post_exit_bar_close_r,
    post_exit_bar_high_r: pos.post_exit_bar_high_r,
    post_exit_bar_low_r: pos.post_exit_bar_low_r,
    bar_r_count: pos.bar_r_count,
    bar_high_r_peak: pos.bar_high_r_peak,
    bar_low_r_peak: pos.bar_low_r_peak,
    bar_close_r_archive: pos.bar_close_r_archive,
    bar_high_r_archive: pos.bar_high_r_archive,
    bar_low_r_archive: pos.bar_low_r_archive,
    post_exit_bar_r_count: pos.post_exit_bar_r_count,
    post_exit_bar_high_r_peak: pos.post_exit_bar_high_r_peak,
    post_exit_bar_low_r_peak: pos.post_exit_bar_low_r_peak,
    post_exit_bar_close_r_archive: pos.post_exit_bar_close_r_archive,
    post_exit_bar_high_r_archive: pos.post_exit_bar_high_r_archive,
    post_exit_bar_low_r_archive: pos.post_exit_bar_low_r_archive,
    mfe_r: pos.mfe_r,
    mae_r: pos.mae_r,
    total_mfe_r: pos.total_mfe_r,
    exit_timing_gap: pos.exit_timing_gap,
    post_checkpoints: pos.post_checkpoints,
  }));
}

installDom();
const OrderManager = require('./order-manager.js');
const ENV_KILL = String(process.env.TALARIA_DISABLE_M19_EXCURSION_TAIL_V1 || '').trim() === '1';

function seedOm(kill) {
  window.__TALARIA_DISABLE_M19_EXCURSION_TAIL_V1 = !!kill;
  return Object.create(OrderManager.prototype);
}

test('kill-switch / enabled polarity', () => {
  const omOn = seedOm(false);
  assert.equal(omOn._m19ExcursionTailV1Enabled(), true);
  assert.equal(omOn._m19ExcursionTailMaxV1(), 256);
  const omOff = seedOm(true);
  assert.equal(omOff._m19ExcursionTailV1Enabled(), false);
});

test('ON: arrays bound; MFE/MAE scalars match full-history max', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  const pos = makePos();
  const mfeBar = 10;
  const maeBar = 20;
  const n = 600;
  for (let i = 0; i < n; i++) {
    om._appendExcursionSnapshot(pos, makeCandle(i, { mfeBar, maeBar }), false);
  }
  const cap = om._m19ExcursionTailMaxV1();
  assert.equal(pos.bar_close_r.length, cap);
  assert.equal(pos.bar_high_r.length, cap);
  assert.equal(pos.bar_low_r.length, cap);
  assert.equal(pos.bar_r_count, n);
  assert.ok(Array.isArray(pos.bar_close_r_archive));
  // Fresh growth: archive all pre-activation samples (256), then freeze; live rolls at 256.
  assert.equal(pos.bar_close_r_archive.length, cap);
  assert.equal(pos.bar_close_r.length, cap);
  assert.equal(pos.bar_r_legacy_pending, 0);
  // Memory bounded: archive + live == 2×cap after boundary exhausted.
  assert.equal(pos.bar_close_r_archive.length + pos.bar_close_r.length, cap * 2);

  const finalized = om._finalizeExcursionScalars({}, pos);
  const ref = makePos();
  for (let i = 0; i < n; i++) {
    appendUnbounded(om, ref, makeCandle(i, { mfeBar, maeBar }), false);
  }
  const expectedMfe = Math.max(...ref.bar_high_r);
  const expectedMaeMag = Math.max(...ref.bar_low_r);
  assert.equal(finalized.mfe_r, parseFloat(expectedMfe.toFixed(4)));
  assert.equal(finalized.mae_r, parseFloat((-expectedMaeMag).toFixed(4)));
  assert.equal(om._m19MaxExcursionR(pos, 'bar_high_r', 'bar_high_r_peak'), expectedMfe);
});

test('OFF/kill: production append byte-matches pure unbounded today path', () => {
  const om = seedOm(true);
  assert.equal(om._m19ExcursionTailV1Enabled(), false);

  const viaProd = makePos();
  const viaLegacy = makePos();
  const n = 400;
  const post = 12;
  for (let i = 0; i < n; i++) {
    const c = makeCandle(i, { mfeBar: 5, maeBar: 15 });
    om._appendExcursionSnapshot(viaProd, c, false);
    appendUnbounded(om, viaLegacy, c, false);
  }
  for (let i = 0; i < post; i++) {
    const c = makeCandle(n + i);
    om._appendExcursionSnapshot(viaProd, c, true);
    appendUnbounded(om, viaLegacy, c, true);
  }

  assert.equal(viaProd.bar_close_r.length, n + post);
  assert.equal(
    JSON.stringify(viaProd),
    JSON.stringify(viaLegacy),
    'D-030: kill-switch OFF path must keep today\'s persisted excursion bytes',
  );
  assert.equal(viaProd.bar_r_count, undefined);
  assert.equal(viaProd.bar_high_r_peak, undefined);
  assert.equal(viaProd.bar_close_r_archive, undefined);
});

test('kill: complete close→post-exit→persist record byte-identical to 250086d7c', () => {
  const om = seedOm(true);
  const viaProd = makePos();
  const viaBase = makePos();
  const inTrade = 120;
  const postExit = 80;
  const mfeBar = 8;
  const maeBar = 40;
  const postMfeBar = 10; // early in post-exit window
  const postMaeBar = 15;

  for (let i = 0; i < inTrade; i++) {
    const c = makeCandle(i, { mfeBar, maeBar });
    om._appendExcursionSnapshot(viaProd, c, false);
    appendUnbounded(om, viaBase, c, false);
  }
  for (let i = 0; i < postExit; i++) {
    const c = makeCandle(inTrade + i, { mfeBar: postMfeBar, maeBar: postMaeBar });
    om._appendExcursionSnapshot(viaProd, c, true);
    appendUnbounded(om, viaBase, c, true);
  }

  // Mimic completion metrics written at end of post-exit tracking (kill = bare max).
  viaProd.mfe_r = Math.max(...viaProd.bar_high_r);
  viaProd.mae_r = Math.max(...viaProd.bar_low_r);
  viaBase.mfe_r = Math.max(...viaBase.bar_high_r);
  viaBase.mae_r = Math.max(...viaBase.bar_low_r);
  viaProd.total_mfe_r = Math.max(
    Math.max(...viaProd.bar_high_r),
    Math.max(...viaProd.post_exit_bar_high_r),
  );
  viaBase.total_mfe_r = Math.max(
    Math.max(...viaBase.bar_high_r),
    Math.max(...viaBase.post_exit_bar_high_r),
  );
  viaProd.exit_timing_gap = Math.max(...viaProd.post_exit_bar_high_r);
  viaBase.exit_timing_gap = Math.max(...viaBase.post_exit_bar_high_r);

  assert.equal(
    JSON.stringify(persistExcursionRecord(viaProd)),
    JSON.stringify(persistExcursionRecord(viaBase)),
    'kill close→post-exit→persist must match 250086d7c unbounded record bytes',
  );
});

test('I16 restore: legacy uncapped arrays are not destructively trimmed on load', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  const legacy = makePos();
  for (let i = 0; i < 500; i++) {
    appendUnbounded(om, legacy, makeCandle(i, { mfeBar: 3, maeBar: 9 }), false);
  }
  const bookendFirst = legacy.bar_close_r[0];
  const bookendLast = legacy.bar_close_r[legacy.bar_close_r.length - 1];
  const lenBefore = legacy.bar_close_r.length;

  const restored = JSON.parse(JSON.stringify(legacy));
  assert.equal(restored.bar_close_r.length, lenBefore);
  assert.equal(restored.bar_close_r[0], bookendFirst);
  assert.equal(restored.bar_close_r[lenBefore - 1], bookendLast);

  const fin = om._finalizeExcursionScalars({}, restored);
  assert.equal(fin.mfe_r, parseFloat(Math.max(...restored.bar_high_r).toFixed(4)));
  assert.equal(fin.mae_r, parseFloat((-Math.max(...restored.bar_low_r)).toFixed(4)));

  const live = JSON.parse(JSON.stringify(restored));
  om._appendExcursionSnapshot(live, makeCandle(500), false);
  assert.ok(live.bar_close_r.length <= om._m19ExcursionTailMaxV1());
  assert.equal(live.bar_r_count, lenBefore + 1);
  // First activation archives the entire legacy overflow losslessly.
  assert.equal(
    live.bar_close_r_archive.length + live.bar_close_r.length,
    live.bar_r_count,
  );
  const finLive = om._finalizeExcursionScalars({}, live);
  assert.equal(finLive.mfe_r, fin.mfe_r);
});

test('restore → resume → persist → reload preserves archive history without duplication', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  const legacy = makePos();
  const legacyN = 500;
  const mfeBar = 4;
  const maeBar = 12;
  for (let i = 0; i < legacyN; i++) {
    appendUnbounded(om, legacy, makeCandle(i, { mfeBar, maeBar }), false);
  }
  const fullCloseRef = legacy.bar_close_r.slice();

  let live = JSON.parse(JSON.stringify(legacy));
  assert.equal(live.bar_close_r_archive, undefined);

  // First resume: archive dropped prefix; legacy still in live tail is pending.
  om._appendExcursionSnapshot(live, makeCandle(legacyN), false);
  assert.equal(live.bar_close_r.length, 256);
  assert.equal(live.bar_close_r_archive.length, legacyN + 1 - 256);
  assert.equal(live.bar_r_legacy_pending, legacyN - live.bar_close_r_archive.length);
  assert.deepEqual(
    om._m19ReconstructExcursionSeries(live, 'bar_close_r').slice(0, legacyN),
    fullCloseRef,
  );

  // Persist → reload → second resume continues archiving legacy-tail (not peaks-only yet).
  live = JSON.parse(JSON.stringify(live));
  const archBefore = live.bar_close_r_archive.length;
  const pendingBefore = live.bar_r_legacy_pending;
  om._appendExcursionSnapshot(live, makeCandle(legacyN + 1), false);
  assert.equal(live.bar_close_r_archive.length, archBefore + 1);
  assert.equal(live.bar_r_legacy_pending, pendingBefore - 1);
  assert.deepEqual(live.bar_close_r_archive.slice(0, archBefore), fullCloseRef.slice(0, archBefore));
});

test('legacy-500 + 300 resumed appends: every original once, no dups, persist/reload, bounded memory', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  const legacyN = 500;
  const resumeN = 300;
  const mfeBar = 4;
  const maeBar = 12;
  const legacy = makePos();
  for (let i = 0; i < legacyN; i++) {
    appendUnbounded(om, legacy, makeCandle(i, { mfeBar, maeBar }), false);
  }
  const originalsClose = legacy.bar_close_r.slice();
  const originalsHigh = legacy.bar_high_r.slice();
  const originalsLow = legacy.bar_low_r.slice();

  let live = JSON.parse(JSON.stringify(legacy));
  for (let i = 0; i < resumeN; i++) {
    om._appendExcursionSnapshot(live, makeCandle(legacyN + i, { mfeBar, maeBar }), false);
    // Mid-flight persist/reload must not duplicate or drop legacy.
    if (i === 100 || i === 200) {
      live = JSON.parse(JSON.stringify(live));
    }
  }

  assert.equal(live.bar_close_r.length, 256);
  assert.equal(live.bar_r_legacy_pending, 0);
  // Complete pre-activation legacy history archived exactly once.
  assert.equal(live.bar_close_r_archive.length, legacyN);
  assert.deepEqual(live.bar_close_r_archive, originalsClose);
  assert.deepEqual(live.bar_high_r_archive, originalsHigh);
  assert.deepEqual(live.bar_low_r_archive, originalsLow);

  // No duplicates: archive and live are disjoint; originals only in archive.
  const liveSet = new Set(live.bar_close_r.map((v, idx) => `${idx}:${v}`));
  for (let i = 0; i < originalsClose.length; i++) {
    // Value equality for originals in archive (exact sequence).
    assert.equal(live.bar_close_r_archive[i], originalsClose[i]);
  }
  // Archive growth frozen — memory = legacyN + 256.
  assert.equal(live.bar_close_r_archive.length + live.bar_close_r.length, legacyN + 256);
  assert.ok(live.bar_close_r_archive.length + live.bar_close_r.length < legacyN + resumeN);

  // Persist → reload preserves exact archive.
  const reloaded = JSON.parse(JSON.stringify(live));
  assert.deepEqual(reloaded.bar_close_r_archive, originalsClose);
  assert.equal(reloaded.bar_r_legacy_pending, 0);

  // Trade-path extraction exposes full reconstructed series for charts.
  const extracted = om._m19ExtractExcursionSeries(reloaded, 'bar_high_r');
  assert.deepEqual(extracted.slice(0, legacyN), originalsHigh);
  const projected = om._m19ProjectTradeExcursionFields(reloaded);
  assert.deepEqual(projected.bar_close_r.slice(0, legacyN), originalsClose);
  assert.equal(projected.bar_close_r.length, legacyN + 256);
  // Projected consumer view must not keep archive alongside reconstructed bar_*.
  assert.equal(projected.bar_close_r_archive, undefined);
  assert.equal(projected.bar_high_r_archive, undefined);

  // MFE/MAE still match unbounded baseline over legacy + resumes.
  const ref = makePos();
  for (let i = 0; i < legacyN + resumeN; i++) {
    appendUnbounded(om, ref, makeCandle(i, { mfeBar, maeBar }), false);
  }
  assert.equal(
    om._m19MaxExcursionR(reloaded, 'bar_high_r', 'bar_high_r_peak'),
    Math.max(...ref.bar_high_r),
  );
  void liveSet;
});

test('>256 post-exit: early MFE/MAE peaks match unbounded baseline for all metrics', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  const pos = makePos();
  const ref = makePos();
  const inTrade = 40;
  const postExit = 320; // >256 so early post-exit peaks leave the live tail
  const postMfeBar = 5;
  const postMaeBar = 12;

  for (let i = 0; i < inTrade; i++) {
    const c = makeCandle(i);
    om._appendExcursionSnapshot(pos, c, false);
    appendUnbounded(om, ref, c, false);
  }
  for (let i = 0; i < postExit; i++) {
    const c = makeCandle(inTrade + i, { mfeBar: postMfeBar, maeBar: postMaeBar });
    om._appendExcursionSnapshot(pos, c, true);
    appendUnbounded(om, ref, c, true);
  }

  assert.equal(pos.post_exit_bar_high_r.length, 256);
  // Early post-exit peak has left the live tail.
  const expectedPostMfe = Math.max(...ref.post_exit_bar_high_r);
  const expectedPostMae = Math.max(...ref.post_exit_bar_low_r);
  const expectedInMfe = Math.max(...ref.bar_high_r);
  assert.ok(pos.post_exit_bar_high_r_peak >= expectedPostMfe - 1e-12);
  assert.ok(!pos.post_exit_bar_high_r.some((v) => Math.abs(v - expectedPostMfe) < 1e-12)
    || om._m19MaxExcursionR(pos, 'post_exit_bar_high_r', 'post_exit_bar_high_r_peak') === expectedPostMfe);

  assert.equal(
    om._m19MaxExcursionR(pos, 'post_exit_bar_high_r', 'post_exit_bar_high_r_peak'),
    expectedPostMfe,
  );
  assert.equal(
    om._m19MaxExcursionR(pos, 'post_exit_bar_low_r', 'post_exit_bar_low_r_peak'),
    expectedPostMae,
  );
  assert.equal(
    om._m19MaxExcursionR(pos, 'bar_high_r', 'bar_high_r_peak'),
    expectedInMfe,
  );

  // Checkpoint-style + completion-style consumers (max tail/peak[/archive]).
  const cpMfe = om._m19MaxExcursionR(pos, 'post_exit_bar_high_r', 'post_exit_bar_high_r_peak');
  const cpMae = om._m19MaxExcursionR(pos, 'post_exit_bar_low_r', 'post_exit_bar_low_r_peak');
  assert.equal(cpMfe, expectedPostMfe);
  assert.equal(cpMae, expectedPostMae);

  const inTradeMfeR = om._m19MaxExcursionR(pos, 'bar_high_r', 'bar_high_r_peak');
  const postMfeR = om._m19MaxExcursionR(pos, 'post_exit_bar_high_r', 'post_exit_bar_high_r_peak');
  const postMaeR = om._m19MaxExcursionR(pos, 'post_exit_bar_low_r', 'post_exit_bar_low_r_peak');
  const totalMfeR = Math.max(inTradeMfeR, postMfeR);
  assert.equal(totalMfeR, Math.max(expectedInMfe, expectedPostMfe));
  assert.equal(postMfeR, expectedPostMfe);
  assert.equal(postMaeR, expectedPostMae);

  const fin = om._finalizeExcursionScalars({}, pos, { inTradeOnly: true });
  assert.equal(fin.mfe_r, parseFloat(expectedInMfe.toFixed(4)));
});

test('sample count survives trim for total_bars_held semantics', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  const pos = makePos();
  for (let i = 0; i < 300; i++) {
    om._appendExcursionSnapshot(pos, makeCandle(i), false);
  }
  assert.equal(om._m19ExcursionSampleCount(pos), 300);
  assert.equal(pos.bar_close_r.length, 256);
  // After 300: first activation at 257 archived 1 + 43 legacy-tail drains → archive 44; pending still > 0.
  assert.equal(pos.bar_close_r_archive.length, 44);
  assert.equal(pos.bar_r_legacy_pending, 256 - 44);
  assert.equal(pos.bar_close_r_archive.length + pos.bar_close_r.length, 300);

  // Drain remaining legacy pending; archive freezes at 256.
  for (let i = 300; i < 600; i++) {
    om._appendExcursionSnapshot(pos, makeCandle(i), false);
  }
  assert.equal(pos.bar_r_legacy_pending, 0);
  assert.equal(pos.bar_close_r_archive.length, 256);
  assert.equal(pos.bar_close_r.length, 256);
  assert.equal(om._m19ExcursionSampleCount(pos), 600);
});

test('projection is idempotent: P(P(row)) === P(row); no missing/dup samples', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  const legacyN = 500;
  const resumeN = 300;
  const pos = makePos();
  for (let i = 0; i < legacyN; i++) {
    appendUnbounded(om, pos, makeCandle(i), false);
  }
  const originalsClose = pos.bar_close_r.slice();
  const originalsHigh = pos.bar_high_r.slice();
  for (let i = 0; i < resumeN; i++) {
    om._appendExcursionSnapshot(pos, makeCandle(legacyN + i), false);
  }
  const stored = persistExcursionRecord(pos);
  const expected = stored.bar_close_r_archive.concat(stored.bar_close_r);
  const expectedHigh = stored.bar_high_r_archive.concat(stored.bar_high_r);

  const p1 = om._m19ProjectTradeExcursionFields(stored);
  const p2 = om._m19ProjectTradeExcursionFields(p1);
  assert.deepEqual(p1.bar_close_r, expected);
  assert.deepEqual(p1.bar_high_r, expectedHigh);
  assert.deepEqual(p2.bar_close_r, p1.bar_close_r);
  assert.deepEqual(p2.bar_high_r, p1.bar_high_r);
  assert.deepEqual(p2.bar_low_r, p1.bar_low_r);
  assert.equal(p1.bar_close_r_archive, undefined);
  assert.equal(p2.bar_close_r_archive, undefined);
  // Originals appear once at the front; length = archive + tail (no dups).
  assert.deepEqual(p1.bar_close_r.slice(0, legacyN), originalsClose);
  assert.deepEqual(p1.bar_high_r.slice(0, legacyN), originalsHigh);
  assert.equal(p1.bar_close_r.length, stored.bar_close_r_archive.length + stored.bar_close_r.length);
  // Storage row unchanged (project is a view).
  assert.equal(stored.bar_close_r.length, 256);
  assert.equal(stored.bar_close_r_archive.length, legacyN);
});

test('journal-close → enrich → persist → reload → export: canonical storage + single reconstruct', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  const legacyN = 500;
  const resumeN = 300;
  const order = makePos();
  for (let i = 0; i < legacyN; i++) {
    appendUnbounded(om, order, makeCandle(i), false);
  }
  const originalsClose = order.bar_close_r.slice();
  for (let i = 0; i < resumeN; i++) {
    om._appendExcursionSnapshot(order, makeCandle(legacyN + i), false);
  }

  // Simulate journal-close write (live tails only — never extract/reconstruct).
  const journalEntry = {
    tradeId: order.id,
    bar_close_r: om._m19LiveExcursionTail(order, 'bar_close_r'),
    bar_high_r: om._m19LiveExcursionTail(order, 'bar_high_r'),
    bar_low_r: om._m19LiveExcursionTail(order, 'bar_low_r'),
    post_exit_bar_close_r: om._m19LiveExcursionTail(order, 'post_exit_bar_close_r'),
    post_exit_bar_high_r: om._m19LiveExcursionTail(order, 'post_exit_bar_high_r'),
    post_exit_bar_low_r: om._m19LiveExcursionTail(order, 'post_exit_bar_low_r'),
  };
  om._m19AssignCanonicalExcursionStorage(journalEntry, order);

  // Canonical disjoint shape on the persisted row.
  assert.equal(journalEntry.bar_close_r.length, 256);
  assert.equal(journalEntry.bar_close_r_archive.length, legacyN);
  assert.deepEqual(journalEntry.bar_close_r_archive, originalsClose);
  assert.deepEqual(
    journalEntry.bar_close_r,
    order.bar_close_r,
  );
  // Never store reconstructed (archive‖tail) in bar_* alongside archive.
  assert.equal(
    journalEntry.bar_close_r_archive.length + journalEntry.bar_close_r.length,
    legacyN + 256,
  );
  assert.ok(journalEntry.bar_close_r.length <= 256);
  assert.notDeepEqual(
    journalEntry.bar_close_r,
    journalEntry.bar_close_r_archive.concat(journalEntry.bar_close_r),
  );

  // Persist → reload.
  const reloaded = JSON.parse(JSON.stringify(journalEntry));
  assert.equal(reloaded.bar_close_r.length, 256);
  assert.deepEqual(reloaded.bar_close_r_archive, originalsClose);

  // Export projects once; repeat projection stays identical (no missing/dups).
  const exported = om._m19ProjectTradeExcursionFields(reloaded);
  const exportedAgain = om._m19ProjectTradeExcursionFields(exported);
  const once = reloaded.bar_close_r_archive.concat(reloaded.bar_close_r);
  assert.deepEqual(exported.bar_close_r, once);
  assert.deepEqual(exportedAgain.bar_close_r, exported.bar_close_r);
  assert.equal(exported.bar_close_r_archive, undefined);
  assert.equal(exported.bar_close_r.length, legacyN + 256);
  assert.deepEqual(exported.bar_close_r.slice(0, legacyN), originalsClose);

  // Reloaded storage still canonical after export projection (view only).
  assert.equal(reloaded.bar_close_r.length, 256);
  assert.equal(reloaded.bar_close_r_archive.length, legacyN);
});

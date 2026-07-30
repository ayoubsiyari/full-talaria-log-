import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTrends, assessConf02 } from '../conf01-duration-gate.mjs';
import { regradeDurationRun } from '../conf01-duration-regrade.mjs';

/** A sample shaped like the gate's own output, with only the fields the fits read. */
const sample = (i, { closed, elements, excursion, loopMs = null, legacyLoopMs = null, heap = 100 }) => ({
  sample: i + 1,
  hours: i * 0.1,
  collected: { heapMB: heap, nodes: 7000, listeners: 1300 },
  live: { heapMB: heap + 40 },
  cpu: { rendererPercent: 120, gpuPercent: 40 },
  footprint: { totalPrivateMB: 1300, pageRendererPrivateMB: 400 },
  elements,
  trades: { managerClosed: closed, managerOpen: 4 },
  heavyFields: excursion,
  orderLoop: loopMs == null
    ? { perFrame: [{ calls: legacyLoopMs == null ? 0 : 80, msPerCall: legacyLoopMs }] }
    : { measured: { calls: 80, msPerCall: loopMs, closedHere: closed } },
});

/** Overlapping lists, as the product actually reports them. */
const heavyWithAliases = (perTradeSamples, closed) => {
  const closedSamples = perTradeSamples * closed;
  return {
    perList: {
      managerOpen: { rows: 4, excursionSamples: 0 },
      managerClosed: { rows: closed, excursionSamples: closedSamples },
      managerJournal: { rows: closed, excursionSamples: closedSamples },
      serviceClosed: { rows: closed, excursionSamples: closedSamples },
    },
    excursionSamples: closedSamples * 3,
    deduped: { excursionSamples: closedSamples, listAliasFactor: 3 },
    heavyMB: 0,
  };
};

test('the excursion series uses deduplicated counts, not the cross-list total', () => {
  const samples = [0, 1, 2, 3, 4, 5].map((i) => sample(i, {
    closed: 10 + i * 5,
    elements: 5000,
    excursion: heavyWithAliases(188, 10 + i * 5),
  }));
  const trends = buildTrends(samples, { minSpanHours: 2 });
  // 188 per trade deduped; the aliased total would read 564 and breach the ceiling.
  assert.ok(trends.excursionSamplesPerClosedTrade.perHour < 256,
    `expected ~188/trade, got ${trends.excursionSamplesPerClosedTrade.perHour}`);
  assert.equal(trends.excursionSamplesPerClosedTrade.verdict, 'BOUNDED');
  assert.equal(trends.excursionSamples.advisory, true);
});

test('an excursion cost above the four-array ceiling is RED, not a design cost', () => {
  const samples = [0, 1, 2, 3, 4, 5].map((i) => sample(i, {
    closed: 10 + i * 5,
    elements: 5000,
    excursion: heavyWithAliases(1_500, 10 + i * 5),
  }));
  const trends = buildTrends(samples, { minSpanHours: 2 });
  assert.equal(trends.excursionSamplesPerClosedTrade.verdict, 'CLIMBS');
  assert.equal(trends.excursionSamplesPerClosedTrade.flatBandPerHour, 1024);
});

test('runs recorded before the frame fix fall back to the host frame, and only when it ticked', () => {
  const ticking = [0, 1, 2, 3, 4].map((i) => sample(i, {
    closed: 10 + i * 5, elements: 5000, excursion: heavyWithAliases(188, 10 + i * 5), legacyLoopMs: 0.8,
  }));
  assert.equal(buildTrends(ticking, { minSpanHours: 2 }).orderLoopMsPerTick.n, 5);

  // calls=0 is a frame that was not ticking, which is not a cheap tick.
  const stalled = [0, 1, 2, 3, 4].map((i) => sample(i, {
    closed: 10 + i * 5, elements: 5000, excursion: heavyWithAliases(188, 10 + i * 5),
  }));
  assert.equal(buildTrends(stalled, { minSpanHours: 2 }).orderLoopMsPerTick.verdict, 'INSUFFICIENT');
});

test('element cost is fitted against trade count, so fixed overhead cannot read as an improvement', () => {
  // Constant DOM per trade plus a large fixed baseline: the ratio elements/closed
  // falls as trades accumulate, which the first version of this gate read as FALLS.
  const samples = [0, 1, 2, 3, 4, 5].map((i) => sample(i, {
    closed: 10 + i * 10,
    elements: 5000 + (10 + i * 10) * 2,
    excursion: heavyWithAliases(188, 10 + i * 10),
  }));
  const trends = buildTrends(samples, { minSpanHours: 2 });
  assert.equal(trends.elementsPerClosedTrade.xUnit, 'closedTrade');
  assert.ok(Math.abs(trends.elementsPerClosedTrade.perHour - 2) < 0.01,
    `expected 2 elements per trade, got ${trends.elementsPerClosedTrade.perHour}`);
  assert.equal(trends.elementsPerClosedTrade.verdict, 'BOUNDED');
  assert.ok(trends.elementsPerClosedTrade.bandBasis, 'a band must name its evidence');
});

test('re-grading a run never claims DUR-01 satisfaction on a short span', () => {
  const samples = [0, 1, 2, 3, 4, 5].map((i) => sample(i, {
    closed: 10 + i * 5, elements: 5000, excursion: heavyWithAliases(188, 10 + i * 5), heap: 100 + i * 30,
  }));
  const out = regradeDurationRun({ signature: 'CONF01-DURATION-GATE-V1', samples, verdict: { status: 'RED' } });
  assert.equal(out.satisfiesDur01, false);
  assert.equal(out.spanHours, 0.5);
  assert.equal(out.verdict.status, 'UNRESOLVED');
  assert.ok(out.verdict.provisionalClimbing.includes('heapAfterGcMB'),
    'a climbing heap on a short run is provisional and must be named as such');
  assert.equal(out.source.priorVerdict, 'RED');
});

test('CONF-02 is not satisfied by a run that never accumulated the closed positions', () => {
  const short = [0, 1, 2, 3].map((i) => sample(i, { closed: 3, elements: 5000, excursion: heavyWithAliases(188, 3) }));
  assert.equal(assessConf02(short, { closedTarget: 30 }).compliant, false);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { fitTrend, gradeDurationSeries, tCritical95 } from '../lib/duration-trend.mjs';
import { assessConf01Compliance } from '../lib/conf01-session.mjs';

const series = (values, stepHours = 0.25) => values.map((value, i) => ({ hours: i * stepHours, value }));

test('a clean climb outside the flat band is CLIMBS', () => {
  const t = fitTrend(series([100, 110, 120, 130, 140, 150]), { flatBandPerHour: 5 });
  assert.equal(t.verdict, 'CLIMBS');
  assert.ok(t.perHour > 35, `expected ~40/h, got ${t.perHour}`);
  assert.ok(t.slopeCi95[0] > 5, 'CI lower bound must clear the band');
});

test('a flat series inside the band is BOUNDED', () => {
  const t = fitTrend(series([100, 100.4, 99.7, 100.2, 100.1, 99.9]), { flatBandPerHour: 5 });
  assert.equal(t.verdict, 'BOUNDED');
});

test('a small slope buried in noise is INDETERMINATE, never BOUNDED', () => {
  // +8/h trend under +-20 scatter: the interval covers both flat and climbing.
  const t = fitTrend(series([100, 130, 90, 125, 95, 135, 105, 140]), { flatBandPerHour: 5 });
  assert.equal(t.verdict, 'INDETERMINATE');
  assert.ok(t.slopeCi95[0] < 5 && t.slopeCi95[1] > 5, `CI should straddle the band: ${t.slopeCi95}`);
});

test('a fall is reported as FALLS, which is not a failure', () => {
  const t = fitTrend(series([150, 140, 128, 121, 110, 99]), { flatBandPerHour: 5 });
  assert.equal(t.verdict, 'FALLS');
});

test('fewer than four samples cannot produce a verdict', () => {
  assert.equal(fitTrend(series([1, 2, 3])).verdict, 'INSUFFICIENT');
});

test('duration below the minimum is flagged even when the fit is flat', () => {
  const t = fitTrend(series([100, 100, 100, 100], 0.1), { flatBandPerHour: 5, minSpanHours: 2 });
  assert.equal(t.verdict, 'BOUNDED');
  assert.equal(t.durationOk, false, 'a 0.3h span cannot satisfy DUR-01');
});

test('t critical values tighten with degrees of freedom', () => {
  assert.ok(tCritical95(2) > tCritical95(10));
  assert.ok(tCritical95(10) > tCritical95(1000));
});

test('gradeDurationSeries is RED on a climb of sufficient span and UNRESOLVED on any indeterminate', () => {
  // 9 points x 0.25h = 2h span, so the climb satisfies DUR-01 and may decide.
  const climbing = fitTrend(series([100, 110, 120, 130, 140, 150, 160, 170, 180]), { flatBandPerHour: 5 });
  assert.equal(climbing.durationOk, true);
  const flat = fitTrend(series([100, 100.2, 99.9, 100.1, 100]), { flatBandPerHour: 5, minSpanHours: 0.5 });
  assert.equal(gradeDurationSeries({ heap: climbing, elements: flat }).status, 'RED');

  const noisy = fitTrend(series([100, 130, 90, 125, 95, 135, 105, 140]), { flatBandPerHour: 5, minSpanHours: 0.5 });
  assert.equal(gradeDurationSeries({ heap: noisy }, { minSpanHours: 0.5 }).status, 'UNRESOLVED');

  assert.equal(gradeDurationSeries({ heap: flat }, { minSpanHours: 0.5 }).status, 'GREEN');
});

test('a short run cannot be GREEN even when every series is bounded', () => {
  const flatButShort = fitTrend(series([100, 100.2, 99.9, 100.1], 0.05), { flatBandPerHour: 5, minSpanHours: 2 });
  assert.equal(gradeDurationSeries({ heap: flatButShort }, { minSpanHours: 2 }).status, 'UNRESOLVED');
});

test('a climb measured over less than the required span is PROVISIONAL, not RED', () => {
  // The first version of this grader called RED on a 25-minute span while
  // implementing a ruling that requires two hours. A short run cannot conclude in
  // either direction.
  const shortClimb = fitTrend(series([100, 110, 120, 130, 140], 0.08), { flatBandPerHour: 5, minSpanHours: 2 });
  assert.equal(shortClimb.verdict, 'CLIMBS');
  assert.equal(shortClimb.durationOk, false);
  const graded = gradeDurationSeries({ heap: shortClimb }, { minSpanHours: 2 });
  assert.equal(graded.status, 'UNRESOLVED');
  assert.deepEqual(graded.climbing, []);
  assert.deepEqual(graded.provisionalClimbing, ['heap']);
  assert.match(graded.reason, /PROVISIONAL climb/);
});

test('advisory series are reported but never the RED reason', () => {
  // CONF-02 mandates trade accumulation, so the absolute count of retained samples
  // MUST climb. Grading that as a leak would fail the workload for obeying its own
  // definition; what decides is the same cost per trade.
  const climbing = fitTrend(series([100, 110, 120, 130, 140, 150, 160, 170, 180]), { flatBandPerHour: 5 });
  const graded = gradeDurationSeries({ excursionSamples: { ...climbing, advisory: true } });
  assert.equal(graded.status, 'GREEN');
  assert.deepEqual(graded.advisoryClimbing, ['excursionSamples']);
  assert.deepEqual(graded.climbing, []);
});

test('a slope fitted against trade count is reported in trades, not per hour', () => {
  const perTrade = fitTrend(
    [5, 10, 15, 20, 25, 30].map((closed, i) => ({ hours: closed, value: 5000 + i * 150 })),
    { flatBandPerHour: 5, minSpanHours: 10 },
  );
  const graded = gradeDurationSeries({ elementsPerClosedTrade: { ...perTrade, xUnit: 'closedTrade' } });
  assert.equal(graded.status, 'RED');
  assert.match(graded.reason, /per closedTrade/);
  assert.doesNotMatch(graded.reason, /\/h/);
});

// ─── CONF-01 compliance ────────────────────────────────────────────────────

const compliantInputs = () => ({
  panelCount: 4,
  fileChoice: { distinctSymbols: 4, symbols: ['XAUUSD', 'HOG', 'ETHBTC', 'BTCEUR'] },
  datasetAssessment: {
    ok: true,
    mismatches: [],
    observed: [
      { panelId: 'A', fileId: '677', timeframe: '1m' },
      { panelId: 'B', fileId: '673', timeframe: '5m' },
      { panelId: 'C', fileId: '670', timeframe: '15m' },
      { panelId: 'D', fileId: '669', timeframe: '1h' },
    ],
  },
  workload: { indicatorsOk: true, order: { ok: true }, observedPlaying: 4 },
  state: {
    charts: 4,
    advancingPanels: 4,
    distinctFileIds: ['677', '673', '670', '669'],
    distinctTimeframes: ['1m', '5m', '15m', '1h'],
    indicatorsPerPanel: [4, 4, 4, 4],
    ordersTotal: 1,
    openPositionsTotal: 0,
  },
});

test('CONF-01 compliance requires four symbols, four timeframes, indicators, orders and advance', () => {
  const verdict = assessConf01Compliance(compliantInputs());
  assert.equal(verdict.compliant, true, JSON.stringify(verdict.failed));
  assert.match(verdict.acceptanceWeight, /carries acceptance weight/);
});

test('a same-pair session is refused acceptance weight', () => {
  const input = compliantInputs();
  input.fileChoice.distinctSymbols = 1;
  input.state.distinctFileIds = ['677'];
  input.state.distinctTimeframes = ['1m'];
  const verdict = assessConf01Compliance(input);
  assert.equal(verdict.compliant, false);
  assert.ok(verdict.failed.includes('fourDistinctSymbols'));
  assert.ok(verdict.failed.includes('fourDistinctTimeframes'));
  assert.match(verdict.acceptanceWeight, /DIAGNOSTIC ONLY/);
});

test('an arming self-report cannot carry compliance the product state contradicts', () => {
  const input = compliantInputs();
  // Arming says everything is armed; the product says nothing is playing and no
  // indicators exist. The product wins.
  input.state.advancingPanels = 1;
  input.state.indicatorsPerPanel = [0, 0, 0, 0];
  input.state.ordersTotal = 0;
  input.state.openPositionsTotal = 0;
  const verdict = assessConf01Compliance(input);
  assert.equal(verdict.compliant, false);
  assert.deepEqual(
    verdict.failed.sort(),
    ['indicatorsLoaded', 'ordersOpen', 'playbackAdvancing'].sort(),
  );
});

test('fewer than three indicators on any panel fails, not averages', () => {
  const input = compliantInputs();
  input.state.indicatorsPerPanel = [4, 4, 4, 1];
  assert.ok(assessConf01Compliance(input).failed.includes('indicatorsLoaded'));
});

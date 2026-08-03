#!/usr/bin/env node
/**
 * Cells for the reference assembler.
 *
 * Two failures are being guarded against, and neither is a crash. The first is a
 * confident headline built from arms that were never comparable — one chart set
 * against four, producing a 3-4x gap that is panel count wearing a costume. The
 * second is quieter and was introduced by fixing the first: a single reading of
 * each side, differenced, published as a gap. Our own idle series moved 15 MB in
 * one direction and 29 MB in the other across one wait, so a point difference
 * between two single runs is noise with a decimal place on it.
 */

import assert from 'node:assert/strict';
import {
  armOf, bandOf, bandRelation, buildReport, comparability, marginalBand,
} from './competitor-reference-report.mjs';

let pass = 0; let fail = 0;
const results = [];
function test(name, fn) {
  try { fn(); pass++; results.push(['PASS', name]); } catch (e) { fail++; results.push(['FAIL', name, e.message]); }
}

const arena = ({ label, panels, total, gpu, renderer = 120, dpr = 2, width = 1440, height = 960, settleMs = 20000, canvases = 5, error = null, noSummary = false }) => ({
  signature: 'COMPETITOR-ARENA-REFERENCE-V1',
  label,
  error,
  inputs: { dpr, viewport: { width, height }, settleMs, panels },
  summary: noSummary ? undefined : {
    label, panelsRequested: panels, dpr, canvasCount: canvases,
    totalPrivateMB: total, gpuPrivateMB: gpu, rendererPrivateMB: renderer,
  },
});

/** n runs of one arm, each a whole artifact, as the CLI would read them. */
const runs = (panels, totals, gpus, opts = {}) => totals.map((t, i) => armOf(
  arena({ label: `arm-${panels}up`, panels, total: t, gpu: gpus[i], ...opts }),
  { expectPanels: panels },
));

// --- comparability, the original objection -------------------------------------

test('a four-up arm cannot stand in for the one-up headline', () => {
  const r = buildReport({
    ours1up: runs(4, [460, 462, 458], [180, 182, 179]).map((a) => armOf(
      arena({ label: 'ours-4up', panels: 4, total: 460, gpu: 180 }), { expectPanels: 1 },
    )),
    tv1up: runs(1, [250, 252, 249], [50, 51, 49]),
  });
  assert.equal(r.headline.state, 'HEADLINE_PAIR_INCOMPLETE');
  assert.equal(r.bands.ours1up.state, 'BAND_ABSENT');
  assert.match(r.headline.refusedSubstitution, /divided by four is not our 1-up cost/);
});

test('a panel-count mismatch is refused with the reason named', () => {
  const cmp = comparability(
    { panels: 4, dpr: 2, width: 1440, height: 960, settleMs: 20000 },
    { panels: 1, dpr: 2, width: 1440, height: 960, settleMs: 20000 },
  );
  assert.equal(cmp.comparable, false);
  assert.match(cmp.reasons[0], /PANEL_COUNT_MISMATCH: 4 vs 1/);
  assert.match(cmp.reasons[0], /manufactures a gap out of layout size/);
});

test('arms taken at different dpr or settle are not comparable, and it says which', () => {
  const bad = buildReport({
    ours1up: runs(1, [300, 301, 299], [60, 61, 59], { dpr: 2 }),
    tv1up: runs(1, [250, 251, 249], [50, 51, 49], { dpr: 1 }),
  });
  assert.equal(bad.headline.state, 'ARMS_NOT_COMPARABLE');
  assert.match(bad.headline.why, /DPR_MISMATCH: 2 vs 1/);

  const settle = buildReport({
    ours1up: runs(1, [300, 301, 299], [60, 61, 59], { settleMs: 20000 }),
    tv1up: runs(1, [250, 251, 249], [50, 51, 49], { settleMs: 1000 }),
  });
  assert.match(settle.headline.why, /SETTLEMS_MISMATCH: 20000 vs 1000/);
});

// --- bands ---------------------------------------------------------------------

test('three runs make a band carrying min, max, median, n and spread', () => {
  const b = bandOf(runs(1, [300, 310, 305], [60, 66, 63]));
  assert.equal(b.state, 'BAND_READ');
  assert.equal(b.n, 3);
  assert.deepEqual(
    [b.metrics.totalPrivateMB.min, b.metrics.totalPrivateMB.max, b.metrics.totalPrivateMB.median],
    [300, 310, 305],
  );
  assert.equal(b.metrics.totalPrivateMB.spreadMB, 10);
  assert.equal(b.metrics.totalPrivateMB.spreadPctOfMin, 3.3);
});

test('one run is SINGLE_OBSERVATION_NOT_A_BAND — reported, not quotable', () => {
  const b = bandOf(runs(1, [300], [60]));
  assert.equal(b.state, 'SINGLE_OBSERVATION_NOT_A_BAND');
  assert.equal(b.n, 1);
  assert.match(b.why, /one run is a reading, not a range/);
  // And it cannot carry the headline.
  const r = buildReport({ ours1up: runs(1, [300], [60]), tv1up: runs(1, [250, 252, 249], [50, 51, 49]) });
  assert.equal(r.headline.state, 'HEADLINE_PAIR_INCOMPLETE');
  assert.match(r.headline.why, /ours=SINGLE_OBSERVATION_NOT_A_BAND \(n=1\)/);
});

test('two runs is a band but graded down, and the headline says so rather than hiding it', () => {
  const r = buildReport({
    ours1up: runs(1, [300, 310], [60, 66]),
    tv1up: runs(1, [250, 252, 249], [50, 51, 49]),
  });
  assert.equal(r.bands.ours1up.state, 'BAND_UNDERPOWERED');
  assert.equal(r.headline.state, 'HEADLINE_READ', 'thin evidence is still evidence; it must not be discarded');
  assert.match(r.headline.underpowered, /n < 3/);
});

test('a failed run inside a group is dropped and recorded, not allowed to sink the group', () => {
  const group = [
    ...runs(1, [300, 305], [60, 63]),
    armOf(arena({ label: 'tv', panels: 1, total: 90, gpu: 12, canvases: 0 }), { expectPanels: 1 }),
  ];
  const b = bandOf(group);
  assert.equal(b.n, 2, 'the drew-nothing run must not be counted in the interval');
  assert.equal(b.rejected.length, 1);
  assert.equal(b.rejected[0].state, 'ARM_DREW_NOTHING');
  assert.equal(b.metrics.totalPrivateMB.min, 300, 'and its 90 MB must not become our floor');
});

test('a page that never drew is refused, not read as a cheap competitor', () => {
  const r = buildReport({
    ours1up: runs(1, [300, 305, 310], [60, 63, 66]),
    tv1up: [0, 1, 2].map(() => armOf(arena({ label: 'tv', panels: 1, total: 90, gpu: 12, canvases: 0 }), { expectPanels: 1 })),
  });
  assert.equal(r.bands.tv1up.state, 'BAND_ABSENT');
  assert.equal(r.bands.tv1up.rejected.length, 3);
  assert.match(r.bands.tv1up.rejected[0].why, /zero canvases/);
  assert.equal(r.headline.state, 'HEADLINE_PAIR_INCOMPLETE');
});

test('an errored arm and one with no summary are named, not read as zero', () => {
  const errored = armOf(arena({ label: 'tv', panels: 1, total: 0, gpu: 0, error: 'Navigation timeout of 120000 ms exceeded\n  at foo' }), { expectPanels: 1 });
  assert.equal(errored.state, 'ARM_ERRORED');
  assert.equal(errored.why, 'Navigation timeout of 120000 ms exceeded');
  const empty = armOf(arena({ label: 'tv', panels: 1, total: 0, gpu: 0, noSummary: true }), { expectPanels: 1 });
  assert.equal(empty.state, 'ARM_HAS_NO_SUMMARY');
});

// --- band comparison, never point to point ------------------------------------

test('overlapping bands are WITHIN_BAND with a zero gap, not a difference of medians', () => {
  const ours = bandOf(runs(1, [300, 320, 310], [60, 70, 65]));
  const tv = bandOf(runs(1, [290, 330, 305], [55, 75, 62]));
  const rel = bandRelation(ours, tv, 'totalPrivateMB');
  assert.equal(rel.state, 'WITHIN_BAND');
  assert.equal(rel.gapMB, 0, 'overlap means the observations do not distinguish the two');
  const r = buildReport({ ours1up: runs(1, [300, 320, 310], [60, 70, 65]), tv1up: runs(1, [290, 330, 305], [55, 75, 62]) });
  assert.equal(r.headline.verdict, 'PER_CHART_COST_INDISTINGUISHABLE_FROM_REFERENCE');
});

test('disjoint bands quote the NEAREST edges, the smallest defensible gap', () => {
  // ours 400-420, reference 250-300. Nearest edges: 400-300 = 100.
  // Medians would say 410-275 = 135, and max-to-min 420-250 = 170. Both overstate.
  const ours = bandOf(runs(1, [400, 420, 410], [60, 70, 65]));
  const tv = bandOf(runs(1, [250, 300, 275], [50, 55, 52]));
  const rel = bandRelation(ours, tv, 'totalPrivateMB');
  assert.equal(rel.state, 'ABOVE_BAND');
  assert.equal(rel.gapMB, 100);
  assert.match(rel.basis, /nearest edges/);
});

test('being cheaper than the reference is BELOW_BAND, not a negative gap', () => {
  const ours = bandOf(runs(1, [200, 210, 205], [40, 42, 41]));
  const tv = bandOf(runs(1, [300, 320, 310], [60, 62, 61]));
  const rel = bandRelation(ours, tv, 'totalPrivateMB');
  assert.equal(rel.state, 'BELOW_BAND');
  assert.equal(rel.gapMB, 90, 'a gap is a magnitude; the direction is in the state');
});

test('the headline publishes no point value anywhere', () => {
  const r = buildReport({
    ours1up: runs(1, [300, 320, 310], [60, 70, 65]),
    tv1up: runs(1, [250, 260, 255], [50, 55, 52]),
  });
  for (const side of [r.headline.oursBand, r.headline.normalBand]) {
    assert.ok(Array.isArray(side.totalPrivateMB), 'every published figure must be an interval');
    assert.equal(side.totalPrivateMB.length, 2);
    assert.equal(typeof side.n, 'number');
  }
  assert.equal(r.headline.normalBand.note, 'NEVER_A_POINT');
  assert.equal(r.headline.oursBand.totalPrivateMB.length, 2);
});

// --- our own 1 -> 2 -> 4 curve --------------------------------------------------

test('the 1-2-4 curve reports marginal cost per added panel as an interval', () => {
  const r = buildReport({
    ours1up: runs(1, [300, 310, 305], [60, 66, 63]),
    tv1up: runs(1, [250, 260, 255], [50, 55, 52]),
    ours2up: runs(2, [360, 370, 365], [90, 96, 93]),
    ours4up: runs(4, [460, 480, 470], [150, 160, 155]),
  });
  assert.deepEqual(r.ourScalingCurve.panelsMeasured, [1, 2, 4]);
  assert.equal(r.ourScalingCurve.label, 'OURS_ONLY_NOT_A_COMPARISON');
  const m12 = r.ourScalingCurve.marginals.find((m) => m.fromPanels === 1 && m.key === 'totalPrivateMB');
  // 1->2 over one panel: low = 360-310 = 50, high = 370-300 = 70.
  assert.deepEqual(m12.perPanelMB, [50, 70]);
  const m24 = r.ourScalingCurve.marginals.find((m) => m.fromPanels === 2 && m.key === 'totalPrivateMB');
  // 2->4 over two panels: low = (460-370)/2 = 45, high = (480-360)/2 = 60.
  assert.deepEqual(m24.perPanelMB, [45, 60]);
});

test('the fixed share of a four-up is a band, and it is the number the debate needs', () => {
  const r = buildReport({
    ours1up: runs(1, [300, 310, 305], [60, 66, 63]),
    tv1up: runs(1, [250, 260, 255], [50, 55, 52]),
    ours2up: runs(2, [360, 370, 365], [90, 96, 93]),
    ours4up: runs(4, [460, 480, 470], [150, 160, 155]),
  });
  // 300/480 = 62.5% at the low end, 310/460 = 67.4% at the high end.
  assert.deepEqual(r.ourScalingCurve.fixedShareOfFourUpPct, [62.5, 67.4]);
  assert.match(r.ourScalingCurve.fixedShareMeaning, /not panels/);
});

test('four panels costing less than one is refused, not published as a negative marginal', () => {
  // The 20:55+01:00 pass, reproduced: 1-up at 564.3 MB and 4-up at 448.87 MB,
  // which yielded -38.48 MB per added panel and a fixed share of 125.7%. More
  // panels cannot cost less, so the arithmetic must refuse rather than describe.
  const r = buildReport({
    ours1up: runs(1, [564.3, 560, 566], [356.77, 350, 360]),
    tv1up: runs(1, [780, 770, 790], [446, 440, 450]),
    ours4up: runs(4, [448.87, 445, 450], [142.63, 140, 145]),
  });
  assert.equal(r.ourScalingCurve.state, 'CURVE_NOT_MONOTONIC_IN_PANELS');
  assert.match(r.ourScalingCurve.why, /more panels cannot cost less/);
  assert.match(r.ourScalingCurve.why, /4 panels \(445-450 MB\) costs less than 1 \(560-566 MB\)/);
  assert.equal(r.ourScalingCurve.marginals, undefined, 'no marginal may be published from an inverted curve');
  assert.equal(r.ourScalingCurve.fixedShareOfFourUpPct, undefined);
  assert.ok(r.ourScalingCurve.curve.length === 2, 'the readings stay so the inversion is inspectable');
  // The headline is unaffected: it is a different pair of arms.
  assert.equal(r.headline.state, 'HEADLINE_READ');
});

test('overlapping panel bands are not an inversion — only a total one is', () => {
  // 2-up cheaper than 1-up on SOME runs is noise, not an impossibility, and must
  // not suppress the curve. Only a gap with no overlap at all qualifies.
  // Deliberately the awkward shape: the 2-up interval sits INSIDE the 1-up one,
  // so its max is below the 1-up max while still overlapping. A test written as
  // `hi.max < lo.max` would call this impossible and suppress a usable curve.
  const r = buildReport({
    ours1up: runs(1, [300, 360, 330], [60, 70, 65]),
    tv1up: runs(1, [250, 260, 255], [50, 55, 52]),
    ours2up: runs(2, [310, 340, 325], [90, 96, 93]),
  });
  assert.equal(r.ourScalingCurve.label, 'OURS_ONLY_NOT_A_COMPARISON');
  assert.notEqual(r.ourScalingCurve.state, 'CURVE_NOT_MONOTONIC_IN_PANELS',
    'a partial overlap is noise, not an impossibility');
  assert.ok(Array.isArray(r.ourScalingCurve.marginals), 'an overlap is noise; the curve still publishes');
});

test('a curve with only one usable panel count refuses rather than drawing a line', () => {
  const r = buildReport({
    ours1up: runs(1, [300, 310, 305], [60, 66, 63]),
    tv1up: runs(1, [250, 260, 255], [50, 55, 52]),
  });
  assert.equal(r.ourScalingCurve.state, 'CURVE_INCOMPLETE');
  assert.match(r.ourScalingCurve.why, /at least two usable panel counts/);
  assert.equal(r.ourScalingCurve.label, 'OURS_ONLY_NOT_A_COMPARISON', 'even incomplete, it is labelled as ours');
});

test('a marginal over a non-positive panel step is refused, not divided by zero', () => {
  const a = bandOf(runs(2, [360, 370, 365], [90, 96, 93]));
  assert.equal(marginalBand(a, a, 'totalPrivateMB').state, 'PANEL_STEP_NOT_POSITIVE');
});

test('the coverage limit is in the artifact, including that normal is a band', () => {
  const r = buildReport({ ours1up: [], tv1up: [] });
  assert.deepEqual(r.coverage.competitorPanelCountsMeasured, [1]);
  assert.match(r.coverage.readingRule, /ONE-CHART reference/);
  assert.match(r.coverage.normalIsABand, /no point value is published/);
  assert.ok(r.coverage.notMeasured.some((s) => /paid tiers not purchased/.test(s)));
  assert.ok(r.coverage.notMeasured.some((s) => /TradeZella and FX Replay/.test(s)));
});

for (const [state, name, why] of results) {
  console.log(`  ${state}  ${name}${why ? `\n        ${why}` : ''}`);
}
console.log(`\n  ${pass}/${pass + fail} cells`);
process.exitCode = fail ? 1 : 0;

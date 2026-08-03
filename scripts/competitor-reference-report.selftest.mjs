#!/usr/bin/env node
/**
 * Cells for the reference assembler. The failure this guards against is not a
 * crash — it is a confident headline built out of two arms that were never
 * comparable, which is the exact reading the PO struck down: one chart set
 * against four, producing a 3-4x gap that is panel count wearing a costume.
 */

import assert from 'node:assert/strict';
import { armOf, buildReport, comparability } from './competitor-reference-report.mjs';

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

test('a one-up pair at matching settings produces the headline, with deltas and ratios', () => {
  const r = buildReport({
    ours1up: armOf(arena({ label: 'ours-1up', panels: 1, total: 300, gpu: 60 }), { expectPanels: 1 }),
    tv1up: armOf(arena({ label: 'tv-1up', panels: 1, total: 250, gpu: 50 }), { expectPanels: 1 }),
  });
  assert.equal(r.headline.state, 'HEADLINE_READ');
  assert.equal(r.headline.deltaMB.total, 50);
  assert.equal(r.headline.ratio.gpu, 1.2);
  assert.match(r.headline.basis, /one chart each/);
});

test('a four-up arm cannot stand in for the one-up headline', () => {
  // The substitution the PO struck down: ours at 4 panels against TradingView at
  // 1. It must refuse rather than produce a 3-4x number.
  const r = buildReport({
    ours1up: armOf(arena({ label: 'ours-4up', panels: 4, total: 460, gpu: 180 }), { expectPanels: 1 }),
    tv1up: armOf(arena({ label: 'tv-1up', panels: 1, total: 250, gpu: 50 }), { expectPanels: 1 }),
  });
  assert.equal(r.headline.state, 'HEADLINE_PAIR_INCOMPLETE');
  assert.equal(r.arms.ours1up.state, 'ARM_WRONG_PANEL_COUNT');
  assert.match(r.arms.ours1up.why, /expected a 1-panel arm, this artifact is 4/);
  assert.match(r.headline.refusedSubstitution, /divided by four is not our 1-up cost/);
});

test('a panel-count mismatch that slips past the expectation is still refused', () => {
  // Belt and braces: armOf is where the count is checked, comparability is where
  // it is checked again, because a caller may read arms without an expectation.
  const cmp = comparability(
    { panels: 4, dpr: 2, width: 1440, height: 960, settleMs: 20000 },
    { panels: 1, dpr: 2, width: 1440, height: 960, settleMs: 20000 },
  );
  assert.equal(cmp.comparable, false);
  assert.match(cmp.reasons[0], /PANEL_COUNT_MISMATCH: 4 vs 1/);
  assert.match(cmp.reasons[0], /manufactures a gap out of layout size/);
});

test('arms taken at different dpr are not comparable, and it says which field', () => {
  const r = buildReport({
    ours1up: armOf(arena({ label: 'ours-1up', panels: 1, total: 300, gpu: 60, dpr: 2 }), { expectPanels: 1 }),
    tv1up: armOf(arena({ label: 'tv-1up', panels: 1, total: 250, gpu: 50, dpr: 1 }), { expectPanels: 1 }),
  });
  assert.equal(r.headline.state, 'ARMS_NOT_COMPARABLE');
  assert.match(r.headline.why, /DPR_MISMATCH: 2 vs 1/);
});

test('a differing settle refuses too, since settle is worth ~111 MB on our own arm', () => {
  const r = buildReport({
    ours1up: armOf(arena({ label: 'ours-1up', panels: 1, total: 300, gpu: 60, settleMs: 20000 }), { expectPanels: 1 }),
    tv1up: armOf(arena({ label: 'tv-1up', panels: 1, total: 250, gpu: 50, settleMs: 1000 }), { expectPanels: 1 }),
  });
  assert.equal(r.headline.state, 'ARMS_NOT_COMPARABLE');
  assert.match(r.headline.why, /SETTLEMS_MISMATCH: 20000 vs 1000/);
});

test('a missing competitor arm is HEADLINE_PAIR_INCOMPLETE, not a one-sided claim', () => {
  const r = buildReport({
    ours1up: armOf(arena({ label: 'ours-1up', panels: 1, total: 300, gpu: 60 }), { expectPanels: 1 }),
    tv1up: armOf(null, { expectPanels: 1 }),
  });
  assert.equal(r.headline.state, 'HEADLINE_PAIR_INCOMPLETE');
  assert.match(r.headline.why, /tradingview=ARM_ABSENT/);
  assert.equal(r.ourScalingCurve, undefined, 'and no curve is published without a headline to hang it beside');
});

test('an arm that errored is named as errored rather than read as zero', () => {
  const r = buildReport({
    ours1up: armOf(arena({ label: 'ours-1up', panels: 1, total: 300, gpu: 60 }), { expectPanels: 1 }),
    tv1up: armOf(arena({ label: 'tv-1up', panels: 1, total: 0, gpu: 0, error: 'Navigation timeout of 120000 ms exceeded\n  at foo' }), { expectPanels: 1 }),
  });
  assert.equal(r.arms.tv1up.state, 'ARM_ERRORED');
  assert.equal(r.arms.tv1up.why, 'Navigation timeout of 120000 ms exceeded');
  assert.equal(r.headline.state, 'HEADLINE_PAIR_INCOMPLETE');
});

test('an arm that never reached its summary is named, not treated as absent', () => {
  const arm = armOf(arena({ label: 'tv-1up', panels: 1, total: 0, gpu: 0, noSummary: true }), { expectPanels: 1 });
  assert.equal(arm.state, 'ARM_HAS_NO_SUMMARY');
  assert.match(arm.why, /did not reach its summary/);
});

test('our four-up is published as ours, labelled so, with the marginal cost per panel', () => {
  const r = buildReport({
    ours1up: armOf(arena({ label: 'ours-1up', panels: 1, total: 300, gpu: 60 }), { expectPanels: 1 }),
    tv1up: armOf(arena({ label: 'tv-1up', panels: 1, total: 250, gpu: 50 }), { expectPanels: 1 }),
    ours4up: armOf(arena({ label: 'ours-4up', panels: 4, total: 460, gpu: 180 }), { expectPanels: 4 }),
  });
  assert.equal(r.ourScalingCurve.label, 'OURS_ONLY_NOT_A_COMPARISON');
  assert.match(r.ourScalingCurve.why, /no competitor arm at this panel count/);
  // (460-300)/3 = 53.33 marginal total, (180-60)/3 = 40 marginal GPU.
  assert.equal(r.ourScalingCurve.marginalMBPerAddedPanel, 53.33);
  assert.equal(r.ourScalingCurve.marginalGpuMBPerAddedPanel, 40);
  // 300/460 = 65.2% of a four-up is what one chart already cost.
  assert.equal(r.ourScalingCurve.fixedShareOfFourUpPct, 65.2);
  // And it must not have leaked into the headline.
  assert.equal(r.headline.ours.totalPrivateMB, 300);
});

test('the coverage limit is in the artifact, not only in the prose around it', () => {
  const r = buildReport({ ours1up: armOf(null), tv1up: armOf(null) });
  assert.deepEqual(r.coverage.competitorPanelCountsMeasured, [1]);
  assert.match(r.coverage.readingRule, /ONE-CHART reference/);
  assert.ok(r.coverage.notMeasured.some((s) => /paid tiers not purchased/.test(s)));
  assert.ok(r.coverage.notMeasured.some((s) => /TradeZella and FX Replay/.test(s)));
  assert.ok(r.coverage.notMeasured.some((s) => /no multi-chart competitor data/.test(s)));
});

for (const [state, name, why] of results) {
  console.log(`  ${state}  ${name}${why ? `\n        ${why}` : ''}`);
}
console.log(`\n  ${pass}/${pass + fail} cells`);
process.exitCode = fail ? 1 : 0;

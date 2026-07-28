import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DIFFERENTIAL_PARITY_ORACLE_SIGNATURE,
  DRIFT_LADDER_LENGTHS,
  DRIFT_PERIOD,
  EPS_ROLLING_NONRECURSIVE,
  GROWTH_BASE_NOISE_FLOOR,
  LENGTH_GROWTH_FACTOR,
  M5_CANARY_FAMILIES,
  PARITY_FAMILY_INDEPENDENCE,
  PARITY_MEDIUM_LENGTH,
  PARITY_SCALES,
  PARITY_SHORT_LENGTH,
  PARITY_TIERS,
  REF_SELF_ERROR_DOMINANCE_MIN,
  REF_SELF_ERROR_GROWTH_CAP,
  UNPROVEN_REASONS,
  assertNoLengthDependentGrowth,
  assertWithinAbsoluteEpsilon,
  computeM5Pair,
  evaluateParityPair,
  loadIndicatorPerf,
  maxRelativeDivergence,
  parityCellMeta,
  runAllCells,
  runDriftSmaLadder,
  runDriftWmaControl,
  runM5CanaryParity,
  runM5ParityCell,
  runSanityRollingShort,
} from '../../docs/plan3/oracles/differential-parity-oracle-v1.mjs';
import {
  compensatedRollingSma,
  demaClosedFormReference,
  emaClosedFormReference,
  emaTailCutoffTerms,
  naiveRollingSma,
  recursiveDemaSpecClone,
  recursiveEmaSpecClone,
} from '../../docs/plan3/oracles/naive-rolling-reference.mjs';
import { loadChartIndicatorsEmaDema } from '../../docs/plan3/fixtures/a7-chart-indicators-ema-dema-loader.mjs';
import { NC_INJECTED_RELATIVE_ERROR } from '../../docs/plan3/fixtures/a7-parity-mutations.mjs';
import { buildDriftLadderSeries } from '../../docs/plan3/fixtures/a7-prng-series.mjs';

// The 1M ladder rung and the canary matrix are the expensive part of this suite; compute the
// full report once and let every cell assertion read the same evidence.
let cachedReport = null;
const fullReport = () => (cachedReport ??= runAllCells());

let cachedPerf = null;
const perf = () => (cachedPerf ??= loadIndicatorPerf());

test('DIFFERENTIAL-PARITY-ORACLE-V1 loads IndicatorPerf read-only exports', () => {
  assert.equal(typeof perf().rollingSmaFast, 'function');
  assert.equal(typeof perf().rollingWmaFast, 'function');
});

test('EPS-ROLLING-NONRECURSIVE is pinned and not widened to fit', () => {
  assert.equal(EPS_ROLLING_NONRECURSIVE, 1e-9);
  assert.ok(
    NC_INJECTED_RELATIVE_ERROR > EPS_ROLLING_NONRECURSIVE * 100,
    'negative-control error must sit far above epsilon',
  );
});

test('SANITY-ROLLING-SHORT: SMA/WMA vs reference within EPS-ROLLING-NONRECURSIVE', () => {
  const result = runSanityRollingShort(perf());
  assert.equal(result.cell, 'SANITY-ROLLING-SHORT');
  assert.equal(result.status, 'GREEN', `smaMax=${result.smaMax} wmaMax=${result.wmaMax}`);
  assert.ok(result.smaMax <= EPS_ROLLING_NONRECURSIVE);
  assert.ok(result.wmaMax <= EPS_ROLLING_NONRECURSIVE);
  assert.equal(result.comparedCount, 512 - (DRIFT_PERIOD - 1));
});

test('NC-PARITY-EPSILON-INVERTED: inverted compare RED on short SMA path', () => {
  const result = runSanityRollingShort(perf(), { invertEpsilon: true });
  assert.equal(result.cell, 'NC-PARITY-EPSILON-INVERTED');
  assert.equal(result.status, 'RED');
  assert.equal(result.pass, true, 'NC passes when inverted compare is RED');
});

// ── comparator: reports its compared population and fails closed ────────────────────────

test('maxRelativeDivergence reports comparedCount alongside maxRel', () => {
  const ref = [null, null, 100, 200, 300];
  const opt = [null, null, 100, 200, 300];
  const div = maxRelativeDivergence(ref, opt, 3);
  assert.equal(div.ok, true);
  assert.equal(div.maxRel, 0);
  assert.equal(div.comparedCount, 3);
  assert.equal(div.bitExactCount, 3);
  assert.equal(div.differingCount, 0);
  assert.equal(div.startIndex, 2);
});

test('maxRelativeDivergence: comparedCount===0 fails closed, never maxRel 0', () => {
  const div = maxRelativeDivergence([null, null, null], [null, null, null], 2);
  assert.equal(div.ok, false);
  assert.equal(div.reason, UNPROVEN_REASONS.NO_COMPARED_VALUES);
  assert.equal(div.comparedCount, 0);
  assert.equal(div.maxRel, null, 'an empty compare must not report a divergence of 0');
});

test('maxRelativeDivergence: length mismatch fails closed', () => {
  const div = maxRelativeDivergence([1, 2, 3, 4], [1, 2, 3], 2);
  assert.equal(div.ok, false);
  assert.equal(div.reason, UNPROVEN_REASONS.LENGTH_MISMATCH);
  assert.equal(div.maxRel, null);
});

test('maxRelativeDivergence: non-finite compared values fail closed', () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    const div = maxRelativeDivergence([1, 2, 3], [1, 2, bad], 2);
    assert.equal(div.ok, false, `expected fail-closed on ${bad}`);
    assert.equal(div.reason, UNPROVEN_REASONS.NON_FINITE);
    assert.equal(div.failureIndex, 2);
    assert.equal(div.maxRel, null);
  }
});

test('maxRelativeDivergence: a null on one side only fails closed (no silent skip)', () => {
  const div = maxRelativeDivergence([1, 2, 3], [1, 2, null], 2);
  assert.equal(div.ok, false);
  assert.equal(div.reason, UNPROVEN_REASONS.NULL_ALIGNMENT_MISMATCH);
  assert.equal(div.nullSide, 'optimized');
});

test('maxRelativeDivergence: short compared population fails closed', () => {
  const div = maxRelativeDivergence([1, 2, 3, null], [1, 2, 3, null], 2, { minComparedCount: 3 });
  assert.equal(div.ok, false);
  assert.equal(div.reason, UNPROVEN_REASONS.INSUFFICIENT_COMPARED);
  assert.equal(div.comparedCount, 2);
});

test('maxRelativeDivergence: real divergence is measured and counted', () => {
  const div = maxRelativeDivergence([100, 100, 100], [100, 100, 100 * (1 + 1e-6)], 2);
  assert.equal(div.ok, true);
  assert.ok(Math.abs(div.maxRel - 1e-6) < 1e-12, `maxRel=${div.maxRel}`);
  assert.equal(div.comparedCount, 2);
  assert.equal(div.differingCount, 1);
});

// ── growth ratchet ──────────────────────────────────────────────────────────────────────

test('assertNoLengthDependentGrowth: synthetic length-growing divergence RED', () => {
  const maxByLength = {
    100_000: 1.5896223785226764e-14,
    500_000: 4.661277616719828e-14,
    1_000_000: 5.424285154704246e-14,
  };
  const growth = assertNoLengthDependentGrowth(maxByLength, DRIFT_LADDER_LENGTHS);
  assert.equal(growth.ok, false, 'must RED when maxRel scales ~3.4× across ladder');
  assert.ok(growth.violations.length > 0);
  const base = Math.max(maxByLength[100_000], GROWTH_BASE_NOISE_FLOOR);
  assert.ok(maxByLength[1_000_000] > base * (1 + LENGTH_GROWTH_FACTOR));
});

test('assertNoLengthDependentGrowth: flat ladder within LENGTH_GROWTH_FACTOR GREEN', () => {
  const base = 2e-14;
  const maxByLength = {
    100_000: base,
    500_000: base * (1 + LENGTH_GROWTH_FACTOR * 0.5),
    1_000_000: base * (1 + LENGTH_GROWTH_FACTOR * 0.9),
  };
  const growth = assertNoLengthDependentGrowth(maxByLength, DRIFT_LADDER_LENGTHS);
  assert.equal(growth.ok, true, JSON.stringify(growth.violations));
});

test('assertNoLengthDependentGrowth: EPS parity floor must not mask growth (regression)', () => {
  const maxByLength = { 100_000: 1.59e-14, 500_000: 4.66e-14, 1_000_000: 5.42e-14 };
  const growth = assertNoLengthDependentGrowth(maxByLength, DRIFT_LADDER_LENGTHS);
  assert.equal(growth.ok, false);
  assert.equal(growth.base, growth.rawBase);
  assert.ok(growth.base < EPS_ROLLING_NONRECURSIVE, 'baseline must not use parity EPS as floor');
});

test('ladder assertions fail closed on an unproven rung', () => {
  const withNull = { 100_000: null, 500_000: 2e-14, 1_000_000: 2e-14 };
  const growth = assertNoLengthDependentGrowth(withNull, DRIFT_LADDER_LENGTHS);
  assert.equal(growth.ok, false);
  assert.equal(growth.violations[0].reason, 'unproven-baseline');

  const tailNull = { 100_000: 2e-14, 500_000: 2e-14, 1_000_000: null };
  const tailGrowth = assertNoLengthDependentGrowth(tailNull, DRIFT_LADDER_LENGTHS);
  assert.equal(tailGrowth.ok, false);

  const absolute = assertWithinAbsoluteEpsilon(tailNull);
  assert.equal(absolute.ok, false, 'an unproven rung must not pass the absolute EPS bound');
  assert.equal(assertWithinAbsoluteEpsilon({}).ok, false, 'an empty ladder proves nothing');
});

// ── SMA drift ladder ────────────────────────────────────────────────────────────────────

test('DRIFT-SMA-100K: records max relative divergence vs reference', () => {
  const { cells } = runDriftSmaLadder(perf(), [100_000]);
  assert.equal(cells.length, 1);
  assert.equal(cells[0].cell, 'DRIFT-SMA-100K');
  assert.ok(Number.isFinite(cells[0].maxRel));
  assert.equal(cells[0].comparedCount, 100_000 - (DRIFT_PERIOD - 1));
});

test('DRIFT-SMA-1M: divergence must not grow with series length', () => {
  const { cells, growth, absolute, maxByLength } = fullReport().smaLadder;
  const c1m = cells.find((c) => c.cell === 'DRIFT-SMA-1M');
  const c500 = cells.find((c) => c.cell === 'DRIFT-SMA-500K');
  assert.ok(c1m);
  assert.ok(c500);

  for (const c of cells) {
    assert.ok(c.maxRel <= EPS_ROLLING_NONRECURSIVE, `${c.cell} maxRel=${c.maxRel} exceeds EPS`);
    assert.equal(c.comparedCount, c.length - (DRIFT_PERIOD - 1));
  }
  assert.equal(absolute.ok, true, JSON.stringify(absolute.violations));

  assert.equal(
    growth.ok,
    false,
    `live SMA ladder shows length-dependent growth: ${JSON.stringify(maxByLength)}`,
  );
  assert.equal(c1m.status, 'RED');
  for (const c of cells) {
    assert.equal(c.status, 'RED', `${c.cell} must RED when growth fails`);
    assert.match(c.cell, /^DRIFT-SMA-/);
  }
});

test('DRIFT-SMA-REFERENCE-SELF-ERROR: the growth belongs to the product, not the harness', () => {
  const { cells, referenceControl, growth } = fullReport().smaLadder;
  assert.equal(referenceControl.cell, 'DRIFT-SMA-REFERENCE-SELF-ERROR');
  assert.equal(referenceControl.status, 'GREEN', JSON.stringify(referenceControl.violations));

  // The stateless reference cannot drift with length: its own error stays flat...
  assert.ok(
    referenceControl.selfGrowthRatio <= REF_SELF_ERROR_GROWTH_CAP,
    `reference self-error grew ${referenceControl.selfGrowthRatio}× across the ladder`,
  );
  // ...while the running-sum path grows well past it.
  assert.ok(
    growth.growthRatio > REF_SELF_ERROR_GROWTH_CAP,
    `product divergence growth ${growth.growthRatio}× should exceed reference noise growth`,
  );
  for (const c of cells) {
    const selfErr = c.referenceSelfError;
    assert.equal(selfErr.ok, true, `${c.cell} self-error unproven: ${selfErr.reason}`);
    assert.ok(
      c.maxRel / selfErr.maxRel >= REF_SELF_ERROR_DOMINANCE_MIN,
      `${c.cell}: divergence ${c.maxRel} not dominant over reference noise ${selfErr.maxRel}`,
    );
  }
});

test('DRIFT-WMA-CONTROL: harness control, declared code-clone', () => {
  const { cells, growth, absolute, status } = runDriftWmaControl(perf());
  assert.equal(cells[0].cell, 'DRIFT-WMA-CONTROL');
  for (const c of cells) {
    assert.ok(c.maxRel <= EPS_ROLLING_NONRECURSIVE, `${c.cell} maxRel=${c.maxRel}`);
    assert.equal(c.comparedCount, c.length - (DRIFT_PERIOD - 1));
    // Stated plainly so no one reads this control as evidence about WMA numerics.
    assert.equal(c.independence.class, 'code-clone');
    assert.equal(c.differingCount, 0, 'clone paths agree bit-for-bit by construction');
  }
  assert.equal(absolute.ok, true, JSON.stringify(absolute.violations));
  assert.equal(growth.ok, true, JSON.stringify(growth.violations));
  assert.equal(status, 'GREEN');
  for (const c of cells) assert.equal(c.status, 'GREEN');
});

test('oracle signature token is stable', () => {
  assert.equal(DIFFERENTIAL_PARITY_ORACLE_SIGNATURE, 'TALARIA_DIFFERENTIAL_PARITY_ORACLE_V1');
  const report = fullReport();
  assert.equal(report.signature, 'TALARIA_DIFFERENTIAL_PARITY_ORACLE_V1');
  assert.equal(report.cpuAcceptanceDoc, 'docs/plan3/PO-PROTOCOL-CPU-AB-20260728.md');
});

// ── references ──────────────────────────────────────────────────────────────────────────

test('M5 canary: chart-indicators EMA/DEMA calculators load read-only', () => {
  const { calculateEMA, calculateDEMA } = loadChartIndicatorsEmaDema();
  assert.equal(typeof calculateEMA, 'function');
  assert.equal(typeof calculateDEMA, 'function');
});

test('EMA closed form: truncated geometric tail matches the full expansion', () => {
  const series = buildDriftLadderSeries(PARITY_MEDIUM_LENGTH, 0xa7_2026_07, { scale: 1e6 });
  const truncated = emaClosedFormReference(series, DRIFT_PERIOD);
  const full = emaClosedFormReference(series, DRIFT_PERIOD, { tailCutoff: false });
  const div = maxRelativeDivergence(full, truncated, DRIFT_PERIOD);
  assert.equal(div.ok, true);
  assert.ok(
    div.maxRel <= 1e-15,
    `tail truncation must be below double resolution, got ${div.maxRel}`,
  );
  assert.ok(emaTailCutoffTerms(DRIFT_PERIOD) < PARITY_MEDIUM_LENGTH, 'cutoff must actually bind');
});

test('EMA/DEMA closed form is an independent evaluation, not the product recurrence', () => {
  const series = buildDriftLadderSeries(PARITY_MEDIUM_LENGTH, 0xa7_2026_07, { scale: 1e6 });
  for (const [closed, clone] of [
    [emaClosedFormReference(series, DRIFT_PERIOD), recursiveEmaSpecClone(series, DRIFT_PERIOD)],
    [demaClosedFormReference(series, DRIFT_PERIOD), recursiveDemaSpecClone(series, DRIFT_PERIOD)],
  ]) {
    const div = maxRelativeDivergence(closed, clone, DRIFT_PERIOD);
    assert.equal(div.ok, true);
    // Same definition: they must agree to rounding...
    assert.ok(div.maxRel <= 1e-12, `closed form disagrees with the definition: ${div.maxRel}`);
    // ...but a different evaluation: bit-identical output would mean the "independent"
    // reference is just the product recurrence again.
    assert.ok(
      div.differingCount > 0,
      'closed form must not reproduce the recurrence bit-for-bit',
    );
  }
});

test('M5 EMA/DEMA parity runs against the closed form, not the recurrence clone', () => {
  const chartCalcs = loadChartIndicatorsEmaDema();
  const series = buildDriftLadderSeries(PARITY_SHORT_LENGTH, 0xa7_2026_07, { scale: 1e6 });
  const wiring = [
    ['EMA', emaClosedFormReference, recursiveEmaSpecClone],
    ['DEMA', demaClosedFormReference, recursiveDemaSpecClone],
  ];
  for (const [family, closedForm, clone] of wiring) {
    const pair = computeM5Pair(perf(), chartCalcs, family, PARITY_SHORT_LENGTH, 1e6);
    assert.deepEqual(
      pair.reference,
      closedForm(series, DRIFT_PERIOD),
      `${family} parity reference must be the independent closed-form derivation`,
    );
    assert.notDeepEqual(
      pair.reference,
      clone(series, DRIFT_PERIOD),
      `${family} parity reference must not be the product's recurrence written twice`,
    );
  }
});

test('compensated reference bounds the naive reference error and is stateless', () => {
  const series = buildDriftLadderSeries(100_000, 0xa7_2026_07, { scale: 1e6 });
  const div = maxRelativeDivergence(
    compensatedRollingSma(series, DRIFT_PERIOD),
    naiveRollingSma(series, DRIFT_PERIOD),
    DRIFT_PERIOD,
  );
  assert.equal(div.ok, true);
  assert.ok(div.maxRel < 1e-14, `reference self-error unexpectedly large: ${div.maxRel}`);
});

// ── M5 canary parity matrix ─────────────────────────────────────────────────────────────

test('M5 canary parity: every family × tier × scale is GREEN with a real compared population', () => {
  const { cells, chartCalcsError } = fullReport().m5Parity;
  assert.equal(chartCalcsError, null, `EMA/DEMA loader failed: ${chartCalcsError}`);
  assert.equal(cells.length, M5_CANARY_FAMILIES.length * PARITY_TIERS.length * PARITY_SCALES.length);

  for (const family of M5_CANARY_FAMILIES) {
    for (const scale of PARITY_SCALES) {
      for (const tier of PARITY_TIERS) {
        const name = `PARITY-${family}-${tier.id}${scale.suffix}`;
        const cell = cells.find((c) => c.cell === name);
        assert.ok(cell, `missing ${name}`);
        assert.equal(cell.length, tier.length);
        assert.notEqual(cell.status, 'UNPROVEN', `${name}: ${cell.unprovenReason}`);
        assert.equal(cell.status, 'GREEN', `${name} maxRel=${cell.maxRel}`);
        assert.ok(cell.maxRel <= EPS_ROLLING_NONRECURSIVE);
        assert.equal(
          cell.comparedCount,
          tier.length - (DRIFT_PERIOD - 1),
          `${name} compared ${cell.comparedCount} of ${tier.length - (DRIFT_PERIOD - 1)}`,
        );
        assert.equal(cell.independence.class, PARITY_FAMILY_INDEPENDENCE[family].class);
      }
    }
  }
  assert.equal(PARITY_SHORT_LENGTH, 512);
  assert.equal(PARITY_MEDIUM_LENGTH, 8192);

  // The single-cell entry point must grade identically to the matrix, so a caller reaching
  // for one cell cannot get a differently-graded answer.
  const jpy = PARITY_SCALES.find((s) => s.id === 'JPY');
  const single = runM5ParityCell(
    perf(),
    loadChartIndicatorsEmaDema(),
    'SMA',
    PARITY_SHORT_LENGTH,
    'SHORT',
    jpy,
  );
  const fromMatrix = cells.find((c) => c.cell === 'PARITY-SMA-SHORT-JPY');
  assert.equal(single.cell, fromMatrix.cell);
  assert.equal(single.status, fromMatrix.status);
  assert.equal(single.maxRel, fromMatrix.maxRel);
  assert.equal(single.comparedCount, fromMatrix.comparedCount);
});

test('M5 canary parity: no GREEN rests on a bit-exact compare where independence is claimed', () => {
  const { cells, vacuous } = fullReport().m5Parity;
  assert.deepEqual(
    vacuous.map((c) => c.cell),
    [],
    'a cell that required numeric evidence compared only bit-identical values',
  );

  // The families whose reference is an independent derivation must show the compare actually
  // discriminated bit patterns; WMA is a declared clone and is exempt by declaration, not by
  // accident.
  for (const cell of cells) {
    if (cell.numericEvidenceRequired) {
      assert.equal(cell.evidenceClass, 'numeric', `${cell.cell} discriminated nothing`);
      assert.ok(cell.differingCount > 0, `${cell.cell} differingCount=${cell.differingCount}`);
    }
  }
  const smaJpy = cells.find((c) => c.cell === 'PARITY-SMA-MEDIUM-JPY');
  assert.equal(smaJpy.evidenceClass, 'numeric');
  const wmaJpy = cells.find((c) => c.cell === 'PARITY-WMA-MEDIUM-JPY');
  assert.equal(wmaJpy.independence.class, 'code-clone');
  assert.equal(wmaJpy.numericEvidenceRequired, false);
});

// ── negative controls ───────────────────────────────────────────────────────────────────

test('NC: an injected relative error above EPS turns every canary family RED', () => {
  const { ncCells } = fullReport().m5Parity;
  for (const family of M5_CANARY_FAMILIES) {
    for (const tier of PARITY_TIERS) {
      const name = `NC-PARITY-${family}-${tier.id}-INJECTED-REL-ERROR`;
      const nc = ncCells.find((c) => c.cell === name);
      assert.ok(nc, `missing ${name}`);
      assert.equal(nc.injectedRelativeError, NC_INJECTED_RELATIVE_ERROR);
      assert.equal(nc.mutatedStatus, 'RED', `${name} did not go RED on a known value defect`);
      assert.ok(
        nc.mutatedMaxRel > EPS_ROLLING_NONRECURSIVE,
        `${name} maxRel=${nc.mutatedMaxRel} did not exceed epsilon`,
      );
      assert.equal(nc.pass, true);
      assert.equal(nc.status, 'GREEN');
    }
  }
});

test('NC: shape defects fail closed as UNPROVEN for every canary family', () => {
  const { ncCells } = fullReport().m5Parity;
  const shapeControls = [
    'ALL-NULL-OPTIMIZED',
    'NONFINITE-OPTIMIZED',
    'LENGTH-MISMATCH',
    'ZERO-COMPARED',
  ];
  for (const family of M5_CANARY_FAMILIES) {
    for (const suffix of shapeControls) {
      const name = `NC-PARITY-${family}-MEDIUM-${suffix}`;
      const nc = ncCells.find((c) => c.cell === name);
      assert.ok(nc, `missing ${name}`);
      assert.equal(nc.mutatedStatus, 'UNPROVEN', `${name} must fail closed, got ${nc.mutatedStatus}`);
      assert.equal(nc.pass, true);
    }
  }
});

test('NC: every negative control reacted (no silent misses)', () => {
  const { ncCells, ncFailures } = fullReport().m5Parity;
  assert.deepEqual(ncFailures.map((c) => c.cell), []);
  assert.equal(
    ncCells.length,
    M5_CANARY_FAMILIES.length * PARITY_TIERS.length * 5,
    'every family × tier must carry the full negative-control set',
  );
});

test('all-null optimized output is UNPROVEN, never GREEN', () => {
  const chartCalcs = loadChartIndicatorsEmaDema();
  for (const family of M5_CANARY_FAMILIES) {
    const jpy = PARITY_SCALES.find((s) => s.id === 'JPY');
    const pair = computeM5Pair(perf(), chartCalcs, family, PARITY_SHORT_LENGTH, jpy.scale);
    // Graded under the real cell rules, not a relaxed hand-built copy of them.
    const meta = parityCellMeta(family, { id: 'SHORT', length: PARITY_SHORT_LENGTH }, jpy, pair.optimizedPath);
    const allNull = evaluateParityPair(
      { ...pair, optimized: new Array(pair.optimized.length).fill(null) },
      meta,
    );
    assert.equal(allNull.status, 'UNPROVEN', `${family}: all-null optimized must not be GREEN`);
    assert.notEqual(allNull.status, 'GREEN');
    assert.equal(allNull.pass, false);

    const bothNull = evaluateParityPair(
      {
        ...pair,
        reference: new Array(pair.reference.length).fill(null),
        optimized: new Array(pair.optimized.length).fill(null),
      },
      meta,
    );
    assert.equal(bothNull.status, 'UNPROVEN');
    assert.equal(bothNull.reasonCode, UNPROVEN_REASONS.NO_COMPARED_VALUES);
    assert.equal(bothNull.comparedCount, 0);
  }
});

test('M5 canary parity re-runs deterministically', () => {
  const first = fullReport().m5Parity;
  const second = runM5CanaryParity(perf());
  assert.deepEqual(
    second.cells.map((c) => [c.cell, c.status, c.maxRel]),
    first.cells.map((c) => [c.cell, c.status, c.maxRel]),
  );
});

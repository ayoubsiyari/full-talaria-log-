import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DIFFERENTIAL_PARITY_ORACLE_SIGNATURE,
  DRIFT_LADDER_LENGTHS,
  EPS_ROLLING_NONRECURSIVE,
  GROWTH_BASE_NOISE_FLOOR,
  LENGTH_GROWTH_FACTOR,
  assertNoLengthDependentGrowth,
  loadIndicatorPerf,
  runAllCells,
  runDriftSmaLadder,
  runDriftWmaControl,
  runSanityRollingShort,
} from '../../docs/plan3/oracles/differential-parity-oracle-v1.mjs';

test('DIFFERENTIAL-PARITY-ORACLE-V1 loads IndicatorPerf read-only exports', () => {
  const perf = loadIndicatorPerf();
  assert.equal(typeof perf.rollingSmaFast, 'function');
  assert.equal(typeof perf.rollingWmaFast, 'function');
});

test('SANITY-ROLLING-SHORT: SMA/WMA vs naive within EPS-ROLLING-NONRECURSIVE', () => {
  const perf = loadIndicatorPerf();
  const result = runSanityRollingShort(perf);
  assert.equal(result.cell, 'SANITY-ROLLING-SHORT');
  assert.equal(result.status, 'GREEN', `smaMax=${result.smaMax} wmaMax=${result.wmaMax}`);
  assert.ok(result.smaMax <= EPS_ROLLING_NONRECURSIVE);
  assert.ok(result.wmaMax <= EPS_ROLLING_NONRECURSIVE);
});

test('NC-PARITY-EPSILON-INVERTED: inverted compare RED on short SMA path', () => {
  const perf = loadIndicatorPerf();
  const result = runSanityRollingShort(perf, { invertEpsilon: true });
  assert.equal(result.cell, 'NC-PARITY-EPSILON-INVERTED');
  assert.equal(result.status, 'RED');
  assert.equal(result.pass, true, 'NC passes when inverted compare is RED');
});

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

test('DRIFT-SMA-100K: records max relative divergence vs naive reference', () => {
  const perf = loadIndicatorPerf();
  const { cells } = runDriftSmaLadder(perf, [100_000]);
  assert.equal(cells.length, 1);
  assert.equal(cells[0].cell, 'DRIFT-SMA-100K');
  assert.ok(Number.isFinite(cells[0].maxRel));
});

test('DRIFT-SMA-500K: records max relative divergence vs naive reference', () => {
  const perf = loadIndicatorPerf();
  const { cells } = runDriftSmaLadder(perf, [100_000, 500_000]);
  const c500 = cells.find((c) => c.cell === 'DRIFT-SMA-500K');
  assert.ok(c500);
  assert.ok(Number.isFinite(c500.maxRel));
});

test('DRIFT-SMA-1M: divergence must not grow with series length', () => {
  const perf = loadIndicatorPerf();
  const { cells, growth, absolute, maxByLength } = runDriftSmaLadder(perf);
  const c1m = cells.find((c) => c.cell === 'DRIFT-SMA-1M');
  assert.ok(c1m);

  for (const c of cells) {
    assert.ok(
      c.maxRel <= EPS_ROLLING_NONRECURSIVE,
      `${c.cell} maxRel=${c.maxRel} exceeds EPS`,
    );
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

test('DRIFT-WMA-CONTROL: full recompute path shows no length-dependent drift', () => {
  const perf = loadIndicatorPerf();
  const { cells, growth, absolute, status } = runDriftWmaControl(perf);
  assert.equal(cells[0].cell, 'DRIFT-WMA-CONTROL');
  assert.ok(
    cells[0].maxRel <= EPS_ROLLING_NONRECURSIVE,
    `WMA control maxRel=${cells[0].maxRel} must stay within EPS`,
  );
  for (const c of cells) {
    assert.ok(c.maxRel <= EPS_ROLLING_NONRECURSIVE, `${c.cell} maxRel=${c.maxRel}`);
  }
  assert.equal(absolute.ok, true, JSON.stringify(absolute.violations));
  assert.equal(growth.ok, true, JSON.stringify(growth.violations));
  assert.equal(status, 'GREEN');
  for (const c of cells) assert.equal(c.status, 'GREEN');
});

test('oracle signature token is stable', () => {
  assert.equal(DIFFERENTIAL_PARITY_ORACLE_SIGNATURE, 'TALARIA_DIFFERENTIAL_PARITY_ORACLE_V1');
  const report = runAllCells();
  assert.equal(report.signature, 'TALARIA_DIFFERENTIAL_PARITY_ORACLE_V1');
});

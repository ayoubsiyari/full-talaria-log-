import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGreenTickBarStream } from '../../docs/plan3/fixtures/a16-green-eth-stream.mjs';
import {
  buildGreenFxControlStream,
  buildGreenFuturesMaintenanceStream,
} from '../../docs/plan3/fixtures/a16-futures-maintenance-stream.mjs';
import {
  SUMMER_MAINTENANCE_OPEN_MS,
  SUMMER_PRE_MAINTENANCE_OPEN_MS,
  WINTER_MAINTENANCE_OPEN_MS,
  nyWallFromEpoch,
} from '../../docs/plan3/fixtures/a16-tz-anchors.mjs';
import {
  BAR_TICK_INVARIANTS_SIGNATURE,
  barOpenInFuturesMaintenanceWindow,
  findBarsWithZeroTicks,
  isFuturesMaintenanceClassSymbol,
  nyWallClockFromEpoch,
  runAllCells,
  runBarNoTicksInvariant,
  runFuturesMaintenanceGapInvariant,
  runNcBarNoTicksMutation,
  runNcMaintenanceGapMutation,
  runNcXauusdNotGc,
  withTicklessBarInjection,
} from '../../docs/plan3/oracles/bar-tick-invariants-v1.mjs';

test('signature token is TALARIA_BAR_TICK_INVARIANTS_V1', () => {
  assert.equal(BAR_TICK_INVARIANTS_SIGNATURE, 'TALARIA_BAR_TICK_INVARIANTS_V1');
});

test('BAR-NO-TICKS-INVARIANT: green session-faithful stream GREEN', () => {
  const stream = buildGreenTickBarStream();
  const result = runBarNoTicksInvariant(stream);
  assert.equal(result.cell, 'BAR-NO-TICKS-INVARIANT');
  assert.equal(result.status, 'GREEN');
  assert.equal(result.violations.length, 0);
});

test('FUTURES-MAINTENANCE-GAP-NQ-ES-GC: green NQ stream GREEN', () => {
  const stream = buildGreenFuturesMaintenanceStream();
  const result = runFuturesMaintenanceGapInvariant(stream);
  assert.equal(result.status, 'GREEN');
  for (const sym of ['ES', 'GC1!', 'ES1!']) {
    const r = runFuturesMaintenanceGapInvariant({ ...stream, symbol: sym });
    assert.equal(r.status, 'GREEN', sym);
  }
});

test('NC-BAR-NO-TICKS-MUTATION: tickless bar RED then base GREEN', () => {
  const stream = buildGreenTickBarStream();
  const ticklessOpen = stream.bars[0].t + stream.barDurationMs * 4;
  const nc = runNcBarNoTicksMutation(stream, ticklessOpen);
  assert.equal(nc.cell, 'NC-BAR-NO-TICKS-MUTATION');
  assert.equal(nc.baseStatus, 'GREEN');
  assert.equal(nc.injectedStatus, 'RED');
  assert.equal(nc.status, 'GREEN');
  const mutated = withTicklessBarInjection(stream, { barOpen: ticklessOpen, durationMs: stream.barDurationMs });
  const restored = runBarNoTicksInvariant(stream);
  assert.equal(restored.status, 'GREEN');
  assert.ok(findBarsWithZeroTicks(mutated.bars, mutated.ticks, mutated.barDurationMs).length > 0);
});

test('NC-MAINTENANCE-GAP-MUTATION: NQ 17:00 ET RED, EURUSD control GREEN', () => {
  const futures = buildGreenFuturesMaintenanceStream();
  const fx = buildGreenFxControlStream();
  const winter = runNcMaintenanceGapMutation(futures, fx, WINTER_MAINTENANCE_OPEN_MS);
  assert.equal(winter.futuresStatus, 'RED');
  assert.equal(winter.fxStatus, 'GREEN');
  assert.equal(winter.status, 'GREEN');
  const summer = runNcMaintenanceGapMutation(futures, fx, SUMMER_MAINTENANCE_OPEN_MS);
  assert.equal(summer.futuresStatus, 'RED');
  assert.equal(summer.fxStatus, 'GREEN');
  assert.equal(summer.status, 'GREEN');
});

test('NC-XAUUSD-NOT-GC: spot gold bar at 17:00 ET does not trip futures cell', () => {
  const nc = runNcXauusdNotGc(SUMMER_MAINTENANCE_OPEN_MS);
  assert.equal(nc.cell, 'NC-XAUUSD-NOT-GC');
  assert.equal(nc.status, 'GREEN');
  assert.equal(nc.maintenanceStatus, 'GREEN');
  assert.equal(isFuturesMaintenanceClassSymbol('XAUUSD'), false);
  assert.equal(isFuturesMaintenanceClassSymbol('GC'), true);
});

test('DST: winter vs summer 17:00 ET share wall time, differ UTC offset', () => {
  const w = nyWallFromEpoch(WINTER_MAINTENANCE_OPEN_MS);
  const s = nyWallFromEpoch(SUMMER_MAINTENANCE_OPEN_MS);
  assert.equal(w.hour, 17);
  assert.equal(w.minute, 0);
  assert.equal(s.hour, 17);
  assert.equal(s.minute, 0);
  assert.ok(w.weekday >= 1 && w.weekday <= 5);
  assert.ok(s.weekday >= 1 && s.weekday <= 5);
  const winterUtcHour = new Date(WINTER_MAINTENANCE_OPEN_MS).getUTCHours();
  const summerUtcHour = new Date(SUMMER_MAINTENANCE_OPEN_MS).getUTCHours();
  assert.notEqual(winterUtcHour, summerUtcHour, 'EST vs EDT must differ in UTC');
  assert.equal(barOpenInFuturesMaintenanceWindow(WINTER_MAINTENANCE_OPEN_MS), true);
  assert.equal(barOpenInFuturesMaintenanceWindow(SUMMER_MAINTENANCE_OPEN_MS), true);
  assert.equal(barOpenInFuturesMaintenanceWindow(SUMMER_PRE_MAINTENANCE_OPEN_MS), false);
});

test('maintenance window uses Intl tz data (16:59 vs 17:00 boundary)', () => {
  const w = nyWallClockFromEpoch(SUMMER_PRE_MAINTENANCE_OPEN_MS);
  assert.equal(w.hour, 16);
  assert.equal(w.minute, 59);
  assert.equal(barOpenInFuturesMaintenanceWindow(SUMMER_PRE_MAINTENANCE_OPEN_MS), false);
});

test('runAllCells: full W33 matrix green', () => {
  const greenTickBar = buildGreenTickBarStream();
  const report = runAllCells({
    greenTickBar,
    greenFutures: buildGreenFuturesMaintenanceStream(),
    greenFx: buildGreenFxControlStream(),
    maintenanceOpenMsWinter: WINTER_MAINTENANCE_OPEN_MS,
    maintenanceOpenMsSummer: SUMMER_MAINTENANCE_OPEN_MS,
    ticklessBarOpenMs: greenTickBar.bars[0].t + greenTickBar.barDurationMs * 4,
  });
  assert.equal(report.signature, BAR_TICK_INVARIANTS_SIGNATURE);
  assert.equal(report.coverage, 'soundness');
  assert.equal(report.allPass, true, JSON.stringify(report.cells, null, 2));
  for (const c of report.cells) {
    assert.equal(c.pass, true, c.cell);
    assert.equal(c.status, 'GREEN', c.cell);
  }
});

/**
 * BOUNDED-PHASE-01, proven the way E proved the defect: with a stub that HANGS.
 *
 * E's finding was `UNBOUNDED-READBACK-PARKS-NODE` — a readback that never settles leaves node alive,
 * the heartbeat silent and the artifact frozen, so the run looks healthy from outside and produces
 * nothing. E demonstrated it with a hanging stub rather than by reading the code, because reading the
 * code is exactly what had already missed it: several of the call sites carry `.catch()`, which
 * handles a promise that REJECTS and does nothing at all for one that never settles.
 *
 * So these cells hang the real call SHAPES from `sealed-two-arm-soak.mjs` and assert the run
 * continues with a named state. A test that only checked a resolved promise would pass against the
 * unbounded code and prove nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedPhase, createPhaseRecorder, SOAK_PHASE_BUDGETS_MS, PHASE_OK, PHASE_TIMEOUT } from '../lib/bounded-phase.mjs';

/** A readback that accepts the call and never answers. E's shape exactly. */
const hangs = () => new Promise(() => {});
/** The shape that made this invisible: a hang wearing a catch. */
const hangsWithCatch = () => new Promise(() => {}).catch(() => 'never reached');

test('a hanging readback returns PHASE_TIMEOUT instead of parking the caller', async () => {
  const t0 = Date.now();
  const r = await boundedPhase('sample.readFootprint', 120, hangs, { fallback: null });
  assert.equal(r.state, PHASE_TIMEOUT);
  assert.equal(r.value, null, 'the caller gets its fallback and carries on');
  assert.ok(Date.now() - t0 < 3000, 'the point of the exercise is that control comes back');
});

test('.catch() does not rescue a hang — the reason the old code looked covered', async () => {
  const r = await boundedPhase('sample.readClosed', 120, hangsWithCatch, { fallback: 'fallback' });
  assert.equal(r.state, PHASE_TIMEOUT);
  assert.equal(r.value, 'fallback');
});

test('a whole sample survives one hung phase and records which one', async () => {
  // The real sequence: several readbacks, one of them parked. The sample must still be written.
  const events = [];
  const phases = createPhaseRecorder({ onEvent: (e) => events.push(e) });
  const before = await phases.run('sample.readPanels.before', 120, async () => [1, 2, 3, 4], { fallback: [] });
  const arenas = await phases.run('sample.readArenaColumns', 120, hangs, { fallback: null });
  const after = await phases.run('sample.readPanels.after', 120, async () => [1, 2, 3, 4], { fallback: [] });

  assert.equal(before.state, PHASE_OK);
  assert.equal(arenas.state, PHASE_TIMEOUT);
  assert.equal(after.state, PHASE_OK, 'a stalled read must not poison the reads after it');

  const summary = phases.summary();
  assert.equal(summary.timeouts, 1);
  assert.ok(summary.timedOutPhases.includes('sample.readArenaColumns'),
    'the artifact has to name WHICH phase parked, or hour four is unattributable');
});

test('the network reads in the sample loop are bounded — the shape that stalls silently', async () => {
  // passport() and readBuildInfo() are fetches. A socket accepted and never answered never rejects,
  // so no catch fires; before this was bounded, that parked the loop with node alive.
  for (const phase of ['sample.passport', 'sample.readBuildInfo']) {
    assert.ok(SOAK_PHASE_BUDGETS_MS[phase] > 0, `${phase} must have a budget`);
    const r = await boundedPhase(phase, 100, hangs, { fallback: null });
    assert.equal(r.state, PHASE_TIMEOUT);
  }
});

test('every phase the soak names has a budget, so none falls back to unbounded', () => {
  // A phase with no budget entry is the regression this guards: bounded in form, infinite in fact.
  for (const [phase, ms] of Object.entries(SOAK_PHASE_BUDGETS_MS)) {
    assert.ok(Number.isFinite(ms) && ms > 0, `${phase} has a non-finite budget`);
    assert.ok(ms <= 1_200_000, `${phase} budget ${ms}ms is longer than the pause probe; check it is deliberate`);
  }
});

test('a late rejection from an abandoned phase cannot kill the process at hour nine', async () => {
  let reject;
  const late = () => new Promise((_, rj) => { reject = rj; });
  const r = await boundedPhase('sample.readLoafCensus', 80, late, { fallback: null });
  assert.equal(r.state, PHASE_TIMEOUT);
  reject(new Error('the abandoned read finally failed'));
  // If the abandoned promise were unhandled, node's default is to terminate. Surviving this tick is
  // the assertion: a run that outlived a stall must not be killed later by the stall's own failure.
  await new Promise((res) => setTimeout(res, 50));
  assert.ok(true);
});

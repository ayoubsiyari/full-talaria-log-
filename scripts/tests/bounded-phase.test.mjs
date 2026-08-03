/**
 * Cells for BOUNDED-PHASE-01. Every one is a way the soak can lose ten hours.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boundedPhase, createPhaseRecorder, PHASE_OK, PHASE_TIMEOUT, PHASE_THREW,
  SOAK_PHASE_BUDGETS_MS,
} from '../lib/bounded-phase.mjs';

const never = () => new Promise(() => {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('a readback that never settles returns a named state instead of parking', async () => {
  const r = await boundedPhase('sample.readPanels', 60, never);
  assert.equal(r.state, PHASE_TIMEOUT, 'the whole point: node keeps going and the phase is named');
  assert.equal(r.phase, 'sample.readPanels');
  assert.equal(r.abandoned, true, 'the operation is still running and the artifact must say so');
});

test('a timeout is not a clean pass — the value is the fallback, never a silent undefined', async () => {
  const r = await boundedPhase('p', 40, never, { fallback: { ok: false, why: 'timed out' } });
  assert.deepEqual(r.value, { ok: false, why: 'timed out' });
  assert.notEqual(r.state, PHASE_OK, 'a stalled read must never grade as success');
});

test('the happy path is untouched and returns the real value', async () => {
  const r = await boundedPhase('p', 1_000, async () => ({ panels: 4 }));
  assert.equal(r.state, PHASE_OK);
  assert.deepEqual(r.value, { panels: 4 });
});

test('a rejection is a different state from a hang, because the fix is different', async () => {
  const r = await boundedPhase('p', 1_000, async () => { throw new Error('page detached'); });
  assert.equal(r.state, PHASE_THREW);
  assert.match(r.error, /page detached/);
});

test('a thunk that throws synchronously never produces an unobserved promise', async () => {
  const r = await boundedPhase('p', 1_000, () => { throw new Error('bad arg'); });
  assert.equal(r.state, PHASE_THREW, 'a sync throw is not a hang and must not be graded as one');
});

test('a LATE REJECTION after a timeout cannot take the process down', async () => {
  // This is the cell that justifies the design. Promise.race leaves the loser unobserved; when it
  // later rejects, node's default for an unhandled rejection is to terminate. A ten-hour soak that
  // survives a stall at hour four and is then killed at hour nine BY THAT STALL has lost the run
  // twice for one defect.
  const events = [];
  let rejectIt;
  const r = await boundedPhase('p', 30, () => new Promise((_, rej) => { rejectIt = rej; }), {
    onEvent: (e) => events.push(e.state),
  });
  assert.equal(r.state, PHASE_TIMEOUT);

  const unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  rejectIt(new Error('late failure from the abandoned readback'));
  await sleep(60);
  process.off('unhandledRejection', onUnhandled);

  assert.equal(unhandled.length, 0, 'the abandoned promise must carry a terminal handler');
  assert.ok(events.includes('PHASE_LATE_REJECT'), 'and the late failure must be recorded, not just swallowed');
});

test('PHASE_OVERDUE is emitted while still waiting, not only at the deadline', async () => {
  const events = [];
  const r = await boundedPhase('p', 300, never, {
    overdueMs: 40, overdueEveryMs: 40, onEvent: (e) => events.push(e),
  });
  const overdue = events.filter((e) => e.state === 'PHASE_OVERDUE');
  assert.ok(overdue.length >= 2, `expected repeated overdue warnings, got ${overdue.length}`);
  assert.ok(overdue[0].waitingMs < 300, 'the warning must arrive before the timeout, or it is not a warning');
  assert.equal(r.overdueCount, overdue.length);
});

test('a fast phase emits no overdue warning', async () => {
  const events = [];
  await boundedPhase('p', 1_000, async () => 1, { overdueMs: 200, onEvent: (e) => events.push(e) });
  assert.equal(events.filter((e) => e.state === 'PHASE_OVERDUE').length, 0);
});

test('a recorder tells a bad sample apart from a parked browser', async () => {
  const rec = createPhaseRecorder();
  await rec.run('a', 1_000, async () => 1);
  await rec.run('b', 30, never);
  const mixed = rec.summary();
  assert.equal(mixed.sampleState, 'DEGRADED_SOME_PHASES_TIMED_OUT');
  assert.equal(mixed.timeouts, 1);
  assert.equal(mixed.abandonedPromises, 1);

  const dead = createPhaseRecorder();
  await dead.run('a', 30, never);
  await dead.run('b', 30, never);
  assert.equal(dead.summary().sampleState, 'ALL_PHASES_TIMED_OUT',
    'every phase timing out is a parked browser, not a sample, and must be nameable by a gate');
});

test('consecutive timeouts reset on a good phase, so one blip is not an escalation', async () => {
  const rec = createPhaseRecorder();
  await rec.run('a', 30, never);
  assert.equal(rec.consecutiveTimeouts, 1);
  await rec.run('b', 1_000, async () => 1);
  assert.equal(rec.consecutiveTimeouts, 0);
});

test('the recorder never throws, so a stalled phase cannot abort the sample loop', async () => {
  const rec = createPhaseRecorder();
  await assert.doesNotReject(() => rec.run('boom', 1_000, async () => { throw new Error('x'); }));
  assert.equal(rec.summary().sampleState, 'DEGRADED_SOME_PHASES_THREW');
});

test('every call site E named carries a budget', () => {
  // E's handoff lists ten calls. A budget table that silently omits one leaves that call unbounded
  // while the run reports itself bounded, which is the failure wearing a new coat.
  for (const name of ['readPanels', 'measureBlocking', 'measureFrameRate', 'readFootprint',
    'readArenaColumns', 'readEffectiveRateReadback', 'readLoafCensus',
    'readOldestOpenPositionAge', 'forcedGcPauseProbe', 'offlineToggle']) {
    const hit = Object.keys(SOAK_PHASE_BUDGETS_MS).some((k) => k.includes(name));
    assert.ok(hit, `${name} has no budget in SOAK_PHASE_BUDGETS_MS`);
  }
  for (const [k, v] of Object.entries(SOAK_PHASE_BUDGETS_MS)) {
    assert.ok(Number.isFinite(v) && v > 0, `${k} has a nonsense budget`);
  }
});

test('the blocking budget exceeds its own observation window', () => {
  // measureBlocking(20000) takes 20 s by construction. A budget at or under that would time out
  // every healthy sample and read as a permanent stall.
  assert.ok(SOAK_PHASE_BUDGETS_MS['sample.measureBlocking'] > 20_000);
  assert.ok(SOAK_PHASE_BUDGETS_MS['sample.measureFrameRate'] > 3_000);
});

test('the pause-probe budget exceeds the ~11 minutes the probe is designed to take', () => {
  // I first wrote this at 5 minutes, which would have timed out every healthy probe and reported a
  // working instrument as a permanent stall — a deadline shorter than the operation is a fault
  // injector wearing a safety net's coat, and its output is indistinguishable from the defect it
  // was added to catch.
  assert.ok(SOAK_PHASE_BUDGETS_MS['probe.forcedGcPauseProbe'] > 11 * 60_000,
    'the soak excludes an ~11 minute window for this probe; the budget must clear it with margin');
});

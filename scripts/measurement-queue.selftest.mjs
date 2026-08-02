/**
 * Self-test for MEASUREMENT-QUEUE-01 — no machine, no filesystem.
 * node --test scripts/measurement-queue.selftest.mjs
 *
 * The cases are the two failures from 2026-08-02, plus the one that made them expensive:
 * a queue that answers "clear" when it cannot actually see the machine.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, classifyProcess, scriptNameOf } from './measurement-queue.mjs';

const proc = (pid, cmd) => ({ pid, cmd });
const MEASURE = (pid, name) => proc(pid, `"C:\\Program Files\\nodejs\\node.exe" scripts/${name} --panels=4`);

test('classification separates measurements from tooling and infrastructure', () => {
  assert.equal(classifyProcess('node scripts/arena-timeseries.mjs --out=x'), 'measurement');
  assert.equal(classifyProcess('node scripts/measurement-queue.mjs status'), 'tooling');
  assert.equal(classifyProcess('node scripts/arena-timeseries-conform.mjs'), 'tooling');
  assert.equal(classifyProcess('node --test scripts/foo.selftest.mjs'), 'tooling');
  assert.equal(classifyProcess('node "chart v 1.4/chart/multichart-prod/harness/serve.mjs"'), 'infrastructure');
  // Up since 09:41; treating it as contention would leave the queue permanently red.
  assert.equal(classifyProcess('node --max-old-space-size=256 scripts/build-identity-watch.mjs'), 'infrastructure');
  assert.equal(scriptNameOf('node scripts/pair-switch-arena-accumulation.mjs --switches=10'), 'pair-switch-arena-accumulation.mjs');
});

test('a build counts as contention even though it launches no browser', () => {
  // The b125 decision: a vite build during E's V8 attribution would perturb the GC behaviour
  // being measured. A browser-scoped queue would have called this clear.
  assert.equal(classifyProcess('node node_modules/vite/bin/vite.js build'), 'heavy');
  assert.equal(classifyProcess('npm.cmd run build:live'), 'heavy');
  const v = evaluate({ state: { claim: null }, procs: [proc(500, 'node node_modules/vite/bin/vite.js build')], owner: 'E', self: 1 });
  assert.equal(v.state, 'UNCLAIMED_RUN_DETECTED');
  assert.equal(v.mayRun, false);
});

test('a quiet machine with no claim is clear', () => {
  const v = evaluate({ state: { claim: null }, procs: [], owner: 'D', self: 1 });
  assert.equal(v.state, 'QUEUE_CLEAR');
  assert.equal(v.mayRun, true);
});

test('an unclaimed run must never read as clear — the 2026-08-02 pile-up', () => {
  const procs = [MEASURE(23660, 'competitor-arena-reference.mjs'), MEASURE(29596, 'buffer-partition-discriminator.mjs')];
  const v = evaluate({ state: { claim: null }, procs, owner: 'D', self: 1 });
  assert.equal(v.state, 'UNCLAIMED_RUN_DETECTED');
  assert.equal(v.mayRun, false);
  assert.equal(v.foreign.length, 2);
});

test('a live claim blocks another owner and admits its holder', () => {
  const procs = [MEASURE(777, 'arena-timeseries.mjs')];
  const state = { claim: { owner: 'C', run: 'arena-timeseries', pid: 777, at: 'x' } };
  assert.equal(evaluate({ state, procs, owner: 'D', self: 1 }).mayRun, false);
  assert.equal(evaluate({ state, procs, owner: 'D', self: 1 }).state, 'QUEUE_HELD');
  assert.equal(evaluate({ state, procs, owner: 'C', self: 1 }).state, 'HELD_BY_YOU');
});

test('a claim whose pid is gone is stale, not a permanent block', () => {
  const state = { claim: { owner: 'C', run: 'arena-timeseries', pid: 35600, at: 'x' } };
  const v = evaluate({ state, procs: [], owner: 'D', self: 1 });
  assert.equal(v.state, 'STALE_CLAIM');
  assert.equal(v.mayRun, true);
  assert.equal(v.staleClaim.pid, 35600);
});

test('a stale claim still refuses when an unclaimed run is on the machine', () => {
  const state = { claim: { owner: 'C', run: 'arena-timeseries', pid: 35600, at: 'x' } };
  const v = evaluate({ state, procs: [MEASURE(999, 'competitor-arena-reference.mjs')], owner: 'D', self: 1 });
  assert.equal(v.state, 'STALE_CLAIM');
  assert.equal(v.mayRun, false, 'a dead claim does not make a busy machine free');
});

test('an orphaned child keeps the queue held even though its shell exited', () => {
  // D's accumulation: watcher shell exited -1 at 22:02, the node child ran to 23:07.
  const state = { claim: { owner: 'D', run: 'pair-switch-accumulation', pid: 4242, at: 'x' } };
  const v = evaluate({ state, procs: [MEASURE(4242, 'pair-switch-arena-accumulation.mjs')], owner: 'E', self: 1 });
  assert.equal(v.state, 'QUEUE_HELD', 'liveness comes from the pid, not from a shell exit code');
  assert.equal(v.mayRun, false);
});

test('a free queue with a reservation is not open season — the timer-driven claimant must wait', () => {
  // D's canary polls every 30 s with no human; A has to read the board and type. Without the
  // order in the predicate, D wins every deploy race regardless of what was posted.
  const state = { claim: null, reservations: [{ owner: 'B', run: 'rebuild-constraint' }, { owner: 'A', run: 'shell-play' }, { owner: 'D', run: 'daily-boundary-canary' }] };
  const d = evaluate({ state, procs: [], owner: 'D', self: 1 });
  assert.equal(d.state, 'NOT_YOUR_TURN');
  assert.equal(d.mayRun, false);
  assert.equal(d.head.owner, 'B');
  const b = evaluate({ state, procs: [], owner: 'B', self: 1 });
  assert.equal(b.state, 'QUEUE_CLEAR');
  assert.equal(b.mayRun, true);
});

test('a reservation does not override an actually busy machine', () => {
  const state = { claim: null, reservations: [{ owner: 'B', run: 'rebuild-constraint' }] };
  const v = evaluate({ state, procs: [MEASURE(1, 'v8-monotone-heap-diff.mjs')], owner: 'B', self: 9 });
  assert.equal(v.state, 'UNCLAIMED_RUN_DETECTED');
  assert.equal(v.mayRun, false, 'being next in line does not make a busy box free');
});

test('an unreadable process list refuses rather than reporting clear', () => {
  const v = evaluate({ state: { claim: null }, procs: null, owner: 'D', self: 1 });
  assert.equal(v.state, 'MACHINE_UNREADABLE');
  assert.equal(v.mayRun, false);
});

test('the queue tool does not count itself as contention', () => {
  const procs = [proc(1, 'node scripts/measurement-queue.mjs preflight --owner=D')];
  assert.equal(evaluate({ state: { claim: null }, procs, owner: 'D', self: 99 }).state, 'QUEUE_CLEAR');
});

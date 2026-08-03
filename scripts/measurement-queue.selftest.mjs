/**
 * Self-test for MEASUREMENT-QUEUE-01 — no machine, no filesystem.
 * node --test scripts/measurement-queue.selftest.mjs
 *
 * The cases are the two failures from 2026-08-02, plus the one that made them expensive:
 * a queue that answers "clear" when it cannot actually see the machine.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, classifyProcess, scriptNameOf, sameRun, groupRuns } from './measurement-queue.mjs';

const proc = (pid, cmd) => ({ pid, cmd });
const MEASURE = (pid, name) => proc(pid, `"C:\\Program Files\\nodejs\\node.exe" scripts/${name} --panels=4`);

/**
 * Reservations were consumed on owner alone, so any run by that owner ate the head slot whatever it
 * was. A stale `D/daily-boundary-canary` therefore sat where D's PO-ordered mutant suite needed to
 * be, and D refused to launch rather than spend the turn on the wrong run. Run identity has to be
 * part of the match, and it has to survive the punctuation drift between a reservation typed one
 * night and a claim typed the next morning.
 */
test('run matching tolerates punctuation and case drift but not a different run', () => {
  assert.equal(sameRun('daily-boundary-canary', 'A3-DAILY-BOUNDARY-CANARY'), true, 'D reserved and claimed these as one run');
  assert.equal(sameRun('canonical-floor-retake', 'canonical-floor-retake'), true);
  assert.equal(sameRun('daily-boundary-canary', 'TAL-PO-UI-SMOKE-MUTANTS-LIVE'), false, 'the whole point: two D runs are not one slot');
  assert.equal(sameRun('shell-play-discriminator', 'idle-transient-clean-retake'), false);
  assert.equal(sameRun('', 'anything'), false, 'an empty name must not match everything');
  assert.equal(sameRun(null, undefined), false);
});

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


/**
 * RUN-GROUP-01 cells. A run is a process tree; counting processes raised four false alarms in one
 * day and was teaching everyone to scroll past the line.
 */

/** A's real shape at 14:46+01:00: an orchestrator that spawnSyncs one arm at a time. */
const A_IDLE_RETAKE = [
  { pid: 10572, ppid: 16920, cmd: 'node scripts/idle-transient-clean-retake.mjs' },
  { pid: 33548, ppid: 10572, cmd: 'node scripts/competitor-arena-reference.mjs --self --dpr=2 --out=idle-transient-clean-dpr2b.json' },
];

test('an orchestrator and the arm it spawned are ONE run, not two', () => {
  const groups = groupRuns(A_IDLE_RETAKE, { self: 999 });
  assert.equal(groups.length, 1, 'this is the false alarm: two processes, one experiment');
  assert.equal(groups[0].rootPid, 10572);
  assert.equal(groups[0].members.length, 2);
});

test('the unclaimed alarm counts runs and names the arms beneath the root', () => {
  const r = evaluate({ state: { claim: null }, procs: A_IDLE_RETAKE, owner: 'C', self: 999 });
  assert.equal(r.state, 'UNCLAIMED_RUN_DETECTED', 'still unclaimed — nobody claimed it, and that is true');
  assert.equal(r.foreignGroups.length, 1, 'but it is ONE run');
  assert.match(r.reason, /1 unclaimed run/);
  assert.match(r.reason, /idle-transient-clean-retake\.mjs#10572/);
  assert.match(r.reason, /\+1 arm/, 'the arm is named under its root, not promoted beside it');
});

test('two genuinely separate owners are still two runs — the alarm must survive', () => {
  const twoOwners = [
    { pid: 100, ppid: 1, cmd: 'node scripts/idle-transient-clean-retake.mjs' },
    { pid: 200, ppid: 2, cmd: 'node scripts/canonical-floor-retake.mjs' },
  ];
  const groups = groupRuns(twoOwners, { self: 999 });
  assert.equal(groups.length, 2, 'grouping must not collapse unrelated runs into one');
  const r = evaluate({ state: { claim: null }, procs: twoOwners, owner: 'C', self: 999 });
  assert.match(r.reason, /2 unclaimed runs/);
});

test("a claim held by a watcher covers the suite it fired — D's shape", () => {
  const dWatcher = [
    { pid: 25308, ppid: 1, cmd: 'node scripts/tal-po-ui-smoke-watch-b126.mjs --queue-owner=D' },
    { pid: 24508, ppid: 25308, cmd: 'node scripts/tal-po-ui-smoke-mutant-suite-live.mjs' },
  ];
  const r = evaluate({
    state: { claim: { owner: 'D', run: 'TAL-PO-UI-SMOKE-MUTANTS-LIVE', pid: 25308 } },
    procs: dWatcher, owner: 'D', self: 999,
  });
  assert.equal(r.state, 'HELD_BY_YOU', 'the child must not read as a second, unclaimed run');
});

test('an orchestrator that is not itself a measurement cannot launder its arms', () => {
  // The root here classifies as tooling; the arm underneath is a real measurement. Taking the
  // root's class would wave the whole tree through.
  const laundered = [
    { pid: 10, ppid: 1, cmd: 'node C:\\tmp\\wrapper.js' },
    { pid: 11, ppid: 10, cmd: 'node scripts/competitor-arena-reference.mjs --self' },
  ];
  const groups = groupRuns(laundered, { self: 999 });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'measurement', 'the group takes the most serious kind it contains');
});

test('without parent data every process is its own run, so nothing is silently merged', () => {
  const noPpid = [
    { pid: 1, cmd: 'node scripts/a-probe.mjs' },
    { pid: 2, cmd: 'node scripts/b-probe.mjs' },
  ];
  assert.equal(groupRuns(noPpid, { self: 999 }).length, 2,
    'a platform that cannot report parents must fall back to the strict reading, not the lenient one');
});

test('a cycle in the parent chain cannot hang the grouper', () => {
  const cyclic = [
    { pid: 1, ppid: 2, cmd: 'node scripts/a.mjs' },
    { pid: 2, ppid: 1, cmd: 'node scripts/b.mjs' },
  ];
  assert.ok(groupRuns(cyclic, { self: 999 }).length >= 1);
});


/** CLAIM-GRACE-01 cells. E lost a 100-minute slot 28 seconds after claiming it. */

test('a claim seconds old is settling, not stale — E at 14:22:36Z', () => {
  const state = { claim: { owner: 'E', run: 'v8-playback-heap-slope-90m-rerun', pid: 18972, at: new Date(Date.now() - 28_000).toISOString() } };
  const v = evaluate({ state, procs: [], owner: 'D', self: 1 });
  assert.equal(v.state, 'CLAIM_SETTLING');
  assert.equal(v.mayRun, false, "D must not take the box out from under a claim made 28 seconds ago");
});

test('the claimant itself may proceed while its own claim is settling', () => {
  const state = { claim: { owner: 'E', run: 'v8-rerun', pid: 18972, at: new Date(Date.now() - 5_000).toISOString() } };
  assert.equal(evaluate({ state, procs: [], owner: 'E', self: 1 }).mayRun, true);
});

test('grace expires — an old claim with a dead pid is still stale', () => {
  const state = { claim: { owner: 'E', run: 'v8-rerun', pid: 18972, at: new Date(Date.now() - 10 * 60_000).toISOString() } };
  assert.equal(evaluate({ state, procs: [], owner: 'D', self: 1 }).state, 'STALE_CLAIM',
    'grace must not become a permanent block — that was the defect STALE_CLAIM existed to fix');
});

test('a claim with no parseable time gets no grace', () => {
  const state = { claim: { owner: 'E', run: 'v8-rerun', pid: 18972, at: 'x' } };
  assert.equal(evaluate({ state, procs: [], owner: 'D', self: 1 }).state, 'STALE_CLAIM');
});


test('a self-test forking the script it tests is not an unclaimed run', () => {
  // Observed live at 15:36+01:00: D's census self-test forked the census twice, and the freshly
  // landed grouping reported two unclaimed runs on an otherwise idle box.
  const underTest = [
    { pid: 10220, ppid: 1, cmd: 'node --test scripts/copy-absence-census.selftest.mjs' },
    { pid: 19300, ppid: 10220, cmd: 'node scripts/copy-absence-census.mjs --fixture' },
  ];
  const groups = groupRuns(underTest, { self: 999 });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'tooling', 'a test harness is not contention');
  assert.equal(evaluate({ state: { claim: null }, procs: underTest, owner: 'C', self: 999 }).state,
    'QUEUE_CLEAR');
});

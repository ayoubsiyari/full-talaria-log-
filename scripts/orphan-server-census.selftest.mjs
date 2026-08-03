/**
 * ORPHAN-SERVER-01 cells. BIND-01: each state is demonstrated on input known to produce it, and the
 * RED state is demonstrated on a fixture built from the three real servers that sat on this box.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { censusOf, IS_LOCAL_SERVER } from './orphan-server-census.mjs';

const SERVE = (pid, ppid) => ({ pid, ppid, cmd: 'node C:\\repo\\harness\\serve.mjs --port=8080' });

test('a clean box reports NO_HARNESS_SERVERS', () => {
  const v = censusOf([{ pid: 1, ppid: null, cmd: 'node scripts/canonical-floor-retake.mjs' }]);
  assert.equal(v.state, 'NO_HARNESS_SERVERS');
  assert.equal(v.exit, 0);
});

test('RED: the three real servers with dead parents are ORPHANS_PRESENT', () => {
  // The 2026-08-03 fixture: pids 2104, 24904, 26776, whose launching runs died that morning.
  const v = censusOf([SERVE(2104, 9001), SERVE(24904, 9002), SERVE(26776, 9003)]);
  assert.equal(v.state, 'ORPHANS_PRESENT');
  assert.equal(v.exit, 3, 'an orphan must fail loudly, not be reported as a note');
  assert.deepEqual(v.orphans.map((o) => o.pid), [2104, 24904, 26776]);
});

test('a server whose parent is still alive is not an orphan', () => {
  const v = censusOf([{ pid: 500, ppid: null, cmd: 'node scripts/tal-po-ui-smoke.mjs' }, SERVE(501, 500)]);
  assert.equal(v.state, 'SERVERS_PRESENT');
  assert.equal(v.exit, 0, 'killing a server someone is using is worse than leaving it');
  assert.equal(v.orphans.length, 0);
});

test('an unreadable process list is never reported as a clean box', () => {
  assert.equal(censusOf(null).state, 'SCAN_UNAVAILABLE');
  assert.equal(censusOf(null).exit, 2, '"I could not look" must not share a colour with "nothing there"');
});

test('an unknown parent is not evidence of an orphan', () => {
  // ppid null means the platform told us nothing. Guessing orphan here would recommend killing a
  // server that may be in use.
  const v = censusOf([SERVE(700, null)]);
  assert.equal(v.state, 'SERVERS_PRESENT');
});

test('the matcher does not catch instruments that merely mention a server', () => {
  assert.equal(IS_LOCAL_SERVER.test('node scripts/serve-check.mjs'), false);
  assert.equal(IS_LOCAL_SERVER.test('node harness/serve.mjs'), true);
});

/**
 * HYG-1 tests. The module is a browser IIFE that hangs itself off `window`, so it runs here against a
 * minimal shim rather than being restructured for testability - restructuring product code to suit a
 * test is how you end up testing something other than what ships.
 *
 * The cases that matter are the two where a naive breaker does the wrong thing:
 *   - a storm must be ABSORBED, not dropped (no preference may be lost to rate limiting)
 *   - an open circuit must RETAIN the payload, not discard it (no preference lost to an outage)
 */
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = process.argv[2] || 'chart v 1.4/chart/modules/settings-write-breaker.js';

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`); fail++; }
};

function freshBreaker() {
  const listeners = {};
  const ctx = {
    console,
    setTimeout, clearTimeout, Date,
    window: {
      addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    },
    document: {
      addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
      visibilityState: 'visible',
    },
  };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx);
  return { b: ctx.window.__talariaSettingsWriteBreaker, ctx, fire: (t) => (listeners[t] || []).forEach((f) => f({})) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('=== the module exposes what preferences-sync expects ===');
{
  const { b } = freshBreaker();
  check('has write/flush/canSend/recordSuccess/recordFailure',
    ['write', 'flush', 'canSend', 'recordSuccess', 'recordFailure'].every((k) => typeof b[k] === 'function'),
    true);
  check('enabled by default', b.isEnabled(), true);
}

console.log('\n=== coalescing: N writes to one key cost one store, and the LAST value wins ===');
{
  const { b } = freshBreaker();
  const written = [];
  for (let i = 1; i <= 10; i++) b.write('k', i, (k, v) => written.push(v));
  check('nothing written synchronously', written.length, 0);
  b.flush();
  check('exactly one write performed', written.length, 1);
  check('and it is the last value', written[0], 10);
  check('coalesced counter records the 9 collapsed', b.stats().coalesced, 9);
}

console.log('\n=== different keys do not collapse into each other ===');
{
  const { b } = freshBreaker();
  const written = [];
  b.write('a', 1, (k, v) => written.push([k, v]));
  b.write('b', 2, (k, v) => written.push([k, v]));
  b.flush();
  check('both keys written', written.length, 2);
}

console.log('\n=== a write is never lost to the document going away ===');
{
  const { b, fire } = freshBreaker();
  const written = [];
  b.write('k', 'unsaved', (k, v) => written.push(v));
  fire('pagehide');
  check('pagehide flushed the pending write', written, ['unsaved']);
}

console.log('\n=== the switch restores immediate uncoalesced writes ===');
{
  const { b, ctx } = freshBreaker();
  ctx.window.__TALARIA_SETTINGS_WRITE_BREAKER_V1 = false;
  const written = [];
  b.write('k', 1, (k, v) => written.push(v));
  b.write('k', 2, (k, v) => written.push(v));
  check('both written synchronously when disabled', written, [1, 2]);
}

console.log('\n=== circuit: opens on transport failures, and RETAINS rather than drops ===');
{
  const { b } = freshBreaker();
  check('closed initially', b.canSend('preferences'), true);
  b.recordFailure('preferences', 500);
  b.recordFailure('preferences', 500);
  check('still closed after 2', b.canSend('preferences'), true);
  b.recordFailure('preferences', 500);
  check('open after 3', b.canSend('preferences'), false);
  check('open is counted', b.stats().circuitOpens, 1);
  check('and the caller is told to hold, not to discard', b.stats().sendsBlockedWhileOpen > 0, true);
}

console.log('\n=== 401 and 403 are answers, not failures - they must not trip the breaker ===');
{
  const { b } = freshBreaker();
  for (let i = 0; i < 10; i++) { b.recordFailure('preferences', 403); b.recordFailure('preferences', 401); }
  check('circuit still closed after 20 auth/subscription responses', b.canSend('preferences'), true);
  check('no opens recorded', b.stats().circuitOpens, 0);
}

console.log('\n=== a success closes the circuit again ===');
{
  const { b } = freshBreaker();
  b.recordFailure('x', 500); b.recordFailure('x', 500); b.recordFailure('x', 500);
  check('open', b.canSend('x'), false);
  b.recordSuccess('x');
  check('closed after success', b.canSend('x'), true);
}

console.log('\n=== channels are independent ===');
{
  const { b } = freshBreaker();
  b.recordFailure('a', 500); b.recordFailure('a', 500); b.recordFailure('a', 500);
  check('a open', b.canSend('a'), false);
  check('b unaffected', b.canSend('b'), true);
}

console.log('\n=== a storm widens the window instead of dropping writes ===');
{
  const { b } = freshBreaker();
  const written = [];
  for (let i = 0; i < 60; i++) b.write('hot', i, (k, v) => written.push(v));
  const s = b.stats();
  check('debounce widened past the base 250ms', s.currentCoalesceMs > 250, true);
  check('widening was recorded', s.stormWidenings > 0, true);
  b.flush();
  check('and the newest value still survives', written[written.length - 1], 59);
}

console.log('\n=== the coalesce window actually elapses on its own ===');
{
  const { b } = freshBreaker();
  const written = [];
  b.write('k', 'v', (k, v) => written.push(v));
  await sleep(400);
  check('written without an explicit flush', written, ['v']);
}

console.log('\n=== a throwing sink does not wedge the queue ===');
{
  const { b } = freshBreaker();
  const written = [];
  b.write('bad', 1, () => { throw new Error('storage full'); });
  b.write('good', 2, (k, v) => written.push(v));
  b.flush();
  check('the good write still landed', written, [2]);
  check('and the failure was recorded', typeof b.stats().lastError, 'string');
}

console.log(`\n================ ${pass} passed, ${fail} failed ================`);
process.exit(fail ? 1 : 0);

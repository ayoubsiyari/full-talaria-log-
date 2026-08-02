#!/usr/bin/env node
/**
 * Self-test for passport3-verify.mjs — BIND-01: a gate that has never gone red on a known
 * defect is not evidence.
 *
 * Serves each failure mode from a local origin and asserts the verifier's verdict. The
 * central case is C's: 200 + app-shell login HTML. The repo-mode gate cannot see it; this
 * one must, and must fail for the RIGHT reason rather than collapsing every fault into a
 * single red.
 */
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Must be async spawn, never spawnSync: the verifier under test fetches from the server
// this same process is hosting, and spawnSync blocks the event loop that would answer it.
function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { encoding: 'utf8' });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ status: code, out }); });
  });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This file tests the LIVE reader, which is the one the cut runs. C's scripts/passport3-verify.mjs
// is a different tool with the same stem: it proves the emitter/reader contract end to end, but its
// live path accepts neither --expect-build nor --expect-sha. Pointing this binding at C's file makes
// the cut command's expected build and SHA silently ignored, which passes while checking nothing.
const VERIFIER = path.join(__dirname, 'passport3-verify.mjs');
const GOOD_SHA = 'd7a27f70d494462fb9fcc66ab81851e6fd49c492';

// Watchdog. An earlier revision of this file deadlocked (spawnSync blocked the event loop
// that had to answer the child's fetch) and survived the shell that launched it, leaving an
// orphaned node process holding a listening port. On a host about to carry a ten-hour soak
// that is crash weight, so the run now bounds itself rather than relying on being killed.
const watchdog = setTimeout(() => {
  console.log('\n  FATAL self-test exceeded 120s — aborting rather than leaving a bound port');
  process.exit(1);
}, 120_000);
watchdog.unref();

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ''}`); fail++; }
};

// 29,406 bytes of app-shell login HTML, which is what the live origin actually returned.
const LOGIN_SHELL = `<!doctype html><html><head><title>Talaria — Sign in</title></head>`
  + `<body><div id="root"></div>${' '.repeat(29_000)}</body></html>`;

const HEALTHY_BODY = JSON.stringify({
  signature: 'TALARIA_BUILD_INFO_V1', buildId: '20260802b121', sourceCommitSha: GOOD_SHA,
  checkpointBuild: true, builtAt: new Date().toISOString(),
});
const JSON_NOSTORE = { 'content-type': 'application/json', 'cache-control': 'no-store' };

// Every case asserts the machine-readable PASSPORT3_STATE, not prose. The states exist so
// that "you pointed me at the wrong origin" can never be mistaken for "the build shipped a
// broken passport" — asserting on the classification is what holds that line.
const CASES = {
  'login-shell-200': {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    body: LOGIN_SHELL,
    exitCode: 3,
    state: 'WRONG_DOOR_APP_SHELL',
    because: 'HTML under a 200 is the exact live defect',
  },
  'auth-redirect-307': {
    status: 307,
    headers: { location: '/login/?next=%2Fchart%2Fbuild-info.json' },
    body: '',
    exitCode: 3,
    state: 'WRONG_DOOR_AUTH',
    because: 'an auth redirect is what production does, and it is not a verdict on the build',
  },
  'null-sha': {
    status: 200,
    headers: JSON_NOSTORE,
    body: JSON.stringify({ signature: 'TALARIA_BUILD_INFO_V1', buildId: '20260802b121', sourceCommitSha: null, checkpointBuild: true }),
    exitCode: 1,
    state: 'PASSPORT_FAILED',
    because: 'a null SHA looks like an answer',
    expectReason: /sourceCommitSha/i,
  },
  'cached': {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
    body: JSON.stringify({ signature: 'TALARIA_BUILD_INFO_V1', buildId: '20260802b121', sourceCommitSha: GOOD_SHA, checkpointBuild: true }),
    exitCode: 1,
    state: 'PASSPORT_FAILED',
    because: 'a cached passport can outlive the bytes it describes',
    expectReason: /Cache-Control/i,
  },
  'wrong-build': {
    status: 200,
    headers: JSON_NOSTORE,
    body: JSON.stringify({ signature: 'TALARIA_BUILD_INFO_V1', buildId: '20260731b120', sourceCommitSha: GOOD_SHA, checkpointBuild: true }),
    exitCode: 1,
    state: 'PASSPORT_FAILED',
    because: 'a readable passport from a stale deploy is the failure the badge check exists for',
    expectReason: /buildId matches the cut badge/i,
  },
  'not-found': {
    status: 404,
    headers: JSON_NOSTORE,
    body: JSON.stringify({ signature: 'TALARIA_BUILD_INFO_V1', buildId: null, sourceCommitSha: null, checkpointBuild: false }),
    exitCode: 1,
    state: 'PASSPORT_ABSENT',
    because: 'a dev image is not soak-legal, and absent is not the same fault as wrong door',
  },
  'healthy': {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: HEALTHY_BODY,
    exitCode: 0,
    state: 'VERIFIED',
    because: 'a correct passport must be accepted, or the gate is unusable at the cut',
  },
  'healthy-but-unbound': {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: HEALTHY_BODY,
    // Deliberately run with no expectations: readable is not verified.
    args: [],
    exitCode: 4,
    state: 'READABLE_BUT_UNBOUND',
    because: 'readability without an expected build is what let a stale deploy pass as a seal check',
  },
  'healthy-unbound-acknowledged': {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: HEALTHY_BODY,
    args: ['--allow-unbound'],
    exitCode: 0,
    state: 'VERIFIED',
    because: 'an unbound read is allowed only when the operator says so explicitly',
  },
};

const state = { current: null };
const server = http.createServer((req, res) => {
  const c = CASES[state.current];
  // Close the socket per response: undici keeps connections alive, and a lingering
  // keep-alive socket makes server.close() hang forever after the last case.
  res.writeHead(c.status, { ...c.headers, connection: 'close' });
  res.end(c.body);
});
server.keepAliveTimeout = 1;
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
console.log(`=== passport3-verify self-test against ${origin} ===\n`);

const BOUND = ['--expect-build=20260802b121', `--expect-sha=${GOOD_SHA}`];

for (const [name, c] of Object.entries(CASES)) {
  state.current = name;
  const r = await run([VERIFIER, '--mode=live', `--origin=${origin}`, ...(c.args ?? BOUND)]);
  const out = r.out;
  const verdict = c.exitCode === 0 ? 'ACCEPTS' : 'REJECTS';
  check(`${name}: verifier ${verdict} — ${c.because}`,
    r.status === c.exitCode,
    `expected exit ${c.exitCode}, got ${r.status}\n${out.split('\n').filter((l) => l.includes('FAIL')).slice(0, 3).join('\n')}`);
  check(`${name}: classified ${c.state}, so the reason is actionable and not a generic red`,
    new RegExp(`PASSPORT3_STATE=${c.state}\\b`).test(out),
    `expected PASSPORT3_STATE=${c.state}; got ${(out.match(/PASSPORT3_STATE=\S+/) || ['(none)'])[0]}`);
  if (c.expectReason) {
    check(`${name}: and names the failing assertion`,
      c.expectReason.test(out),
      `expected /${c.expectReason.source}/ in output`);
  }
}

// A wrong door must never print a content failure: the whole point is that nothing was read,
// so any assertion about the passport's contents would be an invention.
{
  state.current = 'auth-redirect-307';
  const r = await run([VERIFIER, '--mode=live', `--origin=${origin}`, ...BOUND]);
  check('wrong door: reports zero content failures rather than four look-alike reds',
    /0 passed, 0 failed, 6 not evaluated/.test(r.out),
    r.out.split('\n').filter((l) => /=====/.test(l)).join(' | '));
  check('wrong door: says in words that this is not a verdict on the build',
    /THIS IS NOT A VERDICT ON THE BUILD/.test(r.out));
}

server.closeAllConnections?.();
server.close();

// A server that accepts and never answers is the shape that stalls a cut. Distinct from a
// refused connection, and it must be reported as a timeout rather than hung on.
{
  const blackhole = http.createServer(() => { /* accept, never respond */ });
  await new Promise((r) => blackhole.listen(0, '127.0.0.1', r));
  const t = Date.now();
  const r = await run([
    VERIFIER, '--mode=live', `--origin=http://127.0.0.1:${blackhole.address().port}`,
    '--timeout=2500',
  ]);
  const ms = Date.now() - t;
  check('unresponsive origin: reports a timeout instead of hanging',
    /did not respond within/.test(r.out) && r.status === 1, `exit=${r.status} in ${ms}ms`);
  check('unresponsive origin: returns promptly so the cut is not stalled', ms < 15_000, `${ms}ms`);
  blackhole.closeAllConnections?.();
  blackhole.close();
}

clearTimeout(watchdog);
console.log(`\n================ SELF-TEST: ${pass} passed, ${fail} failed ================`);
process.exit(fail ? 1 : 0);

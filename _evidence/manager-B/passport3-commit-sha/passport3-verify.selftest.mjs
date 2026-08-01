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

const CASES = {
  'login-shell-200': {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    body: LOGIN_SHELL,
    mustFail: true,
    because: 'HTML under a 200 is the exact live defect',
    expectReason: /HTML document/i,
  },
  'null-sha': {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify({ signature: 'TALARIA_BUILD_INFO_V1', buildId: '20260802b121', sourceCommitSha: null, checkpointBuild: true }),
    mustFail: true,
    because: 'a null SHA looks like an answer',
    expectReason: /sourceCommitSha/i,
  },
  'cached': {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
    body: JSON.stringify({ signature: 'TALARIA_BUILD_INFO_V1', buildId: '20260802b121', sourceCommitSha: GOOD_SHA, checkpointBuild: true }),
    mustFail: true,
    because: 'a cached passport can outlive the bytes it describes',
    expectReason: /Cache-Control/i,
  },
  'not-found': {
    status: 404,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify({ signature: 'TALARIA_BUILD_INFO_V1', buildId: null, sourceCommitSha: null, checkpointBuild: false }),
    mustFail: true,
    because: 'a dev image is not soak-legal',
    expectReason: /status is 200/i,
  },
  'healthy': {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify({ signature: 'TALARIA_BUILD_INFO_V1', buildId: '20260802b121', sourceCommitSha: GOOD_SHA, checkpointBuild: true, builtAt: new Date().toISOString() }),
    mustFail: false,
    because: 'a correct passport must be accepted, or the gate is unusable at the cut',
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

for (const [name, c] of Object.entries(CASES)) {
  state.current = name;
  const r = await run([
    VERIFIER, '--mode=live', `--origin=${origin}`, '--expect-build=20260802b121',
  ]);
  const out = r.out;
  const failed = r.status !== 0;
  check(`${name}: verifier ${c.mustFail ? 'REJECTS' : 'ACCEPTS'} — ${c.because}`,
    failed === c.mustFail,
    `exit=${r.status}\n${out.split('\n').filter((l) => l.includes('FAIL')).slice(0, 3).join('\n')}`);
  if (c.expectReason) {
    check(`${name}: and fails for the right reason, not a generic red`,
      c.expectReason.test(out),
      `expected /${c.expectReason.source}/ in output`);
  }
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

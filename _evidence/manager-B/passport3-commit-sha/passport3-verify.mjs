#!/usr/bin/env node
/**
 * PASSPORT-3 live verifier — HTTP mode.
 *
 * WHY THIS EXISTS, IN C'S WORDS AND MINE
 * --------------------------------------
 * My repo-mode gate (passport3.test.mjs) locks the emitter, the Dockerfile wiring, the
 * served whitelist, the handler headers, and the nginx location ordering. Thirty green
 * checks. Every one of them reads a file on disk. Not one makes an HTTP request.
 *
 * That is precisely why they were green while the live origin returned 29,406 bytes of
 * app-shell login HTML, under a 200, for /chart/build-info.json.
 *
 * A 200 is worse than a 404 here. A 404 makes a reader fail loudly. A 200 of HTML means:
 *   - a reader checking `res.ok` is satisfied
 *   - a reader calling `res.json()` inside try/catch swallows the parse error
 *   - the passport records sourceCommitSha: null
 * and a passport carrying a null SHA is worse than no passport, because it looks like an
 * answer. My own commit message says so, which makes this my defect to catch, not C's.
 *
 * The repo gate could never have caught it: routing correctness on disk and routing
 * behaviour on the wire are different propositions. Auth middleware in front of the route,
 * an SPA catch-all, or a proxy tier reordering can all satisfy the file and break the wire.
 *
 * WHAT THIS ASSERTS (all of it on the wire, none of it inferred)
 *   1. status is exactly 200
 *   2. content-type is JSON — NOT text/html; this is the check that fails the login-shell
 *   3. the body is not an HTML document, byte-inspected before parsing
 *   4. the body parses as JSON
 *   5. signature === TALARIA_BUILD_INFO_V1
 *   6. sourceCommitSha is full 40-hex and NOT null
 *   7. checkpointBuild === true
 *   8. Cache-Control is no-store, so every soak sample re-reads it
 *   9. buildId matches the expected badge when --expect-build is given
 *
 * Usage:
 *   node passport3-verify.mjs --mode=live --origin=https://host [--expect-build=20260802b121]
 *                             [--expect-sha=<40hex>]
 *
 * Exit 0 only if every assertion holds. Run at the cut so the transition is witnessed
 * rather than inferred.
 */

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }),
);

const MODE = args.mode || 'live';
const ORIGIN = (args.origin || '').replace(/\/+$/, '');
const EXPECT_BUILD = args['expect-build'] || null;
const EXPECT_SHA = args['expect-sha'] || null;
const PATH = '/chart/build-info.json';
const SOURCE_SHA_RE = /^[a-f0-9]{40}$/;

if (MODE !== 'live') {
  console.error('passport3-verify: only --mode=live is implemented; repo mode is passport3.test.mjs');
  process.exit(2);
}
if (!ORIGIN) {
  console.error('passport3-verify: --origin=https://host is required in live mode');
  process.exit(2);
}

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ''}`); fail++; }
};

const url = `${ORIGIN}${PATH}`;
console.log(`=== PASSPORT-3 live verification: ${url} ===\n`);

// Hard timeout. This runs at the cut, where a hung origin must report a failure rather than
// stall the transition and leave a process behind on a host that is about to carry a soak.
const TIMEOUT_MS = Number(args.timeout || 15_000);
let res, bodyText;
try {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    res = await fetch(url, {
      redirect: 'manual',
      headers: { accept: 'application/json' },
      signal: ac.signal,
    });
    bodyText = await res.text();
  } finally {
    clearTimeout(timer);
  }
} catch (err) {
  const timedOut = err.name === 'AbortError';
  console.log(timedOut
    ? `  FATAL ${url} did not respond within ${TIMEOUT_MS}ms`
    : `  FATAL could not reach ${url}: ${err.message}`);
  process.exit(1);
}

const ctype = (res.headers.get('content-type') || '').toLowerCase();
const cacheControl = (res.headers.get('cache-control') || '').toLowerCase();
const bytes = Buffer.byteLength(bodyText, 'utf8');

console.log(`  status=${res.status}  content-type=${ctype || '(none)'}  bytes=${bytes}`);
console.log(`  cache-control=${cacheControl || '(none)'}\n`);

check('status is 200', res.status === 200, `got ${res.status}`);

// The check that would have caught the login shell. A 200 of text/html is the failure C
// found; it is a distinct state from "missing" and must not collapse into the same red.
const looksHtml = /^\s*(<!doctype html|<html[\s>])/i.test(bodyText) || ctype.includes('text/html');
check('content-type is JSON, not an HTML document', ctype.includes('json') && !looksHtml,
  looksHtml
    ? `SERVED AN HTML DOCUMENT UNDER ${res.status} (${bytes} bytes). This is the app-shell/login `
      + 'catch-all swallowing the route. A reader checking res.ok is satisfied and records a null SHA.'
    : `content-type was "${ctype}"`);

check('body is not an HTML document', !looksHtml,
  looksHtml ? `first 120 bytes: ${JSON.stringify(bodyText.slice(0, 120))}` : '');

let info = null;
try { info = JSON.parse(bodyText); } catch (err) {
  check('body parses as JSON', false, `${err.message}; first 120 bytes: ${JSON.stringify(bodyText.slice(0, 120))}`);
}
if (info) {
  check('body parses as JSON', true);
  check('signature is TALARIA_BUILD_INFO_V1', info.signature === 'TALARIA_BUILD_INFO_V1',
    `got ${JSON.stringify(info.signature)}`);
  check('sourceCommitSha is present and full 40-hex, not null',
    typeof info.sourceCommitSha === 'string' && SOURCE_SHA_RE.test(info.sourceCommitSha),
    `got ${JSON.stringify(info.sourceCommitSha)} — a null here is the failure this row exists to remove`);
  check('checkpointBuild is true', info.checkpointBuild === true, `got ${JSON.stringify(info.checkpointBuild)}`);
  check('buildId is present', typeof info.buildId === 'string' && info.buildId.length > 0,
    `got ${JSON.stringify(info.buildId)}`);
  if (EXPECT_BUILD) {
    check(`buildId matches the cut badge ${EXPECT_BUILD}`, info.buildId === EXPECT_BUILD,
      `got ${JSON.stringify(info.buildId)}`);
  }
  if (EXPECT_SHA) {
    check(`sourceCommitSha matches the train tip ${EXPECT_SHA.slice(0, 12)}…`,
      String(info.sourceCommitSha).toLowerCase() === String(EXPECT_SHA).toLowerCase(),
      `got ${JSON.stringify(info.sourceCommitSha)}`);
  }
}

check('Cache-Control is no-store', cacheControl.includes('no-store'),
  `got "${cacheControl}" — a cached passport can keep asserting a SHA after the bytes changed`);

console.log(`\n================ PASSPORT-3 LIVE: ${pass} passed, ${fail} failed ================`);
if (fail) {
  console.log('\nThe soak must not start against this origin. A passport that cannot be read on the');
  console.log('wire is not a passport, and the harness would record a null SHA for ten hours.');
}
process.exit(fail ? 1 : 0);

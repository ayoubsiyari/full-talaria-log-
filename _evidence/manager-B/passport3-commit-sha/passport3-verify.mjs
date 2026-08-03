#!/usr/bin/env node
// SEAL-EVIDENCE-01: SERVED_SMOKE — this verifier hits a live origin over HTTP.
// Green is evidence about THAT origin's /chart/build-info.json, not about source
// on disk. A run against the wrong badge or a retired identity is SERVED_SMOKE_NOT_RUN
// for the seal, even if every cell below would still print PASS.
console.log('SEAL-EVIDENCE-01 EVIDENCE CLASS: SERVED_SMOKE — live HTTP against the named origin; provenance must match the sealed badge/digest/SHA before this blesses a seal row.');

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
 * WHAT IT REFUSES TO CONFLATE
 *   A gate that prints the same red for "the build shipped a broken passport" and for "you
 *   pointed me at the wrong origin" is a gate nobody can act on at 03:00. CLOCK-01-EXEMPT:
 *   that is the idiom for the middle of the night, not a cited event, and stamping an
 *   offset onto it would assert a precision that was never meant. Before asserting
 *   anything about content, this triages the door and reports one of:
 *
 *     VERIFIED               a real passport, matching the expected badge and SHA
 *     READABLE_BUT_UNBOUND   a real passport, but this run never checked WHICH build
 *     PASSPORT_FAILED        a real passport whose contents are wrong — a build defect
 *     PASSPORT_ABSENT        404: emitter never ran, or artefact missing from the image
 *     WRONG_DOOR_AUTH        auth redirect to a login page — verdict says nothing about the build
 *     WRONG_DOOR_APP_SHELL   SPA catch-all served HTML — verdict says nothing about the build
 *     WRONG_DOOR_REDIRECT    something in front of the route is rewriting the request
 *
 * Usage:
 *   node passport3-verify.mjs --mode=live --origin=https://host [--expect-build=20260802b121]
 *                             [--expect-sha=<40hex>] [--allow-unbound]
 *
 * Exit 0 only when the passport is read AND bound to an expected build and SHA.
 *   0 VERIFIED   1 passport wrong   3 wrong door (not a verdict on the build)   4 unbound
 * Run at the cut so the transition is witnessed rather than inferred.
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
      // connection: close so no keep-alive socket outlives the verdict and holds the loop
      // open once process.exit() is no longer forcing the issue.
      headers: { accept: 'application/json', connection: 'close' },
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
const location = res.headers.get('location') || '';
const bytes = Buffer.byteLength(bodyText, 'utf8');

console.log(`  status=${res.status}  content-type=${ctype || '(none)'}  bytes=${bytes}`);
console.log(`  cache-control=${cacheControl || '(none)'}`);
if (location) console.log(`  location=${location}`);
console.log('');

const skipped = [];
const skip = (name, why) => { console.log(`  ----  ${name}\n          not evaluated: ${why}`); skipped.push(name); };

// ---------------------------------------------------------------------------
// DOOR TRIAGE, run before any content assertion.
//
// Per BIND-01: presence is not binding and binding is not correctness. Three
// failures wear completely different faces and must not print the same red:
//
//   WRONG DOOR  something answered, but it was not this endpoint — an auth
//               redirect or an app shell. Says NOTHING about the build.
//   ABSENT      this origin owns the route and the passport is not there — the
//               emitter did not run or the artefact was not copied into the image.
//   PRESENT     a real passport, now judged on its contents.
//
// Without this split, pointing the verifier at the wrong origin prints "status is
// 200 / body parses as JSON / Cache-Control is no-store" as four failures that read
// exactly like a build that shipped a broken passport. That is how a required gate
// starts passing or failing for reasons unrelated to the build.
// ---------------------------------------------------------------------------
const looksHtml = /^\s*(<!doctype html|<html[\s>])/i.test(bodyText) || ctype.includes('text/html');
const isRedirect = res.status >= 300 && res.status < 400;
const authRedirect = isRedirect && /login|signin|sign-in|auth/i.test(location);

let doorState = null;
let doorWhy = '';
if (authRedirect) {
  doorState = 'WRONG_DOOR_AUTH';
  doorWhy = `this origin answered ${res.status} -> ${location}. The request never reached the passport: it `
    + 'was intercepted by auth and sent to a login page. A browser or curl FOLLOWS that redirect and '
    + 'lands on the login shell, which is why this endpoint gets reported as "returns text/html" — the '
    + 'HTML is the login page, not the passport route. An origin that does this is running a build from '
    + 'before /chart/build-info.json was added to the auth whitelist.';
} else if (isRedirect) {
  doorState = 'WRONG_DOOR_REDIRECT';
  doorWhy = `this origin answered ${res.status} -> ${location || '(no Location header)'}. The passport route `
    + 'does not redirect; something in front of it is rewriting the request.';
} else if (looksHtml) {
  doorState = 'WRONG_DOOR_APP_SHELL';
  doorWhy = `served an HTML document under ${res.status} (${bytes} bytes). This is the SPA catch-all `
    + 'swallowing the route. A reader checking res.ok is satisfied and records a null SHA.';
} else if (res.status === 404) {
  doorState = 'PASSPORT_ABSENT';
  doorWhy = 'the route is not being intercepted and the passport is genuinely not there. This IS a build '
    + 'defect: the emitter did not run, or build-info.json was not copied into the runtime image.';
} else if (res.status !== 200) {
  doorState = 'UNREADABLE_STATUS';
  doorWhy = `origin answered ${res.status}, which is neither a passport nor a recognised interception.`;
}

if (doorState && doorState !== 'PASSPORT_ABSENT') {
  console.log(`  DIAGNOSIS  ${doorState}\n             ${doorWhy}\n`);
  skip('status is 200', 'wrong door — not the passport route');
  skip('content-type is JSON, not an HTML document', 'wrong door — not the passport route');
  skip('body is not an HTML document', 'wrong door — not the passport route');
  skip('body parses as JSON', 'wrong door — not the passport route');
  skip('sourceCommitSha is present and full 40-hex, not null', 'wrong door — not the passport route');
  skip('Cache-Control is no-store', 'wrong door — not the passport route');
} else if (doorState === 'PASSPORT_ABSENT') {
  console.log(`  DIAGNOSIS  ${doorState}\n             ${doorWhy}\n`);
  check('the passport exists at this origin', false, `got ${res.status} at ${url}`);
} else {
  check('status is 200', res.status === 200, `got ${res.status}`);

  check('content-type is JSON, not an HTML document', ctype.includes('json') && !looksHtml,
    `content-type was "${ctype}"`);

  // An empty body is not an HTML document, so a naive !looksHtml passes on nothing at all.
  // A check that goes green on zero bytes is the vacuous shape this file exists to refuse.
  check('body is not an HTML document', !looksHtml && bytes > 0,
    bytes === 0 ? 'body was empty — nothing was served to inspect' : '');

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
}

// A readable passport is not a verified one. Without an expected badge AND an expected
// SHA this run proves only that SOME build answers here — a stale deploy serves a
// perfectly readable passport. The seal step must bind, so refuse to report green unbound.
const unbound = !fail && !(EXPECT_BUILD && EXPECT_SHA);

const tail = skipped.length ? `, ${skipped.length} not evaluated` : '';
console.log(`\n================ PASSPORT-3 LIVE: ${pass} passed, ${fail} failed${tail} ================`);

if (doorState && doorState !== 'PASSPORT_ABSENT') {
  console.log(`\nTHIS IS NOT A VERDICT ON THE BUILD. Nothing was read from ${url}, so this run says`);
  console.log('nothing about what the deployed bytes contain — it says the verifier was pointed at an');
  console.log('origin that does not expose the passport. Point it at the soak target and re-run.');
} else if (fail) {
  console.log('\nThe soak must not start against this origin. A passport that cannot be read on the');
  console.log('wire is not a passport, and the harness would record a null SHA for ten hours.');
} else if (unbound) {
  console.log('\nREADABLE BUT UNBOUND. Every wire assertion holds, but this run was given no');
  console.log('--expect-build and/or no --expect-sha, so it did not check WHICH build answered.');
  console.log('Readability is not identity: a stale deploy serves a passport that passes all of the');
  console.log('above. For the seal, pass both expectations. To accept an unbound read, --allow-unbound.');
}

// Distinct exit codes so an operator, or a chain, can tell the three apart without reading
// prose. Any consumer treating non-zero as failure is unaffected.
//   1 = the build is wrong or the passport is broken   3 = wrong door, verdict not about the build
//   4 = readable but not bound to an expected build
const state = doorState
  ? doorState
  : fail ? 'PASSPORT_FAILED'
    : unbound && !args['allow-unbound'] ? 'READABLE_BUT_UNBOUND'
      : 'VERIFIED';
console.log(`\nPASSPORT3_STATE=${state}`);
// Set the code and let the loop drain rather than process.exit()ing on top of undici's
// still-closing keep-alive socket. On Windows that races libuv and aborts the process with
// "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\\win\\async.c" AND exit code
// -1073740791, reproducibly, AFTER printing 11 passed / 0 failed. A gate that prints a green
// verdict and hands back a crash code is a false red, and it would have failed the cut on a
// deployment that was correct. C runs this on Windows too.
process.exitCode = state === 'VERIFIED' ? 0
  : state === 'READABLE_BUT_UNBOUND' ? 4
    : (state === 'PASSPORT_FAILED' || state === 'PASSPORT_ABSENT') ? 1
      : 3;

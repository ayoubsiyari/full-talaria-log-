#!/usr/bin/env node
/**
 * Self-test for the served-capability gate.
 *
 * The gate exists to stop a soak measuring a build without the fix, so the thing that must be proven is
 * that it REFUSES - a gate that only ever passes is decoration, which is a defect I have shipped before
 * and now test for explicitly. Failure shapes are served from a local fixture rather than asserted
 * against the live origin: a test that asserts production is broken turns green when production is fixed.
 */
import http from 'node:http';
import { checkSpeed01Served, capabilityDigest, gradeRuntimeLadder } from './lib/served-capability.mjs';

const checks = [];
const gate = (name, pass, detail) => { checks.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

const WITH_LADDER = `
  const SPEED_GOV_LADDER_BPS = [1,2,3,4,5,6,7,8,9,10];
  function _speedGovNearestRung(v) { return v; }
  function normalizeSpeed(v) { return _speedGovNearestRung(v); }
  function migrateStoredSpeed(v) { return normalizeSpeed(v); }
  if (window.__TALARIA_SPEED_GOV_V1) { /* on */ }
`;
const WITHOUT_LADDER = 'function setSpeed(v) { this.speed = v; }\n'.repeat(40);
const SPA_SHELL = '<!doctype html><html><body>Boo! Page missing!</body></html>';

// A fixture origin that reproduces the real server's behaviour, including the trap: unknown paths under
// /chart/ answer 200 with the app shell rather than 404.
let mode = 'ladder';
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/chart/modules/replay-system.js')) {
    if (mode === 'missingfile') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(SPA_SHELL); return; }
    res.writeHead(200, { 'content-type': 'application/javascript' });
    res.end(mode === 'ladder' ? WITH_LADDER : WITHOUT_LADDER);
    return;
  }
  if (req.url.startsWith('/chart/modules/')) { res.writeHead(200, { 'content-type': 'application/javascript' }); res.end('// other engine file\n'); return; }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end(SPA_SHELL);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const markers = { file: '/chart/modules/replay-system.js', requires: ['SPEED_GOV_LADDER_BPS', '_speedGovNearestRung', 'normalizeSpeed', 'migrateStoredSpeed', '__TALARIA_SPEED_GOV_V1'], localMirror: 'does-not-exist.js' };

// CONTROL FIRST: a healthy build must clear, or every refusal below proves nothing.
mode = 'ladder';
let r = await checkSpeed01Served(ORIGIN, { markers });
gate('CONTROL: a build WITH the ladder passes', r.ok && r.state === 'PRESENT', `state ${r.state}, ${r.present.length}/5 markers`);

mode = 'noladder';
r = await checkSpeed01Served(ORIGIN, { markers });
gate('a build WITHOUT the ladder is REFUSED', !r.ok && r.state === 'MISSING_MARKERS', `state ${r.state}, missing ${r.missing.length}`);
gate('  and it names which markers are missing', r.missing?.length === 5, (r.missing || []).slice(0, 2).join(', ') + '...');

// The trap that produced the "376 KB with no ladder" reading.
mode = 'missingfile';
r = await checkSpeed01Served(ORIGIN, { markers });
gate('a 200-with-HTML (SPA fallback) is REFUSED as SPA_FALLBACK, not as a missing ladder', !r.ok && r.state === 'SPA_FALLBACK', `state ${r.state}`);
gate('  and it is NOT misreported as MISSING_MARKERS', r.state !== 'MISSING_MARKERS', 'a wrong path must not read as a build defect');

r = await checkSpeed01Served('http://127.0.0.1:9', { markers });
gate('an unreachable origin is REFUSED, never silently passed', !r.ok && r.state === 'UNREACHABLE', `state ${r.state}`);

// The capability digest must MOVE when an uncovered engine file moves — that is its whole purpose.
mode = 'ladder';
const d1 = await capabilityDigest(ORIGIN);
mode = 'noladder';
const d2 = await capabilityDigest(ORIGIN);
gate('the capability digest CHANGES when an engine file changes', d1.digest !== d2.digest, `${d1.digest.slice(0, 10)} -> ${d2.digest.slice(0, 10)}`);
mode = 'ladder';
const d3 = await capabilityDigest(ORIGIN);
gate('  and is stable when nothing changes', d1.digest === d3.digest, `${d3.digest.slice(0, 10)}`);

// Runtime grading.
gate('runtime: exact ladder 1..10 passes', gradeRuntimeLadder({ hasReplaySystem: true, ladder: [1,2,3,4,5,6,7,8,9,10] }).ok, null);
gate('runtime: a 60x ladder is REFUSED', !gradeRuntimeLadder({ hasReplaySystem: true, ladder: [1,2,5,10,30,60] }).ok, gradeRuntimeLadder({ hasReplaySystem: true, ladder: [1,2,5,10,30,60] }).why);
gate('runtime: no governor at all is REFUSED', !gradeRuntimeLadder({ hasReplaySystem: true, ladder: null, hasNearestRung: false, hasTargetGetter: false }).ok, null);
gate('runtime: private ladder accepted when snap fn AND getter are live', gradeRuntimeLadder({ hasReplaySystem: true, ladder: null, hasNearestRung: true, hasTargetGetter: true }).ok, null);
gate('runtime: no replaySystem is REFUSED', !gradeRuntimeLadder({ hasReplaySystem: false }).ok, null);

// SEAL-EVIDENCE-01: a pass must declare which kind of evidence it is. The two passing routes above
// are NOT the same strength, and reporting both as a bare `ok` is how presence gets quoted as
// behaviour. These assert the distinction is machine-readable rather than living in a comment.
{
  const observed = gradeRuntimeLadder({ hasReplaySystem: true, ladder: [1,2,3,4,5,6,7,8,9,10] });
  gate('evidence: an observed ladder is marked behavioural',
    observed.evidenceClass === 'LADDER_OBSERVED' && observed.behaviouralEvidence === true, observed.evidenceClass);

  const presence = gradeRuntimeLadder({ hasReplaySystem: true, ladder: null, hasNearestRung: true, hasTargetGetter: true });
  gate('evidence: the private-ladder pass is marked PRESENCE, not behaviour',
    presence.ok === true && presence.evidenceClass === 'CAPABILITY_PRESENT' && presence.behaviouralEvidence === false,
    presence.evidenceClass);

  gate('evidence: the two passing routes are distinguishable from each other',
    observed.evidenceClass !== presence.evidenceClass, `${observed.evidenceClass} vs ${presence.evidenceClass}`);

  const absent = gradeRuntimeLadder({ hasReplaySystem: false });
  gate('evidence: an unreadable page is its own class, not a capability verdict',
    absent.evidenceClass === 'UNREADABLE', absent.evidenceClass);
}

// Awaited, and the exit code is SET rather than forced. process.exit() while the fixture server was
// still closing tripped a libuv assertion, so a 13/13 run exited -1073740791 - a fully passing self-test
// returning a failure code, which any caller gating on exit status would read as red.
await new Promise((resolve) => server.close(resolve));
const passed = checks.filter((c) => c.pass).length;
console.log(`\n${passed}/${checks.length} passed`);
process.exitCode = passed === checks.length ? 0 : 1;

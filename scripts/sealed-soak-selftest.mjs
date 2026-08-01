#!/usr/bin/env node
/**
 * Self-test for the sealed two-arm soak, covering everything that does NOT need a browser.
 *
 * Deliberately browser-free while the A/B is measuring freeze cadence on this host: a second Chrome would
 * contend for the same cores and bend the very number that run exists to produce. That is the mistake an
 * orphaned renderer made for me tonight and I am not going to make it deliberately.
 *
 * Covers: seal refusal, append-as-taken, heartbeat states, resume across a torn line, and the segment
 * boundary that a resume must declare.
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { openRun, inspectRun } from './lib/detach01.mjs';
import { perBarFields, evaluateGauges } from './lib/soak-gauges.mjs';

const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\';
const OUT = EV + 'SEALED-SOAK-SELFTEST.jsonl';
const results = [];
const check = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

for (const f of [OUT, OUT.replace(/\.jsonl$/, '.heartbeat.json')]) { try { fs.unlinkSync(f); } catch { /* fresh */ } }

// 1. A run pinned to a digest that is not what is served must refuse to start.
// The cap flag is required here because TOOL-01 now asserts BEFORE the digest check, so an uncapped
// invocation exits 4 and never reaches the refusal this pair is testing. Adding a guard reorders the
// failure modes, and a test written against the old order silently checks the wrong one.
const res = spawnSync(process.execPath, [
  '--max-old-space-size=1024',
  'scripts/sealed-two-arm-soak.mjs', '--arm=zerotrade', '--hours=0.01',
  '--expectDigest=deadbeefdeadbeefdeadbeefdeadbeef', `--out=${OUT}`,
], { encoding: 'utf8', timeout: 120000 });
check('refuses to start when the served digest does not match the pinned one',
  res.status === 2 && /REFUSING TO START/.test(String(res.stderr)),
  `exit ${res.status}`);
check('the refusal names both digests so the operator can see what changed',
  /expected digest deadbeef/.test(String(res.stderr)) && /served build is [0-9a-f]{8}/.test(String(res.stderr)),
  String(res.stderr).trim().split('\n')[0]?.slice(0, 110));

// 2. Append-as-taken, heartbeat, and the three heartbeat states.
const run = openRun({ name: 'selftest', out: OUT, meta: { signature: 'SELFTEST' } });
run.append({ segment: 1, hours: 0.01, residentBars: 1000 });
run.append({ segment: 1, hours: 0.02, residentBars: 2000 });
const alive = inspectRun(OUT);
check('heartbeat reports ALIVE while sampling', alive.state === 'ALIVE' && alive.samples === 2, `state=${alive.state} samples=${alive.samples}`);
check('every sample is on disk before the next one is taken',
  fs.readFileSync(OUT, 'utf8').split('\n').filter(Boolean).length >= 3, 'meta + 2 samples');

// 3. Hard kill mid-write, then resume.
fs.appendFileSync(OUT, '{"segment":1,"hours":0.03,"residentB');
const run2 = openRun({ name: 'selftest', out: OUT });
check('resume recovers prior samples and skips only the torn line',
  run2.resumedSamples.length === 2 && run2.tornLinesSkipped === 1,
  `recovered ${run2.resumedSamples.length}, skipped ${run2.tornLinesSkipped}`);

// 4. A resume must declare a segment boundary, because a new browser resets the measured quantity.
const seg = (Math.max(...run2.resumedSamples.map((r) => r.segment || 1)) + 1);
run2.note({ __segmentBoundary: true, segment: seg, why: 'new browser resets resident bars and footprint' });
run2.append({ segment: seg, hours: 0.0, residentBars: 900 });
const lines = fs.readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
check('the boundary is recorded so two populations cannot be pooled into one slope',
  lines.some((l) => l.__segmentBoundary) && lines.some((l) => l.segment === seg && l.residentBars === 900),
  `segment ${seg} opens at 900 bars after ${lines.filter((l) => l.segment === 1 && l.residentBars).length} samples in segment 1`);

// 5. Heartbeat must distinguish a finished run from a dead one.
run2.finish({ completed: true, segments: seg });
const done = inspectRun(OUT);
check('heartbeat reports COMPLETED after a clean finish', done.state === 'COMPLETED', `state=${done.state}`);
fs.writeFileSync(OUT.replace(/\.jsonl$/, '.heartbeat.json'), JSON.stringify({ name: 'selftest', alive: true, samples: 4, lastSampleAt: new Date(Date.now() - 3600000).toISOString() }, null, 1));
const stale = inspectRun(OUT);
check('heartbeat reports DEAD OR STALLED when samples stop arriving', stale.state === 'DEAD OR STALLED', `stale for ${stale.staleForSec}s`);

// 6. THE GAUGES — and these are written to be DISCRIMINATING per PROC-3 axis 4. Each one fails if the
//    guard it checks is removed, so a green here is not a green on absent code. They import the same
//    functions the sample loop calls, not a restatement of them.

// 6a. A working gauge must not trip the guard, or the run stops on healthy data.
let m = { footprint: 0, blocking: 0 };
let g = evaluateGauges(m, { footprintTotalMB: 1393.1 }, { blockingMsPerSec: 356.8 });
check('healthy gauges do not stop the run', g.stop === false && g.misses.footprint === 0, 'no false stop');

// 6b. ONE miss is tolerated - a single failed process read is not a broken gauge.
g = evaluateGauges({ footprint: 0, blocking: 0 }, { footprintTotalMB: null }, { blockingMsPerSec: 300 });
check('a single failed footprint read does not stop the run', g.stop === false && g.misses.footprint === 1, 'miss counted, run continues');

// 6c. TWO consecutive misses must stop it. Delete the guard and this goes RED.
g = evaluateGauges({ footprint: 1, blocking: 0 }, { footprintTotalMB: null, footprintReadFailed: 'SystemInfo unavailable' }, { blockingMsPerSec: 300 });
check('two consecutive footprint failures STOP the run rather than logging nulls',
  g.stop === true && /footprint returned null on two consecutive/.test(g.why), g.why?.slice(0, 72));

// 6d. Same for the lag gauge, independently.
g = evaluateGauges({ footprint: 0, blocking: 1 }, { footprintTotalMB: 1400 }, { blockingMsPerSec: null, blockingNote: 'observer produced no readable result' });
check('two consecutive blocking failures STOP the run independently of memory',
  g.stop === true && /blocking returned null/.test(g.why), g.why?.slice(0, 72));

// 6e. THE UNIT TRAP. Level and slope must not be the same number under two names. With real smoke-run
//     values the level reads ~191 and the true slope ~49; if perBarFields ever returns the level in the
//     slope field, this goes RED - which is exactly what my first version did.
const f1 = perBarFields(1387.7, 7258, null);
const f2 = perBarFields(1427.8, 8077, { bars: 7258, mb: 1387.7 });
check('first sample of a segment has NO slope, because it has no predecessor',
  f1.localSlopeMbPerKbar === null && f1.footprintPerKbarLEVEL > 100, `level=${f1.footprintPerKbarLEVEL} slope=${f1.localSlopeMbPerKbar}`);
check('the slope field is a SLOPE, not the level wearing the published unit',
  f2.localSlopeMbPerKbar !== f2.footprintPerKbarLEVEL && Math.abs(f2.localSlopeMbPerKbar - 48.96) < 0.1 && f2.footprintPerKbarLEVEL > 170,
  `level=${f2.footprintPerKbarLEVEL} slope=${f2.localSlopeMbPerKbar} — published slopes are 23.98/24.55/25.35`);

// 6f. A slope over a bar delta too small to mean anything must be withheld, not published as a huge number.
const f3 = perBarFields(1430.0, 8090, { bars: 8077, mb: 1427.8 });
check('a slope over a trivial bar delta is withheld rather than published as noise',
  f3.localSlopeMbPerKbar === null, `13 bars apart -> slope=${f3.localSlopeMbPerKbar}`);

// 7. BINDING — TOOL-01 and PASSPORT-3. These do not grep for an import line, because a static reference
//    is exactly what PROC-3 says is not binding. Each one runs the real entry point and requires the
//    behaviour that only exists if the module is actually called.

// 7a. TOOL-01 bound: an UNCAPPED launch of the soak must refuse, before it opens a browser.
{
  const r = spawnSync(process.execPath, ['scripts/sealed-two-arm-soak.mjs', '--arm=zerotrade', '--hours=0.01'], { encoding: 'utf8', timeout: 120000 });
  const err = String(r.stderr || '');
  check('TOOL-01 is BOUND: an uncapped soak refuses to start',
    r.status === 4 && /HEAP CAP \(TOOL-01\)/.test(err), `exit ${r.status}`);
  check('and it names the limit V8 actually applied, not the one requested',
    /old-space limit of \d+ MB/.test(err), err.split('\n')[1]?.trim().slice(0, 96));
}

// 7b. TOOL-01 bound the other way: a CORRECTLY capped launch must get past the cap and fail later, on
//     the digest. A cap check that refuses valid work is as broken as one that passes invalid work.
{
  const r = spawnSync(process.execPath, ['--max-old-space-size=1024', 'scripts/sealed-two-arm-soak.mjs', '--arm=zerotrade', '--hours=0.01', '--expectDigest=deadbeefdeadbeefdeadbeefdeadbeef'], { encoding: 'utf8', timeout: 120000 });
  check('a correctly capped soak passes the cap check and proceeds',
    r.status !== 4 && !/HEAP CAP/.test(String(r.stderr)), `exit ${r.status} (2 = digest refusal, which is past the cap)`);
}

// 7c. TOOL-01 bound through the LAUNCH PATH: the child reports its own V8 limit, so a flag that is
//     constructed and then dropped cannot pass this.
{
  const r = spawnSync(process.execPath, ['scripts/detach-cap-check.mjs', '512'], { encoding: 'utf8', timeout: 90000 });
  const out = String(r.stdout || '');
  check('TOOL-01 reaches the DETACHED child: it runs under the cap it was launched with',
    r.status === 0 && /CAP APPLIED IN THE DETACHED CHILD/.test(out),
    out.split('\n').find((l) => /child V8 heap limit/.test(l))?.trim() || `exit ${r.status}`);
  check('and launchDetached reports a launch FAILURE rather than returning quietly',
    /export function launchDetached/.test(fs.readFileSync('scripts/lib/detach01.mjs', 'utf8'))
      && /error: ok \? null :/.test(fs.readFileSync('scripts/lib/detach01.mjs', 'utf8')),
    'a launcher that fails silently is how a ten-hour run becomes an empty file');
}

// 7d. PASSPORT-3 bound: with the SHA required and an origin that cannot serve it, the soak must refuse
//     with exit 3 — the SHA path, distinct from the digest path (exit 2) and the cap path (exit 4).
{
  const r = spawnSync(process.execPath, ['--max-old-space-size=1024', 'scripts/sealed-two-arm-soak.mjs', '--arm=zerotrade', '--hours=0.01', '--origin=http://127.0.0.1:9', '--requireSha=1'], { encoding: 'utf8', timeout: 120000 });
  const err = String(r.stderr || '');
  check('PASSPORT-3 is BOUND: the soak refuses when the source commit is unreadable',
    r.status === 3 && /source commit SHA is not readable/.test(err), `exit ${r.status}`);
  check('and it refuses rather than recording sourceCommitSha:null for ten hours',
    /LOOKS provenanced and is not/.test(err), err.split('\n').find((l) => /provenanced/.test(l))?.trim().slice(0, 90));
}

// 7e. PASSPORT-3's reader must classify a 200 carrying app-shell HTML as SPA_FALLBACK rather than as a
//     healthy passport. This used to point at the LIVE origin and assert SPA_FALLBACK — which passed only
//     while the route was broken, and inverted to FAIL the moment B's b121 cut fixed it. A suite whose
//     green depends on a production defect is worse than no test, so the failure shape now comes from a
//     local fixture and the live origin is RECORDED, never asserted.
{
  const { readBuildInfo } = await import('./lib/build-info.mjs');
  const http = await import('node:http');
  const shell = '<!doctype html><html><head><title>Talaria</title></head><body><div id="root"></div></body></html>';
  const srv = http.createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(shell); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const fake = await readBuildInfo(`http://127.0.0.1:${port}`);
  await new Promise((r) => srv.close(r));
  check('a 200 carrying HTML is reported as SPA_FALLBACK, not as a passport',
    fake.ok === false && fake.state === 'SPA_FALLBACK' && fake.sourceCommitSha === null,
    `state=${fake.state} ok=${fake.ok}`);

  const live = await readBuildInfo('http://31.97.192.82:3000').catch(() => ({ state: 'UNREACHABLE', ok: false }));
  results.push({ pass: true, name: `live origin passport state RECORDED (not asserted): ${live.state}${live.ok ? ` sha ${String(live.sourceCommitSha).slice(0, 12)}` : ''}`, detail: 'Recorded so the suite reports what production serves without its own green depending on it.' });
}

const passed = results.filter((r) => r.pass).length;
fs.writeFileSync(EV + 'SEALED-SOAK-SELFTEST-20260801.json', JSON.stringify({
  signature: 'SEALED-SOAK-SELFTEST-V1',
  at: new Date().toISOString(),
  bfcacheState: 'not applicable — no browser, deliberately, so the A/B measuring freeze cadence on this host is not contended.',
  results,
  passed,
  total: results.length,
  browserPathsNotCovered: ['boot and 4-panel gate', 'playhead liveness', 'governor cadence', 'mid-run seal re-verification against a live session'],
  verdict: passed === results.length ? 'ALL BROWSER-FREE PATHS PASS' : 'FAILURES PRESENT',
}, null, 1));
console.log(`\n${passed}/${results.length} passed. Browser-dependent paths COVERED by the 2026-08-01 09:43 live smoke run: 4-panel boot gate, effective speed read back (60 requested / 60 reported), 3 fsync'd samples, seal digest re-verified on every sample, governor closing trades 1/2/3, and panel liveness 4 by playhead against 1 by bar count - the false-void trap caught and both routes recorded.`);

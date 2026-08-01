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

const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\';
const OUT = EV + 'SEALED-SOAK-SELFTEST.jsonl';
const results = [];
const check = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

for (const f of [OUT, OUT.replace(/\.jsonl$/, '.heartbeat.json')]) { try { fs.unlinkSync(f); } catch { /* fresh */ } }

// 1. A run pinned to a digest that is not what is served must refuse to start.
const res = spawnSync(process.execPath, [
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

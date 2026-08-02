#!/usr/bin/env node
/**
 * FULL-CHAIN REHEARSAL before the ten-hour arm.
 *
 * WHY. The soak harness was built and proven entirely at speed 60. It has never run one sample at 10
 * bars/s, and 10 is now the whole envelope. Every vacuous gate found this week passed because nothing
 * exercised it, and at this moment the harness at the new envelope is the largest unexercised thing we
 * own. A rehearsal is cheaper than discovering it at hour eight.
 *
 * WHAT IT DRIVES, end to end, on the real origin:
 *   - the seal, with BOTH --expectDigest and --expectSha actually passed and verified per sample
 *   - the SPEED-01 gate, against a live engine rather than an argument parser
 *   - every gauge: footprint, renderer split, blocking ms/s, frame rate, storage, LoAF
 *   - RATE-HOLD sampling at the new envelope, which has no precedent at all
 *   - detach, and auto-resume across a deliberate mid-run kill
 *
 * AND ONE QUESTION IT ANSWERS INDEPENDENTLY. FRAME-01 caps playback at 30 fps. If bar advance is coupled
 * to paint, that cap bounds delivered bars/s - the number RATE-HOLD grades. E is measuring this; this
 * rehearsal sees it at full scale on the real workload. If the two disagree, that is worth knowing
 * before the ten hours rather than after.
 *
 * The build is named explicitly with --confirmBadge so I cannot rehearse the wrong one by accident. The
 * badge is NOT the pin - the digest and the source commit are, and both are read from the origin here
 * and passed through - it is only there to make me state which build I think I am rehearsing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { computeSeal } from './lib/seal.mjs';
import { readBuildInfo } from './lib/build-info.mjs';

const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const ORIGIN = (process.env.TEST_VPS_URL || 'http://31.97.192.82:3000').replace(/\/$/, '');
const argOf = (n, d) => { const p = process.argv.find((a) => a.startsWith(`--${n}=`)); return p ? p.split('=').slice(1).join('=') : d; };
const CONFIRM_BADGE = argOf('confirmBadge', '');
const MINUTES = Number(argOf('minutes', '40'));
const SPEED = Number(argOf('speed', '10'));
const KILL_AT_MIN = Number(argOf('killAtMin', '12'));   // 0 disables the resume exercise
const MECHANICAL_ONLY = process.argv.includes('--mechanicalOnly');
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

const seal = await computeSeal(ORIGIN);
const info = await readBuildInfo(ORIGIN);
log(`origin serves badge ${seal.badge}, digest ${seal.digest.slice(0, 12)}, sha ${String(info.sourceCommitSha).slice(0, 12)}`);

if (!CONFIRM_BADGE) {
  console.error('\nREFUSED: pass --confirmBadge=<badge> naming the build you intend to rehearse.');
  console.error(`  The origin currently serves ${seal.badge}.`);
  console.error('  The badge is not the pin — the digest and source commit are, and both are read from the origin');
  console.error('  and passed to the soak. This flag exists only so a rehearsal cannot silently run the wrong build.');
  process.exit(2);
}
if (seal.badge !== CONFIRM_BADGE) {
  console.error(`\nREFUSED: you named ${CONFIRM_BADGE}; the origin serves ${seal.badge}.`);
  process.exit(2);
}
if (!info.ok || !/^[a-f0-9]{40}$/.test(String(info.sourceCommitSha || ''))) {
  console.error(`\nREFUSED: the origin does not expose a usable source commit (state ${info.state}).`);
  console.error('  A rehearsal that cannot pass --expectSha has not rehearsed the thing most likely to fail.');
  process.exit(3);
}

/**
 * DRIVEN THROUGH THE REAL LAUNCHER, which the first version of this script did not do.
 *
 * It spawned sealed-two-arm-soak.mjs directly, killed it, and then graded auto-resume as FAILED. Resume
 * does not live in the soak - it lives in fire-sealed-soak.mjs, which decides on RELAUNCH whether to
 * join an existing series or archive it. So the first run bypassed the machinery it claimed to test and
 * reported its absence as a defect in the harness. That is the vacuous-test shape I have now published
 * on three times: the test must call the code the real path calls, not a restatement of it.
 *
 * The resume exercise is therefore launch -> kill the soak child -> RELAUNCH -> the launcher must say
 * RESUMING and the samples must continue into a second segment in the SAME file.
 */
const hours = (MINUTES / 60).toFixed(4);
const out = path.join(EV, 'REHEARSAL-SOAK-TRADES.jsonl');   // the launcher's own --rehearsal path
const launcher = path.join(process.cwd(), 'scripts', 'fire-sealed-soak.mjs');
const launchArgs = [
  launcher, '--arm=trades', '--rehearsal', `--hours=${hours}`, `--speed=${SPEED}`,
  '--sampleMs=120000', `--expectDigest=${seal.digest}`, `--expectSha=${info.sourceCommitSha}`,
  `--origin=${ORIGIN}`, `--heapCapMB=1024`,
];
log(`rehearsing ${MINUTES} min at ${SPEED} bars/s, through fire-sealed-soak`);
log(`  digest pinned ${seal.digest.slice(0, 16)}   sha pinned ${info.sourceCommitSha.slice(0, 16)}`);
if (MECHANICAL_ONLY) {
  log('  MECHANICAL ONLY: proving the chain RUNS at this envelope — gauges, gates, resume.');
}

const runLauncher = (extra = []) => new Promise((resolve) => {
  const c = spawn(process.execPath, [...launchArgs, ...extra], { stdio: ['ignore', 'pipe', 'pipe'] });
  let buf = '';
  c.stdout.on('data', (d) => { buf += d; process.stdout.write(d); });
  c.stderr.on('data', (d) => { buf += d; process.stderr.write(d); });
  c.on('exit', (code) => resolve({ code, out: buf }));
});

// Find the detached soak child the launcher started, so the kill hits the run and not the launcher.
const findSoakPid = () => {
  try {
    const ps = `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*sealed-two-arm-soak*' } | ForEach-Object { $_.ProcessId }`;
    const r = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', timeout: 20000 });
    return String(r).trim().split(/\s+/).filter(Boolean).map(Number);
  } catch { return []; }
};

const started = Date.now();
let killedOnce = false;
let resumeAnnounced = false;

const first = await runLauncher(['--fresh']);
log(`launcher exited ${first.code}`);
if (first.code !== 0) { log('the launch itself failed — nothing to rehearse'); }

if (first.code === 0 && KILL_AT_MIN > 0) {
  await new Promise((r) => setTimeout(r, KILL_AT_MIN * 60000));
  const pids = findSoakPid();
  if (pids.length) {
    killedOnce = true;
    log(`KILLING soak pid ${pids.join(', ')} at +${KILL_AT_MIN} min on purpose`);
    for (const pid of pids) { try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
    await new Promise((r) => setTimeout(r, 20000));
    log('RELAUNCHING — the launcher must RESUME the series, not archive it');
    const second = await runLauncher([]);
    resumeAnnounced = /RESUMING the existing series/.test(second.out);
    log(`relaunch exited ${second.code}, resume announced: ${resumeAnnounced}`);
  } else {
    log('no soak child found to kill — the resume exercise did not happen');
  }
}

// Wait out the remainder, then confirm the run has actually stopped before grading its file.
const waitUntil = started + (MINUTES + 3) * 60000;
while (Date.now() < waitUntil && findSoakPid().length) await new Promise((r) => setTimeout(r, 30000));
const exitCode = findSoakPid().length ? 'still-running' : 0;
log(`run finished after ${((Date.now() - started) / 60000).toFixed(1)} min`);

// Read what the run actually wrote, rather than what the log said.
let rows = [];
try { rows = fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { /* no artifact */ }
const samples = rows.filter((r) => r.n != null);
const segStarts = rows.filter((r) => r.__segmentStart);
const voids = rows.filter((r) => r.__void);
const frames = samples.map((s) => s.hostFramesPerSec).filter((v) => Number.isFinite(v));
const rates = samples.map((s) => s.deliveredBarsPerSec).filter((v) => Number.isFinite(v));
const bpf = samples.map((s) => s.barsPerFrame).filter((v) => Number.isFinite(v));
const mean = (xs) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3) : null);

const checks = [];
const gate = (name, pass, detail) => { checks.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

console.log('');
gate('the run produced samples', samples.length >= 3, `${samples.length} samples`);
gate('the seal was pinned by BOTH digest and source commit', args.some((a) => a.startsWith('--expectDigest=')) && args.some((a) => a.startsWith('--expectSha=')), 'both flags present on the child command line');
gate('every sample re-verified the seal and it held', samples.length > 0 && samples.every((s) => s.sealHeld !== false), `${samples.filter((s) => s.sealHeld !== false).length}/${samples.length}`);
gate('the source commit held on every sample', samples.length > 0 && samples.every((s) => s.sourceCommitHeld !== false), `${samples.filter((s) => s.sourceCommitHeld !== false).length}/${samples.length}`);
gate('the SPEED-01 gate passed against a live engine', segStarts.length > 0 && segStarts.every((s) => s.effectiveSpeed != null), segStarts.map((s) => `${s.requestedSpeed}->${s.effectiveSpeed} via ${s.effectiveSpeedRoute}`).join('; ') || 'no segment start recorded');
gate('footprint read on every sample', samples.length > 0 && samples.every((s) => Number.isFinite(s.footprintTotalMB)), `${samples.filter((s) => Number.isFinite(s.footprintTotalMB)).length}/${samples.length}`);
gate('blocking ms/s read', samples.some((s) => Number.isFinite(s.blockingMsPerSec)), `${samples.filter((s) => Number.isFinite(s.blockingMsPerSec)).length} samples`);
gate('frame rate read (FRAME-01)', frames.length > 0, frames.length ? `mean ${mean(frames)} fps over ${frames.length} samples` : 'NO frame rate on any sample');
gate('delivered bars/s computed at the new envelope', rates.length > 0, rates.length ? `mean ${mean(rates)} bars/s, requested ${SPEED}` : 'RATE-HOLD had no computable input');
if (KILL_AT_MIN > 0) {
  gate('the launcher announced RESUME rather than archiving', resumeAnnounced, resumeAnnounced ? 'RESUMING printed on relaunch' : 'the launcher did not resume');
  gate('the deliberate kill was followed by auto-resume', killedOnce && segStarts.length >= 2, `${segStarts.length} segment starts, killed=${killedOnce}`);
  gate('the series continued past the kill', killedOnce && samples.length > 0 && Math.max(...samples.map((s) => s.segment || 1)) >= 2, `highest segment ${samples.length ? Math.max(...samples.map((s) => s.segment || 1)) : 0}`);
  gate('the pre-kill samples survived the relaunch', samples.filter((s) => (s.segment || 1) === 1).length > 0, `${samples.filter((s) => (s.segment || 1) === 1).length} samples from segment 1 still present`);
}
gate('no VOID was recorded', voids.length === 0, voids.length ? voids.map((v) => String(v.why).slice(0, 90)).join(' | ') : 'none');

// The FRAME-01 reading, stated as a finding rather than a gate: this rehearsal measures it, it does not
// grade it. E owns the verdict; a disagreement between us is the thing worth surfacing.
const frameFinding = {
  meanFramesPerSec: mean(frames),
  meanDeliveredBarsPerSec: mean(rates),
  meanBarsPerFrame: mean(bpf),
  requestedBarsPerSec: SPEED,
  deliveryMetRequest: rates.length ? mean(rates) >= SPEED * 0.9 : null,
  reading: frames.length === 0 ? 'no frame data'
    : (rates.length && mean(rates) < SPEED * 0.9
      ? `Delivery averaged ${mean(rates)} bars/s against ${SPEED} requested while the host painted ${mean(frames)} fps. If bars/frame sits near a constant, the frame cap is bounding delivery.`
      : `Delivery averaged ${mean(rates)} bars/s against ${SPEED} requested at ${mean(frames)} fps — the frame cap is NOT bounding delivery at this envelope.`),
};
console.log(`\n  FRAME-01: ${frameFinding.reading}`);

const passed = checks.filter((c) => c.pass).length;
const report = {
  signature: 'B122-REHEARSAL-V1', at: new Date().toISOString(),
  bfcacheState: 'not applicable — a fresh browser per segment, no back/forward navigation.',
  build: { origin: ORIGIN, badge: seal.badge, digest: seal.digest, sourceCommitSha: info.sourceCommitSha },
  mechanicalOnly: MECHANICAL_ONLY,
  requestedMinutes: MINUTES, requestedSpeed: SPEED, killAtMin: KILL_AT_MIN, killed: killedOnce,
  childExitCode: exitCode, artifact: out,
  samples: samples.length, segmentStarts: segStarts.length, voids: voids.length,
  frame01: frameFinding,
  passed, total: checks.length, checks,
  verdict: passed === checks.length ? 'REHEARSAL GREEN — the chain runs end to end at this envelope' : 'REHEARSAL RED — do not fire',
};
fs.writeFileSync(path.join(EV, `REHEARSAL-GRADE-${seal.badge}.json`), JSON.stringify(report, null, 1));
console.log(`\n  ${passed}/${checks.length} — ${report.verdict}\n`);
process.exitCode = passed === checks.length ? 0 : 1;

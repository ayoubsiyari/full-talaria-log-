#!/usr/bin/env node
/**
 * SWEEP-QUEUE — runs the SWEEP-01 sweeps serially in the ruling's priority order.
 *
 * NIGHT-01 still binds even though the night is over and the PO is awake: serial only, explicit
 * --max-old-space-size so an OOM is a loud error rather than a disappearance, a hard per-sweep
 * timeout, and a sweep that dies is recorded VOID with its reason while the queue moves on.
 *
 * Order is the ruling's: S3, S1, S5, S2, S4. If the queue overruns, items fall off the BOTTOM.
 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EVIDENCE = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const STAMP = '20260731';
const NODE_ARGS = ['--max-old-space-size=4096'];

/** Point counts drive the timeout: 12 min a point plus 4 min boot, plus a 25% margin. */
const QUEUE = [
  { id: 'S3', points: 4, why: 'indicator dose-response — confirms or kills Monster 2 with a curve' },
  { id: 'S1', points: 5, why: 'speed — settles bars-versus-clock for the whole plan' },
  { id: 'S5', points: 3, why: 'history depth at load — nearly free, three page loads', pointMinutes: 0 },
  { id: 'S2', points: 3, why: 'panel count — linear or superlinear decides the defect class' },
  { id: 'S4', points: 2, why: 'same-pair vs different-pair — do the twenty guards buy anything' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function killTree(pid) {
  try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', timeout: 20_000 }); } catch { /* gone */ }
}

function killStrayChrome() {
  try {
    execSync('powershell -NoProfile -Command "Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq \'\' } | Stop-Process -Force"',
      { stdio: 'ignore', timeout: 30_000 });
  } catch { /* none */ }
}

function freeMemGb() {
  try {
    const out = execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory"',
      { encoding: 'utf8', timeout: 15_000 });
    const kb = Number(String(out).trim());
    return Number.isFinite(kb) && kb > 0 ? +(kb / 1048576).toFixed(2) : null;
  } catch { return null; }
}

const manifestPath = path.join(EVIDENCE, `SWEEP-QUEUE-MANIFEST-${STAMP}.json`);
const manifest = {
  signature: 'SWEEP-QUEUE-V1',
  ruling: '3df92902c SWEEP-01',
  startedAtIso: new Date().toISOString(),
  order: QUEUE.map((q) => q.id),
  orderProvenance: 'Ruling order by information per minute: B1 (already banked), S3, S1, S5, S2, S4.',
  nodeArgs: NODE_ARGS,
  sweeps: [],
};
const save = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
save();

for (const q of QUEUE) {
  const pointMinutes = q.pointMinutes ?? 12;
  const timeoutMin = Math.ceil((q.points * (pointMinutes + 4)) * 1.25) + 5;
  const out = path.join(EVIDENCE, `SWEEP-${q.id}-${STAMP}.json`);
  const log = path.join(EVIDENCE, `SWEEP-${q.id}-${STAMP}.log`);
  const entry = {
    id: q.id, why: q.why, points: q.points, pointMinutes, timeoutMin, out, log,
    startedAtIso: new Date().toISOString(), freeMemGbAtStart: freeMemGb(), status: 'RUNNING',
  };
  manifest.sweeps.push(entry);
  save();
  console.error(`\n=== ${q.id} START (${q.why}) — ${q.points} points x ${pointMinutes}min, timeout ${timeoutMin}min ===`);

  killStrayChrome();
  const fd = fs.openSync(log, 'a');
  const args = [...NODE_ARGS, 'scripts/sweep-runner.mjs', `--sweep=${q.id}`, `--point-minutes=${pointMinutes}`, `--out=${out}`];
  const child = spawn(process.execPath, args, { cwd: process.cwd(), stdio: ['ignore', fd, fd] });
  const startedAt = Date.now();

  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, timeoutMin * 60_000);
  // eslint-disable-next-line no-await-in-loop -- serial by NIGHT-01
  const code = await new Promise((resolve) => {
    child.on('exit', (c) => resolve(c));
    child.on('error', () => resolve(-1));
  });
  clearTimeout(timer);
  fs.closeSync(fd);

  entry.endedAtIso = new Date().toISOString();
  entry.elapsedMin = +((Date.now() - startedAt) / 60_000).toFixed(1);
  entry.exitCode = code;
  entry.freeMemGbAtEnd = freeMemGb();

  // A sweep whose artifact carries a grade finished its measurement even if the process then
  // died in teardown. That distinction cost a full soak's credibility last night.
  let graded = null;
  try {
    const art = JSON.parse(fs.readFileSync(out, 'utf8'));
    graded = art.grade || null;
    entry.usablePoints = graded?.usablePoints ?? (art.points || []).filter((p) => p.status === 'OK').length;
    entry.sweepVoid = graded?.sweepVoid ?? null;
    entry.measurementComplete = !!graded;
  } catch { entry.measurementComplete = false; }

  if (timedOut) entry.status = entry.measurementComplete ? 'OK_TEARDOWN_HUNG' : 'VOID';
  else if (code === 0) entry.status = 'OK';
  else entry.status = entry.measurementComplete ? 'OK_TEARDOWN_HUNG' : 'VOID';
  if (entry.status === 'VOID') entry.reason = timedOut ? `exceeded ${timeoutMin}min timeout` : `exit code ${code}`;
  save();
  console.error(`=== ${q.id} ${entry.status} in ${entry.elapsedMin}min (usable points ${entry.usablePoints ?? '?'}${entry.reason ? `, ${entry.reason}` : ''}) ===`);

  killStrayChrome();
  // eslint-disable-next-line no-await-in-loop -- let the OS reclaim before the next sweep boots
  await sleep(20_000);
}

manifest.endedAtIso = new Date().toISOString();
save();
console.error('\nSWEEP QUEUE COMPLETE');
for (const s of manifest.sweeps) console.error(`  ${s.id} ${s.status} ${s.elapsedMin}min points=${s.usablePoints ?? '?'}`);

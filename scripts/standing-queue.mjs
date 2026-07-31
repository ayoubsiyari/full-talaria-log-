#!/usr/bin/env node
/**
 * STANDING-QUEUE — items 8 and 10 of the SWEEP-01 matrix, serially, after the sweeps.
 *
 * Waits for a pid to exit first when --after-pid is given, so the standing scenarios start the
 * moment the sweep queue finishes without two heavy sessions ever overlapping. NIGHT-01 rules
 * hold: serial, memory-capped, hard timeout, VOID with a reason and move on.
 *
 * Cheapest and most decisive first, and torture last because it is an upper bound rather than an
 * answer: if the queue overruns, the item that falls off is the one nothing depends on.
 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EVIDENCE = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const STAMP = '20260731';
const NODE_ARGS = ['--max-old-space-size=4096'];

const QUEUE = [
  { id: 'teardown', timeoutMin: 30, why: 'residue hypothesis, measured cleanly for the first time' },
  { id: 'seekrewind', timeoutMin: 25, why: 'the duration-gate rewind defect, chased at last' },
  { id: 'pancold', timeoutMin: 25, why: 'EVICT-03 reversibility half' },
  { id: 'idle', timeoutMin: 25, why: 'idle baseline foreground' },
  { id: 'background', timeoutMin: 25, why: 'the PO 1.24 GB / 18.8% backgrounded tab, unexplained' },
  { id: 'torture', timeoutMin: 30, why: 'upper bound before canary; nothing depends on it' },
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

function pidAlive(pid) {
  try {
    const out = execSync(`powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction SilentlyContinue) -ne $null"`,
      { encoding: 'utf8', timeout: 15_000 });
    return /true/i.test(String(out).trim());
  } catch { return false; }
}

const afterPid = Number((process.argv.find((a) => a.startsWith('--after-pid=')) || '').split('=')[1] || 0);
if (afterPid) {
  console.error(`[standing] waiting for pid ${afterPid} (sweep queue) to exit before starting`);
  let waited = 0;
  while (pidAlive(afterPid) && waited < 8 * 60 * 60_000) {
    // eslint-disable-next-line no-await-in-loop -- this is the wait
    await sleep(60_000);
    waited += 60_000;
  }
  console.error(`[standing] pid ${afterPid} gone after ${Math.round(waited / 60_000)}min; starting`);
  await sleep(30_000);
}

const manifestPath = path.join(EVIDENCE, `STANDING-QUEUE-MANIFEST-${STAMP}.json`);
const manifest = {
  signature: 'STANDING-QUEUE-V1',
  ruling: '3df92902c SWEEP-01 items 8 and 10',
  startedAtIso: new Date().toISOString(),
  order: QUEUE.map((q) => q.id),
  scenarios: [],
};
const save = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
save();

for (const q of QUEUE) {
  const log = path.join(EVIDENCE, `STANDING-${q.id.toUpperCase()}-${STAMP}.log`);
  const out = path.join(EVIDENCE, `STANDING-${q.id.toUpperCase()}-${STAMP}.json`);
  const entry = { id: q.id, why: q.why, timeoutMin: q.timeoutMin, log, out, startedAtIso: new Date().toISOString(), status: 'RUNNING' };
  manifest.scenarios.push(entry);
  save();
  console.error(`\n=== ${q.id} START (${q.why}) timeout ${q.timeoutMin}min ===`);
  killStrayChrome();

  const fd = fs.openSync(log, 'a');
  const child = spawn(process.execPath, [...NODE_ARGS, 'scripts/standing-scenarios.mjs', `--scenario=${q.id}`],
    { cwd: process.cwd(), stdio: ['ignore', fd, fd] });
  const startedAt = Date.now();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, q.timeoutMin * 60_000);
  // eslint-disable-next-line no-await-in-loop -- serial by NIGHT-01
  const code = await new Promise((resolve) => {
    child.on('exit', (c) => resolve(c));
    child.on('error', () => resolve(-1));
  });
  clearTimeout(timer);
  fs.closeSync(fd);

  entry.elapsedMin = +((Date.now() - startedAt) / 60_000).toFixed(1);
  entry.exitCode = code;
  try {
    const art = JSON.parse(fs.readFileSync(out, 'utf8'));
    entry.artifactStatus = art.status ?? null;
    entry.measurementComplete = art.status === 'OK' || !!(art.trends || art.verdict || art.correctness);
  } catch { entry.measurementComplete = false; }
  if (timedOut) entry.status = entry.measurementComplete ? 'OK_TEARDOWN_HUNG' : 'VOID';
  else if (code === 0) entry.status = 'OK';
  else entry.status = entry.measurementComplete ? 'OK_TEARDOWN_HUNG' : 'VOID';
  if (entry.status === 'VOID') entry.reason = timedOut ? `exceeded ${q.timeoutMin}min timeout` : `exit code ${code}`;
  entry.endedAtIso = new Date().toISOString();
  save();
  console.error(`=== ${q.id} ${entry.status} in ${entry.elapsedMin}min ===`);
  killStrayChrome();
  // eslint-disable-next-line no-await-in-loop
  await sleep(15_000);
}

manifest.endedAtIso = new Date().toISOString();
save();
console.error('\nSTANDING QUEUE COMPLETE');
for (const s of manifest.scenarios) console.error(`  ${s.id} ${s.status} ${s.elapsedMin}min`);

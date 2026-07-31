#!/usr/bin/env node
/**
 * BASELINE-QUEUE — the 09:15 queue, machine half, run serially and unattended.
 *
 * PULL-01: this exists so the machine takes the next item the moment it goes idle rather than waiting
 * for a dispatch. NIGHT-01 still binds: one heavy scenario at a time, an explicit heap cap on every
 * child, a hard timeout, and a scenario that dies is recorded VOID with its reason while the queue
 * continues.
 *
 * It first supersedes the SWEEP-01 queue. S1 and S5 are kept because they are not slope work under the
 * new priority — S1 IS item 1's curve and S5 IS item 8's baseline half — but S2 and S4 are dropped, so
 * this waits for S5 to land and then stops the old queue rather than letting it start S2.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\';
const SWEEP_MANIFEST = `${EV}SWEEP-QUEUE-MANIFEST-20260731.json`;
const MANIFEST = `${EV}BASELINE-QUEUE-MANIFEST-20260731.json`;
const LOG = `${EV}BASELINE-QUEUE-20260731.log`;
const SWEEP_QUEUE_PID = Number(process.env.C_SWEEP_QUEUE_PID || 0);
/** Which sweep we let finish before superseding the old queue. */
const WAIT_FOR_SWEEP = process.env.C_WAIT_FOR_SWEEP || 'S5';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${s}`;
  console.error(line);
  try { fs.appendFileSync(LOG, `${line}\n`); } catch { /* best effort */ }
};

const QUEUE = [
  {
    id: 'WORKER-GAUGE-VALIDATION',
    why: 'GATE-01 for the new worker-heap gauge: it must see a known ballast inside a worker before any number it reports is trusted',
    script: 'scripts/worker-heap-validation.mjs',
    timeoutMin: 12,
    heapMb: 2048,
  },
  {
    id: 'BASELINE-CENSUS',
    why: 'items 3 and 6: R-1 residency buckets and the baseline composition table with a named residual',
    script: 'scripts/baseline-census.mjs',
    timeoutMin: 35,
    heapMb: 4096,
  },
  {
    id: 'SESSION-RESET',
    why: 'item 7: does logout discard the realm in practice, storage bytes across three sessions, first-paint cost at each',
    script: 'scripts/session-reset-probe.mjs',
    timeoutMin: 40,
    heapMb: 4096,
  },
];

function alive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function sweepStatus(id) {
  try {
    const m = JSON.parse(fs.readFileSync(SWEEP_MANIFEST, 'utf8'));
    const s = (m.sweeps || []).find((x) => x.id === id);
    return s ? s.status : null;
  } catch { return null; }
}

async function killTree(pid) {
  if (!pid) return;
  await new Promise((r) => {
    const k = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    k.on('exit', () => r());
    setTimeout(r, 8_000);
  });
}

async function killStrayChrome() {
  await new Promise((r) => {
    const k = spawn('powershell', ['-NoProfile', '-Command',
      "Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq '' } | Stop-Process -Force -ErrorAction SilentlyContinue"],
    { stdio: 'ignore' });
    k.on('exit', () => r());
    setTimeout(r, 15_000);
  });
}

const manifest = {
  signature: 'BASELINE-QUEUE-V1',
  ruling: 'cbfdb81f4 — baseline over slope',
  startedAtIso: new Date().toISOString(),
  supersedes: 'SWEEP-QUEUE-V1 items S2 and S4 (panel count, symbol config). Both are slope work and both fall below every item in the 09:15 queue.',
  keptFromSweepQueue: 'S1 (it is item 1 curve) and S5 (it is item 8 baseline half)',
  order: QUEUE.map((q) => q.id),
  items: [],
};
const save = () => fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));

(async () => {
  save();
  log(`baseline queue up. waiting for ${WAIT_FOR_SWEEP} to land before superseding the sweep queue (pid ${SWEEP_QUEUE_PID || 'unknown'}).`);

  // ---- Phase 1: let S5 finish, then supersede -------------------------------
  const waitDeadline = Date.now() + 150 * 60_000;
  for (;;) {
    const st = sweepStatus(WAIT_FOR_SWEEP);
    if (st && st !== 'RUNNING') { log(`${WAIT_FOR_SWEEP} finished with status ${st}. superseding.`); break; }
    if (!alive(SWEEP_QUEUE_PID) && SWEEP_QUEUE_PID) { log('sweep queue is already gone. proceeding.'); break; }
    if (Date.now() > waitDeadline) { log(`waited 150 min without ${WAIT_FOR_SWEEP} landing; superseding anyway so the baseline items are not starved.`); break; }
    await sleep(30_000);
  }
  manifest.supersededAtIso = new Date().toISOString();
  manifest.sweepStatusAtSupersede = {
    S1: sweepStatus('S1'), S5: sweepStatus('S5'), S2: sweepStatus('S2'), S4: sweepStatus('S4'),
  };
  save();

  if (alive(SWEEP_QUEUE_PID)) {
    log(`stopping sweep queue pid ${SWEEP_QUEUE_PID} and its children so S2 never starts.`);
    await killTree(SWEEP_QUEUE_PID);
    await sleep(5_000);
  }
  await killStrayChrome();
  await sleep(10_000);

  // ---- Phase 2: the baseline items, serially -------------------------------
  for (const item of QUEUE) {
    const entry = {
      id: item.id, why: item.why, script: item.script, timeoutMin: item.timeoutMin,
      startedAtIso: new Date().toISOString(), status: 'RUNNING',
    };
    manifest.items.push(entry);
    save();

    if (!fs.existsSync(item.script)) {
      entry.status = 'VOID';
      entry.void = 'script not present — written later than the queue was launched';
      entry.endedAtIso = new Date().toISOString();
      log(`${item.id} VOID: script missing (${item.script})`);
      save();
      continue;
    }

    const outLog = `${EV}${item.id}-20260731.log`;
    const fd = fs.openSync(outLog, 'a');
    entry.log = outLog;
    const child = spawn(process.execPath, [`--max-old-space-size=${item.heapMb}`, item.script], {
      cwd: process.cwd(), stdio: ['ignore', fd, fd],
    });
    log(`${item.id} started pid ${child.pid} cap ${item.heapMb}MB timeout ${item.timeoutMin}min — ${item.why}`);
    entry.pid = child.pid;
    save();

    let timedOut = false;
    const timer = setTimeout(async () => { timedOut = true; await killTree(child.pid); }, item.timeoutMin * 60_000);
    const code = await new Promise((r) => child.on('exit', (c) => r(c)));
    clearTimeout(timer);
    try { fs.closeSync(fd); } catch { /* already closed */ }

    entry.exitCode = code;
    entry.endedAtIso = new Date().toISOString();
    entry.elapsedMin = +((Date.now() - Date.parse(entry.startedAtIso)) / 60_000).toFixed(1);
    entry.status = timedOut ? 'VOID_TIMEOUT' : (code === 0 ? 'OK' : 'VOID_EXIT');
    if (timedOut) entry.void = `exceeded ${item.timeoutMin} min and was killed; the next item proceeds per NIGHT-01`;
    log(`${item.id} ${entry.status} in ${entry.elapsedMin}min (exit ${code})`);
    save();

    await killStrayChrome();
    await sleep(15_000);
  }

  manifest.finishedAtIso = new Date().toISOString();
  save();
  log('baseline queue complete.');
  process.exit(0);
})();

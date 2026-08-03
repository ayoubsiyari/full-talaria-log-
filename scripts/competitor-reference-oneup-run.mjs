#!/usr/bin/env node
/**
 * Takes all three reference arms in ONE box slot, in one order, at one set of
 * settings — because the arms are only comparable if nothing about the host
 * changed between them, and three separately queued runs across an evening on a
 * machine other lanes are also using cannot promise that.
 *
 * Order matters: ours-1up, then TradingView-1up, then ours-4up. The headline pair
 * runs first and adjacent, so if the slot is lost partway the thing we lose is
 * our own scaling curve rather than the comparison itself.
 *
 *   node scripts/competitor-reference-oneup-run.mjs
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { waitForBox } from './lib/box-availability.mjs';
import { clockOf, stampUtc } from './lib/clock.mjs';
import {
  evaluate as evaluateQueue,
  readNodeProcesses,
  readState as readQueueState,
  writeState as writeQueueState,
} from './measurement-queue.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const EVIDENCE = path.join(REPO_ROOT, 'docs/plan3/evidence');
const ARENA = path.join(__dirname, 'competitor-arena-reference.mjs');

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const RUN_NAME = 'competitor-reference-arms';
const WAIT_MAX_MS = Number(argOf('wait-max', String(180 * 60 * 1000)));
const TV_URL = argOf('tv-url', 'https://www.tradingview.com/chart/');

/** One set of settings for every arm. Changing one here changes all three. */
const COMMON = ['--dpr=2', '--width=1440', '--height=960', '--settle=20000', '--idle-samples=1', '--idle-interval=30000'];

const ARMS = [
  {
    key: 'ours-1up',
    out: path.join(EVIDENCE, 'reference-ours-1up.json'),
    args: ['--self', '--panels=1', '--label=ours-1up', '--warmup=20000'],
  },
  {
    key: 'tradingview-1up',
    out: path.join(EVIDENCE, 'reference-tradingview-1up.json'),
    // A longer warmup than our own arm: a third-party chart has to fetch its own
    // data over the network before it has drawn anything worth measuring, and an
    // undrawn page measured early is the ARM_DREW_NOTHING failure.
    args: [`--url=${TV_URL}`, '--panels=1', '--label=tradingview-1up', '--warmup=60000'],
  },
  {
    key: 'ours-4up',
    out: path.join(EVIDENCE, 'reference-ours-4up.json'),
    args: ['--self', '--panels=4', '--label=ours-4up', '--warmup=20000'],
  },
];

const log = (...a) => console.log(`[reference-run ${clockOf(new Date(), { seconds: true })}]`, ...a);

function claim() {
  // In-process, using C's own evaluator with self set: the CLI classifies this
  // wrapper as an unclaimed measurement run and refuses to let it claim, which
  // is a deadlock rather than a disagreement.
  const verdict = evaluateQueue({
    state: readQueueState(), procs: readNodeProcesses(), owner: 'A', self: process.pid,
  });
  if (!verdict.mayRun) return { ok: false, state: verdict.state, why: `${verdict.state}: ${verdict.detail || ''}` };
  const state = readQueueState();
  state.claim = { owner: 'A', run: RUN_NAME, pid: process.pid, eta: '12m', at: stampUtc() };
  writeQueueState(state);
  return { ok: true, state: verdict.state };
}

async function main() {
  log(`three arms, one slot: ${ARMS.map((a) => a.key).join(' -> ')}`);
  const gate = await waitForBox({ owner: 'A', waitMaxMs: WAIT_MAX_MS, log });
  if (!gate.free) {
    // The state, not a guess at it: this line once printed WAIT_TIMEOUT six
    // minutes into a 180-minute budget because `free` was absent from the
    // success path and `why` was undefined on it.
    log(`${gate.state} after ${Math.round(gate.waitedMs / 60000)}m — ${gate.why}`);
    process.exitCode = 2;
    return;
  }
  /**
   * Waiting for the box is not the same as waiting for your turn. An empty box
   * with another lane's reservation ahead of you is `NOT_YOUR_TURN`, and a wrapper
   * that exits on it has to be relaunched by a human who happens to be watching —
   * so the slot sits open while the run that wanted it is dead. Poll the queue on
   * the same budget instead.
   */
  const claimDeadline = Date.now() + WAIT_MAX_MS;
  let got = claim();
  let saidWhy = '';
  while (!got.ok) {
    if (!/NOT_YOUR_TURN|UNCLAIMED_RUN|QUEUE_HELD/.test(got.why || '')) {
      log(`QUEUE_REFUSED — ${got.why}`);
      process.exitCode = 2;
      return;
    }
    if (Date.now() > claimDeadline) {
      log(`QUEUE_WAIT_TIMEOUT after ${Math.round(WAIT_MAX_MS / 60000)}m — ${got.why}`);
      process.exitCode = 2;
      return;
    }
    if (got.why !== saidWhy) { log(`waiting for my turn — ${got.why}`); saidWhy = got.why; }
    await new Promise((r) => setTimeout(r, 60_000));
    const box = await waitForBox({ owner: 'A', waitMaxMs: Math.max(0, claimDeadline - Date.now()), log });
    if (!box.free) {
      log(`${box.state} after ${Math.round(box.waitedMs / 60000)}m — ${box.why}`);
      process.exitCode = 2;
      return;
    }
    got = claim();
  }
  log(`claimed the queue as A/${RUN_NAME} pid ${process.pid} (${got.state})`);

  const ran = [];
  try {
    for (const arm of ARMS) {
      log(`arm ${arm.key} -> ${path.basename(arm.out)}`);
      const res = spawnSync(process.execPath, [ARENA, ...arm.args, ...COMMON, `--out=${arm.out}`], {
        cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'],
      });
      ran.push({ arm: arm.key, exit: res.status, artifact: arm.out, exists: fs.existsSync(arm.out) });
      log(`arm ${arm.key} exit ${res.status}`);
      // The arms must not overlap on the GPU: a settle wait measures decommit,
      // and a second browser starting during it would be measured as our floor.
      await new Promise((r) => setTimeout(r, 15_000));
    }
  } finally {
    try {
      const rel = execFileSync(process.execPath, [path.join(__dirname, 'measurement-queue.mjs'), 'release', '--owner=A', `--run=${RUN_NAME}`], { encoding: 'utf8' });
      log(String(rel).trim().split('\n')[0]);
    } catch (e) { log(`release failed: ${e.message}`); }
  }

  const report = spawnSync(process.execPath, [
    path.join(__dirname, 'competitor-reference-report.mjs'),
    `--ours-1up=${ARMS[0].out}`,
    `--tv-1up=${ARMS[1].out}`,
    `--ours-4up=${ARMS[2].out}`,
    `--out=${path.join(EVIDENCE, 'competitor-reference-oneup.json')}`,
  ], { cwd: REPO_ROOT, encoding: 'utf8' });
  process.stdout.write(report.stdout || '');
  process.stderr.write(report.stderr || '');
  log(`arms: ${ran.map((r) => `${r.arm}=${r.exit}`).join(' ')}`);
  process.exitCode = report.status === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}

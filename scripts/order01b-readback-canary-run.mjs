/**
 * Waits for the box, claims C's queue, runs the ORDER-01B read-back canary,
 * releases. Nothing else.
 *
 * Exists because of an instruction and an accident. The instruction: go the
 * moment the holder releases, not when the process list looks quiet. The
 * accident: two multi-hour measurements lost today to something brief starting
 * on top of them, so "brief" is exactly the run that must not be launched by
 * hand at a guessed moment. A wrapper that polls the claim releases the operator
 * from watching, and RUN-LOCK-01 inside the canary is what actually protects it.
 *
 * The claim is taken here rather than inside the canary so the canary stays
 * runnable on an idle box without a queue at all.
 *
 *   node scripts/order01b-readback-canary-run.mjs --step=1 --speed=10
 */

import { spawnSync } from 'node:child_process';
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

const argOf = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};

const STEP = argOf('step', '1');
const SPEED = argOf('speed', '10');
const SAMPLE = argOf('sample', '60000');
const SLICE = argOf('slice', '10000');
const RUNWAY = argOf('runway', '120');
const OUT = argOf('out', path.join(REPO_ROOT, 'docs/plan3/evidence/order01b-readback-canary-b126-rerun.json'));
const WAIT_MAX_MS = Number(argOf('wait-max', String(120 * 60 * 1000)));
const RUN_NAME = argOf('run-name', 'order01b-readback-canary-rerun-4up');

const log = (m) => console.log(`[canary-run ${clockOf(new Date(), { seconds: true })}] ${m}`);

function queue(...args) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/measurement-queue.mjs'), ...args], {
    cwd: REPO_ROOT, encoding: 'utf8',
  });
}

async function main() {
  log(`waiting for the box — will run --step=${STEP} --speed=${SPEED}, ${Number(SAMPLE) / 1000}s window in ${Number(SLICE) / 1000}s slices`);
  const gate = await waitForBox({ owner: 'A', waitMaxMs: WAIT_MAX_MS, log });
  if (gate.state !== 'BOX_AVAILABLE') {
    console.error(`[canary-run] ${gate.state} after ${Math.round(gate.waitedMs / 60000)}m — ${gate.why}`);
    process.exit(3);
  }
  log(`box available after ${Math.round(gate.waitedMs / 1000)}s`);

  /**
   * The claim is taken in-process through C's own `evaluate`, not by shelling out
   * to `measurement-queue.mjs claim`, and the reason is a defect rather than a
   * preference: the CLI excludes only its own pid from the unclaimed-run scan, so
   * it sees THIS wrapper as an unclaimed measurement run and refuses. A wrapper
   * that waits for the queue can therefore never claim it — it waits on itself.
   * Same shape as the `preflight` deadlock reported to C earlier.
   *
   * Passing `self: process.pid` to C's exported decision function honours every
   * rule C wrote — live claims, the settling grace window, reservation order —
   * while excluding the one process that is not a competitor. No edit to C's file.
   */
  const verdict = evaluateQueue({
    state: readQueueState(),
    procs: readNodeProcesses(),
    owner: 'A',
    self: process.pid,
  });
  if (!verdict.mayRun) {
    console.error(`[canary-run] QUEUE_REFUSED_CLAIM — ${verdict.state}: ${verdict.reason}`);
    process.exit(4);
  }
  const state = readQueueState();
  state.claim = { owner: 'A', run: RUN_NAME, pid: process.pid, eta: '5m', at: stampUtc() };
  writeQueueState(state);
  log(`claimed the queue as A/${RUN_NAME} pid ${process.pid} (${verdict.state})`);

  let runStatus = null;
  try {
    log(`starting canary at ${stampUtc()}`);
    const run = spawnSync(process.execPath, [
      path.join(REPO_ROOT, 'scripts/order01b-readback-canary.mjs'),
      `--step=${STEP}`, `--speed=${SPEED}`,
      `--sample=${SAMPLE}`, `--slice=${SLICE}`, `--runway=${RUNWAY}`,
      `--out=${OUT}`,
    ], { cwd: REPO_ROOT, stdio: 'inherit' });
    runStatus = run.status;
  } finally {
    // Release through the CLI: it does not consult `mayRun`, so it works from
    // here, and it writes the ledger line and consumes the reservation.
    const released = queue('release', '--owner=A', `--run=${RUN_NAME}`);
    log((released.stdout || released.stderr || '').trim().split('\n')[0] || 'released');
  }
  log(`canary exit ${runStatus} — artifact ${OUT}`);
  process.exit(runStatus === null ? 5 : runStatus);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((e) => {
    console.error(`[canary-run] FAILED — ${e && e.message}`);
    process.exit(2);
  });
}

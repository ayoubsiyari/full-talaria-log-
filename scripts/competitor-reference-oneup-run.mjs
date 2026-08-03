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

const REPEATS = Number(argOf('repeats', '3'));

/**
 * Four arms: the like-for-like pair, and our own 1 -> 2 -> 4 curve on the same
 * probe and scenario. The marginal cost per added panel is the figure no
 * competitor can supply, because no free tier will render four charts — and it is
 * the figure that decides whether a four-up total is four charts or one chart plus
 * fixed cost.
 */
const ARM_SPECS = [
  { key: 'ours-1up', args: ['--self', '--panels=1', '--label=ours-1up', '--warmup=20000'] },
  {
    key: 'tradingview-1up',
    // A longer warmup than our own arm: a third-party chart fetches its own data
    // over the network before it has drawn anything worth measuring, and an
    // undrawn page measured early is the ARM_DREW_NOTHING failure.
    args: [`--url=${TV_URL}`, '--panels=1', '--label=tradingview-1up', '--warmup=60000'],
  },
  { key: 'ours-2up', args: ['--self', '--panels=2', '--label=ours-2up', '--warmup=20000'] },
  { key: 'ours-4up', args: ['--self', '--panels=4', '--label=ours-4up', '--warmup=20000'] },
];

/**
 * Round-robin rather than three of each in a block. Repeats of one arm taken
 * back to back share whatever the host was doing in that window, so a block
 * ordering confounds arm with time and the bands come out tight and wrong.
 * Spreading each arm's repeats across the whole slot makes host drift hit every
 * arm alike, which is what lets the intervals be compared at all.
 */
/**
 * A top-up run replaces specific readings rather than the whole series: after the
 * 21:10+01:00 pass, ours-1up needed two more rounds to be a band at all and two arms
 * had to be retaken because they ran beside a foreign instrument. `--round-start`
 * keeps the new files from overwriting readings that were clean.
 */
const ONLY = (argOf('arms', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const ROUND_START = Number(argOf('round-start', '1'));

const ARMS = [];
for (let round = ROUND_START; round < ROUND_START + REPEATS; round++) {
  for (const spec of ARM_SPECS) {
    if (ONLY.length && !ONLY.includes(spec.key)) continue;
    ARMS.push({
      key: spec.key,
      round,
      out: path.join(EVIDENCE, `reference-${spec.key}-r${round}.json`),
      args: spec.args,
    });
  }
}

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
  // An eta the queue can hold others to: 4 arms x REPEATS rounds, roughly two
  // minutes each plus the 15s gaps that keep two browsers off the GPU at once.
  const etaMin = Math.ceil((ARMS.length * 135) / 60);
  state.claim = { owner: 'A', run: RUN_NAME, pid: process.pid, eta: `${etaMin}m`, at: stampUtc() };
  writeQueueState(state);
  return { ok: true, state: verdict.state };
}

async function main() {
  log(`${new Set(ARMS.map((a) => a.key)).size} arms x ${REPEATS} rounds, one slot, round-robin: `
    + `${ARMS.map((a) => `${a.key}#${a.round}`).join(' -> ')}`);
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
      log(`arm ${arm.key} round ${arm.round}/${REPEATS} -> ${path.basename(arm.out)}`);
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

  // Every round that produced a file, whether or not its arm succeeded: the
  // assembler names and drops a bad run itself, which is better than a wrapper
  // deciding silently which readings the report is allowed to see.
  // Every artifact for this arm on disk, not only the ones this invocation wrote:
  // a top-up must add to the band rather than replace it, and the assembler is the
  // thing that decides which readings are admissible.
  const group = (key) => fs.readdirSync(EVIDENCE)
    .filter((f) => new RegExp(`^reference-${key}-r\\d+\\.json$`).test(f))
    .map((f) => path.join(EVIDENCE, f)).join(',');
  const report = spawnSync(process.execPath, [
    path.join(__dirname, 'competitor-reference-report.mjs'),
    `--ours-1up=${group('ours-1up')}`,
    `--tv-1up=${group('tradingview-1up')}`,
    `--ours-2up=${group('ours-2up')}`,
    `--ours-4up=${group('ours-4up')}`,
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

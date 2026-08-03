#!/usr/bin/env node
// SEAL-EVIDENCE-01: RUNTIME_TOOL — spawns real OS processes against the real
// lock implementations on disk. It measures acquisition under simultaneous
// start and nothing else; it is not evidence about any instrument's behaviour.
console.log('SEAL-EVIDENCE-01 EVIDENCE CLASS: RUNTIME_TOOL — real concurrent processes against the on-disk locks; measures acquisition only.');

/**
 * LOCK-RACE-COMPARE — how many processes think they won the same lock?
 *
 * Three lanes built a run lock inside ninety minutes on 2026-08-03. Sequential
 * tests pass on all of them, because the easy case is "start a second run after
 * the first is established". The case that cost us runs is two launches landing
 * together, and that one is only visible by racing real processes.
 *
 * A correct lock yields exactly one winner per round. Anything above one is a
 * lock that admits the duplicate launch it was written to stop.
 *
 * Reading the numbers honestly:
 *  - This UNDERSTATES run-lock.mjs. Its reclaim paths (LOCK_STALE_RECLAIMED,
 *    LOCK_UNPARSEABLE_RECLAIMED) hold the lock but are counted here as refusals,
 *    because only LOCK_ACQUIRED is scored as a win.
 *  - Racers hold briefly on purpose. A winner that exits immediately releases,
 *    and the losers then acquire legitimately in turn — which looks like several
 *    winners and blames the lock for the harness being impatient.
 *
 *   node scripts/lock-race-compare.mjs [racers=12] [rounds=6]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const N = Number(process.argv[2] || 12);
const ROUNDS = Number(process.argv[3] || 6);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lockrace-'));

const IMPLS = [
  {
    id: 'single-launch-lock.mjs (B) — openSync wx + mid-creation retry',
    file: path.join(ROOT, 'scripts/lib/single-launch-lock.mjs'),
    body: (dir) => `
      import { acquireRunLock } from '%SPEC%';
      const [, startAt] = process.argv.slice(2);
      while (Date.now() < Number(startAt)) {}
      try { acquireRunLock('raced', { dir: ${JSON.stringify(dir)} }); console.log('WON'); }
      catch { console.log('refused'); }
      setTimeout(() => {}, 900);
    `,
  },
  {
    id: 'run-lock.mjs (A) — openSync wx, reclaims an unparseable holder',
    file: path.join(ROOT, 'scripts/lib/run-lock.mjs'),
    body: (dir) => `
      import { acquireRunLock } from '%SPEC%';
      const [, startAt] = process.argv.slice(2);
      while (Date.now() < Number(startAt)) {}
      const l = acquireRunLock({ artifact: ${JSON.stringify(path.join(dir, 'artifact.json'))}, script: 'raced' });
      console.log(l.state === 'LOCK_ACQUIRED' ? 'WON' : 'refused');
      setTimeout(() => {}, 900);
    `,
  },
];

async function round(impl, i) {
  const dir = path.join(TMP, `${i}`);
  fs.mkdirSync(dir, { recursive: true });
  const script = path.join(dir, 'racer.mjs');
  fs.writeFileSync(script, impl.body(dir).replace('%SPEC%', pathToFileURL(impl.file).href));
  const startAt = Date.now() + 700;
  const wins = await Promise.all(Array.from({ length: N }, () => new Promise((res) => {
    let buf = '';
    const p = spawn(process.execPath, [script, dir, String(startAt)]);
    p.stdout.on('data', (d) => { buf += d; });
    p.on('close', () => res(buf.includes('WON') ? 1 : 0));
  })));
  return wins.reduce((a, b) => a + b, 0);
}

let anyLeak = false;
for (const impl of IMPLS) {
  if (!fs.existsSync(impl.file)) { console.log(`SKIP (absent): ${impl.id}\n`); continue; }
  const results = [];
  for (let i = 0; i < ROUNDS; i += 1) results.push(await round(impl, `${IMPLS.indexOf(impl)}-${i}`));
  const bad = results.filter((w) => w !== 1);
  if (bad.length) anyLeak = true;
  console.log(impl.id);
  console.log(`  winners per round (${N} racers x ${ROUNDS} rounds): ${results.join(', ')}`);
  console.log(`  rounds with != 1 winner: ${bad.length}/${ROUNDS}`
    + `${bad.length ? '   <-- DUPLICATE LAUNCHES ADMITTED' : '   correct'}\n`);
}

fs.rmSync(TMP, { recursive: true, force: true });
process.exit(anyLeak ? 1 : 0);

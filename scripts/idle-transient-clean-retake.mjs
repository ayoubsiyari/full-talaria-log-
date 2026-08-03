#!/usr/bin/env node
/**
 * IDLE-TRANSIENT-CLEAN-RETAKE — the settle-window series C is blocked on.
 *
 * I told C that a 30-90 s settle window is a hazard and 2-3 minutes is safe.
 * That guidance came entirely from contended runs, so I withdrew it rather than
 * let C bake it into every soak reading. This is the re-take on an exclusive
 * host, and it is three arms because direction is not universal: at dpr 1 the
 * four-panel total FELL (411.59 -> 396.52 MB by idle+30s) while at dpr 2 it ROSE
 * (460.33 -> 489.58, GPU 142.5 -> 183.5). A window calibrated at one dpr will
 * misread the other, and C is building that window into the soak.
 *
 * Each arm is the committed arena instrument with its own artifact, so the
 * evidence carries its own provenance and lock state rather than relying on this
 * wrapper. The wrapper's only job is to wait for the box and to keep the arms
 * strictly sequential — two arms at once would measure each other.
 *
 * Waits on BOTH gates, because they fail differently: the run lock catches lanes
 * that adopted it, and C's queue catches lanes that have not. My own scan read
 * BOX_FREE at 14:35+01:00 while D's suite was live between browser launches --
 * browser observation is a point-in-time check and a measurement process between
 * launches is invisible to it.
 *
 *   node scripts/idle-transient-clean-retake.mjs
 *   node scripts/idle-transient-clean-retake.mjs --arms=dpr1 --samples=4   # short
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clockOf, stampUtc } from './lib/clock.mjs';
// The wait moved to lib/ when a second wrapper needed it. One implementation:
// writing this twice is how three lock systems ended up live on one box.
import { waitForBox } from './lib/box-availability.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const argOf = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};

const SAMPLES = Number(argOf('samples', '12'));
const INTERVAL = Number(argOf('idle-interval', '30000'));
const ONLY = (argOf('arms', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const WAIT_MAX_MS = Number(argOf('wait-max', String(90 * 60 * 1000)));

/** dpr 2 twice: it is the arm whose direction reversed, so it needs the n. */
const ARMS = [
  { id: 'dpr1', dpr: 1, label: 'self-idle-clean-dpr1' },
  { id: 'dpr2', dpr: 2, label: 'self-idle-clean-dpr2' },
  { id: 'dpr2b', dpr: 2, label: 'self-idle-clean-dpr2-repeat' },
];

const log = (m) => console.log(`[idle-retake ${clockOf(new Date(), { seconds: true })}] ${m}`);

async function main() {
  log(`three arms, ${SAMPLES} idle samples at ${INTERVAL / 1000}s each, sequential`);
  const gate = await waitForBox({ owner: 'A', waitMaxMs: WAIT_MAX_MS, log });
  if (gate.state !== 'BOX_AVAILABLE') {
    console.error(`[idle-retake] ${gate.state} after ${Math.round(gate.waitedMs / 60000)}m — ${gate.why}`);
    process.exit(3);
  }
  log(`box available after ${Math.round(gate.waitedMs / 1000)}s`);

  const results = [];
  for (const arm of ARMS) {
    if (ONLY.length && !ONLY.includes(arm.id)) continue;
    const out = path.join(REPO_ROOT, `docs/plan3/evidence/idle-transient-clean-${arm.id}.json`);
    const args = [
      path.join(REPO_ROOT, 'scripts/competitor-arena-reference.mjs'),
      '--self', `--label=${arm.label}`, '--panels=4', `--dpr=${arm.dpr}`,
      '--settle=20000', `--idle-samples=${SAMPLES}`, `--idle-interval=${INTERVAL}`,
      `--out=${out}`, '--wait-for-host=1800000',
    ];
    log(`arm ${arm.id} starting (dpr ${arm.dpr})`);
    const r = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: REPO_ROOT });
    results.push({ arm: arm.id, dpr: arm.dpr, exit: r.status, artifact: out, at: stampUtc() });
    log(`arm ${arm.id} exit ${r.status}`);
    // A refusal is not a reason to keep going: the arms are only comparable if
    // each one had the box to itself.
    if (r.status === 3) { log('refused by the lock — stopping rather than running the rest contended'); break; }
  }
  log(`done: ${results.map((r) => `${r.arm}=${r.exit}`).join(' ')}`);
  process.exitCode = results.some((r) => r.exit !== 0) ? 1 : 0;
}

/**
 * Main-module guard, absent from the first version, which cost a stray browser: a
 * smoke test that merely IMPORTED this file booted an arm, because top-level
 * `main()` runs on import. Anything that launches a browser needs this.
 */
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((e) => { console.error(`[idle-retake] FAILED — ${e && e.message}`); process.exit(2); });
}

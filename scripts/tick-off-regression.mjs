/**
 * TICK-OFF-01 blast radius.
 *
 *   node scripts/tick-off-regression.mjs
 *
 * The kill changes a DEFAULT, so any suite that assumed tick-by-default can go
 * red without anything being broken. This runs each candidate suite twice —
 * once on my tree and once on the two product files restored from the base
 * commit — so a red is attributed to the change or to the base, never guessed.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const COPIES = [
  'chart v 1.4/chart/modules/replay-system.js',
  'homepage/public/chart/modules/replay-system.js',
];

const SUITES = [
  'chart v 1.4/chart/modules/lag-setinterval-tick.test.mjs',
  'chart v 1.4/chart/modules/m19-i-g2-tick-speed-coherence.test.mjs',
  'chart v 1.4/chart/modules/b75-po-v5-1d-tick-speed-routing.red.test.mjs',
  'chart v 1.4/chart/modules/replay-mode-switch-price.test.mjs',
  'chart v 1.4/chart/modules/m17-di2-completed-bar-guard.test.mjs',
  'chart v 1.4/chart/modules/m20-q9-prefix-slice.test.mjs',
  'chart v 1.4/chart/modules/m20-q6-replay-lifecycle-binding.test.mjs',
  'chart v 1.4/chart/modules/m28-replay-hidden-pause.test.mjs',
  'chart v 1.4/chart/modules/m27-engine-release.test.mjs',
  'chart v 1.4/chart/modules/m2-canonical-replay-mark.test.mjs',
  'chart v 1.4/chart/modules/m19-h-timeframe-switch.test.mjs',
  'chart v 1.4/chart/modules/replay-autoscroll-right-gap.test.mjs',
  'chart v 1.4/chart/modules/replay-crop-refresh-restore.test.mjs',
  'chart v 1.4/chart/modules/m10-runtime-pnl-replay-frame.test.mjs',
  'chart v 1.4/chart/modules/m19-persist-trim-contract.test.mjs',
];

function run(suite) {
  if (!fs.existsSync(path.join(ROOT, suite))) return { verdict: 'MISSING', pass: 0, fail: 0 };
  try {
    const out = execFileSync(
      process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap', suite],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 },
    );
    return { verdict: 'GREEN', ...tally(out), failed: [] };
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`;
    if (e.killed || /ETIMEDOUT/.test(String(e.message))) return { verdict: 'TIMEOUT', pass: 0, fail: 0, failed: [] };
    return { verdict: 'RED', ...tally(out), failed: namesOfFailures(out) };
  }
}
function tally(out) {
  const p = /^# pass (\d+)$/m.exec(out);
  const f = /^# fail (\d+)$/m.exec(out);
  return { pass: p ? +p[1] : 0, fail: f ? +f[1] : 0 };
}
function namesOfFailures(out) {
  return out.split(/\r?\n/)
    .map((l) => /^not ok \d+ - (.+)$/.exec(l.trim()))
    .filter(Boolean).map((m) => m[1].trim());
}

const mine = COPIES.map((p) => fs.readFileSync(path.join(ROOT, p), 'utf8'));

console.log('ARM 1 — my tree (tick disabled by default)\n');
const withChange = SUITES.map((s) => ({ suite: s, r: run(s) }));
for (const { suite, r } of withChange) {
  console.log(`  ${r.verdict.padEnd(8)} ${String(r.pass).padStart(3)}p/${String(r.fail)}f  ${path.basename(suite)}`);
}

// Restore the two product files from the base commit, leaving tests as-is.
for (const p of COPIES) {
  const base = execFileSync('git', ['show', `HEAD:${p}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(path.join(ROOT, p), base);
}

console.log('\nARM 2 — base commit product files (tick enabled, pre-change)\n');
const atBase = SUITES.map((s) => ({ suite: s, r: run(s) }));
for (const { suite, r } of atBase) {
  console.log(`  ${r.verdict.padEnd(8)} ${String(r.pass).padStart(3)}p/${String(r.fail)}f  ${path.basename(suite)}`);
}

COPIES.forEach((p, i) => fs.writeFileSync(path.join(ROOT, p), mine[i]));

console.log('\n──────── attribution ────────');
let caused = 0;
for (let i = 0; i < SUITES.length; i++) {
  const a = withChange[i].r; const b = atBase[i].r;
  const name = path.basename(SUITES[i]);
  if (a.verdict === b.verdict && a.fail === b.fail) continue;
  if (b.verdict !== 'GREEN' && a.verdict !== 'GREEN') {
    console.log(`  PRE-EXISTING  ${name}  (base ${b.fail}f, mine ${a.fail}f)`);
    continue;
  }
  if (b.verdict === 'GREEN' && a.verdict !== 'GREEN') {
    caused += 1;
    console.log(`  CAUSED BY ME  ${name}  ${a.fail} newly failing`);
    a.failed.forEach((f) => console.log(`        ${f}`));
  } else {
    console.log(`  IMPROVED      ${name}`);
  }
}
if (!caused) console.log('  no suite goes from GREEN to RED because of this change');
console.log(`\nsuites caused-red by the change: ${caused}`);

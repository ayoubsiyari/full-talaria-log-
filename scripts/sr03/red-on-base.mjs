/**
 * Re-prove the FINAL gate RED on the unmodified base. Swaps the five product
 * files (both mirrors) back to BASE, runs the gate, then restores the working
 * versions and verifies every byte by hash.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const ROOT = process.argv[2] || process.cwd();
const BASE_REF = process.argv[3] || '350707826';
const TEST = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'a-sr03-focus-routing.test.mjs');

const REL = [
  'chart.js',
  'modules/economic-news-sidebar.js',
  'modules/favorites-manager.js',
  'modules/indicator-ui.js',
  'modules/screenshot-manager.js',
];
const paths = [];
for (const r of REL) {
  paths.push({ git: `chart v 1.4/chart/${r}`, fs: path.join(ROOT, 'chart v 1.4', 'chart', ...r.split('/')) });
  paths.push({ git: `homepage/public/chart/${r}`, fs: path.join(ROOT, 'homepage', 'public', 'chart', ...r.split('/')) });
}

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const WORKING = new Map(paths.map((p) => [p.fs, fs.readFileSync(p.fs)]));

function runGate() {
  const r = spawnSync(process.execPath,
    ['--test', '--test-reporter=tap', '--test-concurrency=1', TEST],
    { encoding: 'utf8', cwd: ROOT });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const pass = []; const fail = [];
  for (const line of out.split('\n')) {
    let m = /^ok \d+ - (.+)$/.exec(line);
    if (m) { pass.push(m[1].trim()); continue; }
    m = /^not ok \d+ - (.+)$/.exec(line);
    if (m) fail.push(m[1].trim());
  }
  return { code: r.status, pass, fail, out };
}

try {
  for (const p of paths) {
    const blob = execFileSync('git', ['show', `${BASE_REF}:${p.git}`],
      { cwd: ROOT, maxBuffer: 1 << 30, encoding: 'buffer' });
    fs.writeFileSync(p.fs, blob);
  }
  const red = runGate();
  console.log(`=== FINAL GATE ON BASE ${BASE_REF} ===`);
  console.log(`exit=${red.code}  pass=${red.pass.length}  fail=${red.fail.length}`);
  console.log('\n--- RED on base (must go green after the fix) ---');
  for (const f of red.fail) console.log(`  RED   ${f}`);
  console.log('\n--- already GREEN on base (guard / pin cells) ---');
  for (const f of red.pass) console.log(`  GREEN ${f}`);
  fs.writeFileSync(
    path.join(ROOT, 'docs', 'plan3', 'evidence', 'A-SR03-ROUTING-CONVERSION-20260731', 'gate-RED-on-base.tap'),
    red.out);
} finally {
  for (const [f, buf] of WORKING) fs.writeFileSync(f, buf);
  let bad = 0;
  for (const [f, buf] of WORKING) {
    if (sha(f) !== crypto.createHash('sha256').update(buf).digest('hex')) { console.error(`RESTORE MISMATCH ${f}`); bad++; }
  }
  console.log(`\nrestored ${WORKING.size} files; mismatches=${bad}`);
  if (bad) process.exit(2);
}

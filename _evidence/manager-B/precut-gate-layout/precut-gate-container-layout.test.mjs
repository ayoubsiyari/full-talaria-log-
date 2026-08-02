/**
 * Reproduce the layout that blocked the b122 build, and prove the emitter now survives it.
 *
 * The homepage image runs `node /build/chart/scripts/bump-chart-engine-build.mjs` while a homepage
 * tree sits at /homepage. Two levels up from the chart tree is therefore `/`, and /homepage/public/chart
 * really does exist there — so testing that one path alone elected `/` as the repo root. The gate then
 * looked for `chart v 1.4/chart` under `/`, did not find it, and blocked with "the canonical mirror is
 * missing entirely". Nothing was wrong with the tree.
 *
 * This builds that shape in a temp dir and runs the REAL emitter inside it, so the fix is demonstrated
 * against the product rather than against a copy of its logic.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const REAL_CHART = path.join(REPO, 'chart v 1.4', 'chart');

let bad = 0;
const check = (name, pass, detail = '') => {
  if (!pass) bad++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// --- build the container-shaped sandbox -------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b122-layout-'));
const chartRoot = path.join(tmp, 'build', 'chart');
fs.mkdirSync(path.join(chartRoot, 'scripts', 'lib'), { recursive: true });
fs.mkdirSync(path.join(chartRoot, 'modules'), { recursive: true });
// The decoy: this is what made `/` look like a repo root.
fs.mkdirSync(path.join(tmp, 'homepage', 'public', 'chart'), { recursive: true });

fs.copyFileSync(path.join(REAL_CHART, 'chart.js'), path.join(chartRoot, 'chart.js'));
for (const f of ['bump-chart-engine-build.mjs', 'pre-cut-integrity-gate.mjs']) {
  fs.copyFileSync(path.join(REAL_CHART, 'scripts', f), path.join(chartRoot, 'scripts', f));
}
fs.copyFileSync(
  path.join(REAL_CHART, 'scripts', 'lib', 'mirror-integrity.mjs'),
  path.join(chartRoot, 'scripts', 'lib', 'mirror-integrity.mjs'),
);
// A couple of real modules so the scan has something to parse and cannot pass vacuously.
for (const m of fs.readdirSync(path.join(REAL_CHART, 'modules')).filter((n) => /\.m?js$/.test(n)).slice(0, 6)) {
  fs.copyFileSync(path.join(REAL_CHART, 'modules', m), path.join(chartRoot, 'modules', m));
}

console.log('\n== the layout that blocked the build ==');
console.log(`  chart tree : ${chartRoot}`);
console.log(`  two up     : ${tmp}  (contains homepage/public/chart, but no "chart v 1.4/chart")`);

const run = (env) => spawnSync(process.execPath,
  [path.join(chartRoot, 'scripts', 'bump-chart-engine-build.mjs'), '--dry-run'],
  { cwd: chartRoot, encoding: 'utf8', env: { ...process.env, ...env } });

console.log('\n== the real emitter, in that layout ==');
const res = run({ BUILD_ID: '20260802b122', CHECKPOINT_BUILD: '1', SOURCE_COMMIT_SHA: 'c'.repeat(40) });
const out = `${res.stdout || ''}${res.stderr || ''}`;

check('emitter exits 0 (the build is no longer blocked)', res.status === 0, `exit=${res.status}`);
check('no longer claims the canonical mirror is missing',
  !/canonical mirror is missing entirely/.test(out));
check('the gate actually RAN rather than being skipped',
  /PRE-CUT GATE PASSED|files checked across/.test(out));
check('it scanned the chart tree as canonical, not nothing',
  /canonical: [1-9]\d* files/.test(out), (out.match(/canonical: \d+ files/) || ['none'])[0]);
check('and it did not pass vacuously on zero files',
  !/ZERO files were checked/.test(out));
check('emits the passport for this build', /"buildId": "20260802b122"/.test(out));

// --- the gate must still BLOCK on a genuinely broken tree in this same layout ------------
console.log('\n== discriminating: truncate a file and the gate must still block ==');
const victim = fs.readdirSync(path.join(chartRoot, 'modules'))[0];
const vpath = path.join(chartRoot, 'modules', victim);
fs.writeFileSync(vpath, 'export function broken() { const x = {', 'utf8');
const res2 = run({ BUILD_ID: '20260802b122', CHECKPOINT_BUILD: '1', SOURCE_COMMIT_SHA: 'c'.repeat(40) });
const out2 = `${res2.stdout || ''}${res2.stderr || ''}`;
check('a truncated module still blocks the build', res2.status !== 0, `exit=${res2.status}`);
check('and names the parse failure', /CUT BLOCKED|parse failures [1-9]/.test(out2));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n  ${bad === 0 ? 'FIX PROVEN: container layout builds, broken tree still blocks' : `${bad} FAILURE(S)`}`);
process.exitCode = bad === 0 ? 0 : 1;

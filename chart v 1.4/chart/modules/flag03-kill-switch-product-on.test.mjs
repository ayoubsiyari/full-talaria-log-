/**
 * FLAG-03 — kill-switch OFF-path must keep a working product.
 *
 * Run as a plain script (not under a parent `node --test` that nests):
 *   node "chart v 1.4/chart/modules/flag03-kill-switch-product-on.test.mjs"
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHART_ROOT = path.resolve(__dirname, '..');
const WORKTREE = path.resolve(CHART_ROOT, '..', '..');

const TODAY_SWITCH_HARNESSES = [
  {
    switchName: '__TALARIA_DISABLE_MC_GRID_STATE_PURGE_V1',
    harness: path.join(CHART_ROOT, 'multichart-prod', 'harness', 'purge2-grid-ref-release.test.mjs'),
    productCell: 'pg5-kill-switch-still-reprimes',
  },
  {
    switchName: '__TALARIA_DISABLE_LAG_SETINTERVAL_TICK_V1',
    harness: path.join(__dirname, 'lag-setinterval-tick.test.mjs'),
    productCell: 'kill-switch restores sync full tick',
  },
  {
    switchName: '__TALARIA_DISABLE_MC_BACKGROUND_RENDER_CADENCE_V1',
    harness: path.join(__dirname, 'fix1-mc-background-render-cadence.test.mjs'),
    productCell: 'FIX1-C16',
  },
  {
    switchName: '__TALARIA_DISABLE_ORDER_SEL01_EXACT_TEARDOWN_V1',
    harness: path.join(__dirname, 'order-sel01-exact-teardown.test.mjs'),
    productCell: null,
  },
  {
    switchName: '__TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1',
    harness: path.join(__dirname, 'm20-j1-journal-shot-thumbs.test.mjs'),
    productCell: 'J1-C12 FLAG-03 working product OFF',
  },
];

function runHarness(file) {
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', file], {
    encoding: 'utf8',
    cwd: WORKTREE,
    timeout: 180_000,
    env: { ...process.env, NODE_TEST_CONTEXT: undefined },
  });
  return { status: r.status, out: `${r.stdout || ''}\n${r.stderr || ''}` };
}

let failed = 0;
for (const row of TODAY_SWITCH_HARNESSES) {
  assert.ok(fs.existsSync(row.harness), `missing harness for ${row.switchName}`);
  const src = fs.readFileSync(row.harness, 'utf8');
  assert.ok(src.includes(row.switchName), `${row.harness} must name ${row.switchName}`);
  const { status, out } = runHarness(row.harness);
  const cellOk = !row.productCell || out.toLowerCase().includes(row.productCell.toLowerCase());
  const pass = status === 0 && cellOk && !/\n✖ /.test(out);
  process.stdout.write(
    `${pass ? 'PASS' : 'FAIL'} FLAG-03 ${row.switchName}${row.productCell ? ` [${row.productCell}]` : ''}\n`,
  );
  if (!pass) {
    failed += 1;
    process.stdout.write(out.slice(-1200) + '\n');
  }
}

if (failed) {
  console.error(`FLAG-03 FAIL count=${failed}`);
  process.exit(1);
}
console.log('FLAG-03 ALL GREEN');

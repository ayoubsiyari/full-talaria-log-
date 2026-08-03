#!/usr/bin/env node
/**
 * Run TAL/Rayan UI smoke row mutants against one sealed served surface.
 *
 * This is intentionally canary-compatible with tal-po-ui-smoke-watch-b125.mjs:
 * it accepts --origin/--expect-badge/--expect-digest/--expect-sha/--out.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  matchCoordinatePairs,
  readCandidateCoordinates,
} from './lib/a3-speed-fill-journal-parity.mjs';
import {
  acquireRunLockOrExit,
  writeArtifactAtomic,
} from './lib/run-lock.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function argOf(name, fallback = '') {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  if (hit) return hit.slice(pref.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const ORIGIN = String(argOf('origin', process.env.TEST_VPS_URL || 'http://31.97.192.82:3000')).replace(/\/$/, '');
const EXPECT = {
  badge: String(argOf('expect-badge', process.env.TAL_PO_UI_EXPECT_BADGE || '20260803b126')),
  digest: String(argOf('expect-digest', process.env.TAL_PO_UI_EXPECT_DIGEST || '')),
  sourceCommitSha: String(argOf('expect-sha', process.env.TAL_PO_UI_EXPECT_SHA || '')),
};
const OUT_JSON = path.resolve(repoRoot, argOf('out', 'docs/plan3/evidence/tal-po-ui-smoke-mutants-b126-live-summary.json'));
const SMOKE_SCRIPT = path.join(__dirname, 'tal-po-ui-smoke-canary.mjs');
const RUN_TIMEOUT_MS = Math.max(60_000, Number(argOf('timeout-ms', '180000')) || 180_000);
const RUN_LOCK_IDENTITY = 'TAL-PO-UI-SMOKE-MUTANTS-LIVE';

const BATCHES = Object.freeze([
  { name: 'batch1', mutants: 'fixed-box-size,value-box-moves,hover-blinks,drag-scale-mismatch' },
  { name: 'missing-unit', mutants: 'missing-size-unit' },
  { name: 'batch2a', mutants: 'market-size-drift,control-button-moves,font-baseline-drift,duplicate-activation-box' },
  { name: 'release-only', mutants: 'release-only-average' },
  { name: 'analysis-only', mutants: 'analysis-only-allows-order' },
]);

function lockFlagsFromLocalArgv(argv = process.argv) {
  return {
    allowConcurrent: argv.includes('--allow-concurrent'),
  };
}

const runLock = acquireRunLockOrExit({
  artifact: OUT_JSON,
  script: RUN_LOCK_IDENTITY,
  key: RUN_LOCK_IDENTITY,
  ...lockFlagsFromLocalArgv(process.argv),
});
console.error(`[tal-po-ui-mutants-live] run-lock ${runLock.state} identity=${RUN_LOCK_IDENTITY}`);

function batchOutPath(name) {
  const dir = path.dirname(OUT_JSON);
  const stem = path.basename(OUT_JSON, path.extname(OUT_JSON));
  return path.join(dir, `${stem}-${name}.json`);
}

const surface = await readCandidateCoordinates(ORIGIN);
const identity = matchCoordinatePairs(surface, EXPECT);
if (!identity.ok) {
  const report = {
    signature: 'TAL-PO-UI-SMOKE-MUTANT-SUITE-LIVE-V1',
    at: new Date().toISOString(),
    origin: ORIGIN,
    expectedCoordinates: EXPECT,
    surface,
    identity,
    verdict: 'BLOCKED - candidate coordinate mismatch',
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  writeArtifactAtomic(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  process.exit(3);
}

const batchReports = [];
for (const batch of BATCHES) {
  const out = batchOutPath(batch.name);
  const args = [
    SMOKE_SCRIPT,
    '--origin', ORIGIN,
    '--expect-badge', surface.badge,
    '--expect-digest', surface.digest,
    '--expect-sha', surface.sourceCommitSha,
    '--mutant-suite',
    `--mutants=${batch.mutants}`,
    `--timeout-ms=${RUN_TIMEOUT_MS}`,
    '--out', out,
  ];
  console.error(`[tal-po-ui-mutants-live] running ${batch.name}: ${batch.mutants}`);
  const child = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.status !== 0) {
    const report = {
      signature: 'TAL-PO-UI-SMOKE-MUTANT-SUITE-LIVE-V1',
      at: new Date().toISOString(),
      origin: ORIGIN,
      expectedCoordinates: EXPECT,
      surface,
      identity,
      verdict: 'FAILED - mutant batch failed',
      failedBatch: batch,
      status: child.status,
      signal: child.signal,
      stdoutTail: String(child.stdout || '').slice(-4000),
      stderrTail: String(child.stderr || '').slice(-4000),
    };
    fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
    writeArtifactAtomic(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    process.exit(child.status || 3);
  }
  batchReports.push(JSON.parse(fs.readFileSync(out, 'utf8')));
}

const rows = batchReports.flatMap((report, index) => {
  const artifact = path.relative(repoRoot, batchOutPath(BATCHES[index].name)).replace(/\\/g, '/');
  return (report.mutantSuite?.rows || []).map((row) => ({ ...row, artifact }));
});
const report = {
  signature: 'TAL-PO-UI-SMOKE-MUTANT-SUITE-LIVE-V1',
  at: new Date().toISOString(),
  origin: ORIGIN,
  expectedCoordinates: EXPECT,
  surface,
  identity,
  baselineOk: batchReports.every((r) => r.mutantSuite?.baselineOk === true),
  rows,
  ok: rows.length === 11 && rows.every((row) => row.ok)
    && batchReports.every((r) => r.mutantSuite?.baselineOk === true),
  verdict: rows.length === 11 && rows.every((row) => row.ok)
    && batchReports.every((r) => r.mutantSuite?.baselineOk === true)
    ? 'PASSED - TAL/Rayan row mutants killed one-for-one'
    : 'FAILED - TAL/Rayan row mutant suite',
};
fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
writeArtifactAtomic(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 3;

#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const modulesDir = path.join(repoRoot, 'chart v 1.4', 'chart', 'modules');
const artifactDir = path.join(here, 'artifacts');
const pairCount = Math.max(1, Number(process.env.B70_BROAD_PAIRS) || 3);
const seed = String(process.env.B70_BROAD_SEED || '7005');
const concurrency = String(process.env.B70_BROAD_CONCURRENCY || '1');
const perTestTimeoutMs = Math.max(
  1_000, Number(process.env.B70_BROAD_TEST_TIMEOUT_MS) || 240_000
);
const perRunTimeoutMs = Math.max(
  perTestTimeoutMs, Number(process.env.B70_BROAD_RUN_TIMEOUT_MS) || 420_000
);
const runTag = String(process.env.B70_BROAD_RUN_TAG || 'broad-paired-runs')
  .replace(/[^a-z0-9._-]+/gi, '-');
const baseline = JSON.parse(
  fs.readFileSync(path.join(artifactDir, 'broad-baseline.json'), 'utf8')
);
const tests = fs.readdirSync(modulesDir)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort((a, b) => a.localeCompare(b))
  .map((name) => path.join(modulesDir, name));
const args = [
  '--test',
  `--test-concurrency=${concurrency}`,
  `--test-timeout=${perTestTimeoutMs}`,
  ...tests,
];

function resourceState() {
  return {
    timestamp: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    logicalCpus: os.cpus().length,
    loadAverage: os.loadavg(),
    freeMemoryBytes: os.freemem(),
    totalMemoryBytes: os.totalmem(),
    processRssBytes: process.memoryUsage().rss,
  };
}

function parse(output) {
  const failures = Array.from(output.matchAll(/^✖ (.+?) \([\d.]+ms\)$/gm))
    .map((match) => match[1])
    .filter((title, index, all) => all.indexOf(title) === index)
    .sort();
  const summary = {};
  for (const name of ['tests', 'pass', 'fail', 'skipped', 'duration_ms']) {
    const match = output.match(new RegExp(`^ℹ ${name} ([\\d.]+)$`, 'm'));
    summary[name] = match ? Number(match[1]) : null;
  }
  return { failures, summary };
}

function terminateTree(child) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch (_) {
    try { child.kill('SIGKILL'); } catch (_) {}
  }
}

async function run(role, pair) {
  const before = resourceState();
  const started = Date.now();
  const child = spawn(process.execPath, args, {
    cwd: repoRoot,
    windowsHide: true,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      B70_BROAD_ROLE: role,
      B70_BROAD_SEED: seed,
      TZ: 'UTC',
      UV_THREADPOOL_SIZE: '4',
    },
  });
  const chunks = [];
  let capturedBytes = 0;
  let timedOut = false;
  let overflow = false;
  const capture = (chunk) => {
    capturedBytes += chunk.length;
    if (capturedBytes > 128 * 1024 * 1024) {
      overflow = true;
      terminateTree(child);
      return;
    }
    chunks.push(Buffer.from(chunk));
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  const timer = setTimeout(() => {
    timedOut = true;
    terminateTree(child);
  }, perRunTimeoutMs);
  const completion = await new Promise((resolve) => {
    child.once('error', (error) => resolve({ code: null, signal: null, error }));
    child.once('close', (code, signal) => resolve({ code, signal, error: null }));
  });
  clearTimeout(timer);
  // Idempotent cleanup also catches descendants left by a timed-out test.
  if (timedOut || overflow) terminateTree(child);
  const output = Buffer.concat(chunks).toString('utf8');
  const parsed = parse(output);
  const logName = `${runTag}-pair-${pair}-${role}.tap`;
  fs.writeFileSync(path.join(artifactDir, logName), output, 'utf8');
  return {
    pair,
    role,
    command: `${JSON.stringify(process.execPath)} ${args.map((arg) => JSON.stringify(
      path.isAbsolute(arg) ? path.relative(repoRoot, arg) : arg
    )).join(' ')}`,
    testOrder: tests.map((file) => path.relative(repoRoot, file)),
    concurrency: Number(concurrency),
    seed,
    environment: { TZ: 'UTC', UV_THREADPOOL_SIZE: '4' },
    before,
    after: resourceState(),
    elapsedMs: Date.now() - started,
    exitCode: completion.code,
    signal: completion.signal,
    timedOut,
    outputOverflow: overflow,
    timeoutDiagnostics: (timedOut || overflow) ? {
      perTestTimeoutMs,
      perRunTimeoutMs,
      lastCompletedTest: Array.from(
        output.matchAll(/^[✔✖﹣] (.+?)(?: \([\d.]+ms\))?(?: # SKIP)?$/gm)
      ).at(-1)?.[1] || null,
      lastOutputLines: output.trim().split(/\r?\n/).slice(-40),
      childPid: child.pid,
      termination: process.platform === 'win32'
        ? 'taskkill /PID <pid> /T /F' : 'process-group SIGKILL',
    } : null,
    spawnError: completion.error
      ? String(completion.error.stack || completion.error) : null,
    outputSha256: crypto.createHash('sha256').update(output).digest('hex'),
    logName,
    ...parsed,
  };
}

fs.mkdirSync(artifactDir, { recursive: true });
const runs = [];
for (let pair = 1; pair <= pairCount; pair++) {
  runs.push(await run('baseline-default-off', pair));
  runs.push(await run('candidate-default-off', pair));
}
const expected = [...baseline.failureTitles].sort();
const pairs = Array.from({ length: pairCount }, (_, index) => {
  const pair = index + 1;
  const baselineRun = runs.find((run) =>
    run.pair === pair && run.role === 'baseline-default-off');
  const candidateRun = runs.find((run) =>
    run.pair === pair && run.role === 'candidate-default-off');
  return {
    pair,
    baselineCandidateExact:
      JSON.stringify(baselineRun.failures) === JSON.stringify(candidateRun.failures),
    baselineSnapshotExact:
      JSON.stringify(baselineRun.failures) === JSON.stringify(expected),
    candidateSnapshotExact:
      JSON.stringify(candidateRun.failures) === JSON.stringify(expected),
  };
});
const verdict = pairs.every((pair) =>
  pair.baselineCandidateExact
  && pair.baselineSnapshotExact
  && pair.candidateSnapshotExact)
  && runs.every((run) => !run.timedOut && !run.outputOverflow
    && !run.spawnError) ? 'GREEN' : 'FAIL';
const body = {
  schemaVersion: 1,
  verdict,
  pairCount,
  deterministicContract: {
    sortedTestOrder: true,
    concurrency: Number(concurrency),
    perTestTimeoutMs,
    perRunTimeoutMs,
    seed,
    timezone: 'UTC',
    uvThreadpoolSize: 4,
    expectedFailureTitles: expected,
  },
  pairs,
  runs,
};
const outPath = path.join(artifactDir, `${runTag}.json`);
fs.writeFileSync(outPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ verdict, pairs, outPath }, null, 2)}\n`);
process.exitCode = verdict === 'GREEN' ? 0 : 1;

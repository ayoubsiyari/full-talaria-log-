#!/usr/bin/env node
/**
 * DETAILED-DUMP-CAPTURE-WATCH
 *
 * Waits for E's measurement-queue turn, claims it, runs one detailed memory-infra
 * capture, parses it, and releases the claim. The capture itself is bounded and
 * writes to a fresh timestamped outdir so the queue wait is not spent on setup.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluate, readNodeProcesses, readState } from './measurement-queue.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OWNER = arg('owner', 'E');
const RUN = arg('run', 'detailed-dump-capture-item6');
const OUT_ROOT = arg('outRoot', '_evidence/manager-E/detailed-dump-capture-20260803');
const POLL_MS = Number(arg('pollMs', '30000'));
const PORT = arg('port', 'auto');
const CAPTURE_TIMEOUT_MS = Number(arg('captureTimeoutMs', '300000'));
const PARSE_TIMEOUT_MS = Number(arg('parseTimeoutMs', '60000'));
const DRY_RUN = arg('dryRun', '0') === '1';
const RE_RESERVE_ON_NO_BROWSER = arg('reReserveOnNoBrowser', '1') === '1';

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function stamp() {
  return new Date().toISOString();
}

function runId() {
  return stamp().replace(/[:.]/g, '-');
}

function log(...parts) {
  console.error(`[detailed-dump-watch ${stamp()}]`, ...parts);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

function appendEvent(report, event) {
  report.events.push({ at: stamp(), ...event });
  writeJson(report.watchReport, report);
}

function spawnBounded(label, args, { timeoutMs, cwd = REPO_ROOT } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref?.();
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        label,
        code,
        signal,
        timedOut,
        stdoutTail: stdout.slice(-4000),
        stderrTail: stderr.slice(-4000),
      });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ label, code: null, signal: null, timedOut, error: String(error?.message || error) });
    });
  });
}

async function queueCli(args, timeoutMs = 30000) {
  return spawnBounded(`measurement-queue ${args[0]}`, ['scripts/measurement-queue.mjs', ...args], { timeoutMs });
}

function freshPaths() {
  const id = runId();
  const outDir = path.join(OUT_ROOT, id);
  return {
    runId: id,
    outDir,
    watchReport: path.join(outDir, 'watch-report.json'),
    capture: path.join(outDir, 'capture.json'),
    rawTrace: path.join(outDir, 'raw-trace-events.json'),
    parsed: path.join(outDir, 'parsed.json'),
  };
}

async function runOnce(paths, report) {
  appendEvent(report, { state: 'CLAIMING', run: RUN });
  const claim = await queueCli(['claim', `--owner=${OWNER}`, `--run=${RUN}`, `--eta=5m`, `--pid=${process.pid}`]);
  appendEvent(report, { state: 'CLAIM_RESULT', claim });
  if (claim.code !== 0) {
    report.state = 'CLAIM_REFUSED';
    writeJson(report.watchReport, report);
    return report;
  }

  try {
    appendEvent(report, { state: 'CAPTURE_START', capture: paths.capture, rawTrace: paths.rawTrace });
    const capture = await spawnBounded('detailed-dump-capture', [
      'scripts/live-trace-and-allocator-probe.mjs',
      `--port=${PORT}`,
      '--phases=memory',
      '--memoryDetail=detailed',
      `--out=${paths.capture}`,
      `--rawOut=${paths.rawTrace}`,
    ], { timeoutMs: CAPTURE_TIMEOUT_MS });
    appendEvent(report, { state: 'CAPTURE_DONE', capture });

    let captureJson = null;
    try { captureJson = JSON.parse(fs.readFileSync(paths.capture, 'utf8')); } catch (_) {}
    if (capture.timedOut) {
      report.state = 'CAPTURE_TIMEOUT';
    } else if (capture.code !== 0) {
      report.state = 'CAPTURE_EXIT_NONZERO';
    } else if (captureJson?.error) {
      report.state = /No live soak browser/i.test(captureJson.error)
        ? 'NO_LIVE_SOAK_BROWSER'
        : 'CAPTURE_REPORTED_ERROR';
      report.captureError = captureJson.error;
    } else {
      appendEvent(report, { state: 'PARSE_START', input: paths.capture, parsed: paths.parsed });
      const parse = await spawnBounded('detailed-dump-parse', [
        'scripts/detailed-dump-parser.mjs',
        paths.capture,
        `--out=${paths.parsed}`,
      ], { timeoutMs: PARSE_TIMEOUT_MS });
      appendEvent(report, { state: 'PARSE_DONE', parse });
      report.state = parse.timedOut ? 'PARSE_TIMEOUT' : (parse.code === 0 ? 'CAPTURE_PARSED' : 'PARSE_EXIT_NONZERO');
    }
  } finally {
    const release = await queueCli(['release', `--owner=${OWNER}`]);
    appendEvent(report, { state: 'RELEASE_RESULT', release });
    if (RE_RESERVE_ON_NO_BROWSER && report.state === 'NO_LIVE_SOAK_BROWSER') {
      const reserve = await queueCli([
        'reserve',
        `--owner=${OWNER}`,
        `--run=${RUN}`,
        '--front',
        '--note=re-reserved-after-no-live-soak-browser',
      ]);
      appendEvent(report, { state: 'RE_RESERVE_RESULT', reserve });
    }
  }
  writeJson(report.watchReport, report);
  return report;
}

async function main() {
  const paths = freshPaths();
  const report = {
    signature: 'DETAILED-DUMP-CAPTURE-WATCH-V1',
    startedAt: stamp(),
    owner: OWNER,
    run: RUN,
    port: PORT,
    pollMs: POLL_MS,
    captureTimeoutMs: CAPTURE_TIMEOUT_MS,
    parseTimeoutMs: PARSE_TIMEOUT_MS,
    reReserveOnNoBrowser: RE_RESERVE_ON_NO_BROWSER,
    ...paths,
    events: [],
    state: DRY_RUN ? 'DRY_RUN_READY' : 'WAITING_FOR_QUEUE',
  };
  writeJson(report.watchReport, report);
  log(`watch report -> ${report.watchReport}`);

  if (DRY_RUN) {
    appendEvent(report, { state: 'DRY_RUN_READY', note: 'Fresh timestamped outdir and bounded phase plan written; no queue claim or browser attach attempted.' });
    return;
  }

  for (;;) {
    const verdict = evaluate({ state: readState(), procs: readNodeProcesses(), owner: OWNER });
    appendEvent(report, {
      state: 'PREFLIGHT',
      verdict: verdict.state,
      reason: verdict.reason,
      mayRun: verdict.mayRun,
    });
    log(`preflight ${verdict.state}: ${verdict.reason}`);
    if (verdict.mayRun) {
      await runOnce(paths, report);
      log(`finished ${report.state}`);
      return;
    }
    await sleep(POLL_MS);
  }
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  await main().catch((error) => {
    console.error(`[detailed-dump-watch ${stamp()}] ERROR`, error);
    process.exit(1);
  });
}

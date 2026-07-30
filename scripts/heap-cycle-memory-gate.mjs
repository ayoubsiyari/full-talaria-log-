#!/usr/bin/env node
/**
 * HEAP-CYCLE-MEMORY-V1 gate.
 *
 *   node scripts/heap-cycle-memory-gate.mjs --fixture
 *   node scripts/heap-cycle-memory-gate.mjs --require-browser
 *   node scripts/heap-cycle-memory-gate.mjs --json
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  HEAP_CYCLE_SIGNATURE,
  HEAP_CYCLE_STATUS_SKIP,
  assertHeapCycleMemoryReport,
  defaultHeapCycleGate01FixtureDir,
  formatHeapCycleMemoryReport,
  synthesizePoLeakHeapCycleReport,
} from './lib/heap-cycle-memory.mjs';

export function parseHeapCycleMemoryArgs(argv = process.argv.slice(2)) {
  const options = {
    fixtureDir: null,
    requireBrowser: false,
    json: false,
    timeoutMs: 720_000,
    surface: 'dist-v9',
    outPath: null,
    disableFlags: [],
    cycles: null,
    requireBuild: null,
    poHandSample: null,
    playHoldMs: null,
    datasetMode: null,
    timeframes: null,
    finalRetainerSnapshot: false,
    snapshotOutPath: null,
    steadyStateDiff: false,
    ablateTerminateWorkers: false,
    datasetRotate: 0,
    releaseConsole: false,
    memoryApiProbe: false,
  };
  for (const arg of argv) {
    if (arg === '--fixture' || arg === '--gate01-fixture') {
      options.fixtureDir = defaultHeapCycleGate01FixtureDir();
    } else if (arg.startsWith('--fixture-dir=')) {
      options.fixtureDir = path.resolve(arg.slice('--fixture-dir='.length));
    } else if (arg === '--require-browser') {
      options.requireBrowser = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--po-hand-sample') {
      options.poHandSample = true;
    } else if (arg === '--no-po-hand-sample') {
      options.poHandSample = false;
    } else if (arg.startsWith('--dataset-mode=')) {
      options.datasetMode = arg.slice('--dataset-mode='.length).trim().toLowerCase();
    } else if (arg.startsWith('--snapshot-out=')) {
      options.snapshotOutPath = path.resolve(arg.slice('--snapshot-out='.length));
      options.finalRetainerSnapshot = true;
    } else if (arg === '--release-console-handles') {
      options.releaseConsole = true;
    } else if (arg === '--release-console-handles=deep') {
      // Deep mode also drops async stack capture and cycles the Runtime domain.
      options.releaseConsole = 'deep';
    } else if (arg.startsWith('--dataset-rotate=')) {
      options.datasetRotate = Number(arg.split('=')[1]) || 0;
    } else if (arg === '--memory-api-probe') {
      // MEMORY-API-SCOPE-V1: measures whether performance.memory sees panel
      // iframe heaps at all, and whether measureUserAgentSpecificMemory is callable.
      options.memoryApiProbe = true;
    } else if (arg === '--ablate-terminate-workers') {
      // Experiment: terminate panel workers before collapse to test whether the
      // unterminated indicator Worker is what pins the retained realm.
      options.ablateTerminateWorkers = true;
    } else if (arg === '--steady-state-diff') {
      // Snapshot the last two collapsed states instead of baseline-vs-final, so
      // per-cycle growth is not inflated by the one-time realm warm-up.
      options.steadyStateDiff = true;
    } else if (arg === '--final-retainer-snapshot') {
      options.finalRetainerSnapshot = true;
    } else if (arg.startsWith('--timeframes=')) {
      options.timeframes = arg.slice('--timeframes='.length)
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
    } else if (arg.startsWith('--play-hold-ms=')) {
      options.playHoldMs = Number(arg.slice('--play-hold-ms='.length));
    } else if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = Number(arg.slice('--timeout-ms='.length));
    } else if (arg.startsWith('--cycles=')) {
      options.cycles = Number(arg.slice('--cycles='.length));
    } else if (arg.startsWith('--require-build=')) {
      options.requireBuild = arg.slice('--require-build='.length).trim();
    } else if (arg.startsWith('--surface=')) {
      options.surface = arg.slice('--surface='.length);
    } else if (arg === '--thin-host') {
      options.surface = 'thin-host';
    } else if (arg === '--deployed') {
      options.surface = 'deployed';
    } else if (arg.startsWith('--out=')) {
      options.outPath = path.resolve(arg.slice('--out='.length));
    } else if (arg.startsWith('--disable-flags=')) {
      options.disableFlags = arg.slice('--disable-flags='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg === '--disable-all-b85-fixes') {
      options.disableFlags = [
        '__TALARIA_DISABLE_MC_PANEL_STATE_PURGE_V1',
        '__TALARIA_DISABLE_MC_GRID_STATE_PURGE_V1',
        '__TALARIA_DISABLE_MC_BAR_STORE_REALM_V1',
        '__TALARIA_DISABLE_MC_CLEARFILE_ON_REMOVE_V1',
      ];
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function loadFixtureReport(fixtureDir) {
  const reportPath = path.join(fixtureDir, 'report.json');
  if (!fs.existsSync(reportPath)) {
    throw new Error(`fixture report missing: ${reportPath}`);
  }
  return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
}

/**
 * Newest steady-state snapshot written by a run, given the --snapshot-out base.
 *
 * The browser writes one file per graded cycle as `<base>.cycleN<ext>`, so the
 * highest N that exists is the collapsed state to grade.
 */
export function newestCycleSnapshot(snapshotOutPath, { existsSync = fs.existsSync } = {}) {
  if (!snapshotOutPath) return null;
  const ext = path.extname(snapshotOutPath);
  const base = ext ? snapshotOutPath.slice(0, -ext.length) : snapshotOutPath;
  for (let cycle = 12; cycle >= 1; cycle -= 1) {
    const candidate = `${base}.cycle${cycle}${ext}`;
    if (existsSync(candidate)) return candidate;
  }
  return existsSync(snapshotOutPath) ? snapshotOutPath : null;
}

/**
 * Turn a REALM-SURVIVAL-V1 grade into a gate cell.
 *
 * Kept pure and separate from the spawn so the grading policy can be tested
 * without a 340 MB snapshot: a product-retained peer realm is a blocking leak,
 * the kill switch is a non-blocking SKIP, and inspector-retained realms are
 * reported but never graded because they are ours, not the product's.
 */
export function buildRealmSurvivalCell(grade) {
  if (!grade) return null;
  if (grade.status === 'SKIPPED') {
    return {
      name: 'REALM-SURVIVAL-V1',
      pass: true,
      status: 'SKIPPED',
      detail: grade.reason || 'disabled by kill switch',
      nonBlocking: true,
    };
  }
  const counts = grade.census?.counts || {};
  const survivors = grade.census?.survivors || [];
  const inspector = counts['inspector-retained'] ?? 0;
  const detail = grade.ok
    ? `no product-retained peer realm (live=${counts.live ?? '?'} `
      + `inspector-retained=${inspector} not graded)`
    : `${survivors.length} torn-down peer realm(s) still reachable from product references: `
      + `${survivors.map((s) => s.label).join(', ')} `
      + `[${survivors[0]?.path?.slice(0, 200) || 'no path'}]`;
  return {
    name: 'REALM-SURVIVAL-V1',
    pass: grade.ok === true,
    status: grade.status || (grade.ok ? 'GREEN' : 'RED'),
    detail: grade.reason ? `${detail} — ${grade.reason}` : detail,
    blocking: true,
    survivors: survivors.map((s) => ({ label: s.label, panel: s.panel, cycle: s.cycle })),
    inspectorRetainedNotGraded: inspector,
  };
}

/**
 * Whether this process can afford to grade in-line.
 *
 * Measured the hard way: grading spawned a ~3.3 GB child while this process was
 * still holding parsed steady-state snapshots, and the run died with no output
 * after 4.5 minutes of browser work. A grade is never worth losing the run that
 * produced it, so above the threshold we report the command instead of running it.
 */
export function shouldGradeInProcess(heapUsedBytes, limitBytes = 1_500_000_000) {
  return Number.isFinite(heapUsedBytes) && heapUsedBytes < limitBytes;
}

/** The standalone command to grade a snapshot, so a skip is still actionable. */
export function realmSurvivalCommandFor(snapshot) {
  return `node --max-old-space-size=10240 scripts/realm-survival-gate.mjs --snapshot=${snapshot} --json`;
}

/**
 * Grade a snapshot in a child process, because parsing ~340 MB of snapshot needs
 * a larger old-space than this gate is normally launched with.
 */
function gradeRealmSurvivalSnapshot(snapshot) {
  const gateScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'realm-survival-gate.mjs');
  const child = spawnSync(
    process.execPath,
    ['--max-old-space-size=6144', gateScript, `--snapshot=${snapshot}`, '--json'],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  const stdout = String(child.stdout || '').trim();
  try {
    return JSON.parse(stdout);
  } catch (_) {
    return {
      status: 'RED',
      ok: false,
      reason: `realm-survival grade did not return JSON (exit ${child.status}): `
        + `${String(child.stderr || stdout).slice(0, 300)}`,
    };
  }
}

export async function runHeapCycleMemoryGate({
  fixtureDir = null,
  requireBrowser = false,
  timeoutMs = 720_000,
  surface = 'dist-v9',
  disableFlags = [],
  cycles = null,
  requireBuild = null,
  poHandSample = false,
  playHoldMs = null,
  datasetMode = null,
  timeframes = null,
  finalRetainerSnapshot = false,
  snapshotOutPath = null,
  steadyStateDiff = false,
  ablateTerminateWorkers = false,
  datasetRotate = 0,
  releaseConsole = false,
  memoryApiProbe = false,
  runBrowser = null,
} = {}) {
  const startedAt = new Date().toISOString();
  try {
    let report;
    if (fixtureDir) {
      report = loadFixtureReport(fixtureDir);
    } else {
      const browserRunner = runBrowser || (await import('./lib/heap-cycle-browser.mjs')).runHeapCycleBrowserSession;
      try {
        const browserOpts = {
          timeoutMs,
          surface,
          disableFlags,
        };
        if (poHandSample !== null && poHandSample !== undefined) {
          browserOpts.poHandSample = poHandSample === true;
        }
        if (datasetMode) browserOpts.datasetMode = datasetMode;
        if (Array.isArray(timeframes) && timeframes.length) browserOpts.timeframes = timeframes;
        if (finalRetainerSnapshot) browserOpts.finalRetainerSnapshot = true;
        if (snapshotOutPath) browserOpts.snapshotOutPath = snapshotOutPath;
        if (steadyStateDiff) browserOpts.steadyStateDiff = true;
        if (ablateTerminateWorkers) browserOpts.ablateTerminateWorkers = true;
        if (datasetRotate) browserOpts.datasetRotate = datasetRotate;
        // Preserve the mode ('deep' vs true): coercing to true silently downgrades it.
        if (releaseConsole) browserOpts.releaseConsole = releaseConsole;
        if (memoryApiProbe) browserOpts.memoryApiProbe = true;
        if (Number.isFinite(cycles) && cycles > 0) browserOpts.cycles = cycles;
        if (Number.isFinite(playHoldMs) && playHoldMs > 0) browserOpts.playHoldMs = playHoldMs;
        report = await browserRunner(browserOpts);
      } catch (error) {
        if (!requireBrowser && /puppeteer unavailable|no Chromium|Browser/i.test(String(error?.message || error))) {
          return {
            ok: false,
            status: HEAP_CYCLE_STATUS_SKIP,
            signature: HEAP_CYCLE_SIGNATURE,
            error: String(error?.message || error),
            cells: [],
            report: null,
            meta: { startedAt, finishedAt: new Date().toISOString(), requireBrowser, surface },
          };
        }
        throw error;
      }
    }

    const cells = assertHeapCycleMemoryReport(report);
    // Grade realm survival whenever a run wrote a snapshot to disk. A leak that
    // retains a whole panel realm does not always show in a floor delta, and a
    // floor delta cannot say whether the product or our inspector holds it.
    const gradedSnapshot = newestCycleSnapshot(snapshotOutPath);
    if (snapshotOutPath && !gradedSnapshot) {
      // A surface that takes snapshots and discards them leaves REALM-SURVIVAL-V1
      // with nothing to grade. Silence there reads as a pass; say it instead.
      cells.push({
        name: 'REALM-SURVIVAL-V1',
        pass: false,
        status: 'RED',
        detail: `a snapshot was requested at ${snapshotOutPath} but none was written, `
          + 'so realm survival could not be graded on this surface',
        blocking: true,
      });
    }
    if (gradedSnapshot) {
      const affordable = shouldGradeInProcess(process.memoryUsage().heapUsed);
      const cell = affordable
        ? buildRealmSurvivalCell(gradeRealmSurvivalSnapshot(gradedSnapshot))
        : {
          name: 'REALM-SURVIVAL-V1',
          pass: true,
          status: 'SKIPPED-LOWMEM',
          detail: 'not graded in-process — this run is holding parsed snapshots and an '
            + `in-line grade has killed a run before. Grade it with: ${realmSurvivalCommandFor(gradedSnapshot)}`,
          nonBlocking: true,
        };
      if (cell) cells.push({ ...cell, snapshot: gradedSnapshot });
    }
    if (requireBuild) {
      const got = report?.meta?.buildId || null;
      const pinOk = got === requireBuild;
      cells.unshift({
        name: 'HEAP-CYCLE-BUILD-PIN',
        pass: pinOk,
        status: pinOk ? 'GREEN' : 'RED',
        detail: pinOk
          ? `buildId=${got} matches --require-build`
          : `buildId=${got || 'MISSING'} ≠ required ${requireBuild}`,
        blocking: true,
        expected: requireBuild,
        actual: got,
      });
    }
    // Ship GREEN requires leak-stable + census cells; regrade INSUFFICIENT non-blocking.
    // Calibration RED (harness not real product) is reported first in error string.
    const cellsOk = cells.every((row) => {
      if (row.name === 'M26-REGRADE-ON-HEAP-CYCLE' || row.name === 'FIX3-REGRADE-ON-HEAP-CYCLE') {
        return row.pass === true;
      }
      if (row.nonBlocking === true) return true;
      return row.pass === true;
    });
    const failed = cells.filter((cell) => !cell.pass && cell.nonBlocking !== true);
    failed.sort((a, b) => {
      if (a.name === 'HEAP-GROWTH-SURFACE-CALIBRATION') return -1;
      if (b.name === 'HEAP-GROWTH-SURFACE-CALIBRATION') return 1;
      if (a.name === 'HEAP-CYCLE-PO-WORKLOAD-ARMED') return -1;
      if (b.name === 'HEAP-CYCLE-PO-WORKLOAD-ARMED') return 1;
      return 0;
    });
    return {
      ok: cellsOk,
      status: cellsOk ? 'GREEN' : 'RED',
      signature: HEAP_CYCLE_SIGNATURE,
      error: cellsOk ? null : failed.map((cell) => `${cell.name}: ${cell.detail}`).join('; '),
      cells,
      report,
      meta: {
        startedAt,
        finishedAt: new Date().toISOString(),
        fixtureDir: fixtureDir || null,
        requireBrowser,
        requireBuild: requireBuild || null,
        surface: report?.meta?.surface || surface,
        buildId: report?.meta?.buildId || null,
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: 'RED',
      signature: HEAP_CYCLE_SIGNATURE,
      error: String(error?.message || error),
      cells: [],
      report: null,
      meta: { startedAt, finishedAt: new Date().toISOString(), requireBrowser, fixtureDir },
    };
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  let report;
  let wantJson = false;
  let outPath = null;
  try {
    const options = parseHeapCycleMemoryArgs();
    wantJson = options.json === true;
    outPath = options.outPath;
    report = await runHeapCycleMemoryGate({
      fixtureDir: options.fixtureDir,
      requireBrowser: options.requireBrowser,
      timeoutMs: options.timeoutMs,
      surface: options.surface,
      disableFlags: options.disableFlags,
      cycles: options.cycles,
      requireBuild: options.requireBuild,
      poHandSample: options.poHandSample,
      playHoldMs: options.playHoldMs,
      datasetMode: options.datasetMode,
      timeframes: options.timeframes,
      finalRetainerSnapshot: options.finalRetainerSnapshot,
      snapshotOutPath: options.snapshotOutPath,
      steadyStateDiff: options.steadyStateDiff,
      ablateTerminateWorkers: options.ablateTerminateWorkers,
      datasetRotate: options.datasetRotate,
      releaseConsole: options.releaseConsole,
      memoryApiProbe: options.memoryApiProbe,
    });
  } catch (error) {
    report = {
      ok: false,
      status: 'RED',
      signature: HEAP_CYCLE_SIGNATURE,
      error: String(error?.message || error),
      cells: [],
    };
    wantJson = process.argv.includes('--json');
  }
  const text = wantJson
    ? JSON.stringify(report, null, 2)
    : formatHeapCycleMemoryReport(report);
  if (outPath) {
    fs.writeFileSync(outPath, text, 'utf8');
    // Compact console summary — avoids mixing serve.mjs [api] noise with JSON.
    console.log(formatHeapCycleMemoryReport(report));
    console.log(`wrote ${outPath}`);
  } else if (wantJson) {
    console.log(text);
  } else {
    console.log(text);
  }
  process.exit(report.ok ? 0 : 1);
}

export { synthesizePoLeakHeapCycleReport, defaultHeapCycleGate01FixtureDir };

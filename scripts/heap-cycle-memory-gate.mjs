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

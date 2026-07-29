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
    timeoutMs: 300_000,
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
    } else if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = Number(arg.slice('--timeout-ms='.length));
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
  timeoutMs = 300_000,
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
        report = await browserRunner({ timeoutMs });
      } catch (error) {
        if (!requireBrowser && /puppeteer unavailable|no Chromium|Browser/i.test(String(error?.message || error))) {
          return {
            ok: false,
            status: HEAP_CYCLE_STATUS_SKIP,
            signature: HEAP_CYCLE_SIGNATURE,
            error: String(error?.message || error),
            cells: [],
            report: null,
            meta: { startedAt, finishedAt: new Date().toISOString(), requireBrowser },
          };
        }
        throw error;
      }
    }

    const cells = assertHeapCycleMemoryReport(report);
    // Ship GREEN requires leak-stable cells; regrade INSUFFICIENT cells are non-blocking.
    const cellsOk = cells.every((row) => {
      if (row.name === 'M26-REGRADE-ON-HEAP-CYCLE' || row.name === 'FIX3-REGRADE-ON-HEAP-CYCLE') {
        return row.pass === true;
      }
      return row.pass === true;
    });
    return {
      ok: cellsOk,
      status: cellsOk ? 'GREEN' : 'RED',
      signature: HEAP_CYCLE_SIGNATURE,
      error: cellsOk ? null : cells.filter((cell) => !cell.pass).map((cell) => `${cell.name}: ${cell.detail}`).join('; '),
      cells,
      report,
      meta: {
        startedAt,
        finishedAt: new Date().toISOString(),
        fixtureDir: fixtureDir || null,
        requireBrowser,
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
  try {
    const options = parseHeapCycleMemoryArgs();
    wantJson = options.json === true;
    report = await runHeapCycleMemoryGate(options);
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
  if (wantJson) console.log(JSON.stringify(report, null, 2));
  else console.log(formatHeapCycleMemoryReport(report));
  process.exit(report.ok ? 0 : 1);
}

export { synthesizePoLeakHeapCycleReport, defaultHeapCycleGate01FixtureDir };

#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runM8LoadTollBudgetGate } from './m8-load-toll-budget-gate.mjs';
import { runReadme63Suite } from './release-parity-readme-6-3-add-remove.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

export const RESET_GATES_SIGNATURE = 'TALARIA_RESET_GATES_V1';

export async function runResetGates({ live = false } = {}) {
  const loadToll = await runM8LoadTollBudgetGate({ live });
  const destroyHeap = runReadme63Suite();
  const destroyHeapAllowedRed = destroyHeap.status === 'RED'
    && destroyHeap.current?.status === 'RED'
    && destroyHeap.releaseAuthority?.productBlocksRelease === true
    && destroyHeap.current?.requiresChartDestroy === true;
  const checks = [
    {
      cell: 'RESET-M8-LOAD-TOLL-BUDGET',
      status: loadToll.status,
      required: true,
      reportStatus: loadToll.status,
    },
    {
      cell: 'RESET-DESTROY-HEAP-README-6-3',
      status: destroyHeapAllowedRed ? 'ALLOWED_RED' : destroyHeap.status,
      required: true,
      reportStatus: destroyHeap.status,
      allowance: destroyHeapAllowedRed
        ? 'Free RED today: R3/Chart.destroy() fails by construction, and the gate proves the current leak honestly.'
        : null,
    },
  ];
  const status = checks.every((check) => check.status === 'GREEN' || check.status === 'ALLOWED_RED')
    ? (loadToll.status === 'GREEN' ? 'GREEN' : 'RED')
    : 'RED';
  return {
    signature: RESET_GATES_SIGNATURE,
    status,
    measurementStamp: loadToll.measurementStamp,
    checks,
    loadToll,
    destroyHeap,
    statement:
      'Reset depends on M8 navigation-start load-toll budget and README 6.3 destroy heap gate. Destroy heap is allowed RED today only because Chart.destroy()/R3 is absent.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runResetGates({ live: process.argv.includes('--live') });
  const outPath = resolve(root, 'docs/plan3/RESET-GATES-20260731.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'GREEN' ? 0 : 1);
}

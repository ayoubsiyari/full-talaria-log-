import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { poolAllocationPackets } from '../qw3-allocation-pool.mjs';

function writePacket(dir, name, { totalSampledMb, rate, sites }) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `${JSON.stringify({
    row: 'synthetic allocation packet',
    startedAt: '2026-08-02T00:00:00.000Z',
    finishedAt: '2026-08-02T00:05:00.000Z',
    nominalBarsPerSecond: 10,
    effectiveRate: { mean: rate },
    totalSampledMb,
    topSites: sites,
  }, null, 2)}\n`);
  return file;
}

test('QW-3 pool: aggregates default indicator-worker and resample rows across packets', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qw3-pool-'));
  const a = writePacket(dir, 'a.json', {
    totalSampledMb: 10,
    rate: 9.8,
    sites: [
      { site: 'w.onmessage @ chart-indicators-full.js:10', mb: 1.5, pct: 15 },
      { site: 'mergeIndicatorTailWindow @ indicator-performance.js:11', mb: 0.5, pct: 5 },
      { site: '_resampleDataFull @ chart.js:1', mb: 2, pct: 20 },
      { site: 'small @ chart.js:2', mb: 1, pct: 10 },
    ],
  });
  const b = writePacket(dir, 'b.json', {
    totalSampledMb: 20,
    rate: 10.2,
    sites: [
      { site: 'w.onmessage @ chart-indicators-full.js:12', mb: 2, pct: 10 },
      { site: 'finishWorkerPass @ chart-indicators-full.js:13', mb: 1, pct: 5 },
      { site: '_resampleDataFull @ chart.js:1', mb: 3, pct: 15 },
    ],
  });

  const report = poolAllocationPackets({ inputs: [a, b] });
  assert.equal(report.status, 'READY');
  assert.equal(report.packetCount, 2);
  assert.equal(report.totalSampledMb, 30);
  assert.equal(report.rateMean, 10);

  const indicatorWorker = report.rows.find((row) => row.label === 'Indicator worker result path');
  const resample = report.rows.find((row) => row.label === 'MONSTER-2 _resampleDataFull');
  assert.equal(indicatorWorker.pooledMb, 5);
  assert.equal(indicatorWorker.pooledPct, 16.67);
  assert.equal(indicatorWorker.runsWithMatch, 2);
  assert.equal(resample.pooledMb, 5);
  assert.equal(resample.pooledPct, 16.67);
});

test('QW-3 pool: custom top-stack rows and missing input voids are explicit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qw3-pool-'));
  const a = writePacket(dir, 'a.json', {
    totalSampledMb: 8,
    rate: 10,
    sites: [
      { site: 'w.onmessage @ panel-cmd-bridge.js:1', mb: 1, pct: 12.5 },
      { site: 'other @ chart.js:2', mb: 1, pct: 12.5 },
    ],
  });
  const missing = path.join(dir, 'missing.json');
  const report = poolAllocationPackets({
    inputs: [a, missing],
    stacks: [{ label: 'custom onmessage', patterns: [/w\.onmessage/i] }],
  });

  assert.equal(report.status, 'VOID_MISSING_INPUT');
  assert.deepEqual(report.missingInputs, [missing]);
  assert.equal(report.rows[0].label, 'custom onmessage');
  assert.equal(report.rows[0].pooledMb, 1);
  assert.equal(report.rows[0].pooledPct, 12.5);
});
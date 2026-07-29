#!/usr/bin/env node
/**
 * Bisect B's four b85 leak fixes on the live canary via HEAP-CYCLE-MEMORY-V1.
 *
 * Configs:
 *   ALL_ON          — production defaults (fixes armed)
 *   ALL_OFF         — all four kill-switches true
 *   OFF_<flag>      — leave-one-out: disable only that fix
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runHeapCycleMemoryGate } from './heap-cycle-memory-gate.mjs';
import { HEAP_CYCLE_B85_FIX_DISABLE_FLAGS } from './lib/heap-cycle-browser.mjs';

const FIXES = HEAP_CYCLE_B85_FIX_DISABLE_FLAGS;

function summarize(gate) {
  const report = gate.report || {};
  const cycles = Array.isArray(report.cycles) ? report.cycles : [];
  const baseline = report.baseline?.usedJSHeapSize ?? null;
  const floors = [
    baseline,
    ...cycles.map((c) => c?.returnSingle?.usedJSHeapSize),
  ].filter((n) => Number.isFinite(n));
  const heapDeltas = [];
  for (let i = 1; i < floors.length; i += 1) {
    heapDeltas.push(floors[i] - floors[i - 1]);
  }
  const detachedDeltas = cycles.map((c) => c?.detachedDivDelta ?? c?.returnSingle?.detachedDivDelta ?? null);
  const meanHeap = heapDeltas.length
    ? heapDeltas.reduce((a, b) => a + b, 0) / heapDeltas.length
    : null;
  const meanDetached = detachedDeltas.filter((n) => Number.isFinite(n));
  const meanDet = meanDetached.length
    ? meanDetached.reduce((a, b) => a + b, 0) / meanDetached.length
    : null;
  const cells = Object.fromEntries((gate.cells || []).map((c) => [c.name, c.status]));
  return {
    status: gate.status,
    build: report.meta?.buildId || null,
    disableFlags: report.meta?.disableFlags || [],
    floorsMb: floors.map((b) => Number((b / 1048576).toFixed(2))),
    heapDeltasMb: heapDeltas.map((b) => Number((b / 1048576).toFixed(2))),
    meanHeapDeltaMb: meanHeap == null ? null : Number((meanHeap / 1048576).toFixed(2)),
    meanHeapDeltaBytes: meanHeap,
    detachedDeltas,
    meanDetachedDelta: meanDet,
    m26: cells['M26-REGRADE-ON-HEAP-CYCLE'] || null,
    fix3: cells['FIX3-REGRADE-ON-HEAP-CYCLE'] || null,
    detachedCell: cells['HEAP-CYCLE-DETACHED-DIV-STABLE'] || null,
    heapCell: cells['HEAP-CYCLE-HEAP-FLOOR-BOUNDED'] || null,
    error: gate.error || null,
  };
}

function bisectEffect(rows) {
  const allOn = rows.find((r) => r.id === 'ALL_ON');
  const allOff = rows.find((r) => r.id === 'ALL_OFF');
  if (!allOn || allOn.meanHeapDeltaMb == null) {
    return { ok: false, reason: 'ALL_ON missing mean heap delta' };
  }
  const carriers = [];
  for (const flag of FIXES) {
    const row = rows.find((r) => r.id === `OFF_${flag.replace('__TALARIA_DISABLE_', '')}`);
    if (!row || row.meanHeapDeltaMb == null) continue;
    const worsenMb = row.meanHeapDeltaMb - allOn.meanHeapDeltaMb;
    carriers.push({
      flag,
      meanHeapDeltaMb: row.meanHeapDeltaMb,
      worsenVsAllOnMb: Number(worsenMb.toFixed(2)),
      carriesEffect: worsenMb >= 2, // ≥2 MB/cycle worsening when disabled
    });
  }
  return {
    ok: true,
    allOnMeanMb: allOn.meanHeapDeltaMb,
    allOffMeanMb: allOff?.meanHeapDeltaMb ?? null,
    allOffWorsenMb: allOff?.meanHeapDeltaMb != null
      ? Number((allOff.meanHeapDeltaMb - allOn.meanHeapDeltaMb).toFixed(2))
      : null,
    carriers,
    namedCarriers: carriers.filter((c) => c.carriesEffect).map((c) => c.flag),
  };
}

function progress(msg, obj = {}) {
  const line = JSON.stringify({ at: new Date().toISOString(), msg, ...obj });
  fs.appendFileSync('.scratch-w71-b85-bisect.progress.jsonl', `${line}\n`);
  console.log(line);
}

async function runConfig(id, disableFlags, timeoutMs) {
  const outPath = path.resolve(`.scratch-w71-b85-${id}.json`);
  progress('config-start', { id, disableFlags });
  const gate = await runHeapCycleMemoryGate({
    requireBrowser: true,
    surface: 'deployed',
    timeoutMs,
    disableFlags,
  });
  fs.writeFileSync(outPath, JSON.stringify(gate, null, 2));
  const summary = { id, outPath, ...summarize(gate) };
  progress('config-done', summary);
  return summary;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const timeoutMs = 360_000;
  const configs = [
    { id: 'ALL_ON', disableFlags: [] },
    { id: 'ALL_OFF', disableFlags: FIXES.slice() },
    ...FIXES.map((flag) => ({
      id: `OFF_${flag.replace('__TALARIA_DISABLE_', '')}`,
      disableFlags: [flag],
    })),
  ];

  // Sequential on shared canary auth — parallel sessions detach frames / stomp login.
  const rows = [];
  for (const c of configs) {
    rows.push(await runConfig(c.id, c.disableFlags, timeoutMs));
  }
  const effect = bisectEffect(rows);
  const out = {
    signature: 'TALARIA_HEAP_CYCLE_B85_FLAG_BISECT_V1',
    buildExpected: '20260729b85',
    rows,
    effect,
  };
  fs.writeFileSync('.scratch-w71-b85-bisect.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(effect.ok ? 0 : 1);
}

#!/usr/bin/env node
/**
 * PUBLISHED-SET-SWEEP — every figure C's lane has published, run through PHASE-SURVIVAL-01.
 *
 * 27 of 37 instruments force collection on a live page. That does not invalidate everything equally,
 * and "use your judgement" is not a standard two people apply and agree. This applies the criterion
 * to the actual published set and writes the roster, so each figure stands or falls for a reason
 * anyone can check and re-derive.
 *
 * The claim list is data, kept here rather than in the library so the criterion and the things it
 * judges cannot be quietly tuned to each other.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sweepPublishedSet } from './lib/phase-survival.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const matched = { sameSession: true, samePhaseRegime: true, sameCurveOrdered: true };

export const PUBLISHED_CLAIMS = [
  // --- quiescent instruments: never phase-corrupt ---
  { claim: 'method gap, 1 s read vs settled — 108.2 MB', source: 'canonical-floor-retake pass 3',
    kind: 'difference', valueMB: 108.2, quiescent: true, quantity: 'total', ...matched },
  { claim: 'canonical post-play floor — 674.9 MB (b126)', source: 'canonical-floor-retake pass 3',
    kind: 'absolute', valueMB: 674.9, quiescent: true, quantity: 'total' },
  { claim: 'canonical boot floor — no number, NOT_IDLE', source: 'canonical-floor-retake pass 3',
    kind: 'absolute', valueMB: 0, quiescent: true, quantity: 'total' },

  // --- non-quiescent absolutes ---
  { claim: 'CONF-01 post-GC total — 1,159.7 MB (b120)', source: 'conf01-baseline-gate',
    kind: 'absolute', valueMB: 1159.7, quiescent: false, quantity: 'total' },
  { claim: 'CONF-01 first paint — 1,342.9 MB (b120)', source: 'conf01-baseline-gate',
    kind: 'absolute', valueMB: 1342.9, quiescent: false, quantity: 'total' },
  { claim: 'N1 heavy first paint — 1,395.9 MB (b121)', source: 'n1-heavy-vs-fresh',
    kind: 'absolute', valueMB: 1395.9, quiescent: false, quantity: 'total' },
  { claim: 'N1 fresh first paint — 1,387.4 MB (b121)', source: 'n1-heavy-vs-fresh',
    kind: 'absolute', valueMB: 1387.4, quiescent: false, quantity: 'total' },
  { claim: 'N1 post-drain floor — 1,032.0 MB (b121)', source: 'n1-heavy-vs-fresh',
    kind: 'absolute', valueMB: 1032.0, quiescent: false, quantity: 'total' },

  // --- non-quiescent differences ---
  { claim: 'gcReleased mean — 183.2 MB (b120)', source: 'conf01-baseline-gate',
    kind: 'difference', valueMB: 183.2, quiescent: false, quantity: 'total',
    sameSession: true, samePhaseRegime: false, sameCurveOrdered: false },
  { claim: 'combined canvas reclaim — 19.6 MB', source: 'combined-canvas-fix-baseline',
    kind: 'difference', valueMB: 19.6, quiescent: false, quantity: 'gpu',
    sameSession: false, samePhaseRegime: true, sameCurveOrdered: false },
  { claim: 'indicator-layer canvas reclaim — 61.52 MB', source: 'ind-layer-arena-measure',
    kind: 'difference', valueMB: 61.52, quiescent: false, quantity: 'gpu', ...matched },
  { claim: 'linked-pane canvas reclaim — 53.72 MB', source: 'combined-canvas-fix-baseline',
    kind: 'difference', valueMB: 53.72, quiescent: false, quantity: 'gpu', ...matched },
  { claim: 'pair-switch slope — 12.7 MB/switch (already disproved by D)', source: 'c02-pairswitch-pane-measure',
    kind: 'difference', valueMB: 12.7, quiescent: false, quantity: 'total', ...matched },
  { claim: 'frothDrained heavy — 311.5 MB (b121)', source: 'n1-heavy-vs-fresh',
    kind: 'difference', valueMB: 311.5, quiescent: false, quantity: 'total', ...matched },
];

function main() {
  const s = sweepPublishedSet(PUBLISHED_CLAIMS);
  const artifact = {
    gate: 'PUBLISHED-SET-SWEEP',
    criterion: 'PHASE-SURVIVAL-01',
    generatedAt: new Date().toISOString(),
    localOffset: '+01:00',
    tally: s.tally,
    rows: s.rows.map((r, i) => ({ ...r, source: PUBLISHED_CLAIMS[i].source })),
  };
  const out = path.join(ROOT, '_evidence', 'manager-C', 'published-set-phase-sweep.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(artifact, null, 2));

  for (const r of artifact.rows) console.log(`  ${String(r.verdict).padEnd(30)} ${r.claim}`);
  console.log('');
  for (const [k, v] of Object.entries(s.tally)) console.log(`  ${k.padEnd(30)} ${v}`);
  console.log(`[sweep] wrote ${path.relative(ROOT, out).replace(/\\/g, '/')}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}

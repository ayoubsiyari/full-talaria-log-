#!/usr/bin/env node
/**
 * CACHE-STAMP-COHERENCE-V1 CLI
 * Usage:
 *   node scripts/cache-stamp-coherence-gate.mjs
 *   node scripts/cache-stamp-coherence-gate.mjs --write-baseline
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBaselineFromTree,
  formatCacheStampCoherenceReport,
  runCacheStampCoherenceGate,
  writeBaseline,
} from './lib/cache-stamp-coherence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const writeBaselineFlag = process.argv.includes('--write-baseline');

if (writeBaselineFlag) {
  const baseline = buildBaselineFromTree(root);
  const abs = writeBaseline(root, baseline);
  console.log(`wrote ${abs}`);
  console.log(`modules=${Object.keys(baseline.modules).length}`);
  process.exit(0);
}

const report = runCacheStampCoherenceGate({ root });
console.log(formatCacheStampCoherenceReport(report));
process.exit(report.allPass ? 0 : 1);

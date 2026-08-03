/**
 * DETAILED-DUMP-PARSER-V1
 *
 * Non-browser parser for Chrome memory-infra detailed dump artifacts.
 * Accepts raw trace JSON or already-summarized allocator artifacts and emits
 * root/child tables plus adjacent diffs. This is item 6 on the instrument list:
 * one level below top-level arena columns, without launching Chrome.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { diffAllocatorDetail, summariseAllocatorDetail } from './lib/blink-allocator-detail.mjs';
import { ARENA_KEYS, arenaColumnName, arenaColumns } from './lib/arena-columns.mjs';

const DEFAULT_ROOTS = ['v8', 'partition_alloc', 'malloc', 'blink_gc', 'blink_objects', 'canvas', 'cc', 'gpu', 'shared_memory', 'discardable', 'web_cache', 'skia'];
const OUT = arg('out', null);
const TOP_N = Number(arg('top', '25'));

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function inputPaths() {
  return process.argv.slice(2).filter((a) => !a.startsWith('--'));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function hasDetailShape(obj) {
  return obj && typeof obj === 'object'
    && obj.rootsMB && typeof obj.rootsMB === 'object'
    && obj.childrenByRoot && typeof obj.childrenByRoot === 'object';
}

function cloneDetail(detail, label) {
  const rootsMB = { ...(detail.rootsMB || {}) };
  const childrenByRoot = {};
  for (const [root, rows] of Object.entries(detail.childrenByRoot || {})) {
    childrenByRoot[root] = (rows || [])
      .map((r) => ({ name: r.name, mb: Number(r.mb) || 0 }))
      .sort((a, b) => b.mb - a.mb)
      .slice(0, TOP_N);
  }
  return { label, rootsMB, childrenByRoot };
}

function processCoverage(detail, proc) {
  const totalPrivateMB = proc?.privateFootprintMB ?? proc?.residentMB ?? null;
  if (totalPrivateMB == null) return null;
  const row = arenaColumns(detail.rootsMB, {
    totalPrivateMB,
    totalBasis: proc?.privateFootprintMB != null ? 'process-private-footprint' : 'process-resident-set',
  });
  return {
    namedMB: row.arenaNamedTotalMB,
    unattributedMB: row.arenaUnattributedMB,
    coveragePct: row.arenaCoveragePct,
    state: row.arenaCoverageMeets95 ? 'COV_01_MEETS_95' : 'NOT_QUOTABLE_COVERAGE',
    totalPrivateMB: row.totalPrivateMB,
    totalBasis: row.totalBasis,
  };
}

function coverageFromArenaRow(row) {
  if (row?.arenaCoveragePct == null && row?.arenaNamedTotalMB == null) return null;
  return {
    namedMB: row.arenaNamedTotalMB ?? null,
    unattributedMB: row.arenaUnattributedMB ?? null,
    coveragePct: row.arenaCoveragePct ?? null,
    state: row.arenaCoverageMeets95 ? 'COV_01_MEETS_95' : 'NOT_QUOTABLE_COVERAGE',
    totalPrivateMB: row.totalPrivateMB ?? row.footprintTotalMB ?? null,
    totalBasis: row.totalBasis ?? null,
  };
}

function detailFromArenaColumns(row) {
  if (row?.arenaColumnsVersion !== 'ARENA-COLUMNS-V1') return null;
  const rootsMB = {};
  for (const key of ARENA_KEYS) {
    const v = row[arenaColumnName(key)];
    if (v == null) continue;
    rootsMB[key] = Number(v);
  }
  if (!Object.keys(rootsMB).length) return null;
  return { rootsMB, childrenByRoot: {} };
}

function walk(obj, visit, trail = []) {
  if (!obj || typeof obj !== 'object') return;
  visit(obj, trail);
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walk(v, visit, trail.concat(String(i))));
    return;
  }
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') walk(value, visit, trail.concat(key));
  }
}

function sampleLabel(file, trail, suffix = '') {
  const base = path.basename(file);
  const tail = trail.filter((x) => !/^\d+$/.test(x)).slice(-5).join('.');
  return [base, tail, suffix].filter(Boolean).join(' :: ');
}

function extractFromTrace(file, json) {
  const events = Array.isArray(json?.traceEvents) ? json.traceEvents
    : (Array.isArray(json) ? json : null);
  if (!events) return [];
  const samples = [];
  for (const event of events) {
    const allocators = event?.args?.dumps?.allocators;
    if (!allocators) continue;
    const pid = event.pid ?? null;
    const ts = event.ts ?? null;
    samples.push({
      source: file,
      pid,
      ts,
      label: `${path.basename(file)} :: pid=${pid ?? '?'} ts=${ts ?? '?'}`,
      detail: summariseAllocatorDetail(allocators, { maxChildren: TOP_N }),
    });
  }
  return samples;
}

function extractSummaries(file, json) {
  const samples = [];
  for (const proc of json?.allocatorDump?.processes || []) {
    if (!hasDetailShape(proc?.allocatorDetail)) continue;
    const label = `${path.basename(file)} :: allocatorDump.processes pid=${proc.pid ?? '?'}`;
    const detail = cloneDetail(proc.allocatorDetail, label);
    samples.push({
      source: file,
      label,
      pid: proc.pid ?? null,
      detail,
      coverage: proc.cov01 || processCoverage(detail, proc),
      detailState: 'DETAILED_ALLOCATOR_CHILD_ROWS',
    });
  }
  walk(json, (node, trail) => {
    if (trail.includes('allocatorDump') && trail.includes('processes')) return;
    const flatDetail = detailFromArenaColumns(node);
    if (flatDetail) {
      samples.push({
        source: file,
        label: sampleLabel(file, trail, 'flattened-arena-columns'),
        pid: node.arenaDumpPid ?? null,
        detail: flatDetail,
        coverage: coverageFromArenaRow(node),
        detailState: 'ROOTS_ONLY_FLATTENED_ARENA_COLUMNS',
      });
      return;
    }
    if (hasDetailShape(node)) {
      samples.push({
        source: file,
        label: sampleLabel(file, trail),
        detail: cloneDetail(node, sampleLabel(file, trail)),
        detailState: 'DETAILED_ALLOCATOR_CHILD_ROWS',
      });
      return;
    }
    // Common reduced forms in E/C artifacts.
    if (node?.rootsMB && !node.childrenByRoot && !node.partitionBufferTop && !node.mallocTop) {
      samples.push({
        source: file,
        label: sampleLabel(file, trail, 'roots-only'),
        detail: { rootsMB: { ...node.rootsMB }, childrenByRoot: {} },
        detailState: 'ROOTS_ONLY_SUMMARY',
      });
    }
    if (Array.isArray(node?.partitionBufferTop) || Array.isArray(node?.mallocTop)) {
      const childrenByRoot = {};
      if (Array.isArray(node.partitionBufferTop)) childrenByRoot.partition_alloc = node.partitionBufferTop;
      if (Array.isArray(node.mallocTop)) childrenByRoot.malloc = node.mallocTop;
      samples.push({
        source: file,
        label: sampleLabel(file, trail, 'top-children'),
        detail: {
          rootsMB: { ...(node.rootsMB || {}) },
          childrenByRoot,
        },
        detailState: 'SUMMARY_TOP_CHILDREN',
      });
    }
  });
  return samples;
}

export function parseDetailedDumpArtifacts(files) {
  const samples = [];
  for (const file of files) {
    const json = readJson(file);
    samples.push(...extractFromTrace(file, json));
    samples.push(...extractSummaries(file, json));
  }
  return samples;
}

function rootTable(detail) {
  return DEFAULT_ROOTS
    .filter((name) => Object.prototype.hasOwnProperty.call(detail.rootsMB || {}, name))
    .map((name) => ({ name, mb: detail.rootsMB[name] }));
}

function childTable(detail) {
  const out = {};
  for (const root of Object.keys(detail.childrenByRoot || {}).sort()) {
    out[root] = (detail.childrenByRoot[root] || []).slice(0, TOP_N);
  }
  return out;
}

function diffSamples(samples) {
  const diffs = [];
  for (let i = 1; i < samples.length; i += 1) {
    const before = samples[i - 1];
    const after = samples[i];
    const diff = diffAllocatorDetail(before.detail, after.detail);
    diffs.push({
      label: `${before.label} -> ${after.label}`,
      before: before.label,
      after: after.label,
      rootDeltas: diff.rootDeltas,
      childDeltas: diff.childDeltas,
      totalNamedBeforeMB: +(Object.values(before.detail.rootsMB || {}).reduce((s, v) => s + (Number(v) || 0), 0)).toFixed(3),
      totalNamedAfterMB: +(Object.values(after.detail.rootsMB || {}).reduce((s, v) => s + (Number(v) || 0), 0)).toFixed(3),
    });
  }
  return diffs;
}

export function buildDetailedDumpReport(files) {
  const samples = parseDetailedDumpArtifacts(files);
  return {
    signature: 'DETAILED-DUMP-PARSER-V1',
    generatedAt: new Date().toISOString(),
    inputs: files,
    sampleCount: samples.length,
    samples: samples.map((s) => ({
      label: s.label,
      source: s.source,
      pid: s.pid ?? null,
      ts: s.ts ?? null,
      coverage: s.coverage ?? null,
      detailState: s.detailState ?? null,
      roots: rootTable(s.detail),
      children: childTable(s.detail),
    })),
    diffs: diffSamples(samples),
    note: 'Root deltas and child deltas are reported together. A child row is not quotable as product growth without its root/total context.',
  };
}

async function main() {
  const files = inputPaths();
  if (!files.length) {
    console.error('usage: node scripts/detailed-dump-parser.mjs <artifact.json>... [--out=report.json] [--top=25]');
    process.exitCode = 2;
    return;
  }
  const report = buildDetailedDumpReport(files);
  const text = JSON.stringify(report, null, 2);
  if (OUT) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, text);
  }
  console.log(text);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}

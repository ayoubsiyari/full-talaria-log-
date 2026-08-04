/**
 * Self-test for DETAILED-DUMP-PARSER-V1.
 * No browser, no network; writes only temporary synthetic fixtures.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { buildDetailedDumpReport } from './detailed-dump-parser.mjs';

function hex(mb) {
  return `0x${Math.round(mb * 1048576).toString(16)}`;
}

function writeJson(dir, name, obj) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(obj));
  return file;
}

describe('item 6 — DETAILED-DUMP-PARSER', () => {
  it('parses raw memory-infra trace events and preserves v8 child rows', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'detailed-dump-parser-'));
    const file = writeJson(dir, 'trace.json', {
      traceEvents: [
        {
          ph: 'v',
          pid: 123,
          ts: 1000,
          args: {
            dumps: {
              allocators: {
                v8: { attrs: { size: { value: hex(50) } } },
                'v8/main/heap/old_space': { attrs: { size: { value: hex(30) } } },
                'v8/main/malloc': { attrs: { size: { value: hex(8) } } },
                partition_alloc: { attrs: { size: { value: hex(90) } } },
                'partition_alloc/partitions/buffer': { attrs: { size: { value: hex(40) } } },
                malloc: { attrs: { size: { value: hex(20) } } },
              },
            },
          },
        },
      ],
    });

    const report = buildDetailedDumpReport([file]);
    assert.equal(report.sampleCount, 1);
    assert.equal(report.samples[0].pid, 123);
    assert.ok(report.samples[0].roots.some((r) => r.name === 'v8' && r.mb === 50));
    assert.ok(report.samples[0].children.v8.some((r) => r.name === 'v8/main/heap/old_space' && r.mb === 30));
    assert.ok(report.samples[0].children.partition_alloc.some((r) => r.name === 'partition_alloc/partitions/buffer' && r.mb === 40));
  });

  it('parses summarized artifact details and emits adjacent root/child diffs with totals', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'detailed-dump-parser-'));
    const file = writeJson(dir, 'summary.json', {
      before: {
        allocatorDetail: {
          detail: {
            rootsMB: { v8: 50, malloc: 10 },
            childrenByRoot: { v8: [{ name: 'v8/main/heap/old_space', mb: 20 }] },
          },
        },
      },
      after: {
        allocatorDetail: {
          detail: {
            rootsMB: { v8: 62, malloc: 12 },
            childrenByRoot: { v8: [{ name: 'v8/main/heap/old_space', mb: 31 }] },
          },
        },
      },
    });

    const report = buildDetailedDumpReport([file]);
    assert.equal(report.sampleCount, 2);
    assert.equal(report.diffs.length, 1);
    assert.equal(report.diffs[0].rootDeltas.find((r) => r.name === 'v8')?.deltaMB, 12);
    assert.equal(report.diffs[0].childDeltas.v8.find((r) => r.name === 'v8/main/heap/old_space')?.deltaMB, 11);
    assert.equal(report.diffs[0].totalNamedBeforeMB, 60);
    assert.equal(report.diffs[0].totalNamedAfterMB, 74);
  });

  it('parses item 6 capture artifacts as process-scoped COV-01 rows without duplicate detail samples', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'detailed-dump-parser-'));
    const file = writeJson(dir, 'live-memory.json', {
      allocatorDump: {
        item: 'DETAILED-DUMP-CAPTURE',
        processes: [
          {
            pid: 456,
            privateFootprintMB: 200,
            allocatorDetail: {
              rootsMB: { v8: 60, partition_alloc: 100, malloc: 30 },
              childrenByRoot: {
                partition_alloc: [{ name: 'partition_alloc/partitions/buffer', mb: 80 }],
              },
            },
          },
        ],
      },
    });

    const report = buildDetailedDumpReport([file]);
    assert.equal(report.sampleCount, 1);
    assert.equal(report.samples[0].pid, 456);
    assert.equal(report.samples[0].coverage.coveragePct, 95);
    assert.equal(report.samples[0].coverage.state, 'PROCESS_LOCAL_MEETS_95_NOT_COV01');
    assert.equal(report.samples[0].detailState, 'DETAILED_ALLOCATOR_CHILD_ROWS');
    assert.ok(report.samples[0].children.partition_alloc.some((r) => r.name === 'partition_alloc/partitions/buffer' && r.mb === 80));
  });

  it('parses C capture artifacts on the corrected all-process COV-01 basis', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'detailed-dump-parser-'));
    const file = writeJson(dir, 'trades-start.detailed-dump.json', {
      signature: 'DETAILED-DUMP-CAPTURE-V1',
      moment: 'trades:start',
      totalPrivateMB: 674.9,
      totalBasis: 'all-chrome-process-private',
      selectedPid: 6920,
      singlePidCoverage: 59.84,
      singlePidCoverageNote: 'the basis that produced the published 59.84%; kept for comparison, not for quoting',
      processes: [
        {
          pid: 6920,
          allocatorDetail: {
            rootsMB: { v8: 60, partition_alloc: 100, malloc: 30 },
            childrenByRoot: {
              partition_alloc: [{ name: 'partition_alloc/partitions/buffer', mb: 80 }],
            },
          },
        },
        {
          pid: 7000,
          allocatorDetail: {
            rootsMB: { gpu: 20 },
            childrenByRoot: {
              gpu: [{ name: 'gpu/command_buffer', mb: 12 }],
            },
          },
        },
      ],
      row: {
        covState: 'MEASURED',
        arenaNamedTotalMB: 650,
        totalPrivateMB: 674.9,
        arenaCoveragePct: 96.31,
        arenaUnattributedMB: 24.9,
        arenaCoverageMeets95: true,
        basisGuard: { state: 'SAME_BASIS', ok: true },
        processCount: 2,
        sizeBasis: 'effective_size',
        heaviestPid: 6920,
        heaviestDetail: {
          rootsMB: { v8: 60, partition_alloc: 100, malloc: 30 },
          childrenByRoot: {
            partition_alloc: [{ name: 'partition_alloc/partitions/buffer', mb: 80 }],
          },
        },
      },
    });

    const report = buildDetailedDumpReport([file]);
    assert.equal(report.sampleCount, 1);
    assert.equal(report.samples[0].pid, 6920);
    assert.equal(report.samples[0].coverage.coveragePct, 96.31);
    assert.equal(report.samples[0].coverage.state, 'COV_01_MEETS_95');
    assert.equal(report.samples[0].coverage.totalBasis, 'all-chrome-process-private');
    assert.equal(report.samples[0].coverage.sizeBasis, 'effective_size');
    assert.equal(report.samples[0].coverage.processCount, 2);
    assert.equal(report.samples[0].basisComparison.singlePidCoverage, 59.84);
    assert.match(report.samples[0].basisComparison.note, /not for quoting/);
    assert.ok(report.samples[0].children.partition_alloc.some((r) => r.name === 'partition_alloc/partitions/buffer' && r.mb === 80));
  });

  it('parses existing COV-01 flattened arena rows as roots-only and keeps the block loud', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'detailed-dump-parser-'));
    const file = writeJson(dir, 'canonical-floor.json', {
      floor: {
        arenas: {
          arenaColumnsVersion: 'ARENA-COLUMNS-V1',
          arenaV8MB: 47.75,
          arenaPartitionAllocMB: 47.05,
          arenaMallocMB: 75.72,
          arenaBlinkGcMB: 74.82,
          arenaNamedTotalMB: 403.85,
          totalPrivateMB: 674.9,
          totalBasis: 'all-chrome-process-private',
          arenaUnattributedMB: 271.05,
          arenaCoveragePct: 59.84,
          arenaCoverageMeets95: false,
          arenaDumpPid: 6920,
        },
      },
    });

    const report = buildDetailedDumpReport([file]);
    assert.equal(report.sampleCount, 1);
    assert.equal(report.samples[0].pid, 6920);
    assert.equal(report.samples[0].detailState, 'ROOTS_ONLY_FLATTENED_ARENA_COLUMNS');
    assert.equal(report.samples[0].coverage.coveragePct, 59.84);
    assert.equal(report.samples[0].coverage.state, 'NOT_QUOTABLE_COVERAGE');
    assert.equal(report.samples[0].children.partition_alloc, undefined);
  });
});

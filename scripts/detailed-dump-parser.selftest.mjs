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
    assert.equal(report.samples[0].coverage.state, 'COV_01_MEETS_95');
    assert.ok(report.samples[0].children.partition_alloc.some((r) => r.name === 'partition_alloc/partitions/buffer' && r.mb === 80));
  });
});

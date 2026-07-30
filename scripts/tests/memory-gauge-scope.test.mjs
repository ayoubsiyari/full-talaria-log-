/**
 * The gauge-scope instrument bits.
 *
 * Chrome quantizes performance.memory unless --enable-precise-memory-info is
 * passed, and every harness here passes it while the PO's browser does not. Being
 * able to drop the flag is what turned "the console gauge is wrong-scoped" from an
 * argument into a measurement, so the switch itself is worth pinning.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { preciseMemoryArgs, readFrameTree } from '../lib/heap-cycle-browser.mjs';

test('precise memory info is on by default and removable by env', () => {
  delete process.env.TALARIA_HEAP_NO_PRECISE_MEMORY;
  assert.deepEqual(preciseMemoryArgs(), ['--enable-precise-memory-info']);
  process.env.TALARIA_HEAP_NO_PRECISE_MEMORY = '1';
  assert.deepEqual(preciseMemoryArgs(), []);
  // Anything other than an explicit '1' keeps the accurate default rather than
  // silently degrading the gauge.
  process.env.TALARIA_HEAP_NO_PRECISE_MEMORY = '0';
  assert.deepEqual(preciseMemoryArgs(), ['--enable-precise-memory-info']);
  delete process.env.TALARIA_HEAP_NO_PRECISE_MEMORY;
});

test('the frame tree is flattened depth-first with urls and names', async () => {
  const cdp = {
    send: async () => ({
      frameTree: {
        frame: { url: 'http://host/shell.html', name: '' },
        childFrames: [
          { frame: { url: 'http://host/panel.html?id=B', name: 'panel-B' } },
          {
            frame: { url: 'http://host/panel.html?id=C', name: 'panel-C' },
            childFrames: [{ frame: { url: 'about:blank', name: null } }],
          },
        ],
      },
    }),
  };
  const rows = await readFrameTree(cdp, 'test');
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => r.depth), [0, 1, 1, 2]);
  assert.equal(rows[1].name, 'panel-B');
  assert.equal(rows[3].url, 'about:blank');
});

test('a failed frame-tree read returns null rather than throwing mid-sample', async () => {
  const cdp = { send: async () => { throw new Error('target closed'); } };
  assert.equal(await readFrameTree({ ...cdp }, 'test'), null);
});

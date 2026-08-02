import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const replayPath = path.join(__dirname, 'replay-system.js');
const homeReplayPath = path.join(repoRoot, 'homepage/public/chart/modules/replay-system.js');
if (!global.window) global.window = {};
const ReplaySystem = require(replayPath);

function makeReplay() {
  return Object.create(ReplaySystem.prototype);
}

test('QW-3 resample cache keep: replay-system mirrors stay byte-identical', () => {
  assert.equal(fs.readFileSync(homeReplayPath, 'utf8'), fs.readFileSync(replayPath, 'utf8'));
});

test('QW-3 resample cache keep: default keeps pipeline cache, kill switch restores invalidation', () => {
  const priorWindow = global.window;
  try {
    global.window = {};
    const replay = makeReplay();
    let invalidations = 0;
    const chart = {
      dataPipeline: {
        invalidateResampleCache() {
          invalidations += 1;
        },
      },
    };

    replay._m20Q9DropConsumerResampleCache(chart);
    assert.equal(invalidations, 0, 'default QW-3 path keeps ChartDataPipeline cache warm');

    global.window.__TALARIA_DISABLE_QW3_RESAMPLE_CACHE_KEEP_V1 = true;
    replay._m20Q9DropConsumerResampleCache(chart);
    assert.equal(invalidations, 1, 'kill switch restores legacy cache invalidation');

    global.window.__TALARIA_DISABLE_M20_PREFIX_SLICE_V1 = true;
    replay._m20Q9DropConsumerResampleCache(chart);
    assert.equal(invalidations, 1, 'legacy prefix-slice mode still avoids extra invalidation traffic');
  } finally {
    global.window = priorWindow;
  }
});

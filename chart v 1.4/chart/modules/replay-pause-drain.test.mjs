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

function makeBars(n) {
  return Array.from({ length: n }, (_, i) => ({
    t: 1_700_000_000_000 + i * 60_000,
    o: i,
    h: i + 1,
    l: i - 1,
    c: i + 0.5,
    v: 1,
  }));
}

test('replay pause drain: mirrors stay byte-identical', () => {
  assert.equal(fs.readFileSync(homeReplayPath, 'utf8'), fs.readFileSync(replayPath, 'utf8'));
});

test('replay pause drain trims behind playhead and clears derived caches', () => {
  const rs = Object.create(ReplaySystem.prototype);
  const chart = {
    indicators: { active: [] },
    displaySeries: [{ t: 1 }],
    rawData: [],
    dataPipeline: {
      invalidations: 0,
      invalidateResampleCache() {
        this.invalidations += 1;
      },
    },
  };

  rs.chart = chart;
  rs.isActive = true;
  rs.fullRawData = makeBars(9000);
  rs.currentIndex = 8000;
  rs.sessionStartIndex = 0;
  rs._m20Q9PrefixByMaster = new WeakMap();
  let rebuiltWithAutoScroll = null;
  rs.updateChartData = (autoScroll) => {
    rebuiltWithAutoScroll = autoScroll;
    chart.rawData = rs.fullRawData.slice(0, rs.currentIndex + 1);
  };

  rs._drainReplayResidencyOnPause();

  assert.equal(rs.fullRawData.length, 6000, 'keeps the 5,000-bar context plus forward tail');
  assert.equal(rs.currentIndex, 5000, 'rebases currentIndex after dropping 3,000 bars');
  assert.equal(rs.sessionStartIndex, 0);
  assert.equal(rs._evictedBehindPlayheadBars, 3000);
  assert.equal(rs._m20Q9PrefixByMaster, null, 'drops reusable playhead prefix shells');
  assert.equal(chart.dataPipeline.invalidations, 1, 'drops retained resample/display cache');
  assert.equal(chart.displaySeries, null);
  assert.equal(rebuiltWithAutoScroll, false, 'rebuilds the paused prefix without autoscroll');
  assert.equal(chart.rawData.length, 5001);
});

test('replay pause invokes residency drain before final paused render', () => {
  const rs = Object.create(ReplaySystem.prototype);
  const order = [];
  rs.chart = {
    orderManager: { _shouldSkipMcIframeRuntimePersist: () => true },
    render() { order.push('render'); },
  };
  rs.isActive = true;
  rs.isPlaying = true;
  rs.tickProgress = 0;
  rs.tickElapsedMs = 0;
  rs.animatingCandle = null;
  rs._cancelDeferredPlayStart = () => {};
  rs._cancelCandlePlaybackPaint = () => {};
  rs._speedGovClearClock = () => {};
  rs._speedGovResetMeter = () => {};
  rs._speedGovPublishEffectiveRate = () => {};
  rs._nextCandleTimer = null;
  rs.tickInterval = null;
  rs.playInterval = null;
  rs.showTickProgress = () => {};
  rs.syncPlayPauseButtonVisuals = () => {};
  rs._flushReplayIndicatorRecalc = () => { order.push('indicator'); };
  rs._drainReplayResidencyOnPause = () => { order.push('drain'); };

  rs.pause();

  assert.deepEqual(order, ['drain', 'indicator', 'render']);
  assert.equal(rs.isPlaying, false);
});

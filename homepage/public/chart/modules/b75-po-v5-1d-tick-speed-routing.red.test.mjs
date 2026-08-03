import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

// SEAL-EVIDENCE-01: source evidence cannot bless served bytes. This gate reads the chart
// SOURCE, so it can show what the code says and not what the sealed build does.
// The token travels in the output because an audit document does not travel with
// a sweep log.
console.log("[SEAL-EVIDENCE-01] STATIC_ONLY_SOURCE_GATE ORDER-01B 1d tick-speed routing \u2014 reads source; served behaviour unobserved");


const require = createRequire(import.meta.url);
global.window = {
  addEventListener() {},
  removeEventListener() {},
  location: { href: 'http://local.test/chart?sessionId=synthetic-b75-v5' },
  /**
   * This suite characterises the LEGACY TICK path — 1D/1m subdivision, the tick
   * scheduler, the tick-path cache bound. TICK-OFF-01 makes candle the only
   * playback mode by default, so without this switch getPlaybackMode() answers
   * 'candle', startTickAnimation() re-routes into the candle loop, and the
   * suite both fails and HANGS: the candle loop arms a real setInterval that
   * this harness has no fake timers to clear.
   *
   * Setting it restores the exact mode these cells were written against, so the
   * legacy characterisation is preserved rather than weakened. The coverage
   * this suite does NOT provide — what the product does by DEFAULT — belongs to
   * tick-off-candle-only-playback.test.mjs.
   */
  __TALARIA_DISABLE_CANDLE_ONLY_PLAYBACK_V1: true,
};
const ReplaySystem = require('./replay-system.js');

function makeProductPath({ displayTimeframe = '1d', rawTimeframeMs = 60_000 } = {}) {
  const replay = Object.create(ReplaySystem.prototype);
  replay.playbackMode = 'tick';
  replay.isPlaying = true;
  replay.isActive = true;
  replay.stepTimeframeOverride = null;
  replay.speed = 1;
  replay.ticksPerCandle = 72;
  replay.useConstantTickInterval = true;
  replay.tickPathCache = {};
  replay._tickPathCacheRef = replay.tickPathCache;
  replay._tickPathCacheKeys = [];
  replay._tickPathCacheHead = 0;
  replay.currentIndex = 0;
  replay.chart = {
    currentTimeframe: displayTimeframe,
    orderManager: { getOrderExecutionCadenceMs: () => 60_000 },
    _serverCursors: null,
  };
  replay.fullRawData = [
    { t: 1_700_000_000_000 },
    {
      t: 1_700_000_000_000 + rawTimeframeMs,
      o: 100, h: 102, l: 99, c: 101, v: 10,
    },
    {
      t: 1_700_000_000_000 + 2 * rawTimeframeMs,
      o: 101, h: 103, l: 100, c: 102, v: 10,
    },
  ];
  return replay;
}

function startAndCaptureScheduler(replay) {
  replay.getForwardPrefetchThreshold = () => 1;
  replay.getTickPath = () => Array.from({ length: 72 }, (_, index) => 100 + index / 72);
  let scheduled = 0;
  replay.scheduleNextTick = () => { scheduled += 1; };
  ReplaySystem.prototype.startTickAnimation.call(replay);
  assert.equal(scheduled, 1, 'product start path arms exactly one tick chain');
  return {
    configuredSpeed: replay.speed,
    effectiveSpeed: replay.getEffectivePlaybackSpeed(),
    subdivisions: replay._finestTfCadenceSubdivisions(),
    ticks: replay.currentTicksPerCandle,
    fastMode: replay.fastMode,
    interval: replay.fastMode ? replay.fastModeInterval : replay.volumeTickData.baseInterval,
  };
}

test('RED: 1D tick mode retains tick loop while 1m order cadence enables subdivisions', () => {
  const replay = makeProductPath();
  assert.equal(replay.getPlaybackMode(), 'tick', 'configured UI mode is tick');
  assert.equal(replay._getOrderExecutionCadenceMs(), 60_000);
  assert.equal(replay._shouldUseTickAnimation(), true);
  assert.equal(replay.getPlaybackLoopKind(), 'tick');
  assert.equal(replay._isFinestTfReplayCadenceEnabled(), true,
    'retained order cadence activates the finest-timeframe scheduler');
});

test('RED: 1D/1m subdivision multiplies every selected speed by 1440', () => {
  const replay = makeProductPath();
  assert.equal(replay._finestTfCadenceSubdivisions(), 1440);

  const matrix = [];
  for (const configuredSpeed of [1, 5, 15, 30]) {
    replay.speed = configuredSpeed;
    const scheduler = startAndCaptureScheduler(replay);
    matrix.push(scheduler);
    assert.equal(scheduler.effectiveSpeed, configuredSpeed,
      'reported effective speed does not expose scheduler subdivision');
    assert.equal(scheduler.subdivisions, 1440);
  }
  assert.equal(matrix[0].fastMode, false);
  assert.ok(matrix[0].interval < 32,
    '1x enters a sub-frame-adjacent smooth interval only because the 1D/1m ratio is applied');
  assert.deepEqual(matrix.slice(1).map((row) => row.fastMode), [true, true, true],
    'subdivision mutation flips the remaining low speeds into product fast mode');
  assert.ok(matrix[1].interval > matrix[2].interval && matrix[2].interval > matrix[3].interval,
    'actual fast scheduler intervals remain speed-sensitive');
});

test('mutation-sensitive display/replay TF ratios and equal-TF control execute product functions', () => {
  const cases = [
    ['1d', 1440],
    ['4h', 240],
    ['1h', 60],
    ['1m', 1],
  ];
  for (const [displayTimeframe, expectedRatio] of cases) {
    const replay = makeProductPath({ displayTimeframe });
    assert.equal(replay._getSelectedReplayCadenceMs(), replay.timeframeToMs(displayTimeframe));
    assert.equal(replay._finestTfCadenceSubdivisions(), expectedRatio);
  }

  const equalTf = makeProductPath({ displayTimeframe: '1m' });
  const scheduler = startAndCaptureScheduler(equalTf);
  assert.equal(scheduler.subdivisions, 1);
  assert.equal(scheduler.configuredSpeed, scheduler.effectiveSpeed);
  assert.ok(Math.abs(scheduler.interval - (60_000 / 72)) < 0.001,
    'equal-TF control has no hidden subdivision acceleration');
});

test('end-of-data uses product stop path and records an explicit completion notification', () => {
  const replay = makeProductPath();
  let pauses = 0;
  let completions = 0;
  replay.pause = () => { pauses += 1; replay.isPlaying = false; };
  replay._notifyReplayReachedEndOfData = () => { completions += 1; };
  ReplaySystem.prototype._finishPlaybackAtSessionEnd.call(replay);
  assert.equal(replay.isPlaying, false);
  assert.equal(pauses, 1);
  assert.equal(completions, 1);
});

test('memory-bound separation: TF ratio changes cadence, not the product tick-cache bound', () => {
  const replay = makeProductPath();
  const max = replay._tickPathCacheMaxEntries();
  replay.getTickPath = ReplaySystem.prototype.getTickPath;
  for (let index = 0; index < max * 3; index += 1) {
    const t = 1_700_000_000_000 + index * 60_000;
    replay.getTickPath({ t, o: 100, h: 102, l: 99, c: 101, v: 1 });
  }
  assert.ok(Object.keys(replay.tickPathCache).length <= max);
  assert.equal(replay._finestTfCadenceSubdivisions(), 1440);
  replay.chart.currentTimeframe = '1m';
  assert.equal(replay._finestTfCadenceSubdivisions(), 1);
  assert.ok(Object.keys(replay.tickPathCache).length <= max,
    'M25 cadence mutation does not disable the separate M19 cache bound');
});

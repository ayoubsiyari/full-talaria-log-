import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
global.window = {};
const ReplaySystem = require('./replay-system.js');
const here = dirname(fileURLToPath(import.meta.url));

function fixture(step) {
  const diag = { refresh: 0, raf: 0, schedule: 0 };
  const chart = {
    canvas: {},
    mouseX: 50,
    mouseY: 50,
    margin: { l: 10, r: 10, t: 10, b: 10 },
    w: 100,
    h: 100,
    refreshCrosshairFromLastPointer() { diag.refresh += 1; },
    scheduleRender() { diag.schedule += 1; },
  };
  const replay = Object.create(ReplaySystem.prototype);
  Object.assign(replay, {
    chart,
    isPlaying: true,
    isActive: true,
    currentIndex: 1,
    replayTimestamp: 1000,
    _replayPaintGeneration: 0,
    getCandlePlaybackCadence: () => ({ stepsPerTick: 1, orderMoneyPath: false }),
    _isOrderMoneyPathBatchEnabled: () => false,
    simpleStepForward() { step(replay, chart, diag); },
  });
  return { replay, chart, diag };
}

test('committed advance acknowledgement refreshes exactly once without scheduling', () => {
  const { replay, diag } = fixture((r) => {
    r.currentIndex += 1;
    r.replayTimestamp += 60_000;
    r._replayPaintGeneration += 1;
  });
  replay._runCandlePlaybackTick();
  assert.deepEqual(diag, { refresh: 1, raf: 0, schedule: 0 });
});

for (const [name, configure] of [
  ['no advance', () => {}],
  ['advance without paint', (r) => { r.currentIndex += 1; r.replayTimestamp += 60_000; }],
  ['paint without advance', (r) => { r._replayPaintGeneration += 1; }],
  ['teardown after committed paint', (r) => {
    r.currentIndex += 1; r.replayTimestamp += 60_000; r._replayPaintGeneration += 1; r.isActive = false;
  }],
  ['pause after committed paint', (r) => {
    r.currentIndex += 1; r.replayTimestamp += 60_000; r._replayPaintGeneration += 1; r.isPlaying = false;
  }],
  ['wrong owner after committed paint', (r) => {
    r.currentIndex += 1; r.replayTimestamp += 60_000; r._replayPaintGeneration += 1; r.chart = {};
  }],
]) {
  test(`${name} acknowledges zero crosshair refreshes`, () => {
    const { replay, diag } = fixture(configure);
    replay._runCandlePlaybackTick();
    assert.equal(diag.refresh, 0);
    assert.equal(diag.raf, 0);
    assert.equal(diag.schedule, 0);
  });
}

test('no pointer, end-of-data, paused entry, and kill switch refresh zero times', () => {
  const committed = (r) => {
    r.currentIndex += 1;
    r.replayTimestamp += 60_000;
    r._replayPaintGeneration += 1;
  };
  const noPointer = fixture(committed);
  noPointer.chart.mouseX = NaN;
  noPointer.replay._runCandlePlaybackTick();
  assert.equal(noPointer.diag.refresh, 0);

  const end = fixture(() => {});
  end.replay._runCandlePlaybackTick();
  assert.equal(end.diag.refresh, 0);

  const paused = fixture(committed);
  paused.replay.isPlaying = false;
  paused.replay._runCandlePlaybackTick();
  assert.equal(paused.diag.refresh, 0);

  const killed = fixture(committed);
  window.__TALARIA_DISABLE_REPLAY_CROSSHAIR_REFRESH = true;
  killed.replay._runCandlePlaybackTick();
  delete window.__TALARIA_DISABLE_REPLAY_CROSSHAIR_REFRESH;
  assert.equal(killed.diag.refresh, 0);
});

test('reentrant tick is rejected and retains one committed refresh', () => {
  const { replay, chart, diag } = fixture((r) => {
    r.currentIndex += 1;
    r.replayTimestamp += 60_000;
    r._replayPaintGeneration += 1;
  });
  chart.refreshCrosshairFromLastPointer = () => {
    diag.refresh += 1;
    replay._runCandlePlaybackTick();
  };
  replay._runCandlePlaybackTick();
  assert.equal(replay.currentIndex, 2);
  assert.equal(diag.refresh, 1);
});

test('canonical and homepage replay products remain byte-identical', () => {
  const canonical = readFileSync(resolve(here, 'replay-system.js'));
  const homepage = readFileSync(resolve(here, '..', '..', '..', 'homepage', 'public', 'chart', 'modules', 'replay-system.js'));
  assert.deepEqual(canonical, homepage);
});

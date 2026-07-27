import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const bridgeSource = fs.readFileSync(
  new URL('../multichart-prod/panel-cmd-bridge.js', import.meta.url),
  'utf8',
);
const indicatorSource = fs.readFileSync(
  new URL('chart-indicators-full.js', import.meta.url),
  'utf8',
);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function makePanelRuntime({
  indicatorTypes = ['sma', 'ema', 'wma'],
  panelId = 'B',
  seekOutcomes = [true],
} = {}) {
  const cover = deferred();
  const applied = [];
  const seeks = [];
  const indicatorPasses = [];
  const listeners = new Map();
  const parentChart = {
    currentFileId: 'host-file',
    currentSymbol: 'EURUSD',
    currentTimeframe: '1m',
    replaySystem: {
      replayTimestamp: 1_700_000_540_000,
      isPlaying: true,
      isActive: true,
    },
    data: [{ t: 1_700_000_540_000, c: 1.1 }],
  };
  const replaySystem = {
    isActive: true,
    isPlaying: false,
    replayTimestamp: 1_700_000_000_000,
    currentIndex: 10,
    fullRawData: Array.from({ length: 20 }, (_, i) => ({
      t: 1_700_000_000_000 + i * 60_000,
      c: 1 + i / 100,
    })),
    autoScrollEnabled: true,
    userHasPanned: false,
    applyMultichartMirrorFrame(frame) {
      applied.push({ ...frame });
      this.replayTimestamp = frame.timestamp;
      chart.scheduleReplayIndicatorRecalc?.(true);
      return true;
    },
    goToReplayTimestamp(timestamp) {
      const outcome = seekOutcomes.length > 1 ? seekOutcomes.shift() : seekOutcomes[0];
      if (outcome instanceof Error) throw outcome;
      if (outcome !== true) return false;
      seeks.push(timestamp);
      this.replayTimestamp = timestamp;
      this.currentIndex = Math.max(0, Math.min(
        this.fullRawData.length - 1,
        Math.floor((timestamp - this.fullRawData[0].t) / 60_000),
      ));
      chart.scheduleReplayIndicatorRecalc?.(chart._multichartPassivePlayActive === true);
      return true;
    },
    setSpeed() {},
    setPlaybackMode() {},
    exitReplayMode() { this.isActive = false; },
  };
  const chart = {
    currentFileId: 'panel-file',
    currentSymbol: 'GBPUSD',
    currentTimeframe: '1m',
    rawData: replaySystem.fullRawData,
    data: replaySystem.fullRawData.slice(0, 11),
    replaySystem,
    indicators: {
      active: indicatorTypes.map((type, i) => ({ id: `${type}-${i}`, type })),
      data: {},
    },
    ensureReplayDataCoversTimestamp() {
      return cover.promise;
    },
    applyMultichartReplayCut(timestamp) {
      replaySystem.replayTimestamp = timestamp;
    },
    scheduleReplayIndicatorRecalc(isPlaying) {
      if (!this.indicators.active.length) return;
      if (this._mcReplayOwnershipCommitPending === true) {
        this._mcReplayIndicatorRecalcDeferred = true;
        return;
      }
      indicatorPasses.push({
        isPlaying,
        coveragePending: this._mcReplayOwnershipCommitPending === true,
        timestamp: replaySystem.replayTimestamp,
      });
    },
    constrainOffset() {},
    render() {},
    setTimeframe(tf) { this.currentTimeframe = tf; },
  };
  const root = {
    chart,
    parent: {
      chart: parentChart,
      postMessage() {},
      document: { querySelector() { return null; } },
    },
    location: {
      search: `?multichart=1&panelId=${panelId}`,
      origin: 'https://talaria.test',
    },
    document: {
      readyState: 'complete',
      addEventListener() {},
      removeEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener() {},
    requestAnimationFrame(fn) { fn(); return 1; },
    cancelAnimationFrame() {},
    setTimeout,
    clearTimeout,
    setInterval() { return 1; },
    clearInterval() {},
    performance: { now: () => 1_000 },
    URLSearchParams,
    Promise,
    Map,
    Set,
    Math,
    Date,
    console,
  };
  root.window = root;
  root.globalThis = root;
  vm.runInNewContext(bridgeSource, root);
  return {
    root, chart, replaySystem, cover, applied, seeks, indicatorPasses,
    dispatch(type) {
      for (const fn of listeners.get(type) || []) fn({ type });
    },
  };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

test('Play commits independent coverage before SMA/EMA/WMA recalc or frame paint', async () => {
  const panel = makePanelRuntime();
  const bridge = panel.root.MultichartCmdBridge;

  await bridge.applyCommand('replayPlay', { speed: 60, mode: 'candle' });
  await bridge.applyCommand('replayFrame', {
    timestamp: 1_700_000_600_000,
    currentIndex: 20,
    isPlaying: true,
  });

  assert.equal(panel.chart._mcReplayOwnershipCommitPending, true);
  assert.equal(panel.applied.length, 0, 'frame paint must wait for coverage ownership');
  assert.equal(panel.indicatorPasses.length, 0, 'indicator pass must not race coverage ownership');

  panel.cover.resolve(true);
  await settle();

  assert.equal(panel.chart._mcReplayOwnershipCommitPending, false);
  assert.ok(panel.seeks.length >= 1, 'covered panel must commit a seek');
  assert.equal(panel.seeks.at(-1), 1_700_000_600_000);
  assert.ok(panel.indicatorPasses.length >= 1);
  assert.ok(panel.indicatorPasses.every((pass) => pass.coveragePending === false));
});

test('no-indicator control keeps the same coverage/frame ordering across panels', async () => {
  const panels = ['B', 'C', 'D'].map((panelId) => makePanelRuntime({
    indicatorTypes: [],
    panelId,
  }));

  for (const panel of panels) {
    await panel.root.MultichartCmdBridge.applyCommand('replayPlay', { speed: 60 });
    await panel.root.MultichartCmdBridge.applyCommand('replayFrame', {
      timestamp: 1_700_000_600_000,
      currentIndex: 20,
      isPlaying: true,
    });
    assert.equal(panel.applied.length, 0);
    panel.cover.resolve(true);
  }
  await settle();

  for (const panel of panels) {
    assert.equal(panel.seeks.at(-1), 1_700_000_600_000);
    assert.equal(panel.indicatorPasses.length, 0);
  }
});

test('Pause tears down a pending cover; second Play commits only the latest frame', async () => {
  const panel = makePanelRuntime();
  const bridge = panel.root.MultichartCmdBridge;

  await bridge.applyCommand('replayPlay', { speed: 60 });
  await bridge.applyCommand('replayFrame', {
    timestamp: 1_700_000_600_000,
    isPlaying: true,
  });
  await bridge.applyCommand('replayPause', {});
  panel.cover.resolve(true);
  await settle();

  assert.equal(panel.chart._mcReplayOwnershipCommitPending, false);
  assert.equal(panel.seeks.includes(1_700_000_600_000), false,
    'a covered result from the paused generation must not revive Play');

  await bridge.applyCommand('replayPlay', { speed: 60 });
  await bridge.applyCommand('replayFrame', {
    timestamp: 1_700_001_140_000,
    isPlaying: true,
  });
  await settle();

  assert.equal(panel.seeks.at(-1), 1_700_001_140_000);
  assert.ok(panel.indicatorPasses.every((pass) => pass.coveragePending === false));
});

test('ordering guard preserves frame-coherent ON/OFF legacy discrimination', () => {
  const guard = indicatorSource.indexOf('this._mcReplayOwnershipCommitPending === true');
  const coherentBranch = indicatorSource.indexOf('if (_m19ifFrameCoherentEnabled())', guard);
  assert.ok(guard >= 0 && coherentBranch > guard,
    'ownership guard must run before either frame-coherent branch');
  assert.match(indicatorSource, /__TALARIA_DISABLE_M19I_FRAME_COHERENT_V1/);
  assert.match(bridgeSource, /_mcPlayEagerCoverGeneration/);
  assert.match(bridgeSource, /_mcReplayFrameAfterOwnershipCommit/);
});

test('coverage rejection fails closed with diagnostics and no queued paint', async () => {
  const panel = makePanelRuntime();
  await panel.root.MultichartCmdBridge.applyCommand('replayPlay', { speed: 60 });
  await panel.root.MultichartCmdBridge.applyCommand('replayFrame', {
    timestamp: 1_700_000_600_000,
    isPlaying: true,
  });
  panel.cover.reject(new Error('injected coverage failure'));
  await settle();

  assert.equal(panel.chart._mcReplayOwnershipCommitPending, false);
  assert.equal(panel.seeks.length, 0);
  assert.equal(panel.indicatorPasses.length, 0);
  assert.equal(panel.chart._mcReplayFrameAfterOwnershipCommit, null);
  assert.equal(panel.chart._mcReplayOwnershipError.code, 'COVERAGE_REJECTED');
});

for (const command of ['replayExit', 'replayCut']) {
  test(`delayed coverage after ${command} cannot seek or paint`, async () => {
    const panel = makePanelRuntime();
    await panel.root.MultichartCmdBridge.applyCommand('replayPlay', { speed: 60 });
    await panel.root.MultichartCmdBridge.applyCommand('replayFrame', {
      timestamp: 1_700_000_600_000,
      isPlaying: true,
    });
    await panel.root.MultichartCmdBridge.applyCommand(command,
      command === 'replayCut' ? { timestamp: 1_700_000_120_000 } : {});
    const seeksBeforeResolve = panel.seeks.length;
    panel.cover.resolve(true);
    await settle();

    assert.equal(panel.chart._mcReplayOwnershipCommitPending, false);
    assert.equal(panel.seeks.length, seeksBeforeResolve);
    assert.equal(panel.indicatorPasses.length, 0);
    assert.equal(panel.chart._mcReplayFrameAfterOwnershipCommit, null);
  });
}

test('inactive seek acknowledgement fails closed', async () => {
  const panel = makePanelRuntime();
  await panel.root.MultichartCmdBridge.applyCommand('replayPlay', { speed: 60 });
  await panel.root.MultichartCmdBridge.applyCommand('replayFrame', {
    timestamp: 1_700_000_600_000,
    isPlaying: true,
  });
  panel.replaySystem.isActive = false;
  panel.cover.resolve(true);
  await settle();

  assert.equal(panel.chart._mcReplayOwnershipError.code, 'REPLAY_INACTIVE_BEFORE_SEEK');
  assert.equal(panel.seeks.length, 0);
  assert.equal(panel.indicatorPasses.length, 0);
});

test('generation supersession and teardown discard stale completion; retry succeeds', async () => {
  const panel = makePanelRuntime();
  const bridge = panel.root.MultichartCmdBridge;
  await bridge.applyCommand('replayPlay', { speed: 60 });
  const firstGeneration = panel.chart._mcPlayEagerCoverGeneration;
  await bridge.applyCommand('replayPlay', { speed: 60 });
  assert.ok(panel.chart._mcPlayEagerCoverGeneration > firstGeneration);
  await bridge.applyCommand('replayFrame', {
    timestamp: 1_700_000_600_000,
    isPlaying: true,
  });
  panel.dispatch('pagehide');
  panel.cover.resolve(true);
  await settle();
  assert.equal(panel.seeks.length, 0);
  assert.equal(panel.indicatorPasses.length, 0);

  await bridge.applyCommand('replayPlay', { speed: 60 });
  await bridge.applyCommand('replayFrame', {
    timestamp: 1_700_000_660_000,
    isPlaying: true,
  });
  await settle();
  assert.equal(panel.seeks.at(-1), 1_700_000_660_000);
  assert.ok(panel.indicatorPasses.every((pass) => pass.coveragePending === false));
});

test('timeframe replacement invalidates pending ownership before delayed coverage', async () => {
  const panel = makePanelRuntime();
  const bridge = panel.root.MultichartCmdBridge;
  await bridge.applyCommand('replayPlay', { speed: 60 });
  await bridge.applyCommand('replayFrame', {
    timestamp: 1_700_000_600_000,
    isPlaying: true,
  });
  await bridge.applyCommand('setTimeframe', { tf: '5m' });
  panel.cover.resolve(true);
  await settle();

  assert.equal(panel.chart.currentTimeframe, '5m');
  assert.equal(panel.chart._mcReplayOwnershipCommitPending, false);
  assert.equal(panel.seeks.length, 0);
  assert.equal(panel.indicatorPasses.length, 0);
});

test('false seek cannot synthesize ownership from matching stale timestamp/index', async () => {
  const panel = makePanelRuntime({ seekOutcomes: [false, false] });
  panel.replaySystem.replayTimestamp = 1_700_000_540_000;
  panel.replaySystem.currentIndex = 9;
  await panel.root.MultichartCmdBridge.applyCommand('replayPlay', { speed: 60 });
  await panel.root.MultichartCmdBridge.applyCommand('replayFrame', {
    timestamp: 1_700_000_600_000,
    isPlaying: true,
  });
  panel.cover.resolve(true);
  await settle();

  assert.equal(panel.chart._mcReplayOwnershipError.code, 'SEEK_REJECTED');
  assert.equal(panel.seeks.length, 0);
  assert.equal(panel.indicatorPasses.length, 0);
  assert.equal(panel.chart._mcReplayFrameAfterOwnershipCommit, null);
});

test('throwing seek fails closed without restamping or painting', async () => {
  const panel = makePanelRuntime({ seekOutcomes: [new Error('injected seek throw')] });
  const staleTimestamp = panel.replaySystem.replayTimestamp;
  const staleIndex = panel.replaySystem.currentIndex;
  await panel.root.MultichartCmdBridge.applyCommand('replayPlay', { speed: 60 });
  await panel.root.MultichartCmdBridge.applyCommand('replayFrame', {
    timestamp: 1_700_000_600_000,
    isPlaying: true,
  });
  panel.cover.resolve(true);
  await settle();

  assert.equal(panel.chart._mcReplayOwnershipError.code, 'SEEK_THROW');
  assert.equal(panel.replaySystem.replayTimestamp, staleTimestamp);
  assert.equal(panel.replaySystem.currentIndex, staleIndex);
  assert.equal(panel.indicatorPasses.length, 0);
});

test('false seek retries once in the same epoch and then commits true acknowledgement', async () => {
  const panel = makePanelRuntime({ seekOutcomes: [false, true] });
  const generationBefore = Number(panel.chart._mcPlayEagerCoverGeneration) || 0;
  await panel.root.MultichartCmdBridge.applyCommand('replayPlay', { speed: 60 });
  const activeGeneration = panel.chart._mcPlayEagerCoverGeneration;
  assert.ok(activeGeneration > generationBefore);
  await panel.root.MultichartCmdBridge.applyCommand('replayFrame', {
    timestamp: 1_700_000_600_000,
    isPlaying: true,
  });
  panel.cover.resolve(true);
  await settle();

  assert.equal(panel.chart._mcPlayEagerCoverGeneration, activeGeneration);
  assert.equal(panel.chart._mcReplayOwnershipError, null);
  assert.equal(panel.seeks.at(-1), 1_700_000_600_000);
  assert.ok(panel.indicatorPasses.every((pass) => pass.coveragePending === false));
});

test('teardown between bounded seek attempts cancels the retry epoch', async () => {
  const panel = makePanelRuntime({ seekOutcomes: [false, true] });
  await panel.root.MultichartCmdBridge.applyCommand('replayPlay', { speed: 60 });
  await panel.root.MultichartCmdBridge.applyCommand('replayFrame', {
    timestamp: 1_700_000_600_000,
    isPlaying: true,
  });
  panel.cover.resolve(true);
  await Promise.resolve();
  await Promise.resolve();
  panel.dispatch('beforeunload');
  await settle();

  assert.equal(panel.seeks.length, 0);
  assert.equal(panel.indicatorPasses.length, 0);
  assert.equal(panel.chart._mcReplayOwnershipCommitPending, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const managerSource = fs.readFileSync(
  new URL('../multichart-prod/multichart-manager.js', import.meta.url),
  'utf8',
);
const panelBridgeSource = fs.readFileSync(
  new URL('../multichart-prod/panel-cmd-bridge.js', import.meta.url),
  'utf8',
);
const chartSource = fs.readFileSync(new URL('../chart.js', import.meta.url), 'utf8');
const productGridSource = fs.readFileSync(
  new URL('../../talaria-design/src/MultichartGrid.jsx', import.meta.url),
  'utf8',
);
const productShellSource = fs.readFileSync(
  new URL('../../talaria-design/src/TalariaV8bLive.jsx', import.meta.url),
  'utf8',
);
const productIndexSource = fs.readFileSync(
  new URL('../dist-v9/index.html', import.meta.url),
  'utf8',
);
const panelManagerSource = fs.readFileSync(
  new URL('./panel-managerv2.js', import.meta.url),
  'utf8',
);

function makeRuntime({
  enabled, disabled = false, panels = [], persisted = true,
  ownerId = 'user-a', savedOwnerId = ownerId, sessionId = '827',
  timerApi = { setTimeout, clearTimeout },
} = {}) {
  const listeners = new Map();
  const logs = [];
  const root = {
    __TALARIA_DISABLE_MC_RESTORE_V1: disabled,
    __talariaUserId: ownerId,
    location: { origin: 'https://talaria.test' },
    MultichartGuards: {},
    chart: {
      activeTradingSessionId: sessionId,
      getActiveTradingSessionId() { return this.activeTradingSessionId; },
      data: [{}],
      _sessionStateLoadedFor: sessionId,
    },
    userStorage: {
      getScopedItem(key) {
        return persisted && key === 'chart_panel_state'
          ? JSON.stringify({
            ownerId: savedOwnerId, layout: '3', sessionId, panels,
          })
          : null;
      },
    },
    localStorage: {
      getItem() { throw new Error('unscoped localStorage fallback forbidden'); },
    },
    sessionStorage: {
      getItem() { throw new Error('sessionStorage fallback forbidden'); },
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatchEvent(event) {
      for (const fn of listeners.get(event.type) || []) fn.call(root, event);
    },
    document: {
      getElementById() { return null; },
      createElement() { return { style: {}, setAttribute() {} }; },
      head: { appendChild() {} },
    },
    setTimeout: timerApi.setTimeout,
    clearTimeout: timerApi.clearTimeout,
    URLSearchParams,
    Map,
    Set,
    Date,
    Math,
    console,
  };
  if (enabled !== undefined) root.__TALARIA_ENABLE_MC_RESTORE_V1 = enabled;
  root.window = root;
  root.globalThis = root;
  vm.runInNewContext(managerSource, root);
  const manager = new root.MultichartManager({
    container: {},
    onLog(entry) { logs.push(entry); },
  });
  return { root, manager, logs, listeners };
}

function panel(index, fileId, symbol) {
  return { index, isMainChart: index === 0, fileId, symbol, timeframe: '1m' };
}

function addFakePanel(manager, id, fileId, bars = 20) {
  const chart = {
    currentFileId: String(fileId),
    currentSymbol: id === 'B' ? 'GBPUSD' : 'EURUSD',
    activeTradingSessionId: '827',
    currentTimeframe: '1m',
    data: Array.from({ length: bars }, () => ({})),
  };
  const entry = {
    id,
    host: false,
    ready: false,
    state: {},
    frame: { style: {}, remove() {}, contentWindow: { chart } },
    _mcRestoreGeneration: manager._mcRestoreGeneration,
    _mcRestoreAssignment: manager._mcRestoreAssignmentForPanel(id),
  };
  manager.charts.set(id, entry);
  return entry;
}

function begin(manager) {
  const generation = manager.beginMcRestoreGeneration();
  for (const entry of manager.charts.values()) {
    entry._mcRestoreGeneration = generation;
    entry._mcRestoreAssignment = manager._mcRestoreAssignmentForPanel(entry.id);
  }
  return generation;
}

function readyEvent(entry, source = entry.frame.contentWindow, sourceId = entry.id) {
  return {
    source,
    origin: 'https://talaria.test',
    data: { type: 'bridge-ready', source: sourceId },
  };
}

test('MC_RESTORE explicit legacy kill switch installs no restore state', () => {
  const { manager, listeners } = makeRuntime({ enabled: false });
  assert.equal(manager._mcRestoreGeneration, undefined);
  assert.equal(listeners.size, 1, 'only the legacy manager message listener is installed');
  manager.dispose();
});

test('MC_RESTORE product default is ON and reads only user-scoped persisted identity', () => {
  const { manager } = makeRuntime({
    panels: [panel(0, '11', 'EURUSD'), panel(1, '22', 'AUDUSD')],
  });
  const generation = manager.beginMcRestoreGeneration();
  assert.equal(generation, 1);
  assert.deepEqual(
    structuredClone(manager._mcRestoreAssignmentForPanel('B')),
    {
      panelId: 'B',
      fileId: '22',
      ticker: 'AUDUSD',
      sessionId: '827',
      timeframe: '1m',
    },
  );
  manager.dispose();
});

test('MC_RESTORE dedicated kill switch overrides product default', () => {
  const { manager } = makeRuntime({ disabled: true });
  assert.equal(manager._mcRestoreGeneration, undefined);
  assert.equal(manager.beginMcRestoreGeneration(), null);
  manager.dispose();
});

test('missing user-scoped persistence fails closed without host storage fallback', () => {
  const { manager } = makeRuntime({
    persisted: false,
    panels: [panel(0, '11', 'EURUSD'), panel(1, '22', 'AUDUSD')],
  });
  manager.beginMcRestoreGeneration();
  assert.equal(manager._mcRestoreAssignmentForPanel('B'), null);
  manager.dispose();
});

test('logout then user switch cannot restore the previous owner identity', () => {
  const { root, manager } = makeRuntime({
    ownerId: 'user-a',
    savedOwnerId: 'user-a',
    panels: [panel(0, '11', 'EURUSD'), panel(1, '677', 'XAUUSD')],
  });
  manager.beginMcRestoreGeneration();
  assert.equal(manager._mcRestoreAssignmentForPanel('B').fileId, '677');
  root.__talariaUserId = 'user-b';
  manager.beginMcRestoreGeneration();
  assert.equal(manager._mcRestoreAssignmentForPanel('B'), null);
  manager.dispose();
});

test('private window without authenticated owner fails closed', () => {
  const { manager } = makeRuntime({
    ownerId: null,
    savedOwnerId: 'user-a',
    panels: [panel(0, '11', 'EURUSD'), panel(1, '22', 'AUDUSD')],
  });
  manager.beginMcRestoreGeneration();
  assert.equal(manager._mcRestoreAssignmentForPanel('B'), null);
  manager.dispose();
});

test('cross-owner and malformed session identities fail closed', () => {
  for (const options of [
    { ownerId: 'user-b', savedOwnerId: 'user-a', sessionId: '827' },
    { ownerId: 'user-a', savedOwnerId: 'user-a', sessionId: '' },
  ]) {
    const { manager } = makeRuntime({
      ...options,
      panels: [panel(0, '11', 'EURUSD'), panel(1, '22', 'AUDUSD')],
    });
    manager.beginMcRestoreGeneration();
    assert.equal(manager._mcRestoreAssignmentForPanel('B'), null);
    manager.dispose();
  }
});

test('auth-before-manager and auth-after-manager converge once per owner/session epoch', () => {
  const before = makeRuntime({
    ownerId: 'user-a',
    sessionId: '827',
    panels: [panel(0, '11', 'EURUSD'), panel(1, '22', 'AUDUSD')],
  });
  assert.equal(before.manager._refreshMcRestoreEpoch(), true);
  const beforeGeneration = before.manager._mcRestoreGeneration;
  assert.equal(before.manager._refreshMcRestoreEpoch(), true);
  assert.equal(before.manager._mcRestoreGeneration, beforeGeneration);
  before.manager.dispose();

  const after = makeRuntime({
    ownerId: null,
    savedOwnerId: 'user-a',
    sessionId: '827',
    panels: [panel(0, '11', 'EURUSD'), panel(1, '677', 'XAUUSD')],
  });
  assert.equal(after.manager._refreshMcRestoreEpoch(), false);
  after.root.__talariaUserId = 'user-a';
  after.manager._onMcRestoreEpochSignal({
    type: 'talaria-auth-changed',
    detail: { authenticated: true, ownerId: 'user-a' },
  });
  assert.equal(after.manager._mcRestoreEpoch, 'user-a|827');
  assert.equal(after.manager._mcRestoreAssignmentForPanel('B').fileId, '677');
  const generation = after.manager._mcRestoreGeneration;
  after.manager._onMcRestoreEpochSignal({
    type: 'talaria-auth-changed',
    detail: { authenticated: true, ownerId: 'user-a' },
  });
  assert.equal(after.manager._mcRestoreGeneration, generation);
  after.manager.dispose();
});

test('session switch and logout immediately invalidate prior generation', () => {
  const { root, manager } = makeRuntime({
    ownerId: 'user-a',
    sessionId: '827',
    panels: [panel(0, '11', 'EURUSD'), panel(1, '22', 'AUDUSD')],
  });
  assert.equal(manager._refreshMcRestoreEpoch(), true);
  const activeGeneration = manager._mcRestoreGeneration;
  root.chart.activeTradingSessionId = '999';
  manager._onMcRestoreEpochSignal({ type: 'tradingSessionChanged' });
  assert.equal(manager._mcRestoreEpoch, null);
  assert.equal(manager._mcRestoreLayout, null);
  assert.ok(manager._mcRestoreGeneration > activeGeneration);

  root.chart.activeTradingSessionId = '827';
  manager._onMcRestoreEpochSignal({ type: 'talaria-auth-changed', detail: { authenticated: true } });
  assert.equal(manager._mcRestoreEpoch, 'user-a|827');
  manager._onMcRestoreEpochSignal({
    type: 'talaria-auth-changed',
    detail: { authenticated: false },
  });
  assert.equal(manager._mcRestoreEpoch, null);
  assert.equal(manager._mcRestoreAssignmentForPanel('B'), null);
  manager.dispose();
});

test('auth-ready listeners are unique and removed on teardown', () => {
  const { manager, listeners } = makeRuntime();
  for (const eventName of manager._mcRestoreEpochEvents) {
    assert.equal(listeners.get(eventName)?.size, 1);
  }
  manager.dispose();
  for (const eventName of manager._mcRestoreEpochEvents) {
    assert.equal(listeners.get(eventName)?.size, 0);
  }
});

test('delayed auth polling is bounded and timeout fails closed', () => {
  const queue = [];
  const timerApi = {
    setTimeout(fn) { queue.push(fn); return fn; },
    clearTimeout(fn) {
      const index = queue.indexOf(fn);
      if (index >= 0) queue.splice(index, 1);
    },
  };
  const { manager } = makeRuntime({
    ownerId: null,
    savedOwnerId: 'user-a',
    timerApi,
    panels: [panel(0, '11', 'EURUSD'), panel(1, '22', 'AUDUSD')],
  });
  manager._startMcRestoreAuthReadyWatch();
  while (queue.length) queue.shift()();
  assert.equal(manager._mcRestoreAuthReadyAttempts, 100);
  assert.equal(manager._mcRestoreEpoch, null);
  assert.equal(manager._mcRestoreLayout, undefined);
  assert.equal(queue.length, 0);
  manager.dispose();
});

test('panel manager production load branch requires exact active session equality', () => {
  const state = {
    ownerId: 'user-a',
    sessionId: '827',
    layout: '3',
    panels: [panel(0, '11', 'EURUSD'), panel(1, '22', 'AUDUSD')],
  };
  const runtime = {
    window: {
      __talariaUserId: 'user-a',
      chart: {
        activeTradingSessionId: '827',
        getActiveTradingSessionId() { return this.activeTradingSessionId; },
      },
    },
    userStorage: { getScopedItem() { return JSON.stringify(state); } },
    module: { exports: {} },
    URLSearchParams,
    setTimeout,
    clearTimeout,
    console,
  };
  vm.runInNewContext(panelManagerSource, runtime);
  const load = runtime.module.exports.prototype.loadPanelState;
  assert.equal(structuredClone(load.call({})).sessionId, '827');
  runtime.window.chart.activeTradingSessionId = '999';
  assert.equal(load.call({}), null);
  assert.match(panelManagerSource,
    /activeSession && savedSession === activeSession \? state : null/);
});

test('restore barrier requires paused coherent replay timestamp and raw index before Play', () => {
  const queue = [];
  const timerApi = {
    setTimeout(fn) { queue.push(fn); return fn; },
    clearTimeout() {},
  };
  const { root, manager } = makeRuntime({
    timerApi,
    panels: [panel(0, '11', 'EURUSD'), panel(1, '22', 'AUDUSD')],
  });
  const generation = manager.beginMcRestoreGeneration();
  root.chart.replaySystem = {
    isActive: true,
    isPlaying: true,
    currentIndex: 1,
    replayTimestamp: 2000,
    fullRawData: [{ t: 1000 }, { t: 2000 }, { t: 3000 }],
  };
  let completed = 0;
  manager.completeMcRestoreGeneration = () => { completed += 1; return true; };
  manager._armMcRestoreHostBarrier(generation);
  assert.equal(completed, 0, 'Play cannot start before restored state is coherent and paused');
  root.chart.replaySystem.isPlaying = false;
  root.chart.replaySystem.replayTimestamp = 3500;
  queue.shift()();
  assert.equal(completed, 0, 'timestamp outside current raw bar remains blocked');
  root.chart.replaySystem.replayTimestamp = 2500;
  queue.shift()();
  assert.equal(completed, 1);
  manager.dispose();
});

test('actual product boot explicitly enables restore unless killed', () => {
  assert.match(productGridSource,
    /if \(window\.__TALARIA_ENABLE_MC_RESTORE_V1 === undefined\)[\s\S]*window\.__TALARIA_DISABLE_MC_RESTORE_V1 !== true/);
  assert.match(managerSource,
    /global\.__TALARIA_DISABLE_MC_RESTORE_V1 !== true[\s\S]*global\.__TALARIA_ENABLE_MC_RESTORE_V1 !== false/);
  assert.doesNotMatch(managerSource, /localStorage\.getItem\('chart_panel_state'\)/);
  assert.doesNotMatch(managerSource, /sessionStorage\.getItem\('chart_panel_state'\)/);
  assert.match(productShellSource, /storage\.getScopedItem\("chart_panel_state"\)/);
  assert.doesNotMatch(productShellSource, /localStorage\.getItem\("chart_panel_state"\)/);
  assert.doesNotMatch(productShellSource, /localStorage\.setItem\("chart_panel_state"/);
  assert.doesNotMatch(productGridSource, /sessionStorage\.(?:getItem|setItem)\(mcPanelFilePersistStorageKey/);
  assert.match(productIndexSource,
    /if \(key === 'chart_panel_state'\) return this\.getScopedItem\(key\)/);
  assert.match(productShellSource,
    /\["talaria-auth-changed", "tradingSessionChanged", "backtestingSessionChanged"\]/);
  assert.match(productShellSource, /attempts < 100/);
  assert.match(productShellSource, /layoutTupleFromId\(normalized\) \|\| \{ n: 1, li: 0 \}/);
});

test('delayed host completion assigns once after duplicate bridge-ready', async () => {
  const { root, manager } = makeRuntime({
    panels: [panel(0, '11', 'EURUSD'), panel(1, '22', 'GBPUSD')],
  });
  const entry = addFakePanel(manager, 'B', '22');
  const generation = begin(manager);
  let calls = 0;
  manager.sendCommand = async (id, command, args) => {
    calls += 1;
    assert.deepEqual([id, command, args.restoreIdentity.fileId, args.restoreIdentity.sessionId],
      ['B', 'loadFile', '22', '827']);
    return { generation };
  };
  manager._onWindowMessage(readyEvent(entry));
  assert.equal(calls, 0, 'bridge readiness alone cannot cross restore barrier');
  manager.completeMcRestoreGeneration(generation, '827');
  await new Promise((resolve) => setTimeout(resolve, 0));
  manager._onWindowMessage(readyEvent(entry));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 1);
  assert.equal(entry._mcRestoreAppliedGeneration, generation);
  manager.dispose();
});

test('missing saved ticker fails closed without loading fallback identity', () => {
  const { root, manager } = makeRuntime({
    panels: [panel(0, '11', 'EURUSD'), panel(1, '22', null)],
  });
  const entry = addFakePanel(manager, 'B', '11');
  const generation = begin(manager);
  let calls = 0;
  manager.sendCommand = async () => { calls += 1; };
  entry.ready = true;
  manager.completeMcRestoreGeneration(generation, '827');
  assert.equal(calls, 0);
  assert.equal(entry._mcRestoreFailure, 'MISSING_SAVED_TICKER');
  manager.dispose();
});

test('panel removal cancels an in-flight restore and prevents stale completion', async () => {
  const { root, manager } = makeRuntime({
    panels: [panel(0, '11', 'EURUSD'), panel(1, '22', 'GBPUSD')],
  });
  const entry = addFakePanel(manager, 'B', '22');
  const generation = begin(manager);
  entry.ready = true;
  let resolveLoad;
  manager.sendCommand = () => new Promise((resolve) => { resolveLoad = resolve; });
  manager.completeMcRestoreGeneration(generation, '827');
  assert.ok(entry._mcRestoreJob);
  manager.removeChart('B');
  resolveLoad();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(manager.charts.has('B'), false);
  assert.equal(entry._mcRestoreAppliedGeneration, null);
  manager.dispose();
});

test('bridge-ready rejects spoofed source, cross-panel id, missing/wrong origin and duplicates', () => {
  const { manager } = makeRuntime({
    panels: [panel(0, '11', 'EURUSD'), panel(1, '22', 'GBPUSD')],
  });
  const entry = addFakePanel(manager, 'B', '22');
  begin(manager);
  manager._onWindowMessage(readyEvent(entry, {}, 'B'));
  manager._onWindowMessage(readyEvent(entry, entry.frame.contentWindow, 'C'));
  manager._onWindowMessage({ ...readyEvent(entry), origin: '' });
  manager._onWindowMessage({ ...readyEvent(entry), origin: 'https://evil.test' });
  assert.equal(entry.ready, false);
  manager._onWindowMessage(readyEvent(entry));
  assert.equal(entry.ready, true);
  const applied = entry._mcRestoreBootToken;
  manager._onWindowMessage(readyEvent(entry));
  assert.equal(entry._mcRestoreBootToken, applied);
  manager.dispose();
});

test('stale completion cannot release a newer restore generation', () => {
  const { manager } = makeRuntime({
    panels: [panel(0, '11', 'EURUSD'), panel(1, '22', 'GBPUSD')],
  });
  const entry = addFakePanel(manager, 'B', '22');
  entry.ready = true;
  const oldGeneration = begin(manager);
  const newGeneration = begin(manager);
  let calls = 0;
  manager.sendCommand = async () => { calls += 1; };
  assert.equal(manager.completeMcRestoreGeneration(oldGeneration, '827'), false);
  assert.equal(calls, 0);
  assert.equal(manager.completeMcRestoreGeneration(newGeneration, '827'), true);
  assert.equal(calls, 1);
  manager.dispose();
});

test('retry exhaustion is bounded and isolated to the failed panel', async () => {
  const { manager } = makeRuntime({
    panels: [panel(0, '11', 'EURUSD'), panel(1, '22', 'GBPUSD')],
  });
  const entry = addFakePanel(manager, 'B', '22');
  entry.ready = true;
  const generation = begin(manager);
  let attempts = 0;
  manager.sendCommand = async () => {
    attempts += 1;
    throw new Error('injected load failure');
  };
  manager.completeMcRestoreGeneration(generation, '827');
  await new Promise((resolve) => setTimeout(resolve, 900));
  assert.equal(attempts, 3);
  assert.match(entry._mcRestoreFailure, /injected load failure/);
  assert.equal(entry._mcRestoreJob, null);
  manager.dispose();
});

test('manual loadFile remains on the legacy args.fileId contract', () => {
  assert.match(panelBridgeSource,
    /var fileId = restoreIdentity \? restoreIdentity\.fileId : args\.fileId;/);
  assert.match(panelBridgeSource,
    /if \(restoreIdentity\) \{\s*throw new Error\('MC_RESTORE canonical loader did not return/);
});

test('cold restore bootstraps the exact file through the canonical panel loader before replay apply', () => {
  assert.match(panelBridgeSource,
    /function loadColdRestorePanelFile\(ch, fileId, ticker\)[\s\S]*ch\.loadPanelFileData\(String\(fileId\), String\(ticker\)\)/);
  assert.match(panelBridgeSource,
    /var coldRestore = !!\(restoreIdentity && !panelHasLoadedFile\(ch, fidStr\)\);[\s\S]*loadColdRestorePanelFile\(ch, fidStr, restoreIdentity\.ticker\)/);
  assert.match(panelBridgeSource,
    /if \(loaded === false\) \{\s*throw new Error\('MC_RESTORE authenticated file bootstrap failed'\)/);
  assert.match(chartSource,
    /async loadPanelFileData\(fileId, restoredTicker = null\)[\s\S]*const exactRestoredTicker = String\(restoredTicker \|\| ''\)\.trim\(\);/);
  assert.match(chartSource,
    /const targetTicker = exactRestoredTicker[\s\S]*\|\| \(resolveTicker && resolveTicker\(session, targetFileId\)\)/);
});

test('distinct saved panel identities preserve exact ticker with file id', async () => {
  const { manager } = makeRuntime({
    panels: [
      panel(0, '25', 'EURUSD'),
      panel(1, '677', 'XAUUSD'),
      panel(2, '673', 'HOG'),
    ],
  });
  const entries = [
    addFakePanel(manager, 'B', '25'),
    addFakePanel(manager, 'C', '25'),
  ];
  const generation = begin(manager);
  const calls = [];
  manager.sendCommand = async (id, command, args) => {
    calls.push({ id, command, identity: structuredClone(args.restoreIdentity) });
    return { ...args.restoreIdentity, generation };
  };
  for (const entry of entries) entry.ready = true;
  manager.completeMcRestoreGeneration(generation, '827');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(
    calls.map(({ id, identity }) => [id, identity.fileId, identity.ticker]),
    [['B', '677', 'XAUUSD'], ['C', '673', 'HOG']],
  );
  manager.dispose();
});

for (const failure of ['401 Unauthorized', '409 stale lease', '503 unavailable', 'partial fetch']) {
  test(`restore bounds retries for ${failure}`, async () => {
    const { manager } = makeRuntime({
      panels: [panel(0, '11', 'EURUSD'), panel(1, '22', 'GBPUSD')],
    });
    const entry = addFakePanel(manager, 'B', '22', 0);
    entry.ready = true;
    const generation = begin(manager);
    let attempts = 0;
    manager.sendCommand = async () => {
      attempts += 1;
      throw new Error(failure);
    };
    manager.completeMcRestoreGeneration(generation, '827');
    await new Promise((resolve) => setTimeout(resolve, 900));
    assert.equal(attempts, 3);
    assert.match(entry._mcRestoreFailure, new RegExp(failure.split(' ')[0]));
    assert.equal(entry._mcRestoreAppliedGeneration, null);
    manager.dispose();
  });
}

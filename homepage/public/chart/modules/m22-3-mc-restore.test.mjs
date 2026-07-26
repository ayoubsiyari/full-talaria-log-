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

function makeRuntime({ enabled = true, panels = [] } = {}) {
  const listeners = new Map();
  const logs = [];
  const root = {
    __TALARIA_ENABLE_MC_RESTORE_V1: enabled,
    location: { origin: 'https://talaria.test' },
    MultichartGuards: {},
    localStorage: {
      getItem(key) {
        return key === 'chart_panel_state'
          ? JSON.stringify({ layout: '3', sessionId: '827', panels })
          : null;
      },
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
    setTimeout,
    clearTimeout,
    URLSearchParams,
    Map,
    Set,
    Date,
    Math,
    console,
  };
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

test('MC_RESTORE default OFF installs no state or lifecycle listener', () => {
  const { manager, listeners } = makeRuntime({ enabled: false });
  assert.equal(manager._mcRestoreGeneration, undefined);
  assert.equal(listeners.size, 1, 'only the legacy manager message listener is installed');
  manager.dispose();
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
    /function loadColdRestorePanelFile\(ch, fileId\)[\s\S]*ch\.loadPanelFileData\(String\(fileId\)\)/);
  assert.match(panelBridgeSource,
    /var coldRestore = !!\(restoreIdentity && !panelHasLoadedFile\(ch, fidStr\)\);[\s\S]*loadColdRestorePanelFile\(ch, fidStr\)/);
  assert.match(panelBridgeSource,
    /if \(loaded === false\) \{\s*throw new Error\('MC_RESTORE authenticated file bootstrap failed'\)/);
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

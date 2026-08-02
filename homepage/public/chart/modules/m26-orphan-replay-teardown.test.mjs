import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const modulesDir = path.dirname(fileURLToPath(import.meta.url));
const chartRoot = path.resolve(modulesDir, '..');
const managerPath = path.join(chartRoot, 'multichart-prod', 'multichart-manager.js');
const managerSource = fs.readFileSync(managerPath, 'utf8');

function loadManager({ kill = false } = {}) {
  const context = {
    console,
    setTimeout,
    clearTimeout,
  };
  context.window = context;
  context.globalThis = context;
  context.MultichartGuards = {};
  context.addEventListener = () => {};
  context.removeEventListener = () => {};
  if (kill) context.__TALARIA_DISABLE_M26_PANEL_REPLAY_DESTROY_V1 = true;
  vm.createContext(context);
  vm.runInContext(managerSource, context, { filename: managerPath });
  return context.MultichartManager;
}

function makeManager(opts = {}) {
  const MultichartManager = loadManager({ kill: opts.kill });
  return new MultichartManager({
    container: {},
    onLog: opts.onLog || (() => {}),
    onState: () => {},
    onAssertion: () => {},
  });
}

function installPanel(manager, chart, calls = []) {
  const frame = {
    contentWindow: { chart },
    remove: () => { calls.push('frame.remove'); },
  };
  manager.charts.set('B', { id: 'B', frame, ready: true });
  return calls;
}

test('M26 removeChart invokes panel replaySystem.destroy before removing iframe', () => {
  const manager = makeManager();
  const calls = [];
  const chart = {
    _b70ShadowDisposeIndicatorGeneration: () => { calls.push('indicator'); },
    replaySystem: {
      destroy: () => {
        calls.push('destroy:start');
        chart._b70ShadowDisposeIndicatorGeneration();
        calls.push('destroy:end');
      },
    },
  };
  installPanel(manager, chart, calls);

  manager.removeChart('B');

  assert.deepEqual(calls, ['destroy:start', 'indicator', 'destroy:end', 'frame.remove']);
  assert.equal(manager.charts.has('B'), false);
});

test('M26 kill switch restores the previous indicator-only teardown', () => {
  const manager = makeManager({ kill: true });
  const calls = [];
  const chart = {
    _b70ShadowDisposeIndicatorGeneration: () => { calls.push('indicator'); },
    replaySystem: {
      destroy: () => { calls.push('destroy'); },
    },
  };
  installPanel(manager, chart, calls);

  manager.removeChart('B');

  assert.deepEqual(calls, ['indicator', 'frame.remove']);
});

test('M26 panels without replaySystem still dispose indicator generation', () => {
  const manager = makeManager();
  const calls = [];
  const chart = {
    _b70ShadowDisposeIndicatorGeneration: () => { calls.push('indicator'); },
  };
  installPanel(manager, chart, calls);

  manager.removeChart('B');

  assert.deepEqual(calls, ['indicator', 'frame.remove']);
});

test('M26 throwing replaySystem.destroy does not prevent iframe removal', () => {
  const manager = makeManager();
  const calls = [];
  const chart = {
    _b70ShadowDisposeIndicatorGeneration: () => { calls.push('indicator'); },
    replaySystem: {
      destroy: () => {
        calls.push('destroy');
        throw new Error('destroy failed');
      },
    },
  };
  installPanel(manager, chart, calls);

  assert.doesNotThrow(() => manager.removeChart('B'));

  assert.deepEqual(calls, ['destroy', 'frame.remove']);
  assert.equal(manager.charts.has('B'), false);
});

test('M26 throwing replaySystem.destroy is reported and teardown still completes', () => {
  const logs = [];
  const manager = makeManager({ onLog: (entry) => { logs.push(entry); } });
  const calls = [];
  const chart = {
    replaySystem: {
      destroy: () => {
        calls.push('destroy');
        throw new Error('destroy pending');
      },
    },
  };
  installPanel(manager, chart, calls);

  assert.doesNotThrow(() => manager.removeChart('B'));

  assert.deepEqual(calls, ['destroy', 'frame.remove']);
  assert.equal(manager.charts.has('B'), false);
  assert.deepEqual(
    logs.map(({ level, text }) => ({ level, text })),
    [
      { level: 'error', text: 'removeChart B panel replay teardown failed: destroy pending' },
      { level: 'info', text: 'removeChart B' },
    ],
  );
});

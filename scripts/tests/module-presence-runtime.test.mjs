import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const runtimeCode = fs.readFileSync(path.join(root, 'chart v 1.4/chart/modules/module-presence-runtime.js'), 'utf8');
const perfCode = fs.readFileSync(path.join(root, 'chart v 1.4/chart/modules/indicator-performance.js'), 'utf8');

function boot({ includePerf = true, correctOrder = true } = {}) {
  const listeners = {};
  const badges = [];
  const provider = { compareDocumentPosition: () => correctOrder ? 4 : 0 };
  const consumer = {};
  const document = {
    readyState: 'loading',
    body: { appendChild: (node) => badges.push(node) },
    documentElement: { appendChild: (node) => badges.push(node) },
    addEventListener: (name, fn) => { listeners[name] = fn; },
    getElementById: (id) => badges.find((node) => node.id === id) || null,
    createElement: () => ({ style: {}, setAttribute() {} }),
    querySelector: (selector) => selector.includes('indicator-performance') ? provider : consumer,
  };
  const events = [];
  const errors = [];
  const window = {
    document,
    dispatchEvent: (event) => events.push(event),
    console: { error: (...args) => errors.push(args) },
  };
  const context = vm.createContext({
    window, self: window, document, console: window.console,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
    setTimeout: (fn) => fn(),
  });
  vm.runInContext(runtimeCode, context);
  if (includePerf) vm.runInContext(perfCode, context);
  listeners.DOMContentLoaded();
  return { window, badges, events, errors };
}

test('host/panel tripwire accepts symbols, ledger, and order', () => {
  const { window, badges, errors } = boot();
  assert.deepEqual(
    Array.from(window.__TALARIA_LOADED_MODULES, (item) => item.module),
    ['ModulePresenceRuntime', 'IndicatorPerf'],
  );
  assert.equal(window.__TALARIA_DEGRADED_MODE__.active, false);
  assert.equal(badges.length, 0);
  assert.equal(errors.length, 0);
});

test('correctness absence is loud once and non-blocking', () => {
  const { window, badges, events, errors } = boot({ includePerf: false });
  window.__talariaMarkMissingModule('IndicatorPerf');
  assert.equal(window.__TALARIA_DEGRADED_MODE__.active, true);
  assert.deepEqual(Array.from(window.__TALARIA_DEGRADED_MODE__.degradedModules), ['IndicatorPerf']);
  assert.equal(errors.length, 1);
  assert.equal(events.length, 1);
  assert.equal(badges.length, 1);
});

test('misordered provider degrades and bounded identifiers reject junk', () => {
  const { window } = boot({ correctOrder: false });
  assert.deepEqual(Array.from(window.__TALARIA_DEGRADED_MODE__.degradedModules), ['IndicatorPerf']);
  assert.equal(window.__talariaRegisterModule({
    module: '<script>', version: '1', class: 'correctness', status: 'loaded',
  }), false);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import {
  DEGRADED_MODULE_ID_PATTERN,
  MAX_PASSPORT_DEGRADED_MODULES,
  TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
  assertSupportUiDegradedSourceContract,
  extractDegradedModulesForPassport,
  passportDegradedModulesSlice,
  runNcPassportDegradedMutation,
  runPassportDegradedKeyAlwaysCell,
  runPassportDegradedRoundTripCell,
  runSupportPassportDegradedGate,
} from '../lib/support-passport-degraded.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const supportUiPath = path.join(root, 'homepage/src/app/dashboard/support/supportUi.tsx');
const supportUiSource = fs.readFileSync(supportUiPath, 'utf8');
const runtimeCode = fs.readFileSync(
  path.join(root, 'chart v 1.4/chart/modules/module-presence-runtime.js'),
  'utf8',
);

function bootRuntimeOnly() {
  const listeners = {};
  const document = {
    readyState: 'loading',
    body: { appendChild() {} },
    documentElement: { appendChild() {} },
    addEventListener: (name, fn) => { listeners[name] = fn; },
    getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() {} }),
    querySelector: () => null,
  };
  const window = {
    document,
    dispatchEvent() {},
    console: { error() {} },
  };
  const context = vm.createContext({
    window,
    self: window,
    document,
    console: window.console,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
    setTimeout: (fn) => fn(),
  });
  vm.runInContext(runtimeCode, context);
  listeners.DOMContentLoaded();
  return window;
}

test('signature token is TALARIA_SUPPORT_PASSPORT_DEGRADED_V1', () => {
  assert.equal(TALARIA_SUPPORT_PASSPORT_DEGRADED_V1, 'TALARIA_SUPPORT_PASSPORT_DEGRADED_V1');
});

test('PASSPORT-DEGRADED-KEY-ALWAYS [soundness VER-01]: missing state still yields empty array key', () => {
  const cell = runPassportDegradedKeyAlwaysCell({});
  assert.equal(cell.coverage, 'soundness');
  assert.equal(cell.ver, 'VER-01');
  assert.equal(cell.status, 'GREEN');
  assert.deepEqual(cell.slice.degradedModules, []);
});

test('PASSPORT-DEGRADED-KEY-ALWAYS [soundness VER-01]: explicit empty runtime array', () => {
  const window = bootRuntimeOnly();
  const slice = passportDegradedModulesSlice({
    __TALARIA_DEGRADED_STATE: { degradedModules: [] },
  });
  assert.deepEqual(slice.degradedModules, []);
  assert.equal(runPassportDegradedKeyAlwaysCell({
    __TALARIA_DEGRADED_STATE: { degradedModules: [] },
  }).status, 'GREEN');
  assert.ok(Array.isArray(window.__TALARIA_DEGRADED_STATE.degradedModules));
});

test('PASSPORT-DEGRADED-ROUND-TRIP [soundness VER-01]: IndicatorPerf from degraded state', () => {
  const globalLike = { __TALARIA_DEGRADED_STATE: { degradedModules: ['IndicatorPerf'] } };
  const cell = runPassportDegradedRoundTripCell(globalLike, ['IndicatorPerf']);
  assert.equal(cell.coverage, 'soundness');
  assert.equal(cell.status, 'GREEN');
  assert.deepEqual(extractDegradedModulesForPassport(globalLike), ['IndicatorPerf']);
});

test('PASSPORT-DEGRADED-ROUND-TRIP [soundness VER-01]: runtime markMissing mirrors passport', () => {
  const window = bootRuntimeOnly();
  window.__talariaMarkMissingModule('IndicatorPerf');
  const cell = runPassportDegradedRoundTripCell(window, ['IndicatorPerf']);
  assert.equal(cell.status, 'GREEN');
  assert.deepEqual(Array.from(window.__TALARIA_DEGRADED_STATE.degradedModules), ['IndicatorPerf']);
});

test('extractDegradedModulesForPassport filters junk, dedupes, and bounds at 32', () => {
  const ids = ['IndicatorPerf'];
  for (let i = 0; i < 40; i += 1) ids.push(`Mod${i}`);
  const junk = ['<script>', '', 42, 'IndicatorPerf'];
  const globalLike = {
    __TALARIA_DEGRADED_STATE: { degradedModules: [...ids, ...junk] },
  };
  const out = extractDegradedModulesForPassport(globalLike);
  assert.equal(out.length, MAX_PASSPORT_DEGRADED_MODULES);
  assert.ok(out.every((id) => DEGRADED_MODULE_ID_PATTERN.test(id)));
  assert.equal(out.filter((id) => id === 'IndicatorPerf').length, 1);
});

test('alias chain prefers __TALARIA_DEGRADED_STATE over trailing aliases', () => {
  const globalLike = {
    __TALARIA_DEGRADED_STATE: { degradedModules: ['FromCanonical'] },
    __TALARIA_DEGRADED_STATE__: { degradedModules: ['FromTrailing'] },
    __TALARIA_DEGRADED_MODE__: { degradedModules: ['FromMode'] },
  };
  assert.deepEqual(extractDegradedModulesForPassport(globalLike), ['FromCanonical']);
});

test('SUPPORT-UI-SOURCE-CONTRACT [wiring VER-01]: production supportUi pins hold', () => {
  const cell = assertSupportUiDegradedSourceContract(supportUiSource);
  assert.equal(cell.coverage, 'wiring');
  assert.equal(cell.ver, 'VER-01');
  assert.equal(cell.status, 'GREEN');
});

test('NC-PASSPORT-DEGRADED-MUTATION [wiring VER-01]: stripped assignment fails contract', () => {
  const nc = runNcPassportDegradedMutation(supportUiSource);
  assert.equal(nc.coverage, 'wiring');
  assert.equal(nc.baseStatus, 'GREEN');
  assert.equal(nc.mutatedStatus, 'RED');
  assert.equal(nc.status, 'GREEN');
});

test('gate aggregate GREEN on repo supportUi', () => {
  const gate = runSupportPassportDegradedGate({ supportUiSource });
  assert.equal(gate.signature, TALARIA_SUPPORT_PASSPORT_DEGRADED_V1);
  assert.equal(gate.status, 'GREEN');
  assert.equal(gate.ok, true);
  assert.equal(gate.allPass, true);
});

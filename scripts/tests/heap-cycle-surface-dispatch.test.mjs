/**
 * Every option runHeapCycleBrowserSession accepts must reach the surface it
 * dispatches to.
 *
 * The dist-v9 dispatch silently dropped disableFlags, snapshotOutPath,
 * steadyStateDiff and releaseConsole. A leave-one-out matrix of six runs came
 * back as six copies of one configuration, and the run that was supposed to be
 * the control was not one. Nothing in the output said so: a dropped ablation
 * looks exactly like an ablation that made no difference.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MC_RELEASE_KILL_SWITCHES } from '../lib/heap-cycle-browser.mjs';

const LIB = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../lib/heap-cycle-browser.mjs',
);
const source = fs.readFileSync(LIB, 'utf8');

/** Options that select or shape the measurement; dropping any silently voids a run. */
const MEASUREMENT_OPTIONS = [
  'disableFlags',
  'datasetMode',
  'timeframes',
  'finalRetainerSnapshot',
  'snapshotOutPath',
  'steadyStateDiff',
  'ablateTerminateWorkers',
  'releaseConsole',
  'datasetRotate',
  'memoryApiProbe',
];

function dispatchBody(callee) {
  const at = source.indexOf(`return ${callee}({`);
  assert.notEqual(at, -1, `no dispatch to ${callee}`);
  const end = source.indexOf('});', at);
  assert.notEqual(end, -1, `unterminated dispatch to ${callee}`);
  return source.slice(at, end);
}

test('dist-v9 dispatch forwards every measurement option', () => {
  const body = dispatchBody('runDistV9Session');
  for (const opt of MEASUREMENT_OPTIONS) {
    assert.match(body, new RegExp(`\\b${opt}\\b`), `dist-v9 dispatch drops ${opt}`);
  }
});

test('deployed dispatch forwards every measurement option', () => {
  const body = dispatchBody('runDeployedSession');
  for (const opt of MEASUREMENT_OPTIONS) {
    assert.match(body, new RegExp(`\\b${opt}\\b`), `deployed dispatch drops ${opt}`);
  }
});

test('dist-v9 session installs the disable flags it is given', () => {
  const at = source.indexOf('async function runDistV9Session');
  const body = source.slice(at, source.indexOf('async function', at + 10) + 0 || undefined);
  assert.match(
    source.slice(at, at + 4000),
    /installDisableFlags\(page, disableFlags\)/,
    'dist-v9 accepts disableFlags but never installs them',
  );
  assert.ok(body.length > 0);
});

test('the five REALM-TEARDOWN-RELEASE kill-switches are named for readback', () => {
  assert.equal(MC_RELEASE_KILL_SWITCHES.length, 5);
  for (const flag of MC_RELEASE_KILL_SWITCHES) {
    assert.match(flag, /^__TALARIA_DISABLE_MC_RELEASE_[A-Z_0-9]+_V1$/);
  }
});

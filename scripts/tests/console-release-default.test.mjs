import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveConsoleRelease,
  CONSOLE_RELEASE_DISABLE_ENV,
} from '../lib/heap-cycle-browser.mjs';

test('unit: deep release is the default when nothing is asked for', () => {
  assert.equal(resolveConsoleRelease(undefined, {}), 'deep');
  assert.equal(resolveConsoleRelease(false, {}), 'deep');
  assert.equal(resolveConsoleRelease(null, {}), 'deep');
});

test('unit: a bare --release-console-handles means deep, since shallow frees nothing', () => {
  assert.equal(resolveConsoleRelease(true, {}), 'deep');
});

test('unit: shallow is still selectable for A/B against the old behaviour', () => {
  assert.equal(resolveConsoleRelease('shallow', {}), 'shallow');
  assert.equal(resolveConsoleRelease('deep', {}), 'deep');
});

test('unit: the kill switch restores the old behaviour of releasing nothing', () => {
  assert.equal(resolveConsoleRelease('deep', { [CONSOLE_RELEASE_DISABLE_ENV]: '1' }), false);
  assert.equal(resolveConsoleRelease(undefined, { [CONSOLE_RELEASE_DISABLE_ENV]: '1' }), false);
});

test('unit: the switch is only honoured at exactly 1, and absent means enabled', () => {
  assert.equal(resolveConsoleRelease(undefined, { [CONSOLE_RELEASE_DISABLE_ENV]: '0' }), 'deep');
  assert.equal(resolveConsoleRelease(undefined, { [CONSOLE_RELEASE_DISABLE_ENV]: 'true' }), 'deep');
  assert.equal(resolveConsoleRelease(undefined, {}), 'deep');
});

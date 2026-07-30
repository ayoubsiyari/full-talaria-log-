/**
 * FIXED-COLUMN AUDIT RED — 2026-07-30 13:20
 *
 * GATE-01: a claimed-fixed gate must go RED when the fix is reversed.
 * This file fails (exit 1) when known decoration shapes are still present:
 * harnesses that stay GREEN under kill / have no reverse lever / only
 * assert helper fields for a multi-step user money defect.
 *
 * GREEN would mean every cell below was repaired. Today it must be RED.
 *
 * Run: node --test "chart v 1.4/chart/modules/fixed-column-audit.red.test.mjs"
 */
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

const ROOT = process.cwd();
const MOD = join(ROOT, 'chart v 1.4', 'chart', 'modules');

function runNode(args, env = {}) {
  const r = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return { status: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function preloadKill(windowAssign) {
  const dir = mkdtempSync(join(tmpdir(), 'd-audit-'));
  const file = join(dir, 'preload.cjs');
  writeFileSync(file, `globalThis.window = Object.assign(globalThis.window || {}, ${windowAssign});\n`);
  return file;
}

test('AUDIT: m23 rollback suite stays GREEN when kill is preloaded (decoration)', () => {
  const pre = preloadKill('{ __TALARIA_DISABLE_M23_ROLLBACK_TRADE_CANCEL_V1: true }');
  const r = runNode(['--require', pre, '--test', join(MOD, 'm23-rollback-trade-state.red.test.mjs')]);
  assert.notEqual(
    r.status,
    0,
    'EXPECTED RED: m23 suite must fail under kill; still GREEN ⇒ cannot carry fixed for TAL-01937 / Rayan #1/#3/#6b',
  );
});

test('AUDIT: duration suite stays GREEN when kill is preloaded (decoration)', () => {
  const pre = preloadKill('{ __TALARIA_DISABLE_TRADE_DURATION_NORM_V1: true }');
  const r = runNode([
    '--require',
    pre,
    '--test',
    join(ROOT, 'chart v 1.4', 'talaria-design', 'src', 'orderManagerTradeRows.test.mjs'),
  ]);
  assert.notEqual(
    r.status,
    0,
    'EXPECTED RED: duration suite must fail under kill; still GREEN ⇒ TAL-01896 not fixed',
  );
});

test('AUDIT: journal pytest stays GREEN with SESSION_JOURNAL_PATCH_DELETE_GUARD=0', () => {
  const r = spawnSync(
    process.platform === 'win32' ? 'py' : 'python3',
    ['-m', 'pytest', 'chart v 1.4/chart/tests/test_session_journal_store.py', '-q'],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PYTHONPATH: join(ROOT, 'chart v 1.4', 'chart'),
        SESSION_JOURNAL_PATCH_DELETE_GUARD: '0',
      },
      encoding: 'utf8',
    },
  );
  assert.notEqual(
    r.status,
    0,
    'EXPECTED RED: pytest must fail with guard off; still GREEN ⇒ TAL-01926 not fixed',
  );
});

test('AUDIT: pair-switch visual rebind has no reverse-fix lever', () => {
  // No kill-switch exists; gate always exits 0. Prove it cannot satisfy GATE-01.
  const r = runNode([join(MOD, 'order-pair-switch-visual-rebind.test.mjs')]);
  assert.equal(r.status, 0, 'sanity: visual-rebind currently GREEN');
  assert.fail(
    'NO REVERSE LEVER: order-pair-switch-visual-rebind.test.mjs has no kill-switch; TAL-01807b cannot stay fixed',
  );
});

test('AUDIT: one-tick pending gate is CODE-PATH only (no place/refresh)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(join(MOD, 'order-type-one-tick-pending.test.mjs'), 'utf8');
  assert.match(src, /classifyOrderTypeForPrice/, 'classifier-only gate');
  assert.doesNotMatch(src, /placeAdvancedOrder|refresh|hydrate|syncOrderVisuals/, 'no user place/refresh path');
  assert.fail(
    'CODE-PATH-ONLY: TAL-01904 gate never places an order or refreshes; reopen until user-path gate exists',
  );
});

test('AUDIT: balance-floor / single-tp-trail / exit-marker gates are CODE-PATH only', async () => {
  const { readFileSync } = await import('node:fs');
  for (const [file, ticket] of [
    ['order-balance-floor.test.mjs', 'TAL-01809'],
    ['order-single-tp-after-trail.test.mjs', 'TAL-01933'],
    ['order-exit-marker-spread-column.test.mjs', 'TAL-01810'],
  ]) {
    const src = readFileSync(join(MOD, file), 'utf8');
    assert.doesNotMatch(
      src,
      /placeAdvancedOrder|\.click\(|refresh\(|hydrate|session\.|playhead/,
      `${ticket} ${file} has no user place/click/refresh path`,
    );
  }
  assert.fail(
    'CODE-PATH-ONLY: TAL-01809 / TAL-01933 / TAL-01810 helper gates cannot see the user money path',
  );
});

test('AUDIT: SEL-01 gate asserts selectors only', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(join(MOD, 'order-sel01-exact-teardown.test.mjs'), 'utf8');
  assert.match(src, /selector|querySelector|SEL-01/i);
  assert.doesNotMatch(src, /removeChild|dispatchEvent|PointerEvent/, 'no DOM teardown actuation');
  assert.fail('SEL-01 gate never removes a user TP row; selector-shape only');
});
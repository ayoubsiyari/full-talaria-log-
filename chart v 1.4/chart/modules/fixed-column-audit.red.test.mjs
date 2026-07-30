/**
 * FIXED-COLUMN AUDIT RED — 2026-07-30 13:20 (updated)
 *
 * GATE-01: a claimed-fixed gate must go RED when the fix is reversed.
 * Remaining decoration cells only — repaired money-path gates were removed.
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

test('AUDIT: SEL-01 gate asserts selectors only', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(join(MOD, 'order-sel01-exact-teardown.test.mjs'), 'utf8');
  assert.match(src, /selector|querySelector|SEL-01/i);
  assert.doesNotMatch(src, /removeChild|dispatchEvent|PointerEvent/, 'no DOM teardown actuation');
  assert.fail('SEL-01 gate never removes a user TP row; selector-shape only');
});

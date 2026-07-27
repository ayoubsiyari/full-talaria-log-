import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateModuleContracts } from '../module-contract-preflight.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/module-contracts.json'), 'utf8'));

function mutateSurface(id, transform) {
  const target = manifest.inventory.find((entry) => entry.id === id);
  return (file) => {
    const html = fs.readFileSync(file, 'utf8');
    return path.resolve(file) === path.resolve(root, target.path) ? transform(html) : html;
  };
}

test('owned servable inventory satisfies contracts', () => {
  const result = validateModuleContracts({ manifest, root });
  assert.equal(result.ok, true);
  assert.equal(result.checked.length, 10);
});

test('permanent fault injection proves missing duplicate and order RED', () => {
  const id = 'chart-host';
  const tag = '<script defer src="/chart/modules/indicator-performance.js?v=20260727b80"></script>';
  assert.throws(() => validateModuleContracts({
    manifest, root, readFile: mutateSurface(id, (html) => html.replace(tag, '')),
  }), /required script count 0|must precede/);
  assert.throws(() => validateModuleContracts({
    manifest, root, readFile: mutateSurface(id, (html) => html.replace(tag, `${tag}\n${tag}`)),
  }), /required script count 2/);
  assert.throws(() => validateModuleContracts({
    manifest, root, readFile: mutateSurface(id, (html) =>
      html.replace(tag, '').replace(
        '<script defer src="/chart/modules/chart-indicators-full.js?v=20260727b80"></script>',
        '<script defer src="/chart/modules/chart-indicators-full.js?v=20260727b80"></script>\n' + tag,
      )),
  }), /must precede/);
});

test('servable inventory mutation and exclusion controls RED', () => {
  const missing = structuredClone(manifest);
  missing.inventory.find((entry) => entry.id === 'chart-host').path = 'missing.html';
  assert.throws(() => validateModuleContracts({ manifest: missing, root }), /owned surface missing/);
  const falseExclusion = structuredClone(manifest);
  const row = falseExclusion.inventory.find((entry) => entry.id === 'chart-host');
  row.status = 'excluded';
  row.reason = 'fault';
  assert.throws(() => validateModuleContracts({ manifest: falseExclusion, root }), /cannot be servable/);
});

test('alternate host path and clock remain deterministic', () => {
  const alternateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-contract-'));
  for (const entry of manifest.inventory.filter((item) => item.status === 'owned-stamped')) {
    const destination = path.join(alternateRoot, entry.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, entry.path), destination);
  }
  for (const contract of manifest.modules) {
    for (const relative of [contract.source, ...(contract.mirrors || [])]) {
      const destination = path.join(alternateRoot, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(root, relative), destination);
    }
  }
  const before = Date.now;
  Date.now = () => 1;
  try {
    assert.deepEqual(
      validateModuleContracts({ manifest, root: alternateRoot }).checked,
      validateModuleContracts({ manifest, root: alternateRoot }).checked,
    );
  } finally {
    Date.now = before;
    fs.rmSync(alternateRoot, { recursive: true, force: true });
  }
});

test('four-state anti-lying proof', () => {
  const green = () => validateModuleContracts({ manifest, root }).ok;
  assert.equal(green(), true, 'fixed state passes');
  assert.throws(() => validateModuleContracts({
    manifest, root, readFile: mutateSurface('chart-panel', (html) => html.replace('/chart/modules/indicator-performance.js', '/chart/modules/missing.js')),
  }), /required script count 0|must precede/, 'broken/corrupted state fails');
  assert.throws(() => assert.equal(green(), false), /true !== false/, 'inverted assertion flips');
});

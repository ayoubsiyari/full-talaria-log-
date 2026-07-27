#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultManifest = path.join(repoRoot, 'scripts/module-contracts.json');

function scriptPaths(html) {
  const values = [];
  for (const match of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    values.push(match[1].split('?')[0]);
  }
  for (const match of html.matchAll(/(?:inject|__loadHostOnlyScript)\(\s*["']([^"']+\.js)["']\s*\)/g)) {
    values.push(match[1].split('?')[0]);
  }
  for (const block of html.matchAll(/(?:var|const|let)\s+paths\s*=\s*\[([\s\S]*?)\]/g)) {
    for (const match of block[1].matchAll(/["']([^"']+\.js)["']/g)) values.push(match[1]);
  }
  return values;
}

function assertBoundedIdentifier(value, label, { allowLeadingDigit = false } = {}) {
  const pattern = allowLeadingDigit
    ? /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/
    : /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
  assert.match(value, pattern, `${label}: unbounded/invalid identifier`);
}

export function validateModuleContracts({
  manifest = JSON.parse(fs.readFileSync(defaultManifest, 'utf8')),
  root = repoRoot,
  readFile = (file) => fs.readFileSync(file, 'utf8'),
} = {}) {
  assert.equal(manifest.schema, 'talaria.module-contracts.v1', 'unsupported contract schema');
  assert.ok(Array.isArray(manifest.modules) && manifest.modules.length, 'module contracts absent');
  assert.ok(Array.isArray(manifest.inventory) && manifest.inventory.length, 'servable inventory absent');

  const moduleIds = new Set();
  for (const contract of manifest.modules) {
    assertBoundedIdentifier(contract.id, 'module id');
    assertBoundedIdentifier(contract.version, `${contract.id} version`, { allowLeadingDigit: true });
    assert.ok(!moduleIds.has(contract.id), `${contract.id}: duplicate module contract`);
    moduleIds.add(contract.id);
    assert.ok(['correctness', 'performance', 'enhancement'].includes(contract.class), `${contract.id}: invalid class`);
    assert.ok(Array.isArray(contract.provides) && contract.provides.length, `${contract.id}: provides absent`);
    assert.ok(Array.isArray(contract.requiredSurfaces) && contract.requiredSurfaces.length, `${contract.id}: requiredSurfaces absent`);
    assert.ok(contract.order && Array.isArray(contract.order.after) && Array.isArray(contract.order.before), `${contract.id}: order absent`);
    assert.ok(typeof contract.source === 'string' && contract.source, `${contract.id}: source absent`);
    const sourcePath = path.resolve(root, contract.source);
    assert.ok(fs.existsSync(sourcePath), `${contract.id}: source missing`);
    const sourceBytes = fs.readFileSync(sourcePath);
    for (const mirror of contract.mirrors || []) {
      const mirrorPath = path.resolve(root, mirror);
      assert.ok(fs.existsSync(mirrorPath), `${contract.id}: mirror missing`);
      assert.deepEqual(fs.readFileSync(mirrorPath), sourceBytes, `${contract.id}: mirror differs from source`);
    }
  }

  const inventoryIds = new Set();
  const checked = [];
  for (const surface of manifest.inventory) {
    assertBoundedIdentifier(surface.id, 'surface id');
    assert.ok(!inventoryIds.has(surface.id), `${surface.id}: duplicate inventory entry`);
    inventoryIds.add(surface.id);
    assert.ok(['owned-stamped', 'excluded', 'removed', 'removal-pending'].includes(surface.status), `${surface.id}: invalid status`);
    if (surface.status === 'removal-pending') {
      assert.fail(`${surface.id}: deploy blocked until accidental public surface is removed`);
    }
    if (surface.status !== 'owned-stamped') {
      assert.ok(surface.reason, `${surface.id}: exclusion reason absent`);
      assert.equal(surface.servable, false, `${surface.id}: excluded/removed surface cannot be servable`);
      if (surface.status === 'removed') {
        assert.equal(fs.existsSync(path.resolve(root, surface.path)), false, `${surface.id}: removed surface still exists`);
      }
      continue;
    }
    const absolute = path.resolve(root, surface.path);
    assert.ok(fs.existsSync(absolute), `${surface.id}: owned surface missing`);
    const html = readFile(absolute);
    assert.match(html, /\d{8}b\d+/, `${surface.id}: build stamp absent`);
    const scripts = scriptPaths(html);
    for (const contract of manifest.modules.filter((item) => item.requiredSurfaces.includes(surface.surface))) {
      const positions = scripts.flatMap((value, index) => value === contract.script ? [index] : []);
      assert.equal(positions.length, 1, `${surface.id}: ${contract.id} required script count ${positions.length}`);
      const at = positions[0];
      for (const predecessor of contract.order.after) {
        const predecessorAt = scripts.indexOf(predecessor);
        assert.ok(predecessorAt >= 0 && predecessorAt < at, `${surface.id}: ${contract.id} must follow ${predecessor}`);
      }
      for (const successor of contract.order.before) {
        const successorAt = scripts.indexOf(successor);
        assert.ok(successorAt > at, `${surface.id}: ${contract.id} must precede ${successor}`);
      }
      checked.push({ surface: surface.id, module: contract.id, index: at });
    }
  }
  return { signature: 'TALARIA_MODULE_CONTRACT_PREFLIGHT_V1', ok: true, checked };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(validateModuleContracts(), null, 2)}\n`);
  } catch (error) {
    console.error(`[module-contract-preflight] ${error.message}`);
    process.exit(1);
  }
}

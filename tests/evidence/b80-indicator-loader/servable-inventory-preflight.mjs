import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');

function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function validateServableInventory({
  inventory = readJson(path.join(here, 'servable-inventory.json')),
  manifests = [
    readJson(path.join(here, 'post-build-1-manifest.json')),
    readJson(path.join(here, 'post-build-2-manifest.json')),
  ],
  repoRoot = root,
} = {}) {
  const manifestSets = manifests.map((manifest) =>
    new Map(manifest.files.map((entry) => [entry.path, entry])));
  const publicRoots = inventory.publicRoots.map((entry) =>
    path.resolve(repoRoot, entry.path));
  const results = [];

  for (const surface of inventory.surfaces) {
    const absolute = path.resolve(repoRoot, surface.path);
    assert.ok(fs.existsSync(absolute), `${surface.id}: inventory path is absent`);
    const bytes = fs.readFileSync(absolute);
    const underPublicRoot = publicRoots.some((publicRoot) =>
      absolute === publicRoot || absolute.startsWith(`${publicRoot}${path.sep}`));
    if (surface.kind === 'artifact') {
      assert.equal(surface.servable, true, `${surface.id}: public artifact must be classified servable`);
      assert.equal(underPublicRoot, true, `${surface.id}: public artifact escaped declared public roots`);
      assert.ok(surface.route?.startsWith('/'), `${surface.id}: servable artifact route absent`);
    }

    for (const [index, manifest] of manifestSets.entries()) {
      const row = manifest.get(surface.path);
      assert.ok(row, `${surface.id}: reachable owned path absent from post-build-${index + 1} manifest`);
      assert.equal(row.sha256, digest(bytes), `${surface.id}: manifest digest mismatch`);
      assert.equal(row.bytes, bytes.length, `${surface.id}: manifest size mismatch`);
    }

    if (surface.kind === 'shell' || surface.kind === 'shell-source') {
      const html = bytes.toString('utf8');
      for (const contract of inventory.moduleContracts.filter((entry) =>
        entry.requiredSurfaces.includes(surface.surface))) {
        const moduleAt = html.indexOf(contract.script.replace('/chart/', ''));
        const consumerAt = html.indexOf('modules/chart-indicators-full.js');
        assert.ok(moduleAt >= 0, `${surface.id}: ${contract.module} loader absent`);
        assert.ok(consumerAt > moduleAt, `${surface.id}: ${contract.module} loader order invalid`);
      }
    }

    if (surface.sourcePath) {
      const source = fs.readFileSync(path.resolve(repoRoot, surface.sourcePath));
      assert.equal(digest(bytes), digest(source), `${surface.id}: owned mirror differs from source`);
      assert.equal(digest(bytes), surface.sha256, `${surface.id}: inventory digest mismatch`);
      assert.equal(bytes.length, surface.bytes, `${surface.id}: inventory size mismatch`);
    }

    results.push({
      id: surface.id,
      path: surface.path,
      route: surface.route || null,
      servable: surface.servable,
      disposition: surface.disposition,
      sha256: digest(bytes),
      bytes: bytes.length,
    });
  }

  return { verdict: 'GREEN', candidate: inventory.candidate, surfaces: results };
}

export function runServableInventoryNegativeControls({
  inventory = readJson(path.join(here, 'servable-inventory.json')),
  manifests = [
    readJson(path.join(here, 'post-build-1-manifest.json')),
    readJson(path.join(here, 'post-build-2-manifest.json')),
  ],
} = {}) {
  const artifact = inventory.surfaces.find((entry) => entry.kind === 'artifact');
  assert.ok(artifact, 'negative controls require a servable artifact');

  const missing = structuredClone(manifests);
  missing[0].files = missing[0].files.filter((entry) => entry.path !== artifact.path);
  assert.throws(
    () => validateServableInventory({ inventory, manifests: missing }),
    /reachable owned path absent/,
  );

  const misclassified = structuredClone(inventory);
  misclassified.surfaces.find((entry) => entry.path === artifact.path).servable = false;
  assert.throws(
    () => validateServableInventory({ inventory: misclassified, manifests }),
    /must be classified servable/,
  );

  const corrupt = structuredClone(inventory);
  corrupt.surfaces.find((entry) => entry.path === artifact.path).sha256 = '0'.repeat(64);
  assert.throws(
    () => validateServableInventory({ inventory: corrupt, manifests }),
    /inventory digest mismatch/,
  );

  return {
    verdict: 'GREEN',
    cells: ['missing-manifest-red', 'false-nonservable-red', 'digest-drift-red'],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify({
    preflight: validateServableInventory(),
    negativeControls: runServableInventoryNegativeControls(),
  }, null, 2)}\n`);
}

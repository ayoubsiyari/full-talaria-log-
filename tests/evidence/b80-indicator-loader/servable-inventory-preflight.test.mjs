import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateServableInventory } from './servable-inventory-preflight.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const inventory = JSON.parse(fs.readFileSync(path.join(here, 'servable-inventory.json'), 'utf8'));
const manifests = [1, 2].map((number) =>
  JSON.parse(fs.readFileSync(path.join(here, `post-build-${number}-manifest.json`), 'utf8')));
const mirrorPath =
  'homepage/public/chart/multichart-prod/harness/h-a7b-r2-setup-contract.test.mjs';

test('A4c preflight accepts complete servable inventory', () => {
  assert.equal(validateServableInventory({ inventory, manifests }).verdict, 'GREEN');
});

test('negative control: reachable owned mirror absent from manifest is RED', () => {
  const missing = structuredClone(manifests);
  missing[0].files = missing[0].files.filter((entry) => entry.path !== mirrorPath);
  assert.throws(
    () => validateServableInventory({ inventory, manifests: missing }),
    /reachable owned path absent/,
  );
});

test('negative control: public artifact cannot be documented as non-servable', () => {
  const misclassified = structuredClone(inventory);
  misclassified.surfaces.find((entry) => entry.path === mirrorPath).servable = false;
  assert.throws(
    () => validateServableInventory({ inventory: misclassified, manifests }),
    /must be classified servable/,
  );
});

test('negative control: owned mirror digest drift is RED', () => {
  const corrupt = structuredClone(inventory);
  corrupt.surfaces.find((entry) => entry.path === mirrorPath).sha256 = '0'.repeat(64);
  assert.throws(
    () => validateServableInventory({ inventory: corrupt, manifests }),
    /inventory digest mismatch/,
  );
});

#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MANIFEST_SCHEMA,
  simulateLegacyTripleIncrement,
  validateManifest,
} from '../lib/checkpoint-provenance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(
  __dirname,
  '../fixtures/checkpoint-provenance/legacy-unguarded.json',
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const guardOff = process.argv.includes('--provenance-guard-off');

const simulated = simulateLegacyTripleIncrement(
  fixture.sourceShellBuildId,
  fixture.artifacts.engineBuildId,
  fixture.artifacts.serviceWorkerBuildId,
);

const reproduction = {
  emptyBuildId: simulated.explicitBuildId === '',
  threeShellIncrements: JSON.stringify(simulated.passes) === JSON.stringify(fixture.buildPasses),
  unchangedEngine: simulated.engineBuildId === fixture.artifacts.engineBuildId,
  staleServiceWorker:
    simulated.serviceWorkerBuildId !== simulated.shellBuildId,
  missingImmutableSource: fixture.sourceSha === '',
  mutableImages: Object.values(fixture.images).every((ref) => ref.endsWith(':latest')),
};

if (guardOff) {
  const red = {
    signature: 'CB04_PROVENANCE_RED_LEGACY_V1',
    guardEnabled: false,
    unsafePathWouldDeploy: Object.values(reproduction).every(Boolean),
    reproduction,
    simulated,
  };
  console.log(JSON.stringify(red, null, 2));
  process.exit(red.unsafePathWouldDeploy ? 1 : 2);
}

const legacyManifest = {
  schema: MANIFEST_SCHEMA,
  checkpoint: fixture.checkpoint,
  buildId: fixture.explicitBuildId,
  source: {
    sha: fixture.sourceSha,
    remote: 'origin',
    ref: 'refs/heads/main',
  },
  images: {
    chart: { ref: fixture.images.chart, digest: '' },
    homepage: { ref: fixture.images.homepage, digest: '' },
  },
  proof: {},
  rollback: {},
  createdAt: new Date().toISOString(),
};
const validation = validateManifest(legacyManifest);
const green = {
  signature: 'CB04_PROVENANCE_GREEN_GUARD_V1',
  guardEnabled: true,
  rejectedLegacyFixture: validation.ok === false,
  reproduction,
  failures: validation.errors,
};
console.log(JSON.stringify(green, null, 2));
process.exit(green.rejectedLegacyFixture ? 0 : 1);

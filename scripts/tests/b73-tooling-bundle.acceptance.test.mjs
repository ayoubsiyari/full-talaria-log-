import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createDeployPlan,
  loadManifest,
  resolveAdvertisedTagCommit,
  sha256File,
  validateManifest,
  verifyUniformityProof,
} from '../lib/checkpoint-provenance.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureRoot = path.join(root, 'scripts/fixtures/checkpoint-provenance/b73-v2');
const manifestPath = path.join(fixtureRoot, 'manifest.json');
const proofPath = path.join(fixtureRoot, 'uniformity.json');
const expected = {
  manifestHash: 'cc9bc55cc986142b4426b20c690c447c1ea620ab5e0e33ea3eb38f67258cc8b0',
  proofHash: 'fd64533ca1b788b9f8c56a285183714b66dea077c15e86c92f7549af99b40313',
  sourceSha: '11f5787df0ff8b29a85f533716a4ca2e96e025df',
  chartDigest: 'sha256:8feee17897d28d6b1a402de4f5ad899de5e55690969d3d2ab3f31a8bcd406960',
  homepageDigest: 'sha256:b5affe87f1e2629cb2d112f3333ef4a8c0ffe642e595ecbe64ee5e889196bf95',
  rollbackSha: '02d117978520c168132ba6fa0be239b781f9f1bf',
};

test('B73 sealed tooling contracts remain integrated and fail closed', (t) => {
  const { manifest } = loadManifest(manifestPath);

  assert.equal(validateManifest(manifest).ok, true, 'V1 manifest schema remains accepted');
  assert.equal(sha256File(manifestPath), expected.manifestHash);
  assert.equal(sha256File(proofPath), expected.proofHash);

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-b73-contract-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const copiedManifest = path.join(temporary, 'manifest.json');
  const copiedProof = path.join(temporary, manifest.proof.uniformityReport);
  fs.copyFileSync(manifestPath, copiedManifest);
  fs.copyFileSync(proofPath, copiedProof);
  assert.equal(verifyUniformityProof(manifest, copiedManifest).ok, true);

  const deploy = createDeployPlan(manifest);
  assert.equal(deploy.buildAllowed, false);
  assert.equal(deploy.sourceSha, expected.sourceSha);
  assert.deepEqual(deploy.imageDigests, {
    chart: expected.chartDigest,
    homepage: expected.homepageDigest,
  });
  const rollback = createDeployPlan(manifest, { rollback: true });
  assert.equal(rollback.sourceSha, expected.rollbackSha);
  assert.equal(rollback.buildAllowed, false);

  const lightweight = resolveAdvertisedTagCommit(
    `${expected.sourceSha}\t${manifest.source.ref}`,
    manifest.source.ref,
  );
  assert.equal(lightweight.annotated, false);
  const tagObject = 'a'.repeat(40);
  const annotated = resolveAdvertisedTagCommit(
    `${tagObject}\t${manifest.source.ref}\n${expected.sourceSha}\t${manifest.source.ref}^{}`,
    manifest.source.ref,
  );
  assert.deepEqual(annotated, {
    tagObjectSha: tagObject,
    commitSha: expected.sourceSha,
    annotated: true,
  });
  assert.throws(
    () => resolveAdvertisedTagCommit(
      `${tagObject}\t${manifest.source.ref}\n${expected.sourceSha}\trefs/tags/wrong^{}`,
      manifest.source.ref,
    ),
    /unexpected ref/,
  );

  fs.appendFileSync(copiedProof, '\n');
  assert.equal(verifyUniformityProof(manifest, copiedManifest).ok, false, 'tamper must fail');
  fs.copyFileSync(proofPath, copiedProof);
  const wrongTarget = JSON.parse(fs.readFileSync(copiedProof, 'utf8'));
  wrongTarget.forwardingMirrors[0].importTarget = '../../../../wrong-target.mjs';
  fs.writeFileSync(copiedProof, `${JSON.stringify(wrongTarget, null, 2)}\n`);
  const wrongTargetManifest = {
    ...manifest,
    proof: { ...manifest.proof, sha256: sha256File(copiedProof) },
  };
  fs.writeFileSync(copiedManifest, `${JSON.stringify(wrongTargetManifest, null, 2)}\n`);
  assert.match(
    verifyUniformityProof(wrongTargetManifest, copiedManifest).failures.join('\n'),
    /importTarget is invalid/,
  );

  const workflow = fs.readFileSync(path.join(root, 'scripts/deploy-test-checkpoint.sh'), 'utf8');
  assert.match(workflow, /--deploy-existing=<manifest>/);
  assert.match(workflow, /DRY RUN: verified remote tag and rollback manifest; no files, images, or containers changed/);
  assert.match(workflow, /"\$ORCHESTRATOR_ROOT\/scripts\/deploy\.sh" --manifest="\$DEPLOY_EXISTING"/);
  assert.match(fs.readFileSync(path.join(root, 'scripts/deploy.sh'), 'utf8'), /--no-build --no-deps/);

  const probe = fs.readFileSync(path.join(root, 'scripts/checkpoint-runtime-probe.mjs'), 'utf8');
  assert.match(probe, /browser-authenticated/);
  assert.match(probe, /Static mode is intentional for login-gated TEST surfaces/);
  const poll = fs.readFileSync(
    path.join(root, 'tests/evidence/b70-stage5/puppeteer-external-poll.mjs'),
    'utf8',
  );
  assert.match(poll, /while \(now\(\) - startedAt < timeoutMs\)/);
  assert.match(poll, /Promise\.race/);
  const assignment = fs.readFileSync(
    path.join(root, 'tests/evidence/b70-stage5/session-assignment-contract.mjs'),
    'utf8',
  );
  assert.match(assignment, /\^3\(\?:v\|h\|l\|r\|t\|b\)\$/);
  const harness = fs.readFileSync(
    path.join(root, 'tests/evidence/b70-stage5/b70-indicator-generation-shadow.auth-harness.mjs'),
    'utf8',
  );
  assert.match(harness, /B70_SESSION_ID \|\| '849'/);
  assert.match(harness, /mcLayout=3v/);
  assert.match(harness, /deriveSessionAssignments/);
  assert.match(harness, /\.length === 2/);
});

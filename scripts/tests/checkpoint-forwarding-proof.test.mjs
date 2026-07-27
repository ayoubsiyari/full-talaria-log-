import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  sha256Buffer,
  sha256File,
  verifyUniformityProof,
} from '../lib/checkpoint-provenance.mjs';
import { FORWARDING_MIRROR_CONTRACTS } from '../lib/homepage-forwarding-contracts.mjs';

const relativePath = 'modules/m20-q6-replay-lifecycle-binding.test.mjs';
const contract = FORWARDING_MIRROR_CONTRACTS[relativePath];
const buildId = '20260726b70';
const sourceSha = '02d117978'.padEnd(40, '0');

function fixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-forwarding-proof-'));
  const canonicalPath = path.join(repoRoot, 'chart v 1.4/chart', relativePath);
  const wrapperPath = path.join(repoRoot, 'homepage/public/chart', relativePath);
  fs.mkdirSync(path.dirname(canonicalPath), { recursive: true });
  fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });
  fs.writeFileSync(canonicalPath, 'export const canonical = true;\n');
  fs.writeFileSync(wrapperPath, contract.wrapper);
  const canonicalHash = sha256File(canonicalPath);
  const record = {
    path: relativePath,
    contractId: contract.contractId,
    importTarget: contract.importTarget,
    canonicalHash,
    wrapperHash: sha256Buffer(contract.wrapper),
    effectiveCanonicalTargetHash: canonicalHash,
  };
  const manifest = {
    buildId,
    source: { sha: sourceSha },
    proof: { uniformityReport: 'proof.json', sha256: '' },
  };
  const manifestPath = path.join(repoRoot, 'manifest.json');
  const writeProof = (forwardingMirrors = [record]) => {
    fs.writeFileSync(path.join(repoRoot, 'proof.json'), `${JSON.stringify({
      signature: 'TALARIA_CHECKPOINT_UNIFORMITY_V2',
      ok: true,
      expectedBuildId: buildId,
      sourceSha,
      forwardingMirrors,
    })}\n`);
    manifest.proof.sha256 = sha256File(path.join(repoRoot, 'proof.json'));
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  };
  writeProof();
  return { repoRoot, canonicalPath, wrapperPath, manifest, manifestPath, record, writeProof };
}

function verify(value) {
  return verifyUniformityProof(value.manifest, value.manifestPath, {
    repoRoot: value.repoRoot,
  });
}

test('contract proof records unequal bytes and resolves the canonical target', (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.repoRoot, { recursive: true, force: true }));
  assert.notEqual(value.record.canonicalHash, value.record.wrapperHash);
  assert.equal(verify(value).ok, true, verify(value).failures.join('\n'));
});

test('changed wrapper and wrong import target fail closed', (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.repoRoot, { recursive: true, force: true }));
  fs.appendFileSync(value.wrapperPath, '// tamper\n');
  assert.match(verify(value).failures.join('\n'), /wrapper hash is stale/);
  fs.writeFileSync(value.wrapperPath, contract.wrapper);
  value.writeProof([{ ...value.record, importTarget: '../../../../wrong.mjs' }]);
  assert.match(verify(value).failures.join('\n'), /importTarget is invalid/);
});

test('canonical change and stale proof fail closed', (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.repoRoot, { recursive: true, force: true }));
  fs.appendFileSync(value.canonicalPath, '// changed\n');
  assert.match(verify(value).failures.join('\n'), /canonical hash is stale/);
  fs.writeFileSync(path.join(value.repoRoot, 'proof.json'), '{}\n');
  assert.match(verify(value).failures.join('\n'), /proof hash mismatch/);
});

test('contract mode cannot be used on an unapproved path', (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.repoRoot, { recursive: true, force: true }));
  value.writeProof([{ ...value.record, path: 'modules/ordinary.mjs' }]);
  assert.match(verify(value).failures.join('\n'), /unapproved forwarding mirror path/);
});

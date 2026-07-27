import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const H_A8_AUTHORIZATION = Object.freeze({
  id: 'H-A8-VP-2',
  evidenceCommit: '7e9a12631879894affba30ea17e9d54da17f24bc',
  debtBoardRow: 'BRF-H-A8-VP-2',
  owner: 'Lane 4 — Interaction/UX',
  activationCheckpoint: 'B78',
  targetCheckpoint: 'B79',
  signature: 'ff470c3aafb0040bf28e6c4319f21a334e66035651b301b1a6899e5c5e1075b3',
});

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function validateHA8AuthorizationEntry(entry, policyValidation = { ok: true, errors: [] }) {
  const errors = [];
  if (!policyValidation.ok) errors.push(...(policyValidation.errors || ['policy validation failed']));
  for (const [field, expected] of [
    ['id', H_A8_AUTHORIZATION.id],
    ['debtBoardRow', H_A8_AUTHORIZATION.debtBoardRow],
    ['owner', H_A8_AUTHORIZATION.owner],
    ['activationCheckpoint', H_A8_AUTHORIZATION.activationCheckpoint],
    ['targetCheckpoint', H_A8_AUTHORIZATION.targetCheckpoint],
  ]) {
    if (entry?.[field] !== expected) errors.push(`${field} mismatch`);
  }
  if (entry?.activation !== 'ACTIVE') errors.push('activation must be ACTIVE');
  if (entry?.status !== 'RED') errors.push('debt status must remain RED');
  if (entry?.signatureProof?.evidenceCommit !== H_A8_AUTHORIZATION.evidenceCommit) {
    errors.push('evidence commit mismatch');
  }
  for (const field of [
    'baselineDigest',
    'candidateDigest',
    'baselineAssertionDigest',
    'candidateAssertionDigest',
  ]) {
    if (entry?.signatureProof?.[field] !== H_A8_AUTHORIZATION.signature) {
      errors.push(`${field} mismatch`);
    }
  }
  if (entry?.signatureProof?.mutationTests !== '6/6') errors.push('mutation tests mismatch');
  for (const checkpoint of ['B75', 'B77', 'B78']) {
    if (entry?.signatureProof?.repetitions?.[checkpoint] !== '10/10') {
      errors.push(`${checkpoint} repetition mismatch`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateHA8SemanticOutput(output, result) {
  const errors = [];
  if (result !== 'FAIL') errors.push('authorized instance must remain a failing scenario');
  const matches = [...String(output).matchAll(
    /^H-A8-VP-2 SEMANTIC-SIGNATURE ([0-9a-f]{64}) (.+)$/gm,
  )];
  if (matches.length !== 1) {
    errors.push(`expected one semantic signature line, got ${matches.length}`);
    return { ok: false, errors };
  }
  const [, observed, canonical] = matches[0];
  if (observed !== H_A8_AUTHORIZATION.signature) errors.push('semantic signature mismatch');
  if (sha256(canonical) !== observed) errors.push('semantic canonical digest mismatch');
  let parsed;
  try {
    parsed = JSON.parse(canonical);
  } catch {
    errors.push('semantic canonical JSON invalid');
  }
  const assertionShape = parsed?.assertions?.map(({ id, passed }) => ({ id, passed }));
  if (JSON.stringify(assertionShape) !== JSON.stringify([
    { id: 'H-A8-VP-2 CORE-B: canvas drag moves anchor', passed: false },
    { id: 'H-A8-VP-2 CORE-B′: coord tab tracks canvas drag', passed: true },
  ])) {
    errors.push('assertion/failure-point scope mismatch');
  }
  return { ok: errors.length === 0, errors, observed, canonical, parsed };
}

async function findPolicyRoot(startDir) {
  let current = path.resolve(startDir);
  for (let depth = 0; depth < 8; depth += 1) {
    const policyRoot = path.join(current, 'docs/plan3/policy');
    try {
      await fs.access(path.join(policyRoot, 'baseline-retained-failures.json'));
      return policyRoot;
    } catch {}
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error('H-A8-VP-2 policy registry not found');
}

export async function loadAndValidateHA8Authorization(startDir) {
  const policyRoot = await findPolicyRoot(startDir);
  const registry = JSON.parse(await fs.readFile(
    path.join(policyRoot, 'baseline-retained-failures.json'),
    'utf8',
  ));
  const policy = await import(pathToFileURL(
    path.join(policyRoot, 'baseline-retained-failure-policy.mjs'),
  ));
  const entry = registry.find((item) => item.id === H_A8_AUTHORIZATION.id);
  const policyValidation = policy.validateBaselineRetainedFailure(entry, { activating: true });
  const validation = validateHA8AuthorizationEntry(entry, policyValidation);
  if (!validation.ok) {
    throw new Error(`H-A8-VP-2 authorization invalid: ${validation.errors.join('; ')}`);
  }
  return entry;
}

import assert from 'node:assert/strict';
import test from 'node:test';
import registry from './baseline-retained-failures.json' with { type: 'json' };
import {
  validateBaselineRetainedFailure,
  validateCheckpointDebtReport,
} from './baseline-retained-failure-policy.mjs';

const active = {
  ...registry[0],
  authorizer: 'Director-123',
  activationCheckpoint: 'B79',
  signatureProof: {
    kind: 'byte-and-assertion-identical',
    evidenceCommit: '1234567890abcdef1234567890abcdef12345678',
    baselineDigest: 'sha256:bytes',
    candidateDigest: 'sha256:bytes',
    baselineAssertionDigest: 'sha256:assertions',
    candidateAssertionDigest: 'sha256:assertions',
    testRunId: 'B79-H-A8-VP-2-001',
    testCheckpoint: 'B79',
    repetitions: { B79: '10/10' },
    mutationTests: '6/6',
  },
  directorSignOff: {
    decision: 'APPROVED',
    directorIdentity: 'Director-123',
    signedAt: '2026-07-27T13:00:00Z',
    scope: registry[0].scope,
  },
  activation: 'ACTIVE',
};

test('authorized registry instance is active and exact-evidence bound', () => {
  assert.equal(validateBaselineRetainedFailure(registry[0], { activating: true }).ok, true);
  assert.equal(registry[0].debtBoardRow, 'BRF-H-A8-VP-2');
  assert.equal(registry[0].signatureProof.evidenceCommit,
    '7e9a12631879894affba30ea17e9d54da17f24bc');
  assert.equal(registry[0].signatureProof.baselineDigest,
    'ff470c3aafb0040bf28e6c4319f21a334e66035651b301b1a6899e5c5e1075b3');
});

test('complete independent exact-scope authorization can activate', () => {
  assert.equal(validateBaselineRetainedFailure(active, { activating: true }).ok, true);
});

const mutations = [
  ['wildcard scope', (x) => { x.scope = 'anchored-volume-profile *'; }],
  ['ambiguous scope', (x) => { x.scope = 'all anchored-volume-profile failures'; }],
  ['changed byte signature', (x) => { x.signatureProof.candidateDigest = 'sha256:changed'; }],
  ['changed assertion signature', (x) => {
    x.signatureProof.candidateAssertionDigest = 'sha256:changed';
  }],
  ['stale test checkpoint', (x) => { x.signatureProof.testCheckpoint = 'B77'; }],
  ['missing evidence commit', (x) => { x.signatureProof.evidenceCommit = null; }],
  ['incomplete repeated evidence', (x) => { x.signatureProof.repetitions.B79 = '9/10'; }],
  ['failed evidence mutation', (x) => { x.signatureProof.mutationTests = '5/6'; }],
  ['self authorization by owner', (x) => { x.authorizer = x.owner; }],
  ['self authorization by requester', (x) => { x.authorizer = x.requester; }],
  ['missing Director identity', (x) => { x.directorSignOff.directorIdentity = null; }],
  ['changed Director scope', (x) => { x.directorSignOff.scope = 'different scope'; }],
  ['missing security exclusion', (x) => { x.excludedScopes.pop(); }],
];

for (const [name, mutate] of mutations) {
  test(`fails closed: ${name}`, () => {
    const candidate = structuredClone(active);
    mutate(candidate);
    assert.equal(validateBaselineRetainedFailure(candidate, { activating: true }).ok, false);
  });
}

test('non-GREEN debt must appear in each checkpoint report', () => {
  const report = {
    baselineRetainedFailures: [{
      id: 'H-A8-VP-2',
      status: 'RED',
      owner: 'Lane 4 — Interaction/UX',
      targetCheckpoint: 'B79',
    }],
  };
  assert.equal(validateCheckpointDebtReport(registry, report).ok, true);
  assert.equal(validateCheckpointDebtReport(registry, { baselineRetainedFailures: [] }).ok, false);
  report.baselineRetainedFailures.push(structuredClone(report.baselineRetainedFailures[0]));
  assert.equal(validateCheckpointDebtReport(registry, report).ok, false);
});

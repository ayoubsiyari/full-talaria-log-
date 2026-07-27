import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditRetainedMutationCount,
  decideMutation,
  decideSessionStateWrite,
  validateAuthSafeAllowlist,
} from './b75-po-v4-network-policy.mjs';

test('prevents session-state writes by default', () => {
  assert.equal(decideSessionStateWrite({
    expectedQaSessionId: '849',
    observedSessionId: '849',
    ownerValidated: true,
    writeCap: 1,
  }).disposition, 'prevented');
});

test('allows only explicit owner-validated exact-scope writes below cap', () => {
  const allowed = decideSessionStateWrite({
    allowWrites: true,
    expectedQaSessionId: '849',
    observedSessionId: '849',
    ownerValidated: true,
    writeCap: 2,
    allowedWriteCount: 1,
  });
  assert.equal(allowed.disposition, 'allowed-bounded-qa-write');
  assert.equal(allowed.remaining, 0);
});

for (const mutation of [
  { name: 'wrong session', observedSessionId: '850', ownerValidated: true, allowedWriteCount: 0 },
  { name: 'owner unvalidated', observedSessionId: '849', ownerValidated: false, allowedWriteCount: 0 },
  { name: 'cap exhausted', observedSessionId: '849', ownerValidated: true, allowedWriteCount: 1 },
]) {
  test(`prevents explicit write when ${mutation.name}`, () => {
    assert.equal(decideSessionStateWrite({
      allowWrites: true,
      expectedQaSessionId: '849',
      writeCap: 1,
      ...mutation,
    }).disposition, 'prevented');
  });
}

test('blocks a hidden mutating endpoint and marks capture fatal', () => {
  const result = decideMutation({
    method: 'POST',
    pathname: '/api/hidden/mutate',
    expectedQaSessionId: '849',
    ownerValidated: true,
  });
  assert.equal(result.disposition, 'prevented');
  assert.equal(result.fatal, true);
  assert.equal(result.reason, 'unknown-mutating-endpoint-or-method');
});

test('blocks wrong method on checkpoint route', () => {
  const result = decideMutation({
    method: 'PUT',
    pathname: '/api/sessions/849/state',
    expectedQaSessionId: '849',
    ownerValidated: true,
    allowWrites: true,
    writeCap: 1,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.fatal, true);
});

test('permits only the explicit auth-safe request', () => {
  assert.equal(decideMutation({
    method: 'POST',
    pathname: '/api/auth/login',
  }).disposition, 'allowed-auth-safe');
  assert.throws(() => validateAuthSafeAllowlist([
    { method: 'POST', pathname: '/api/auth/unknown' },
  ]), /unknown mutation allowlist entry/);
});

test('rejects an authoritative count copied from flattened duplicate entries', () => {
  const result = auditRetainedMutationCount({
    flattenedEntries: 29,
    deduplicatedObservations: 14,
    authoritativeClaim: 29,
  });
  assert.equal(result.verdict, 'BLOCKED_OVERCLAIMED_COUNT');
  assert.equal(result.authoritativeCount, null);
});

test('supports only 14 observations from the retained set without claiming completeness', () => {
  const result = auditRetainedMutationCount({
    flattenedEntries: 29,
    deduplicatedObservations: 14,
    authoritativeClaim: 14,
    captureComplete: false,
  });
  assert.equal(result.verdict, 'SUPPORTED_RETAINED_SET_COUNT');
  assert.equal(result.authoritativeCount, 14);
  assert.equal(result.hiddenMutationsExcluded, false);
});

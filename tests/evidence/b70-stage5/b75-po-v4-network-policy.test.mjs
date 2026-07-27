import assert from 'node:assert/strict';
import test from 'node:test';
import { decideSessionStateWrite } from './b75-po-v4-network-policy.mjs';

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

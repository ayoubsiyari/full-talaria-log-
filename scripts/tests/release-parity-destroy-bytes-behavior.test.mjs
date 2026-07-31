import assert from 'node:assert/strict';
import test from 'node:test';
import {
  E_DESTROY_CORRECTNESS_COMPANION,
  RELEASE_PARITY_DESTROY_BYTES_BEHAVIOR_SIGNATURE,
  runDestroyBytesBehaviorControl,
  runDestroyBytesBehaviorSuite,
} from '../release-parity-destroy-bytes-behavior.mjs';

test('destroy bytes behavior current product state is RED and names retained bytes', () => {
  const report = runDestroyBytesBehaviorControl('noDestroy');
  assert.equal(report.status, 'RED');
  assert.ok(report.afterLateWork.detachedRetainedBytes > 0);
  assert.ok(report.afterLateWork.lateWorkBytes > 0);
  assert.ok(report.failures.some((failure) => failure.reason === 'destroyed-instance-retains-bytes'));
  assert.ok(report.failures.some((failure) => failure.reason === 'late-work-rehydrated-bytes'));
  assert.equal(report.eCompanion.behaviorCell, 'DESTROY-NO-DESTROY-RESURRECTS-INDICATOR');
});

test('destroy bytes behavior future destroy control can go GREEN', () => {
  const report = runDestroyBytesBehaviorControl('withDestroy');
  assert.equal(report.status, 'GREEN', JSON.stringify(report.failures, null, 2));
  assert.equal(report.afterLateWork.detachedListeners, 0);
  assert.equal(report.afterLateWork.detachedRetainedBytes, 0);
  assert.equal(report.afterLateWork.lateWorkBytes, 0);
});

test('destroy bytes behavior suite coordinates with E and blocks release until destroy lands', () => {
  const report = runDestroyBytesBehaviorSuite();
  assert.equal(report.signature, RELEASE_PARITY_DESTROY_BYTES_BEHAVIOR_SIGNATURE);
  assert.equal(report.status, 'RED');
  assert.equal(report.redControl.status, 'GREEN');
  assert.equal(report.futureControl.status, 'GREEN');
  assert.equal(report.releaseAuthority.stopAuthority, true);
  assert.equal(report.releaseAuthority.destroyStop, true);
  assert.deepEqual(report.eCompanion, E_DESTROY_CORRECTNESS_COMPANION);
  assert.match(report.releaseAuthority.statement, /Chart\.destroy\(\) is absent/);
});

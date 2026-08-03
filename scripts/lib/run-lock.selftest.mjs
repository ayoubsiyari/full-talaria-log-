/**
 * RUN-LOCK-01 selftest. BIND-01: the state that matters is the refusal, so it
 * is driven from a lock file held by a process that is genuinely alive (this
 * one), not from a mock.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  acquireRunLock,
  isAlive,
  lockPathFor,
  writeArtifactAtomic,
} from './run-lock.mjs';

const tmpArtifact = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'runlock-')), 'artifact.json');

function planted(artifact, body) {
  const lf = lockPathFor(artifact);
  fs.mkdirSync(path.dirname(lf), { recursive: true });
  fs.writeFileSync(lf, body);
  return lf;
}

test('isAlive: this process yes, an implausible pid no', () => {
  assert.equal(isAlive(process.pid), true);
  assert.equal(isAlive(0x7ffffff), false);
  assert.equal(isAlive(-1), false);
});

test('first launch acquires and release removes the lock file', () => {
  const a = tmpArtifact();
  const lock = acquireRunLock({ artifact: a, script: 'selftest' });
  assert.equal(lock.state, 'LOCK_ACQUIRED');
  assert.equal(fs.existsSync(lock.lockFile), true);
  lock.release();
  assert.equal(fs.existsSync(lock.lockFile), false);
});

test('RED: a second launch while a live process holds it is refused', () => {
  const a = tmpArtifact();
  // A live holder that is not us. Our own pid is excluded by the guard, so use
  // the parent, which is alive for as long as this test is.
  const lf = planted(a, JSON.stringify({ pid: process.ppid, script: 'other.mjs', startedAt: 'now' }));
  try {
    const lock = acquireRunLock({ artifact: a, script: 'selftest' });
    assert.equal(lock.state, 'DUPLICATE_LAUNCH_REFUSED');
    assert.equal(lock.holder.script, 'other.mjs');
  } finally { fs.unlinkSync(lf); }
});

test('a dead holder is reclaimed rather than blocking the artifact forever', () => {
  const a = tmpArtifact();
  planted(a, JSON.stringify({ pid: 0x7ffffff, script: 'crashed.mjs', startedAt: 'then' }));
  const lock = acquireRunLock({ artifact: a, script: 'selftest' });
  assert.equal(lock.state, 'LOCK_STALE_RECLAIMED');
  lock.release();
});

test('an unparseable lock is reclaimed with its own state, not a crash', () => {
  const a = tmpArtifact();
  planted(a, 'not json at all');
  const lock = acquireRunLock({ artifact: a, script: 'selftest' });
  assert.equal(lock.state, 'LOCK_UNPARSEABLE_RECLAIMED');
  lock.release();
});

test('override is available but names itself so the artifact can declare it', () => {
  const a = tmpArtifact();
  const lf = planted(a, JSON.stringify({ pid: process.ppid, script: 'other.mjs', startedAt: 'now' }));
  try {
    const lock = acquireRunLock({ artifact: a, script: 'selftest', allowConcurrent: true });
    assert.equal(lock.state, 'CONCURRENCY_OVERRIDDEN');
  } finally { fs.unlinkSync(lf); }
});

test('the key is the artifact path: same path collides, different paths do not', () => {
  const a = tmpArtifact();
  const b = tmpArtifact();
  assert.equal(lockPathFor(a), lockPathFor(a));
  assert.notEqual(lockPathFor(a), lockPathFor(b));
});

test('an explicit key catches a second copy that would write a different file', () => {
  // The 12:19 shape: D's instrument auto-suffixes its output, so each launch
  // resolves a distinct path and an artifact-keyed lock never fires. Keying on
  // script identity is what refuses the second live copy.
  const first = acquireRunLock({ artifact: tmpArtifact(), key: 'demo-suite.mjs', script: 'demo-suite.mjs' });
  try {
    assert.equal(first.state, 'LOCK_ACQUIRED');
    const lf = planted(path.resolve('demo-suite.mjs'), JSON.stringify({ pid: process.ppid, script: 'demo-suite.mjs' }));
    try {
      const second = acquireRunLock({ artifact: tmpArtifact(), key: 'demo-suite.mjs', script: 'demo-suite.mjs' });
      assert.equal(second.state, 'DUPLICATE_LAUNCH_REFUSED');
    } finally { fs.unlinkSync(lf); }
  } finally { first.release(); }
});

test('writeArtifactAtomic leaves no partial file and no temp behind', () => {
  const a = tmpArtifact();
  writeArtifactAtomic(a, JSON.stringify({ ok: true }));
  assert.deepEqual(JSON.parse(fs.readFileSync(a, 'utf8')), { ok: true });
  const strays = fs.readdirSync(path.dirname(a)).filter((f) => f.includes('.tmp-'));
  assert.deepEqual(strays, []);
});

/**
 * COV-01-VALIDITY cells. BIND-01: every state demonstrated on input known to produce it, including
 * a RED on the real coverage figure from C's own canonical floor re-take.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { assessQuotability, withValidity, COV01_MIN_PCT } from './memory-validity.mjs';

test('RED on the real floor: 55.5% coverage is not quotable', () => {
  // The 2026-08-03 pass 3 canonical floor re-take on b126 measured 55.5-59.8% coverage.
  const v = assessQuotability({ coveragePct: 55.5, unattributedMB: 87, what: 'the canonical post-play floor' });
  assert.equal(v.state, 'NOT_QUOTABLE_COVERAGE');
  assert.equal(v.quotable, false);
  assert.match(v.reason, /87 MB sits in the unattributed remainder/);
});

test('a number at the threshold is quotable, and the threshold has one home', () => {
  assert.equal(assessQuotability({ coveragePct: COV01_MIN_PCT }).state, 'QUOTABLE');
  assert.equal(assessQuotability({ coveragePct: 94.99 }).quotable, false, 'the boundary must not round in our favour');
});

test('unknown coverage is its own state, never reported as low coverage', () => {
  const v = assessQuotability({ coveragePct: null });
  assert.equal(v.state, 'COVERAGE_UNKNOWN');
  assert.equal(v.quotable, false);
  assert.match(v.reason, /broken or unbound instrument/,
    'a broken instrument read as a low-coverage product finding is the failure this separation prevents');
});

test('NaN is not silently treated as a number', () => {
  assert.equal(assessQuotability({ coveragePct: NaN }).state, 'COVERAGE_UNKNOWN');
});

test('TOTAL-01 is judged before coverage, because it removes the denominator', () => {
  const v = assessQuotability({ coveragePct: 99, hasTotalRow: false });
  assert.equal(v.state, 'NOT_QUOTABLE_NO_TOTAL');
  assert.equal(v.quotable, false, 'high coverage against no total is not coverage at all');
});

test('withValidity stamps the verdict so the artifact carries the judgement', () => {
  const stamped = withValidity({ floorMB: 674.9, verdict: 'FLOOR_FOUND' }, { coveragePct: 55.5 });
  assert.equal(stamped.floorMB, 674.9);
  assert.equal(stamped.quotable, false, 'FLOOR_FOUND and quotable are different claims');
  assert.equal(stamped.cov01.state, 'NOT_QUOTABLE_COVERAGE');
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessR3SessionStartCoverage,
  assertR3SessionStartCoverage,
  R3_SESSION_START_COVERAGE_SIGNATURE,
} from './lib/conf01-session.mjs';

const T = (iso) => Date.parse(iso);

test('R3 preflight refuses the replay-system.js:4297 fallback shape', () => {
  const r = assessR3SessionStartCoverage([
    {
      panelId: 'A',
      fileId: 677,
      timeframe: '1m',
      bars: 100,
      dataFirstMs: T('2026-04-17T00:00:00Z'),
      dataLastMs: T('2026-05-18T00:00:00Z'),
      sessionStartMs: T('2026-06-18T00:00:00Z'),
      firstAtOrAfterSessionStartMs: null,
    },
  ]);
  assert.equal(r.signature, R3_SESSION_START_COVERAGE_SIGNATURE);
  assert.equal(r.ok, false);
  assert.equal(r.state, 'R3_NO_BAR_AT_OR_AFTER_SESSION_START');
  assert.match(r.reason, /replay-system\.js:4297/);
  assert.throws(() => assertR3SessionStartCoverage(r), (error) => {
    assert.equal(error.name, 'R3SessionStartCoverageRefusal');
    assert.equal(error.state, 'R3_NO_BAR_AT_OR_AFTER_SESSION_START');
    return true;
  });
});

test('R3 preflight passes when every realm has a loaded bar at the session start boundary', () => {
  const r = assessR3SessionStartCoverage([
    {
      panelId: 'A',
      fileId: 677,
      timeframe: '1m',
      bars: 2,
      dataFirstMs: T('2026-06-18T00:00:00Z'),
      dataLastMs: T('2026-06-19T00:00:00Z'),
      sessionStartMs: T('2026-06-19T00:00:00Z'),
      firstAtOrAfterSessionStartMs: T('2026-06-19T00:00:00Z'),
    },
    {
      panelId: 'B',
      fileId: 677,
      timeframe: '5m',
      bars: 2,
      dataFirstMs: T('2026-06-18T00:00:00Z'),
      dataLastMs: T('2026-06-20T00:00:00Z'),
      sessionStartMs: T('2026-06-19T00:00:00Z'),
      firstAtOrAfterSessionStartMs: T('2026-06-20T00:00:00Z'),
    },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.state, 'R3_SESSION_START_COVERAGE_OK');
  assert.equal(assertR3SessionStartCoverage(r), r);
});

test('R3 preflight names unreadable realms separately from bad loaded data', () => {
  const r = assessR3SessionStartCoverage([
    {
      panelId: 'A',
      bars: 0,
      dataFirstMs: null,
      dataLastMs: null,
      sessionStartMs: T('2026-06-19T00:00:00Z'),
      firstAtOrAfterSessionStartMs: null,
    },
  ]);
  assert.equal(r.ok, false);
  assert.equal(r.state, 'R3_SESSION_START_COVERAGE_UNREADABLE');
  assert.doesNotMatch(r.reason, /replay-system\.js:4297/);
});

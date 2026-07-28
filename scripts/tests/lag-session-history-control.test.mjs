import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TALARIA_LAG_SESSION_HISTORY_V1,
  assertLagSessionHistory,
  sealLagVerdict,
} from '../lib/lag-session-history-control.mjs';
import {
  INDICATOR_LAG_ORACLE_V1,
  runIndicatorLagOracleStub,
} from '../../docs/plan3/oracles/indicator-lag-oracle-v1.mjs';

test('signature token is TALARIA_LAG_SESSION_HISTORY_V1', () => {
  assert.equal(TALARIA_LAG_SESSION_HISTORY_V1, 'TALARIA_LAG_SESSION_HISTORY_V1');
});

test('VOID: missing meta', () => {
  const v = assertLagSessionHistory(undefined);
  assert.equal(v.status, 'VOID');
  assert.equal(v.ok, false);
});

test('VOID: GREEN attempted without sessionHistory control', () => {
  const sealed = sealLagVerdict({ status: 'GREEN', sessionHistory: { freshContext: false } });
  assert.equal(sealed.status, 'VOID');
  assert.equal(sealed.sealed, false);
});

test('VOID: stated-prior-actions with empty priorActions', () => {
  const v = assertLagSessionHistory({
    sessionHistory: { kind: 'stated-prior-actions', freshContext: false, priorActions: [] },
  });
  assert.equal(v.status, 'VOID');
});

test('CONTROL_OK: freshContext true allows sealed GREEN', () => {
  const sealed = sealLagVerdict({
    status: 'GREEN',
    sessionHistory: { freshContext: true, kind: 'fresh-private-window' },
  });
  assert.equal(sealed.status, 'GREEN');
  assert.equal(sealed.sealed, true);
  assert.equal(sealed.ok, true);
});

test('CONTROL_OK: stated prior actions with explicit freshContext false', () => {
  const sealed = sealLagVerdict({
    status: 'RED',
    sessionHistory: {
      kind: 'stated-prior-actions',
      freshContext: false,
      priorActions: ['opened multichart', 'switched symbol'],
    },
  });
  assert.equal(sealed.status, 'RED');
  assert.equal(sealed.sealed, true);
  assert.equal(sealed.ok, false);
});

test('oracle stub refuses GREEN without control', () => {
  const v = runIndicatorLagOracleStub({});
  assert.equal(v.status, 'VOID');
  assert.notEqual(v.sealed, true);
});

test('oracle stub sealed GREEN with fresh private window', () => {
  const v = runIndicatorLagOracleStub({
    sessionHistory: { freshContext: true, kind: 'fresh-private-window' },
  });
  assert.equal(v.oracle, INDICATOR_LAG_ORACLE_V1);
  assert.equal(v.status, 'GREEN');
  assert.equal(v.sealed, true);
});

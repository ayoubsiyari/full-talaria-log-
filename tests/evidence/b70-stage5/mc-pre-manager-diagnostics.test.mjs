import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRODUCT_DEADLINE_MS,
  assertSafeLeaseTransition,
  classifyPreManagerStage,
  resolveStoredPassport,
} from './mc-pre-manager-diagnostics.mjs';

const passport = { layout: '3v', sessionId: '849', panels: [{ index: 0 }] };
const healthy = () => ({
  navigation: { sameOrigin: true, authRedirect: false },
  switch: { arm: 'on', runtime: true },
  storage: { passport: { selected: passport } },
  lease: { clientId: 'client-123', claimed: true, heartbeatOk: true, blocked: false },
  managerScript: { responseOk: true, bodyHash: 'abc' },
  react: { rootPresent: true, booted: true },
  manager: { constructorSeen: true, hostRegistered: true, iframeCount: 2 },
});

test('storage namespace mismatch is explicit and scoped wins', () => {
  const result = resolveStoredPassport({
    chart_panel_state: JSON.stringify({ ...passport, sessionId: 'old' }),
    u7_chart_panel_state: JSON.stringify(passport),
  }, '7');
  assert.equal(result.mismatch, true);
  assert.equal(result.selected.sessionId, '849');
});

test('missing manager script fails before React topology', () => {
  const value = healthy();
  value.managerScript = { responseOk: false, bodyHash: null };
  assert.equal(classifyPreManagerStage(value), 'manager-script');
});

test('lease loss requires same-client claim and heartbeat reacquire', () => {
  const events = [
    { kind: 'response', url: 'https://test/api/chart/windows/release', status: 200, ok: true },
    { kind: 'response', url: 'https://test/api/chart/windows/claim', status: 200, ok: true,
      body: { evicted_client_ids: [] } },
    { kind: 'response', url: 'https://test/api/chart/windows/heartbeat', status: 200, ok: true },
  ];
  assert.equal(assertSafeLeaseTransition(events, 'client-123').pass, true);
  assert.equal(assertSafeLeaseTransition(events.slice(0, 2), 'client-123').pass, false);
});

test('auth redirect is diagnosed before missing manager', () => {
  const value = healthy();
  value.navigation = { sameOrigin: false, authRedirect: true };
  value.managerScript.responseOk = false;
  assert.equal(classifyPreManagerStage(value), 'auth');
});

test('React boot failure is distinct from manager failure', () => {
  const value = healthy();
  value.react.booted = false;
  assert.equal(classifyPreManagerStage(value), 'react');
});

test('successful true reload reaches ready within unchanged deadline', () => {
  assert.equal(PRODUCT_DEADLINE_MS, 10_000);
  assert.equal(classifyPreManagerStage(healthy()), 'ready');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptMarker,
  classifyProtocolError,
  createLifecycleState,
  diagnostics,
  identityVerdict,
  normalizeExpectedBuild,
  waitStage,
} from './mc-build-preflight.mjs';

const marker = (buildId, url, top) =>
  `__TALARIA_IDENTITY_V1__${JSON.stringify({ buildId, url, top })}`;

test('BOM-safe expected build remains exact', () => {
  assert.equal(normalizeExpectedBuild('\uFEFF20260725b70\r\n'), '20260725b70');
});

test('pending renderer evaluation is bounded internally', async () => {
  const state = createLifecycleState('20260725b70', () => 0);
  let clock = 0;
  await assert.rejects(
    waitStage(state, 'top-level-build-id', () => false, 3, {
      now: () => clock,
      sleep: async () => { clock++; },
      intervalMs: 1,
    }),
    (error) => error.kind === 'internal-timeout' && state.stage === 'top-level-build-id',
  );
});

test('navigation context destruction is distinct and retryable', () => {
  assert.equal(
    classifyProtocolError(new Error('Execution context was destroyed because of a navigation')),
    'navigation-context-destroyed',
  );
});

test('page close is a target close', async () => {
  const state = createLifecycleState('20260725b70');
  state.pageClosed = true;
  await assert.rejects(
    waitStage(state, 'iframe-discovery', () => false, 10),
    (error) => error.kind === 'target-close',
  );
});

test('browser crash is distinct from target close', () => {
  assert.equal(classifyProtocolError(new Error('Connection closed'), false), 'browser-close');
});

test('cleanup race preserves process diagnostics', () => {
  const state = createLifecycleState('20260725b70');
  state.stage = 'cleanup';
  state.browserClosed = true;
  state.processExit = { code: null, signal: 'SIGKILL' };
  const result = diagnostics(state, new Error('browser has disconnected'));
  assert.equal(result.errorClass, 'browser-close');
  assert.deepEqual(result.processExit, { code: null, signal: 'SIGKILL' });
});

test('successful host and iframe event capture passes', () => {
  const state = createLifecycleState('20260725b70');
  const frameUrl = 'https://test.invalid/chart/multichart-prod/chart-embed.html?v=20260725b70';
  state.frames.set(frameUrl, { url: frameUrl, ready: false, buildId: null });
  assert.equal(acceptMarker(state, marker('20260725b70', 'https://test.invalid/chart/', true)), true);
  assert.equal(acceptMarker(state, marker('20260725b70', frameUrl, false)), true);
  assert.equal(identityVerdict(state).ok, true);
});

test('empty host or iframe IDs fail closed', () => {
  const state = createLifecycleState('20260725b70');
  const frameUrl = 'https://test.invalid/chart/multichart-prod/chart-embed.html';
  state.frames.set(frameUrl, { url: frameUrl, ready: true, buildId: null });
  const result = identityVerdict(state);
  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /empty top-level|empty iframe/);
  assert.equal(acceptMarker(state, marker('', frameUrl, false)), false);
});

test('diagnostics redact sensitive URL values and bound events', () => {
  const state = createLifecycleState('20260725b70');
  state.currentUrl = 'https://test.invalid/chart?token=secret';
  state.frames.set('https://test.invalid/frame?session=secret', {
    url: 'https://test.invalid/frame?session=secret',
    ready: false,
    buildId: null,
  });
  const result = diagnostics(state, new Error('token=secret'));
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});

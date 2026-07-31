import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RELEASE_PARITY_README_6_3_SIGNATURE,
  TEARDOWN_PROBE_BASELINE,
  runAddRemoveListenerModel,
  runReadme63Suite,
} from '../release-parity-readme-6-3-add-remove.mjs';
import {
  RELEASE_PARITY_README_6_5_SIGNATURE,
  runPanThrottleModel,
  runReadme65Suite,
} from '../release-parity-readme-6-5-pan-throttle.mjs';

test('README 6.3 is RED today because Chart.destroy() is absent', () => {
  const current = runAddRemoveListenerModel({ mode: 'noDestroy' });
  assert.equal(current.status, 'RED', JSON.stringify(current, null, 2));
  assert.equal(current.listenerCountPerChart, TEARDOWN_PROBE_BASELINE.liveListenersPerInstance);
  assert.equal(current.leakedListeners, 147);
  assert.equal(current.pageWideRegisteredListeners, 357);
  assert.equal(current.pageWideRemovedListeners, 0);
  assert.equal(current.rafLoopsPerInstance, 1);
  assert.equal(current.after.liveRafLoops, current.atThree.liveRafLoops);
  assert.equal(current.timeoutHandlesAtRest, 2);
  assert.equal(current.anonymousClosureListeners, 147);
  assert.equal(current.retainedListenerReferences, 0);
  assert.equal(current.removableAtAll, false);
  assert.equal(current.teardownProbeMatchesCurrent, true);
  assert.equal(current.after.chartIds.length, 2);
  assert.ok(current.after.survivingListeners > current.beforeGrow.survivingListeners);
});

test('README 6.3 future destroy control proves the gate can go GREEN', () => {
  const future = runAddRemoveListenerModel({ mode: 'withDestroy' });
  assert.equal(future.status, 'GREEN', JSON.stringify(future, null, 2));
  assert.equal(future.after.survivingListeners, future.beforeGrow.survivingListeners);
  assert.equal(future.removableAtAll, true);
  assert.equal(future.pageWideRemovedListeners, 147);
  assert.equal(future.anonymousClosureListeners, 0);
  assert.equal(future.retainedListenerReferences, 147);
  const suite = runReadme63Suite();
  assert.equal(suite.signature, RELEASE_PARITY_README_6_3_SIGNATURE);
  assert.equal(suite.status, 'RED');
  assert.equal(suite.current.status, 'RED');
  assert.equal(suite.destroyControl.status, 'GREEN');
  assert.equal(suite.releaseAuthority.productBlocksRelease, true);
});

test('README 6.5 four mismatched-timeframe charts / 30s / 4× throttle fail=0 for pan', () => {
  const green = runPanThrottleModel({ route: 'pan', mode: 'stable' });
  assert.equal(green.status, 'GREEN');
  assert.equal(green.charts, 4);
  assert.equal(green.durationMs, 30_000);
  assert.equal(green.cpuThrottle, 4);
  assert.equal(green.mismatchedTimeframesOnly, true);
  assert.equal(green.fail, 0);
});

test('README 6.5 resize is also a candle-compression route', () => {
  const green = runPanThrottleModel({ route: 'resize', mode: 'stable' });
  assert.equal(green.status, 'GREEN');
  assert.equal(green.route, 'resize');
  assert.equal(green.mismatchedTimeframesOnly, true);
  assert.equal(green.fail, 0);
});

test('README 6.5 RED controls: injected pan/resize failures are detected', () => {
  const red = runPanThrottleModel({ route: 'pan', mode: 'failing' });
  assert.equal(red.status, 'RED');
  assert.ok(red.fail > 0);
  const suite = runReadme65Suite();
  assert.equal(suite.signature, RELEASE_PARITY_README_6_5_SIGNATURE);
  assert.equal(suite.status, 'GREEN');
  assert.equal(suite.routes.pan.status, 'GREEN');
  assert.equal(suite.routes.resize.status, 'GREEN');
  assert.equal(suite.redControls.every((c) => c.status === 'GREEN'), true);
});

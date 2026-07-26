import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyArmPanel,
  observableReady,
  stageForSnapshot,
  topologyReady,
} from './mc-snapshot-contract.mjs';

const panel = (id, host = false) => ({
  id, host, ticker: id, fileId: id, bars: 10, nonblack: 4,
  expected: { ticker: id, fileId: id },
});
const ready = {
  navigation: { top: true },
  panels: [panel('A', true), panel('B'), panel('C')],
};

test('OFF legacy readiness uses host plus iframe observable state', () => {
  assert.equal(topologyReady(ready), true);
  assert.equal(observableReady(ready), true);
  assert.equal(stageForSnapshot(ready), 'ready');
});

test('manager host registration is not required for topology', () => {
  const value = { ...ready, manager: { chartCount: 2, ids: ['B', 'C'] } };
  assert.equal(topologyReady(value), true);
});

test('missing and late observable stages remain diagnostic', () => {
  assert.equal(stageForSnapshot({ navigation: { top: true }, panels: [panel('A', true)] }), 'topology');
  assert.equal(stageForSnapshot({
    ...ready,
    panels: ready.panels.map((value, index) => index === 2 ? { ...value, bars: 0 } : value),
  }), 'bars');
  assert.equal(stageForSnapshot({
    ...ready,
    panels: ready.panels.map((value, index) => index === 2 ? { ...value, nonblack: 0 } : value),
  }), 'paint');
});

test('navigation is diagnosed before stale snapshot state', () => {
  assert.equal(stageForSnapshot({ ...ready, navigation: { top: false } }), 'navigation');
});

test('OFF does not depend on ON-only generation metadata', () => {
  const value = { ...panel('A', true), paintMs: 20 };
  const classify = () => ({ pass: true });
  const strict = () => false;
  assert.equal(classifyArmPanel(value, false, strict, classify), true);
  assert.equal(classifyArmPanel(value, true, strict, classify), false);
});

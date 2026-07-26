import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyOffDeadline,
  classifyArmPanel,
  isExpectedOffRedSnapshot,
  observableReady,
  stageForSnapshot,
  topologyReady,
  transitionAbState,
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

const offSnapshot = () => ({
  navigation: { top: true },
  errors: [],
  panels: [
    {
      ...panel('A', true),
      ticker: 'EURUSD', fileId: '25', sessionId: '849', timeframe: '1m',
      expected: { ticker: 'EURUSD', fileId: '25', sessionId: '849', timeframe: '1m' },
      errors: [],
    },
    {
      ...panel('B'), ticker: '', fileId: '', sessionId: '', bars: 0, nonblack: 0,
      expected: { ticker: 'GBPUSD', fileId: '27', sessionId: '849', timeframe: '1m' },
      errors: [],
    },
    {
      ...panel('C'), ticker: '', fileId: '', sessionId: '', bars: 0, nonblack: 0,
      expected: { ticker: 'AUDUSD', fileId: '28', sessionId: '849', timeframe: '1m' },
      errors: [],
    },
  ],
});

test('expected stable OFF RED is accepted only at deadline', () => {
  const value = offSnapshot();
  assert.equal(isExpectedOffRedSnapshot(value), true);
  const verdict = classifyOffDeadline([
    { atMs: 8_700, value },
    { atMs: 9_300, value },
    { atMs: 9_900, value },
  ], 1_000);
  assert.equal(verdict.pass, true);
  assert.equal(verdict.reason, 'EXPECTED_OFF_RED');
});

test('transient OFF blank that later paints is not false RED', () => {
  const blank = offSnapshot();
  const painted = structuredClone(blank);
  Object.assign(painted.panels[1], {
    ticker: 'GBPUSD', fileId: '27', sessionId: '849', timeframe: '1m', bars: 10, nonblack: 4,
  });
  assert.equal(classifyOffDeadline([
    { atMs: 100, value: blank },
    { atMs: 9_900, value: painted },
  ]).pass, false);
});

test('one blank panel and one wrong identity is hard OFF failure', () => {
  const value = offSnapshot();
  Object.assign(value.panels[2], { ticker: 'GBPUSD', fileId: '27' });
  assert.equal(classifyOffDeadline([{ atMs: 0, value }, { atMs: 1_100, value }]).pass, false);
});

test('missing host passport is hard OFF failure', () => {
  const value = offSnapshot();
  value.panels[0].fileId = '';
  assert.equal(classifyOffDeadline([{ atMs: 0, value }, { atMs: 1_100, value }]).pass, false);
});

test('runtime errors are hard OFF failure', () => {
  const value = offSnapshot();
  value.panels[1].errors.push('boom');
  assert.equal(classifyOffDeadline([{ atMs: 0, value }, { atMs: 1_100, value }]).pass, false);
});

test('OFF candidate must remain stable through deadline', () => {
  const value = offSnapshot();
  const verdict = classifyOffDeadline([{ atMs: 9_200, value }, { atMs: 9_900, value }], 1_000);
  assert.equal(verdict.pass, false);
  assert.equal(verdict.reason, 'OFF_RED_NOT_STABLE_AT_DEADLINE');
});

test('state machine continues deterministically from A to B', () => {
  let state = 'OFF_ARMED';
  state = transitionAbState(state, 'OFF_RED_WITNESSED');
  state = transitionAbState(state, 'ON_SWITCH_READBACK');
  state = transitionAbState(state, 'ON_GREEN');
  assert.equal(state, 'COMPLETE');
  assert.throws(() => transitionAbState('OFF_ARMED', 'ON_GREEN'), /invalid MC A\/B transition/);
});

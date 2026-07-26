import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyPanel,
  strictIdentity,
  summarizeAb,
  validateLayout,
} from './mc-restore-evidence-model.mjs';

const expected = {
  ticker: 'EURUSD', fileId: '25', sessionId: '849', timeframe: '1m',
};
const panel = {
  ...expected, generation: 4, appliedGeneration: 4,
  bars: 2701, nonblack: 40, nonblank: true, paintMs: 900,
};

test('only valid 3v layout is accepted', () => {
  assert.equal(validateLayout('3v'), true);
  assert.throws(() => validateLayout('3'), /exact valid layout 3v/);
});

test('strict identity rejects vacuous and swapped passports', () => {
  assert.equal(strictIdentity(panel, expected, 4), true);
  assert.equal(strictIdentity({ ...panel, ticker: 'null' }, expected, 4), false);
  assert.equal(strictIdentity({ ...panel, fileId: '27' }, expected, 4), false);
  assert.equal(strictIdentity({ ...panel, appliedGeneration: 3 }, expected, 4), false);
  assert.equal(strictIdentity({ ...panel, generation: undefined, appliedGeneration: undefined },
    expected, undefined), false);
});

test('paint and identity classification fails closed', () => {
  assert.equal(classifyPanel(panel, expected).pass, true);
  assert.equal(classifyPanel({ ...panel, nonblank: 0 }, expected).reason, 'BLACK_CANVAS');
  assert.equal(classifyPanel({ ...panel, paintMs: 10_001 }, expected).reason,
    'PAINT_DEADLINE_EXCEEDED');
});

test('A/B summary requires OFF RED and ten three-panel GREEN reloads', () => {
  const off = [{ pass: false }, { pass: false }, { pass: false }];
  const green = Array.from({ length: 10 }, () =>
    [{ pass: true }, { pass: true }, { pass: true }]);
  assert.deepEqual(summarizeAb(off, green), { offRed: true, onGreen: true, attempts: 10 });
  assert.equal(summarizeAb([{ pass: true }, { pass: false }, { pass: true }], green).offRed, true);
  assert.equal(summarizeAb([{ pass: true }, { pass: true }, { pass: true }], green).offRed, false);
  assert.equal(summarizeAb(off, green.slice(1)).onGreen, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { hA7bR2OracleStamp, validateHA7bR2Setup } from './h-a7b-r2-setup-contract.mjs';

const VALID = Object.freeze({
  commandAcknowledged: true,
  fileIds: { A: '25', B: '27' },
  data: { fileId: '27', length: 2000, firstTime: 1000, lastTime: 2000 },
  anchorPoints: [{ x: 600, y: 1.23456 }],
  placement: { id: 'deterministic-drawing-id' },
});

test('A5 fixed state passes setup', () => {
  assert.equal(validateHA7bR2Setup(VALID).classification, 'SETUP_VALID');
});

test('A5 broken state fails closed', () => {
  const result = validateHA7bR2Setup({ ...VALID, commandAcknowledged: false });
  assert.equal(result.classification, 'SETUP_INVALID');
  assert.equal(result.firstInvalidStage, 'load-command-ack');
});

test('A5 corrupted input fails closed', () => {
  const result = validateHA7bR2Setup({ ...VALID, fileIds: { A: '25', B: '25' } });
  assert.equal(result.classification, 'SETUP_INVALID');
  assert.equal(result.firstInvalidStage, 'panel-identity');
});

test('A5 inverted assertion flips fixed state', () => {
  assert.equal(!validateHA7bR2Setup(VALID).ok, false);
});

test('permanent negative control: wrong data identity is SETUP_INVALID', () => {
  const result = validateHA7bR2Setup({
    ...VALID,
    data: { ...VALID.data, fileId: '25' },
  });
  assert.equal(result.firstInvalidStage, 'panel-data');
});

test('permanent negative control: missing anchor is SETUP_INVALID', () => {
  const result = validateHA7bR2Setup({ ...VALID, anchorPoints: [] });
  assert.equal(result.firstInvalidStage, 'anchor-input');
});

test('permanent negative control: missing placement is SETUP_INVALID', () => {
  const result = validateHA7bR2Setup({ ...VALID, placement: null });
  assert.equal(result.firstInvalidStage, 'vp-placement');
});

test('oracle provenance is proven on authored build and expires closed', () => {
  assert.equal(hA7bR2OracleStamp('20260727b78').status, 'PROVEN');
  assert.equal(hA7bR2OracleStamp('20260727b82').status, 'UNPROVEN');
  assert.equal(hA7bR2OracleStamp('unknown').status, 'UNPROVEN');
});

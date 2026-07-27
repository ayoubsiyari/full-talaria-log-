import assert from 'node:assert/strict';
import test from 'node:test';
import {
  H_A8_AUTHORIZATION,
  loadAndValidateHA8Authorization,
  validateHA8AuthorizationEntry,
  validateHA8SemanticOutput,
} from './h-a8-vp-2-policy-authorization.mjs';

const entry = () => ({
  id: H_A8_AUTHORIZATION.id,
  debtBoardRow: H_A8_AUTHORIZATION.debtBoardRow,
  owner: H_A8_AUTHORIZATION.owner,
  activationCheckpoint: H_A8_AUTHORIZATION.activationCheckpoint,
  targetCheckpoint: H_A8_AUTHORIZATION.targetCheckpoint,
  activation: 'ACTIVE',
  status: 'RED',
  signatureProof: {
    evidenceCommit: H_A8_AUTHORIZATION.evidenceCommit,
    baselineDigest: H_A8_AUTHORIZATION.signature,
    candidateDigest: H_A8_AUTHORIZATION.signature,
    baselineAssertionDigest: H_A8_AUTHORIZATION.signature,
    candidateAssertionDigest: H_A8_AUTHORIZATION.signature,
    mutationTests: '6/6',
    repetitions: { B75: '10/10', B77: '10/10', B78: '10/10' },
  },
});

test('repository policy registry activates the exact H-A8 instance', async () => {
  const loaded = await loadAndValidateHA8Authorization(import.meta.dirname);
  assert.equal(loaded.debtBoardRow, H_A8_AUTHORIZATION.debtBoardRow);
});

for (const [name, mutate] of [
  ['scope', (value) => { value.id = 'H-A8-*'; }],
  ['debt row', (value) => { value.debtBoardRow = 'other'; }],
  ['target checkpoint', (value) => { value.targetCheckpoint = 'B80'; }],
  ['evidence commit', (value) => { value.signatureProof.evidenceCommit = '0'.repeat(40); }],
  ['signature', (value) => { value.signatureProof.candidateDigest = '0'.repeat(64); }],
  ['repetition', (value) => { value.signatureProof.repetitions.B77 = '9/10'; }],
]) {
  test(`${name} mismatch is rejected`, () => {
    const mutant = entry();
    mutate(mutant);
    assert.equal(validateHA8AuthorizationEntry(mutant).ok, false);
  });
}

test('semantic output accepts only the exact activated signature and failure point', () => {
  const canonical = '{"schema":"talaria.h-a8-vp-2-semantic/v1","scenario":"H-A8-VP-2","assertions":[{"id":"H-A8-VP-2 CORE-B: canvas drag moves anchor","passed":false},{"id":"H-A8-VP-2 CORE-B′: coord tab tracks canvas drag","passed":true}],"thresholds":{"barMove":0.5,"priceMove":0.00001,"barMatch":0.05,"priceMatch":0.00001},"dragCheckpoint":{"before":{"barIndex":614,"price":1.10963,"type":"anchored-volume-profile"},"after":{"barIndex":614,"price":1.10963,"type":"anchored-volume-profile"}},"recoveryCheckpoint":{"geometry":{"barIndex":614,"price":1.10865,"type":"anchored-volume-profile"},"coordinates":{"anchorBar":614,"anchorPrice":1.10865,"inputCount":2}}}';
  const output = `H-A8-VP-2 SEMANTIC-SIGNATURE ${H_A8_AUTHORIZATION.signature} ${canonical}\n`;
  assert.equal(validateHA8SemanticOutput(output, 'FAIL').ok, true);
  assert.equal(validateHA8SemanticOutput(output.replace('1.10865', '1.10866'), 'FAIL').ok, false);
  assert.equal(validateHA8SemanticOutput(output, 'PASS').ok, false);
});

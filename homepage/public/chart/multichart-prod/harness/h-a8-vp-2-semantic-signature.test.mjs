import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertHA8Vp2SemanticSignature,
  hA8Vp2SemanticSignature,
} from './h-a8-vp-2-semantic-signature.mjs';

function fixture() {
  return {
    assertions: [
      { id: 'H-A8-VP-2 CORE-B: canvas drag moves anchor', passed: false },
      { id: 'H-A8-VP-2 CORE-B′: coord tab tracks canvas drag', passed: true },
    ],
    thresholds: { barMove: 0.5, priceMove: 1e-5, barMatch: 0.05, priceMatch: 1e-5 },
    dragCheckpoint: {
      before: { ok: true, barIndex: 614, price: 1.10963, type: 'anchored-volume-profile' },
      after: { ok: true, barIndex: 614, price: 1.10963, type: 'anchored-volume-profile' },
    },
    recoveryCheckpoint: {
      geometry: { ok: true, barIndex: 614, price: 1.10865, type: 'anchored-volume-profile' },
      coordinates: { ok: true, anchorBar: '614', anchorPrice: '1.10865', inputCount: 2 },
    },
  };
}

test('retained mechanism has the pinned stable signature', () => {
  assert.equal(
    hA8Vp2SemanticSignature(fixture()).sha256,
    'ff470c3aafb0040bf28e6c4319f21a334e66035651b301b1a6899e5c5e1075b3',
  );
});

test('generated identity and timing fields do not enter semantic signature', () => {
  const left = fixture();
  const right = fixture();
  left.uuid = '11111111-1111-1111-1111-111111111111';
  left.timestamp = 1;
  left.rafFrame = 114;
  right.uuid = '22222222-2222-2222-2222-222222222222';
  right.timestamp = 999;
  right.rafFrame = 115;
  assert.equal(hA8Vp2SemanticSignature(left).sha256, hA8Vp2SemanticSignature(right).sha256);
});

for (const [name, mutate] of [
  ['assertion identifier', (value) => { value.assertions[0].id += ' changed'; }],
  ['failure point', (value) => { value.assertions[0].passed = true; }],
  ['drag geometry value', (value) => { value.dragCheckpoint.after.price = 1.10964; }],
  ['recovery coordinate value', (value) => { value.recoveryCheckpoint.coordinates.anchorPrice = '1.10866'; }],
]) {
  test(`${name} mutation changes signature and is rejected`, () => {
    const baseline = fixture();
    const expected = hA8Vp2SemanticSignature(baseline).sha256;
    const mutant = structuredClone(baseline);
    mutate(mutant);
    assert.notEqual(hA8Vp2SemanticSignature(mutant).sha256, expected);
    assert.throws(
      () => assertHA8Vp2SemanticSignature(mutant, expected),
      /semantic signature changed/,
    );
  });
}

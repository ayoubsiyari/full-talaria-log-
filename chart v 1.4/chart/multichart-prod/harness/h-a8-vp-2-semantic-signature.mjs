import crypto from 'node:crypto';

export const H_A8_VP_2_SIGNATURE_SCHEMA = 'talaria.h-a8-vp-2-semantic/v1';

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`H-A8-VP-2 signature: ${name} must be finite`);
  return number;
}

function geometry(value, name) {
  if (!value || value.ok !== true) throw new Error(`H-A8-VP-2 signature: ${name} unavailable`);
  return {
    barIndex: finite(value.barIndex, `${name}.barIndex`),
    price: finite(value.price, `${name}.price`),
    type: String(value.type || ''),
  };
}

function coordinates(value, name) {
  if (!value || value.ok !== true) throw new Error(`H-A8-VP-2 signature: ${name} unavailable`);
  return {
    anchorBar: finite(value.anchorBar, `${name}.anchorBar`),
    anchorPrice: finite(value.anchorPrice, `${name}.anchorPrice`),
    inputCount: finite(value.inputCount, `${name}.inputCount`),
  };
}

export function normalizeHA8Vp2SemanticRecord(record) {
  return {
    schema: H_A8_VP_2_SIGNATURE_SCHEMA,
    scenario: 'H-A8-VP-2',
    assertions: record.assertions.map(({ id, passed }) => ({ id: String(id), passed: !!passed })),
    thresholds: {
      barMove: finite(record.thresholds.barMove, 'thresholds.barMove'),
      priceMove: finite(record.thresholds.priceMove, 'thresholds.priceMove'),
      barMatch: finite(record.thresholds.barMatch, 'thresholds.barMatch'),
      priceMatch: finite(record.thresholds.priceMatch, 'thresholds.priceMatch'),
    },
    dragCheckpoint: {
      before: geometry(record.dragCheckpoint.before, 'dragCheckpoint.before'),
      after: geometry(record.dragCheckpoint.after, 'dragCheckpoint.after'),
    },
    recoveryCheckpoint: {
      geometry: geometry(record.recoveryCheckpoint.geometry, 'recoveryCheckpoint.geometry'),
      coordinates: coordinates(record.recoveryCheckpoint.coordinates, 'recoveryCheckpoint.coordinates'),
    },
  };
}

export function hA8Vp2SemanticSignature(record) {
  const normalized = normalizeHA8Vp2SemanticRecord(record);
  const canonical = JSON.stringify(normalized);
  return {
    normalized,
    canonical,
    sha256: crypto.createHash('sha256').update(canonical).digest('hex'),
  };
}

export function assertHA8Vp2SemanticSignature(record, expectedSha256) {
  const signature = hA8Vp2SemanticSignature(record);
  if (signature.sha256 !== expectedSha256) {
    throw new Error(`H-A8-VP-2 semantic signature changed: expected ${expectedSha256}, got ${signature.sha256}`);
  }
  return signature;
}

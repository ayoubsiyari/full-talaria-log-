const EXACT_SIGNATURE_PROOF = 'byte-and-assertion-identical';
const FORBIDDEN_SCOPES = Object.freeze([
  'D-030-money-paths',
  'I16-customer-data',
  'security-controls',
]);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function exactList(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

export function validateBaselineRetainedFailure(entry, { activating = false } = {}) {
  const errors = [];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { ok: false, errors: ['entry must be an object'] };
  }

  if (!text(entry.id)) errors.push('id is required');
  if (entry.category !== 'baseline-retained failure') {
    errors.push('category must be exactly "baseline-retained failure"');
  }
  if (!text(entry.scope) || /[*?]|\ball\b|\bany\b/i.test(entry.scope)) {
    errors.push('scope must be explicit and may not contain wildcards or ambiguous all/any terms');
  }
  if (!text(entry.debtBoardRow) || !text(entry.owner) || !text(entry.targetCheckpoint)) {
    errors.push('named debtBoardRow, owner, and targetCheckpoint are required');
  }
  if (!exactList(entry.excludedScopes, FORBIDDEN_SCOPES)) {
    errors.push('D-030 money paths, I16 customer data, and security controls must be explicitly excluded');
  }
  if (entry.authorizer === entry.owner || entry.authorizer === entry.requester) {
    errors.push('self-authorization is prohibited');
  }

  const proof = entry.signatureProof;
  if (activating || entry.activation === 'ACTIVE') {
    if (!proof || proof.kind !== EXACT_SIGNATURE_PROOF) {
      errors.push('byte/assertion-identical baseline/candidate signature proof is required');
    } else {
      if (!text(proof.baselineDigest) || proof.baselineDigest !== proof.candidateDigest) {
        errors.push('baseline and candidate byte signatures must be identical');
      }
      if (!text(proof.baselineAssertionDigest)
          || proof.baselineAssertionDigest !== proof.candidateAssertionDigest) {
        errors.push('baseline and candidate assertion signatures must be identical');
      }
      if (!text(proof.testRunId) || !text(entry.activationCheckpoint)
          || proof.testCheckpoint !== entry.activationCheckpoint) {
        errors.push('fresh tests bound to the activation checkpoint are required');
      }
      if (!/^[0-9a-f]{40}$/.test(text(proof.evidenceCommit))) {
        errors.push('immutable 40-hex evidence commit is required');
      }
      const runResults = Object.values(proof.repetitions || {});
      if (runResults.length === 0
          || runResults.some((result) => !/^(\d+)\/\1$/.test(text(result)))) {
        errors.push('all declared repeated evidence runs must pass');
      }
      if (!/^(\d+)\/\1$/.test(text(proof.mutationTests))) {
        errors.push('evidence mutation tests must pass');
      }
    }
    if (!entry.directorSignOff || entry.directorSignOff.decision !== 'APPROVED'
        || !text(entry.directorSignOff.directorIdentity)
        || !text(entry.directorSignOff.signedAt)
        || entry.directorSignOff.scope !== entry.scope) {
      errors.push('explicit Director identity, scope-matched approval, and timestamp are required');
    }
    if (entry.activation !== 'ACTIVE') {
      errors.push('activation must be explicitly ACTIVE');
    }
  } else if (entry.activation !== 'PENDING_IDENTITY_SCOPE_EVIDENCE') {
    errors.push('non-active rulings must remain PENDING_IDENTITY_SCOPE_EVIDENCE');
  }

  return { ok: errors.length === 0, errors };
}

export function validateCheckpointDebtReport(registry, report) {
  const errors = [];
  const required = registry.filter((entry) => entry.status !== 'GREEN').map((entry) => entry.id);
  const rows = Array.isArray(report?.baselineRetainedFailures)
    ? report.baselineRetainedFailures : [];
  for (const id of required) {
    const matches = rows.filter((row) => row?.id === id);
    if (matches.length !== 1) errors.push(`${id} must appear exactly once until GREEN`);
  }
  for (const row of rows) {
    if (!text(row?.status) || !text(row?.owner) || !text(row?.targetCheckpoint)) {
      errors.push('checkpoint debt rows require status, owner, and targetCheckpoint');
    }
  }
  return { ok: errors.length === 0, errors };
}

export const BASELINE_RETAINED_FAILURE_CONSTANTS = Object.freeze({
  exactSignatureProof: EXACT_SIGNATURE_PROOF,
  forbiddenScopes: FORBIDDEN_SCOPES,
});

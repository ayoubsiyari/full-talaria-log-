export function decideSessionStateWrite({
  allowWrites = false,
  expectedQaSessionId,
  observedSessionId,
  ownerValidated = false,
  writeCap = 0,
  allowedWriteCount = 0,
} = {}) {
  const exactScope = String(expectedQaSessionId || '') !== ''
    && String(observedSessionId || '') === String(expectedQaSessionId);
  const cap = Number(writeCap);
  const count = Number(allowedWriteCount);
  const bounded = Number.isInteger(cap) && cap > 0
    && Number.isInteger(count) && count >= 0 && count < cap;
  const allowed = allowWrites === true && exactScope && ownerValidated === true && bounded;
  return {
    disposition: allowed ? 'allowed-bounded-qa-write' : 'prevented',
    allowed,
    exactScope,
    ownerValidated: ownerValidated === true,
    remaining: allowed ? cap - count - 1 : 0,
  };
}

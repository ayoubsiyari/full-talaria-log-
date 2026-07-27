export const MUTATING_METHODS = Object.freeze(['POST', 'PUT', 'PATCH', 'DELETE']);
export const AUTH_SAFE_ALLOWLIST = Object.freeze([
  Object.freeze({ method: 'POST', pathname: '/api/auth/login' }),
]);

export function validateAuthSafeAllowlist(entries = AUTH_SAFE_ALLOWLIST) {
  if (!Array.isArray(entries)) throw new Error('mutation allowlist must be an array');
  for (const entry of entries) {
    const recognized = AUTH_SAFE_ALLOWLIST.some((known) =>
      known.method === String(entry?.method || '').toUpperCase()
      && known.pathname === entry?.pathname);
    if (!recognized) throw new Error('unknown mutation allowlist entry');
  }
  return true;
}

export function decideMutation({
  method,
  pathname,
  sameOrigin = true,
  allowWrites = false,
  expectedQaSessionId,
  observedSessionId,
  ownerValidated = false,
  writeCap = 0,
  allowedWriteCount = 0,
  authSafeAllowlist = AUTH_SAFE_ALLOWLIST,
} = {}) {
  validateAuthSafeAllowlist(authSafeAllowlist);
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const mutating = MUTATING_METHODS.includes(normalizedMethod);
  if (!sameOrigin || !mutating) {
    return { disposition: 'observed-nonmutating', allowed: true, fatal: false };
  }
  const authSafe = authSafeAllowlist.some((entry) =>
    entry.method === normalizedMethod && entry.pathname === pathname);
  if (authSafe) {
    return { disposition: 'allowed-auth-safe', allowed: true, fatal: false };
  }
  const sessionMatch = String(pathname || '').match(/^\/api\/sessions\/([^/]+)\/state$/);
  const checkpointRoute = normalizedMethod === 'PATCH' && !!sessionMatch;
  const exactScope = String(expectedQaSessionId || '') !== ''
    && String(observedSessionId ?? sessionMatch?.[1] ?? '') === String(expectedQaSessionId);
  const cap = Number(writeCap);
  const count = Number(allowedWriteCount);
  const bounded = Number.isInteger(cap) && cap > 0
    && Number.isInteger(count) && count >= 0 && count < cap;
  const allowed = checkpointRoute && allowWrites === true
    && exactScope && ownerValidated === true && bounded;
  const knownPreventedCheckpoint = checkpointRoute && exactScope;
  return {
    disposition: allowed ? 'allowed-bounded-qa-write' : 'prevented',
    allowed,
    exactScope,
    ownerValidated: ownerValidated === true,
    remaining: allowed ? cap - count - 1 : 0,
    fatal: !allowed && !knownPreventedCheckpoint,
    reason: checkpointRoute
      ? (exactScope ? 'checkpoint-write-prevented' : 'session-scope-mismatch')
      : 'unknown-mutating-endpoint-or-method',
  };
}

export function decideSessionStateWrite(options = {}) {
  const observedSessionId = options.observedSessionId;
  return decideMutation({
    method: 'PATCH',
    pathname: `/api/sessions/${encodeURIComponent(observedSessionId || '')}/state`,
    ...options,
  });
}

export function auditRetainedMutationCount({
  flattenedEntries,
  deduplicatedObservations,
  authoritativeClaim,
  captureComplete = false,
} = {}) {
  const flattened = Number(flattenedEntries);
  const deduplicated = Number(deduplicatedObservations);
  const claim = Number(authoritativeClaim);
  const valid = Number.isInteger(flattened) && Number.isInteger(deduplicated)
    && deduplicated <= flattened && claim === deduplicated;
  return {
    verdict: valid ? 'SUPPORTED_RETAINED_SET_COUNT' : 'BLOCKED_OVERCLAIMED_COUNT',
    authoritativeCount: valid ? deduplicated : null,
    flattenedEntries: flattened,
    deduplicatedObservations: deduplicated,
    captureComplete: captureComplete === true,
    hiddenMutationsExcluded: captureComplete === true,
  };
}

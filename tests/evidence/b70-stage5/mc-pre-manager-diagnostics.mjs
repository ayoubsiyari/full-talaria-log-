import crypto from 'node:crypto';

export const PRODUCT_DEADLINE_MS = 10_000;
export const MANAGER_SCRIPT_PATH = '/chart/multichart-prod/multichart-manager.js';

export function sha256(body = '') {
  return crypto.createHash('sha256').update(body).digest('hex');
}

export function resolveStoredPassport(storage = {}, uid = '') {
  const scopedKey = uid ? `u${uid}_chart_panel_state` : '';
  const unscoped = storage.chart_panel_state ?? null;
  const scoped = scopedKey ? storage[scopedKey] ?? null : null;
  const parse = (value) => {
    try { return value == null ? null : JSON.parse(value); } catch { return null; }
  };
  const unscopedValue = parse(unscoped);
  const scopedValue = parse(scoped);
  const selected = scopedValue || unscopedValue;
  return {
    scopedKey: scopedKey || null,
    unscoped: unscopedValue,
    scoped: scopedValue,
    selected,
    mismatch: !!(scopedValue && unscopedValue
      && JSON.stringify(scopedValue) !== JSON.stringify(unscopedValue)),
  };
}

export function classifyPreManagerStage(value) {
  if (!value?.navigation?.sameOrigin || value.navigation.authRedirect) return 'auth';
  if (value?.switch?.arm !== 'on' || value.switch.runtime !== true) return 'switch';
  if (!value?.storage?.passport?.selected) return 'storage';
  if (value?.lease?.blocked) return 'lease-blocked';
  if (!value?.lease?.clientId || !value.lease.claimed || !value.lease.heartbeatOk) return 'lease';
  if (!value?.managerScript?.responseOk) return 'manager-script';
  if (!value?.managerScript?.bodyHash) return 'manager-script-body';
  if (!value?.react?.rootPresent || !value.react.booted) return 'react';
  if (!value?.manager?.constructorSeen) return 'manager-constructor';
  if (!value?.manager?.hostRegistered) return 'host-registration';
  if ((value?.manager?.iframeCount || 0) < 2) return 'iframe-topology';
  return 'ready';
}

export function assertSafeLeaseTransition(events = [], expectedClientId) {
  const relevant = events.filter((event) =>
    /\/api\/chart\/windows\/(claim|heartbeat|release)$/.test(event.url || ''));
  const claims = relevant.filter((event) => event.kind === 'response' && /\/claim$/.test(event.url));
  const heartbeats = relevant.filter((event) =>
    event.kind === 'response' && /\/heartbeat$/.test(event.url));
  const lastClaim = claims.at(-1);
  const lastHeartbeat = heartbeats.at(-1);
  const evicted = lastClaim?.body?.evicted_client_ids || [];
  return {
    pass: !!expectedClientId && lastClaim?.ok === true && evicted.length === 0
      && lastHeartbeat?.ok === true,
    expectedClientId: expectedClientId || null,
    claimStatus: lastClaim?.status ?? null,
    heartbeatStatus: lastHeartbeat?.status ?? null,
    evictedCount: evicted.length,
    events: relevant,
  };
}

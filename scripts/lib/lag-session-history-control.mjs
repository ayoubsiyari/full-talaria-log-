/**
 * LAG session-history control — FINDING-LAG-IS-RESIDUE-20260728 §6 (binding).
 * Signature: TALARIA_LAG_SESSION_HISTORY_V1
 *
 * Lag GREEN/RED without fresh context or stated prior actions is VOID (not reportable).
 */

export const TALARIA_LAG_SESSION_HISTORY_V1 = 'TALARIA_LAG_SESSION_HISTORY_V1';

/**
 * @typedef {{
 *   freshContext?: boolean,
 *   kind?: 'fresh-private-window' | 'stated-prior-actions' | string,
 *   priorActions?: string[],
 * }} SessionHistoryMeta
 */

/**
 * @param {{ sessionHistory?: SessionHistoryMeta }} meta
 */
export function assertLagSessionHistory(meta) {
  if (!meta || typeof meta !== 'object') {
    return {
      ok: false,
      status: 'VOID',
      voidReason: 'missing meta',
      signature: TALARIA_LAG_SESSION_HISTORY_V1,
    };
  }

  const sh = meta.sessionHistory;
  if (!sh || typeof sh !== 'object') {
    return {
      ok: false,
      status: 'VOID',
      voidReason: 'missing sessionHistory',
      signature: TALARIA_LAG_SESSION_HISTORY_V1,
    };
  }

  if (sh.freshContext === true) {
    return {
      ok: true,
      status: 'CONTROL_OK',
      signature: TALARIA_LAG_SESSION_HISTORY_V1,
      sessionHistory: sh,
    };
  }

  if (sh.kind === 'stated-prior-actions' && sh.freshContext === false) {
    const prior = sh.priorActions;
    if (!Array.isArray(prior) || prior.length === 0 || prior.some((line) => typeof line !== 'string' || !line.trim())) {
      return {
        ok: false,
        status: 'VOID',
        voidReason: 'stated-prior-actions requires non-empty priorActions: string[]',
        signature: TALARIA_LAG_SESSION_HISTORY_V1,
      };
    }
    return {
      ok: true,
      status: 'CONTROL_OK',
      signature: TALARIA_LAG_SESSION_HISTORY_V1,
      sessionHistory: sh,
    };
  }

  return {
    ok: false,
    status: 'VOID',
    voidReason: 'session history control invalid: need freshContext===true or kind=stated-prior-actions with freshContext===false and priorActions',
    signature: TALARIA_LAG_SESSION_HISTORY_V1,
  };
}

/**
 * @param {{ status: string, sessionHistory?: SessionHistoryMeta, [key: string]: unknown }} verdict
 */
export function sealLagVerdict(verdict) {
  const control = assertLagSessionHistory(verdict);
  if (!control.ok) {
    return {
      ...verdict,
      status: 'VOID',
      ok: false,
      voidReason: control.voidReason,
      signature: TALARIA_LAG_SESSION_HISTORY_V1,
      sealed: false,
    };
  }

  const proposed = String(verdict.status ?? '').toUpperCase();
  if (proposed !== 'GREEN' && proposed !== 'RED') {
    return {
      ...verdict,
      status: 'VOID',
      ok: false,
      voidReason: `lag verdict must be GREEN or RED when sealed; got ${verdict.status}`,
      signature: TALARIA_LAG_SESSION_HISTORY_V1,
      sealed: false,
    };
  }

  return {
    ...verdict,
    status: proposed,
    ok: proposed === 'GREEN',
    signature: TALARIA_LAG_SESSION_HISTORY_V1,
    sealed: true,
    sessionHistory: control.sessionHistory,
  };
}

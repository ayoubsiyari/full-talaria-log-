/**
 * INDICATOR-LAG-ORACLE-V1 scaffold (W34 / FINDING-LAG-IS-RESIDUE-20260728 §6)
 * Signature context: TALARIA_LAG_SESSION_HISTORY_V1 + future lag oracle token
 *
 * Standing rule: numeric/paint lag checks must not emit GREEN/RED unless sealed through
 * lag session-history control (fresh private window or stated prior actions).
 *
 * Product indicator lag wiring is follow-up; this scaffold proves VOID vs sealed paths.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TALARIA_LAG_SESSION_HISTORY_V1,
  assertLagSessionHistory,
  sealLagVerdict,
} from '../../../scripts/lib/lag-session-history-control.mjs';

export const INDICATOR_LAG_ORACLE_V1 = 'TALARIA_INDICATOR_LAG_ORACLE_V1';

/**
 * Stub lag measurement — replace with paint/timestamp oracle when wired.
 * @param {{ sessionHistory?: import('../../../scripts/lib/lag-session-history-control.mjs').SessionHistoryMeta }} meta
 */
export function runIndicatorLagOracleStub(meta) {
  const control = assertLagSessionHistory(meta);
  if (!control.ok) {
    return {
      oracle: INDICATOR_LAG_ORACLE_V1,
      status: 'VOID',
      ok: false,
      voidReason: control.voidReason,
      signature: TALARIA_LAG_SESSION_HISTORY_V1,
      measurement: null,
    };
  }

  const rawVerdict = {
    status: 'GREEN',
    sessionHistory: meta.sessionHistory,
    measurement: { stub: true, lagMs: 0 },
  };

  const sealed = sealLagVerdict(rawVerdict);
  return { oracle: INDICATOR_LAG_ORACLE_V1, ...sealed };
}

export { assertLagSessionHistory, sealLagVerdict, TALARIA_LAG_SESSION_HISTORY_V1 };

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const sample = runIndicatorLagOracleStub({
    sessionHistory: { freshContext: true, kind: 'fresh-private-window' },
  });
  console.log(JSON.stringify(sample, null, 2));
  process.exit(sample.sealed && sample.status === 'GREEN' ? 0 : 1);
}

/**
 * Named exemptions for M19 progressive-session soak `e_hotpathConsole`.
 *
 * Product Fix-E (`_m19HotpathLog`) gates console.log only; warn/error stay live.
 * The soak sink historically counted every level toward e_hotpathConsole, which
 * false-REDs known-good trade-loss safety warnings when the harness has no
 * session-state backend.
 *
 * Rules:
 * - Exemptions are an admit-list of exact named rows with written justification.
 * - Do NOT reclassify warn/error out of the counter globally.
 * - GATE-01: an injected hot-path console.log and an unlisted console.warn must
 *   each still turn e_hotpathConsole RED.
 */

export const M19_E_HOTPATH_CONSOLE_EXEMPTIONS = Object.freeze([
  Object.freeze({
    id: 'B_W16_DURABLE_JOURNAL_UNHYDRATED_HARNESS_ARTEFACT',
    level: 'warn',
    /**
     * Prefix of order-manager persistJournal hydration-guard warn (B-W16).
     * Full text:
     * "durable journal write suppressed: this session's journal was never hydrated
     *  from the server; the in-memory journal may be incomplete and writing it
     *  would delete server-side trades. Keeping last durable state."
     */
    matchPrefix: '📔 durable journal write suppressed:',
    verdict: 'HARNESS_ARTEFACT',
    justification:
      'B live-host control (Director 2026-07-29): unhydrated write → this warn fires and durable write is refused (probe can see it); after genuine session-state hydrate → no warn, durable write queued, PATCH 200, row confirmed. Soak has no trading-session backend, so journal provenance stays unhydrated and the safety warn fires once per closed trade (~TARGET_CLOSED_TRADES). Counting it as e_hotpathConsole false-REDs Fix-E while the product FixE contract governs console.log only. Named exemption only — warn/error remain in the counter for every unlisted message.',
  }),
]);

export function matchM19EHotpathConsoleExemption(level, args = []) {
  const head = typeof args[0] === 'string' ? args[0] : '';
  if (!head) return null;
  for (const row of M19_E_HOTPATH_CONSOLE_EXEMPTIONS) {
    if (row.level && level && String(level) !== String(row.level)) continue;
    if (head.startsWith(row.matchPrefix) || head.includes(row.matchPrefix)) {
      return row;
    }
  }
  return null;
}

/**
 * Classify a console call for soak Fix-E hotpath accounting.
 * @returns {{ countsTowardHotpath: boolean, exemptionId: string|null, verdict: string|null }}
 */
export function classifyM19EHotpathConsoleCall(level, args = []) {
  const hit = matchM19EHotpathConsoleExemption(level, args);
  if (hit) {
    return {
      countsTowardHotpath: false,
      exemptionId: hit.id,
      verdict: hit.verdict || null,
    };
  }
  return {
    countsTowardHotpath: true,
    exemptionId: null,
    verdict: null,
  };
}

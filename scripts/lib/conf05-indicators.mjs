/**
 * E's `CONF-05` indicator selection, read from E's own artifact rather than retyped.
 *
 * `CONF-05` requires the trade-bearing and zero-trade arms to differ in EXACTLY ONE VARIABLE: trades. If the
 * two arms load different indicators the subtraction is invalid and twenty hours of wall clock produce two
 * numbers that cannot be compared. So both arms read this one file, and if it cannot be read the run refuses
 * to start rather than quietly falling back to a different pair.
 *
 * This replaces `PO_TWO_INDICATORS` (`sma` 20 + `rsi` 14) for the paired soak. Both of those sit in E's
 * INCREMENTAL LAST-POINT family, so that pair measured one recalculation shape twice and never touched the
 * anchored family — the exact error the 17:05 amendment warns about. E's selection is deliberately one of
 * each: `ema` is incremental-recursive, `vwap` is anchored-cumulative.
 */
import fs from 'node:fs';

const CANDIDATE_PATHS = [
  'c:\\Users\\user\\Desktop\\talaria1\\manager-e-indicator-eviction\\docs\\plan3\\worker-reports\\E-CONF05-INDICATOR-SELECTION-20260731.json',
];

/** Returns { pairs, provenance, raw } or throws. `pairs` is the [[type, params]] shape the harness takes. */
export function loadConf05Indicators() {
  let lastErr = null;
  for (const p of CANDIDATE_PATHS) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (raw.signature !== 'TALARIA_CONF05_INDICATOR_SELECTION_V1') {
        throw new Error(`unexpected signature ${raw.signature}`);
      }
      const sel = raw.selectedIndicators || [];
      if (sel.length !== 2) throw new Error(`expected 2 selected indicators, found ${sel.length}`);
      const pairs = sel
        .slice()
        .sort((a, b) => (a.slot || 0) - (b.slot || 0))
        .map((s) => [String(s.type), { ...(s.params || {}) }]);
      const roles = sel.map((s) => s.role);
      // The point of the selection is one of each family. If both slots came back the same role, the
      // selection has drifted and the pair would measure one recalculation shape twice.
      const distinctRoles = new Set(roles).size;
      return {
        pairs,
        provenance: {
          file: p,
          signature: raw.signature,
          config: raw.config,
          roles,
          distinctRoles,
          perChartIndicators: raw.applyTo?.perChartIndicators ?? null,
          totalIndicatorInstances: raw.applyTo?.totalIndicatorInstances ?? null,
          replaces: 'PO_TWO_INDICATORS (sma 20 + rsi 14), which are BOTH incremental-last-point family and therefore measured one recalculation shape twice',
          familyCoverage: distinctRoles === 2
            ? 'one incremental-last-point and one anchored family, as CONF-05 requires'
            : `DEGENERATE: both slots are ${roles[0]}, so only one recalculation shape is represented`,
        },
        raw,
      };
    } catch (err) { lastErr = err; }
  }
  throw new Error(`CONF-05 indicator selection unreadable: ${String(lastErr?.message || lastErr)}`);
}

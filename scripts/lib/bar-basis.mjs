/**
 * BAR-BASIS-01 — the one definition of the 1,024 MB bar, so two gates cannot disagree while both
 * being green.
 *
 * PO ruling, 2026-08-03 21:26+01:00:
 *   - the bar is on the TOTAL all-Chrome basis (OS private working set, every Chrome process);
 *   - every report against it carries THREE ROWS — authored, caused, fixed;
 *   - it binds at SETTLED POST-GC, not at first paint;
 *   - first paint has a separate, higher allowance, which is its own number and is not yet set.
 *
 * Reference: docs/plan3/C-BASIS-OF-THE-1024-BAR-20260803.md
 *
 * WHY THE THREE ROWS, AND WHY THE MIDDLE ONE EXISTS
 * `caused` is the row people will want to delete, and it is the one that matters most. The GPU process
 * is 246–306 MB and is NOT fixed overhead: it is the direct consequence of how many layers and canvas
 * backing stores we create. The combined-canvas fix dropped GPU by ~35 MB while renderer-private grew,
 * so on an authored-only metric that fix scores as a REGRESSION. A metric that can be improved by
 * relocating memory between processes is worse than one containing memory we cannot fix.
 *
 * WHY `fixed` IS NOT SUBTRACTED HERE
 * The ~170 MB fixed floor is measured under ONE harness configuration — headless, `--no-sandbox`,
 * fresh profile, no extensions, no other tabs. Three of its components are spare renderers holding no
 * page content, which is Chrome's process model reacting to how we launch it. Until that is verified
 * under a realistic profile it is reported, never deducted, and it carries `harnessConditional`.
 */

export const BAR_MB = 1024;

/** Where the bar binds. First paint is a different question with a different, unset number. */
export const BINDS_AT = 'settled-post-gc';

/**
 * Split a `readFootprint()` reading into the three rows.
 * @param {{footprintTotalMB:number|null, footprintByType:object, pageRendererMB:number, rendererProcesses:number}} fp
 */
export function threeRows(fp) {
  const total = fp?.footprintTotalMB;
  if (total == null || !(total > 0)) {
    return { state: 'FOOTPRINT_UNREADABLE', totalMB: null, authoredMB: null, causedMB: null, fixedMB: null,
      note: 'no footprint reading; this is an instrument failure, not a memory result' };
  }
  const byType = fp.footprintByType || {};
  const authored = fp.pageRendererMB ?? null;
  const caused = byType.gpu ?? null;
  const spareRenderers = (byType.renderer != null && authored != null)
    ? +(byType.renderer - authored).toFixed(1) : null;
  const fixed = (spareRenderers != null)
    ? +(spareRenderers + (byType.browser || 0) + (byType.other || 0)).toFixed(1) : null;

  const named = [authored, caused, fixed].every((v) => v != null)
    ? +(authored + caused + fixed).toFixed(1) : null;

  return {
    state: authored == null ? 'SPLIT_UNAVAILABLE' : 'SPLIT_MEASURED',
    totalMB: total,
    // What we allocate. The number we are accountable for improving.
    authoredMB: authored,
    // Ours by consequence, not by allocation: GPU memory follows our layer and canvas decisions.
    causedMB: caused,
    // Browser process, spare renderers with no page content, and utility processes.
    fixedMB: fixed,
    fixedBreakdown: { spareRenderersMB: spareRenderers, browserMB: byType.browser ?? null, otherMB: byType.other ?? null },
    // Stated on every row until the harness-independence check lands. See item 2 of the 21:26 ruling.
    harnessConditional: true,
    harnessNote: 'the fixed row is measured under headless Chrome with --no-sandbox, a fresh profile, '
      + 'no extensions and no other tabs; the spare-renderer count is Chrome\'s process model reacting '
      + 'to that launch. Report it, do not deduct it, until verified under a realistic profile.',
    rowsSumMB: named,
    unsplitMB: named != null ? +(total - named).toFixed(1) : null,
    basis: 'all-chrome-process-private',
  };
}

/**
 * Compare a reading against the bar, refusing to do so when the reading is not the kind the bar binds
 * on. An unsettled reading measured against a settled bar is the failure this replaces: the b120
 * "post-GC" figure of 1,159.7 MB was taken 3 seconds after collectGarbage, and my own pass-3 settle
 * work put the gap between a short reading and a settled floor at 108.2 MB.
 *
 * @param {object} fp footprint reading
 * @param {{settled:boolean, settleMs?:number, what?:string}} opts
 */
export function assessAgainstBar(fp, { settled = false, settleMs = null, what = 'this reading' } = {}) {
  const rows = threeRows(fp);
  if (rows.state === 'FOOTPRINT_UNREADABLE') {
    return { ...rows, barState: 'NO_READING', overBarMB: null, meetsBar: null,
      reason: 'no footprint, so no comparison; not a pass and not a breach' };
  }
  if (!settled) {
    return { ...rows, barState: 'BAR_NOT_APPLICABLE_UNSETTLED', overBarMB: null, meetsBar: null,
      barMB: BAR_MB, bindsAt: BINDS_AT,
      reason: `the bar binds at ${BINDS_AT}; ${what} is not a settled reading`
        + `${settleMs != null ? ` (settled ${settleMs} ms)` : ''}, so it is measured against the `
        + 'first-paint allowance instead — which is not yet set' };
  }
  const over = +(rows.totalMB - BAR_MB).toFixed(1);
  return { ...rows, barMB: BAR_MB, bindsAt: BINDS_AT, barState: over > 0 ? 'OVER_BAR' : 'WITHIN_BAR',
    overBarMB: over, meetsBar: over <= 0,
    reason: `${rows.totalMB} MB all-Chrome against a ${BAR_MB} MB bar: `
      + `${over > 0 ? `over by ${over}` : `within by ${Math.abs(over)}`} MB `
      + `(authored ${rows.authoredMB}, caused ${rows.causedMB}, fixed ${rows.fixedMB})` };
}

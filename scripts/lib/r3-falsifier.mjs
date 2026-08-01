/**
 * R3 falsifier — does the bar-driven memory model survive the night?
 *
 * PROVENANCE NOTE: the PO directive numbering R1-R4 is not in my tree. This implements the contract as
 * the Director stated it at 14:45 and should be corrected against the directive if it differs. The two
 * properties I am implementing to are explicit in that instruction:
 *
 *   1. The falsifier reads OLDEST OPEN POSITION AGE before declaring the model void, because MEM-1a's
 *      floor pins bars behind an open position BY DESIGN. "No plateau" with an old open position is a
 *      scenario artifact, not a model failure - the eviction is behaving exactly as specified and the
 *      scenario simply never let it run.
 *   2. A clean failure means ABORT THE NIGHT, KEEP THE HOUR: run on to ~2 h to capture the true curve,
 *      then stop. A refuted model is still worth two hours of shape; it is not worth ten.
 *
 * The model under test: with eviction active, resident bars plateau, and footprint growth flattens with
 * them. Refutation is resident bars climbing without bound while eviction is on AND nothing is pinning
 * them.
 */

/**
 * @param {object[]} samples  ordered, each {hours, residentBars, footprintTotalMB, oldestOpenPositionAgeBars, evictionActive}
 */
export function evaluateR3(samples, {
  minSamples = 12,
  minHours = 1.0,
  plateauTolerance = 0.15,   // late-window bar growth under 15% of early-window counts as a plateau
  pinAgeBars = 2000,         // an open position this old pins at least this many bars behind it
} = {}) {
  const rows = (samples || []).filter((s) => Number.isFinite(s?.hours) && Number.isFinite(s?.residentBars));
  if (rows.length < minSamples || rows[rows.length - 1].hours < minHours) {
    return {
      verdict: 'INSUFFICIENT',
      why: `${rows.length} samples over ${rows.length ? rows[rows.length - 1].hours.toFixed(2) : 0} h; need ${minSamples} and ${minHours} h before this question can be asked at all.`,
      actionable: false,
    };
  }

  const half = Math.floor(rows.length / 2);
  const early = rows.slice(0, half);
  const late = rows.slice(half);
  const rate = (seg) => {
    const dh = seg[seg.length - 1].hours - seg[0].hours;
    return dh > 0 ? (seg[seg.length - 1].residentBars - seg[0].residentBars) / dh : null;
  };
  const earlyRate = rate(early);
  const lateRate = rate(late);
  const ratio = (earlyRate && earlyRate > 0 && lateRate != null) ? +(lateRate / earlyRate).toFixed(3) : null;
  const plateaued = ratio != null && ratio <= plateauTolerance;

  const evictionActive = rows.some((r) => r.evictionActive === true);
  const ages = rows.map((r) => r.oldestOpenPositionAgeBars).filter((v) => Number.isFinite(v));
  const maxAge = ages.length ? Math.max(...ages) : null;
  const pinned = maxAge != null && maxAge >= pinAgeBars;

  if (!evictionActive) {
    return {
      verdict: 'NOT_APPLICABLE',
      why: 'Eviction was never active in this run, so a plateau was never predicted and its absence refutes nothing.',
      earlyBarsPerHour: earlyRate, lateBarsPerHour: lateRate, plateauRatio: ratio, actionable: false,
    };
  }

  if (plateaued) {
    return {
      verdict: 'MODEL_HELD',
      why: `Resident bars plateaued: late-window growth is ${(ratio * 100).toFixed(1)}% of early-window (${lateRate?.toFixed(0)} vs ${earlyRate?.toFixed(0)} bars/h). Eviction is doing what the model says it does.`,
      earlyBarsPerHour: earlyRate, lateBarsPerHour: lateRate, plateauRatio: ratio,
      oldestOpenPositionAgeBars: maxAge, actionable: false,
    };
  }

  // No plateau. Before calling the model void, ask whether the scenario ever permitted one.
  if (pinned) {
    return {
      verdict: 'SCENARIO_ARTIFACT',
      why: `No plateau (late growth ${ratio == null ? 'n/a' : `${(ratio * 100).toFixed(0)}%`} of early), BUT the oldest open position reached ${maxAge} bars of age and MEM-1a pins bars behind an open position BY DESIGN. The eviction floor was doing its job; this scenario never gave it a chance to plateau. NOT a model failure.`,
      earlyBarsPerHour: earlyRate, lateBarsPerHour: lateRate, plateauRatio: ratio,
      oldestOpenPositionAgeBars: maxAge,
      actionable: false,
      rerunAs: 'Re-run with positions closed promptly, or with the zero-trade arm, so no open position holds the floor down.',
    };
  }

  return {
    verdict: 'MODEL_VOID',
    why: `Resident bars did NOT plateau (late-window growth is ${ratio == null ? 'n/a' : `${(ratio * 100).toFixed(0)}%`} of early-window) while eviction was active, and no open position was old enough to pin them (oldest ${maxAge == null ? 'unknown' : `${maxAge} bars`}, pin threshold ${pinAgeBars}). This is a clean falsifier failure.`,
    earlyBarsPerHour: earlyRate, lateBarsPerHour: lateRate, plateauRatio: ratio,
    oldestOpenPositionAgeBars: maxAge,
    actionable: true,
    action: 'ABORT THE NIGHT, KEEP THE HOUR: continue to ~2 h to capture the true curve, then stop. A refuted model is worth two hours of shape and not ten.',
    keepHoursTarget: 2.0,
  };
}

/** Read open-position age from the live page. Three routes, because two accessors have already read null. */
export async function readOldestOpenPositionAge(page) {
  for (const f of page.frames()) {
    try {
      const r = await f.evaluate(() => {
        const om = window.orderManager || window.chart?.orderManager;
        if (!om) return null;
        const svc = om.orderService || om;
        const open = om.openPositions || svc.openPositions || om.positions || null;
        if (!Array.isArray(open)) return { route: 'none', openCount: null, oldestAgeBars: null };
        const idx = window.chart?.replayIndex ?? window.chart?.currentReplayIndex ?? null;
        let oldest = null;
        for (const p of open) {
          const entryIdx = p?.entryIndex ?? p?.entryBarIndex ?? p?.openIndex ?? null;
          if (Number.isFinite(entryIdx) && Number.isFinite(idx)) {
            const age = idx - entryIdx;
            if (oldest == null || age > oldest) oldest = age;
          }
        }
        return { route: 'openPositions', openCount: open.length, oldestAgeBars: oldest, replayIndex: idx };
      });
      if (r && r.openCount != null) return r;
    } catch { /* frame gone */ }
  }
  return { route: 'unreadable', openCount: null, oldestAgeBars: null };
}

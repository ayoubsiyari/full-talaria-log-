/**
 * FLOOR-CURVE — the grading half of the canonical floor re-take (checklist item 13).
 *
 * WHY A CURVE RATHER THAN A READING. Every floor this project has published was a single read taken
 * at whatever moment the instrument happened to reach. A's settle work showed why that is not a
 * measurement: the same boot reads 531.84 MB one second after collection and 420.70 MB twenty
 * seconds after it, and the spread falls from 21.4 to 2.49 at the same time. A number that moves by
 * 111 MB depending on when you look is not a floor, it is a sample of a decay curve.
 *
 * So the re-take reads the same session repeatedly at increasing settle and grades the SHAPE. A
 * floor is the asymptote of that curve, and if the curve has not flattened by the last read then
 * there is no floor to quote — only an upper bound, which this module says out loud rather than
 * rounding to a number.
 *
 * THE ARITHMETIC IS SEPARATED FROM THE HOST DELIBERATELY. Everything here is pure, so the grading
 * can be tested against known-defective curves without a browser. The failure this prevents is the
 * one SEAL-EVIDENCE-01 names: a grader that has never been shown a curve it must reject.
 */

export const FLOOR_CURVE_SIGNATURE = 'FLOOR-CURVE-V1';

/** Default: consecutive reads within this many MB of each other count as flat. */
export const DEFAULT_FLAT_BAND_MB = 3.0;

/** Default: a rise larger than this between reads means the session was not idle. */
export const DEFAULT_RISE_TOLERANCE_MB = 2.0;

const num = (v) => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Grade a settle curve.
 *
 * @param {Array<{settleSec:number, totalMB:number}>} reads in ascending settle order
 * @param {object} [opts]
 * @returns {{state:string, ok:boolean, floorMB:number|null, why:string, ...}}
 *
 * States:
 *   FLOOR_FOUND        the last two reads are within the flat band. The floor is the last read.
 *   STILL_FALLING      the curve had not flattened when we stopped. NOT a floor — an upper bound.
 *   NOT_IDLE           the curve rose beyond tolerance. Something was running; the session was not
 *                      at rest and no floor can be read from it at all.
 *   TOO_FEW_READS      fewer than two reads. Nothing to grade.
 *   UNREADABLE         a read carried no usable total.
 */
export function gradeSettleCurve(reads, {
  flatBandMB = DEFAULT_FLAT_BAND_MB,
  riseToleranceMB = DEFAULT_RISE_TOLERANCE_MB,
} = {}) {
  const clean = (Array.isArray(reads) ? reads : []).map((r) => ({
    settleSec: num(r?.settleSec),
    totalMB: num(r?.totalMB),
  }));

  if (clean.length < 2) {
    return {
      signature: FLOOR_CURVE_SIGNATURE,
      state: 'TOO_FEW_READS',
      ok: false,
      floorMB: null,
      why: `a settle curve needs at least two reads to have a shape; got ${clean.length}.`,
    };
  }
  if (clean.some((r) => r.totalMB == null || r.settleSec == null)) {
    return {
      signature: FLOOR_CURVE_SIGNATURE,
      state: 'UNREADABLE',
      ok: false,
      floorMB: null,
      why: 'at least one read carried no usable total or settle time, so the curve has a hole in it '
        + 'and its shape cannot be graded. A hole is not a flat section.',
    };
  }

  const deltas = [];
  for (let i = 1; i < clean.length; i++) {
    deltas.push({
      fromSec: clean[i - 1].settleSec,
      toSec: clean[i].settleSec,
      deltaMB: +(clean[i].totalMB - clean[i - 1].totalMB).toFixed(3),
    });
  }

  // A rise means allocation, and allocation means the session was not idle. This must be caught
  // before flatness, because a curve that falls, rises and falls back can end up "flat" between its
  // last two points while describing a session that never rested.
  const biggestRise = deltas.reduce((m, d) => (d.deltaMB > m.deltaMB ? d : m), deltas[0]);
  if (biggestRise.deltaMB > riseToleranceMB) {
    return {
      signature: FLOOR_CURVE_SIGNATURE,
      state: 'NOT_IDLE',
      ok: false,
      floorMB: null,
      deltas,
      biggestRiseMB: biggestRise.deltaMB,
      why: `total rose ${biggestRise.deltaMB} MB between the ${biggestRise.fromSec}s and ${biggestRise.toSec}s reads. `
        + 'Something allocated during the settle, so this session was not at rest and no floor can be '
        + 'read from it. Suspect a live panel, a background run on the box, or a timer the pause did not stop.',
    };
  }

  const last = deltas[deltas.length - 1];
  const flat = Math.abs(last.deltaMB) <= flatBandMB;
  const floorMB = clean[clean.length - 1].totalMB;
  const firstMB = clean[0].totalMB;

  if (!flat) {
    return {
      signature: FLOOR_CURVE_SIGNATURE,
      state: 'STILL_FALLING',
      ok: false,
      floorMB: null,
      upperBoundMB: floorMB,
      deltas,
      lastDeltaMB: last.deltaMB,
      totalDeclineMB: +(firstMB - floorMB).toFixed(3),
      why: `the curve was still moving ${last.deltaMB} MB between the last two reads `
        + `(${last.fromSec}s -> ${last.toSec}s), so it had not reached an asymptote when sampling stopped. `
        + `${floorMB} MB is an UPPER BOUND on the floor, not the floor. Quoting it as a floor would repeat `
        + 'the defect this re-take exists to retire. Extend the settle and re-read.',
    };
  }

  return {
    signature: FLOOR_CURVE_SIGNATURE,
    state: 'FLOOR_FOUND',
    ok: true,
    floorMB,
    settleToFloorSec: clean[clean.length - 1].settleSec,
    deltas,
    lastDeltaMB: last.deltaMB,
    totalDeclineMB: +(firstMB - floorMB).toFixed(3),
    declineFromFirstPct: firstMB > 0 ? +(((firstMB - floorMB) / firstMB) * 100).toFixed(2) : null,
    why: `flat to within ${flatBandMB} MB over the last interval; the floor is ${floorMB} MB at `
      + `${clean[clean.length - 1].settleSec}s of settle, having fallen ${+(firstMB - floorMB).toFixed(3)} MB from the first read.`,
  };
}

/**
 * The published figures this re-take exists to retire, with what each one actually measured.
 *
 * Recorded as data rather than prose so the reconciliation is computed against the new reading
 * instead of asserted next to it. Every entry names its CONDITIONS, because the whole confusion
 * came from two numbers being compared as if they described one quantity.
 */
export const PUBLISHED_FLOORS = [
  {
    id: '532.6',
    owner: 'E',
    totalMB: 532.6,
    gpuMB: 179.7,
    rendererMB: 263.0,
    conditions: 'four panels, boot, nothing played',
    settle: 'none — read ~1 s after collection',
    what: "E's advisor headline, quoted as the total-private floor.",
  },
  {
    id: '531.84',
    owner: 'A',
    totalMB: 531.84,
    gpuMB: 182.12,
    rendererMB: 258.76,
    conditions: 'four panels, boot, nothing played, n=3, spread 21.4',
    settle: 'none — the published method, ~1 s after collection',
    what: "A's reproduction of E's headline. Within 1 MB, which is what proves these are one measurement.",
  },
  {
    id: '420.70',
    owner: 'A',
    totalMB: 420.70,
    gpuMB: 99.88,
    rendererMB: 228.36,
    conditions: 'four panels, boot, nothing played, n=3, spread 2.49',
    settle: '20 s, then a second collection',
    what: 'The same boot after settling. 111 MB lower, 82 MB of it GPU.',
  },
  {
    id: '633.0',
    owner: 'C',
    totalMB: 633.0,
    gpuMB: 178.5,
    rendererMB: 349.6,
    conditions: 'four-panel session played to 1,018 MB, then three panels destroyed, then collected',
    settle: 'none — collected and read',
    what: "C's third census moment. NOT a boot floor: this is a post-play floor with a retained tile cache in it.",
  },
];

/**
 * Reconcile the new reading against the published figures.
 *
 * The point is not to pick a winner. It is to show, per figure, WHY it differs — and the two axes
 * that explain all of it are settle and session history. A figure that differs on both is not a
 * rival estimate of the same floor and should never have been compared to one.
 */
export function reconcileFloors({ bootFloorMB = null, postPlayFloorMB = null } = {}) {
  const boot = num(bootFloorMB);
  const post = num(postPlayFloorMB);

  const rows = PUBLISHED_FLOORS.map((p) => {
    const isBoot = p.conditions.startsWith('four panels, boot');
    const comparable = isBoot ? boot : post;
    const basis = isBoot ? 'boot floor' : 'post-play floor';
    const settled = !p.settle.startsWith('none');
    return {
      ...p,
      comparedAgainst: basis,
      newFloorMB: comparable,
      deltaMB: comparable == null ? null : +(p.totalMB - comparable).toFixed(3),
      settled,
      // Named so a reader does not have to infer which axis explains the gap.
      explainedBy: [
        settled ? null : 'no settle — includes memory freed but not yet returned to the OS',
        isBoot ? null : 'post-play session — includes retained play state, not comparable to a boot floor',
      ].filter(Boolean),
      retired: true,
    };
  });

  return {
    signature: FLOOR_CURVE_SIGNATURE,
    bootFloorMB: boot,
    postPlayFloorMB: post,
    rows,
    /**
     * The sentence the seal should carry. Assembled here so the two floors cannot be collapsed into
     * one number on the way to a report.
     */
    verdict: (boot == null || post == null)
      ? 'INCOMPLETE — a canonical floor needs BOTH the boot floor and the post-play floor. One of them is missing, '
        + 'and quoting the other as "the floor" is the exact ambiguity that produced 633 versus 532.6.'
      : `There are TWO canonical floors and conflating them is what produced 633 versus 532.6. `
        + `Boot floor ${boot} MB (four panels, nothing played). Post-play floor ${post} MB (after a play window). `
        + `Both settled and force-collected. 532.6 and 531.84 were the unsettled boot floor; 420.70 was the boot `
        + `floor settled 20 s; 633.0 was an unsettled POST-PLAY floor and was never comparable to any of them.`,
  };
}

/**
 * FIRST-PAINT-ALLOWANCE-V1 — the analysis behind the allowance, separated from the run so the method
 * can be tested without the box.
 *
 * Approved by the Director 21:41+01:00, including the falsifier. The rule that makes it an allowance
 * rather than a ratification:
 *
 *   allowance = settled bar + SUM(attributed, structurally unavoidable construction transients)
 *
 *   UNATTRIBUTED TRANSIENT DOES NOT ENTER THE ALLOWANCE. It is fixed, or waived by name and by a
 *   person. The allowance covers construction cost we can explain, not whatever boot happens to cost.
 *
 * Three boots, on the back of the floor re-take rather than in a slot of their own:
 *   V1  4 panels, standard timeframes   — the transient itself
 *   V2  1 panel,  standard timeframes   — isolates the per-panel raster/layer term
 *   V3  4 panels, coarse timeframes     — fewer resident bars; isolates the dataset-decode term
 *
 * Resident bars are OBSERVED per variant, not set: the count follows the timeframe and window. The
 * model does not need them set, only measured and varied.
 *
 * MODEL
 *   transient = flat + perPanel*panels + perBarPanel*(bars*panels)
 * solved exactly from the three variants. `flat` is bundle parse and compile, which should not move
 * with either dimension.
 */

/** Falsifier 1: below this, the transient is not construction cost and there is no case for any allowance. */
export const SCALING_MIN_FRACTION = 0.30;
/** Falsifier 2: the three named components must explain at least this much of the measured transient. */
export const ATTRIBUTION_MIN_FRACTION = 0.70;

const r1 = (v) => (v == null || !Number.isFinite(v) ? null : +v.toFixed(1));
const r3 = (v) => (v == null || !Number.isFinite(v) ? null : +v.toFixed(4));

/**
 * @param {Array<{id:string, panels:number, residentBars:number, transientMB:number}>} variants
 * @param {{settledBarMB:number}} opts  the bar the allowance sits on top of (1,024 MB)
 */
export function deriveAllowance(variants, { settledBarMB = 1024 } = {}) {
  const v = (variants || []).filter((x) => x && Number.isFinite(x.transientMB));
  if (v.length < 3) {
    return { state: 'INSUFFICIENT_VARIANTS', allowanceMB: null, variants: v.length,
      why: `${v.length} usable variant(s); the model has three terms and cannot be solved` };
  }
  const [a, b, c] = v;

  // Solve the 3x3 exactly. Rows: [1, panels, bars*panels] · [flat, perPanel, perBarPanel] = transient
  const rows = [a, b, c].map((x) => [1, x.panels, x.residentBars * x.panels]);
  const rhs = [a, b, c].map((x) => x.transientMB);
  const sol = solve3(rows, rhs);
  if (!sol) {
    return { state: 'DEGENERATE_DESIGN', allowanceMB: null,
      why: 'the three variants are not independent — they do not separate panels from bars, so the '
        + 'terms cannot be attributed and the design must change before the allowance can be derived' };
  }
  const [flat, perPanel, perBarPanel] = sol;

  // Attribution on the reference variant (the one we actually ship: most panels).
  const ref = [a, b, c].reduce((m, x) => (x.panels > m.panels ? x : m), a);
  const parseMB = flat;
  const rasterMB = perPanel * ref.panels;
  const decodeMB = perBarPanel * ref.residentBars * ref.panels;
  const namedMB = parseMB + rasterMB + decodeMB;
  const attributedFraction = ref.transientMB > 0 ? namedMB / ref.transientMB : null;

  // --- Falsifier 1: does the transient scale at all? ---
  const scalingMB = rasterMB + decodeMB;
  const scalingFraction = ref.transientMB > 0 ? scalingMB / ref.transientMB : null;
  const scales = scalingFraction != null && scalingFraction >= SCALING_MIN_FRACTION;

  if (!scales) {
    return {
      state: 'FALSIFIED_NOT_CONSTRUCTION_COST',
      allowanceMB: null,
      settledBarMB,
      terms: { flatMB: r1(flat), perPanelMB: r1(perPanel), perBarPanelKB: r3(perBarPanel * 1024) },
      scalingFraction: r3(scalingFraction),
      why: `only ${((scalingFraction ?? 0) * 100).toFixed(1)}% of the transient moves with panels or `
        + `bars, under the ${SCALING_MIN_FRACTION * 100}% floor. The transient is therefore NOT `
        + 'construction cost: it is a fixed allocation that belongs in the settled floor, or a leak. '
        + 'There is no case for a first-paint allowance above the bar, and this is a defect to fix '
        + 'rather than a budget to grant.',
    };
  }

  // --- Falsifier 2: do the named components explain enough of it? ---
  const unattributedMB = ref.transientMB - namedMB;
  if (attributedFraction == null || attributedFraction < ATTRIBUTION_MIN_FRACTION) {
    return {
      state: 'FALSIFIED_ATTRIBUTION_SHORTFALL',
      allowanceMB: null,
      settledBarMB,
      attributedFraction: r3(attributedFraction),
      unattributedMB: r1(unattributedMB),
      why: `the three named components explain ${((attributedFraction ?? 0) * 100).toFixed(1)}% of the `
        + `transient, under the ${ATTRIBUTION_MIN_FRACTION * 100}% floor, leaving ${r1(unattributedMB)} MB `
        + 'unexplained. Reported as a shortfall and a finding. The allowance is NOT widened to cover it.',
    };
  }

  // Only attributed transient enters the allowance. This is the anti-ratification rule.
  const allowanceMB = settledBarMB + namedMB;
  return {
    state: 'DERIVED',
    settledBarMB,
    allowanceMB: r1(allowanceMB),
    headroomOverBarMB: r1(namedMB),
    attributed: { bundleParseMB: r1(parseMB), initialRasterMB: r1(rasterMB), datasetDecodeMB: r1(decodeMB) },
    terms: { flatMB: r1(flat), perPanelMB: r1(perPanel), perBarPanelKB: r3(perBarPanel * 1024) },
    referenceVariant: { id: ref.id, panels: ref.panels, residentBars: ref.residentBars, transientMB: r1(ref.transientMB) },
    attributedFraction: r3(attributedFraction),
    // Excluded on purpose. It is the number that must be fixed or waived by name.
    excludedUnattributedMB: r1(unattributedMB),
    scalingFraction: r3(scalingFraction),
    why: `${r1(namedMB)} MB of attributed construction transient on a ${settledBarMB} MB settled bar `
      + `= ${r1(allowanceMB)} MB. ${r1(unattributedMB)} MB measured but unattributed is EXCLUDED and `
      + 'must be fixed or waived by name.',
  };
}

/** Gaussian elimination with partial pivoting on a 3x3. Returns null if singular. */
function solve3(m, rhs) {
  const A = m.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < 3; col += 1) {
    let piv = col;
    for (let r = col + 1; r < 3; r += 1) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = 0; r < 3; r += 1) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let k = col; k < 4; k += 1) A[r][k] -= f * A[col][k];
    }
  }
  const out = [A[0][3] / A[0][0], A[1][3] / A[1][1], A[2][3] / A[2][2]];
  return out.every((x) => Number.isFinite(x)) ? out : null;
}

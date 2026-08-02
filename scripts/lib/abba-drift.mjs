/**
 * DRIFT-ABBA-V1 — checklist item 3. Paired ABBA arms, full vector every reading.
 *
 * WHY AN EQUAL-DURATION CONTROL ARM IS NOT ENOUGH. Running arm B for the same wall time as arm A
 * only removes drift if drift is linear in time. It is not: a session warms caches, fills a tile
 * pool, reaches a plateau, and can decommit in steps. Two arms run back to back then differ by
 * (effect + whatever the curve did between them), and nothing in the artifact separates those.
 *
 * WHAT ABBA BUYS, STATED EXACTLY.
 *   - One ABBA block (A B B A) cancels drift that is LINEAR in slot index, exactly. A occupies slots
 *     {0,3} and B {1,2}; both have mean slot 1.5, so any a+d*t component subtracts out.
 *   - One block does NOT cancel curvature: sum of t^2 is 9 for A and 5 for B.
 *   - ABBA followed by its mirror BAAB (slots 0..7) balances BOTH: A={0,3,5,6}, B={1,2,4,7}, and
 *     both have sum(t)=14 and sum(t^2)=70. So >=2 blocks cancels linear AND quadratic drift.
 * The sequence generator alternates ABBA/BAAB for exactly this reason, and the estimator reports the
 * balance it actually achieved rather than assuming the run completed as planned.
 *
 * FULL VECTOR: every reading carries the whole arena column vector plus the TOTAL-01 total. The
 * estimator differences every column, so a fix that moves memory between arenas (as the canvas fixes
 * do — GPU down, compositor up) cannot hide inside a single-metric summary.
 */

/**
 * Counterbalanced arm order. blocks=1 -> ABBA; blocks=2 -> ABBA BAAB; alternating thereafter.
 * @returns {('A'|'B')[]}
 */
export function abbaSequence(blocks = 2) {
  const n = Math.max(1, Math.floor(blocks));
  const out = [];
  for (let i = 0; i < n; i++) {
    const mirrored = i % 2 === 1;
    const block = mirrored ? ['B', 'A', 'A', 'B'] : ['A', 'B', 'B', 'A'];
    out.push(...block);
  }
  return out;
}

/**
 * How well a realised arm order balances drift. Reported from the arms ACTUALLY read, so a run that
 * lost a slot is graded on what it has rather than on what it intended.
 */
export function driftBalance(arms) {
  const idxA = [];
  const idxB = [];
  arms.forEach((arm, i) => (arm === 'A' ? idxA : idxB).push(i));
  const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
  const meanSlotA = idxA.length ? sum(idxA, (t) => t) / idxA.length : null;
  const meanSlotB = idxB.length ? sum(idxB, (t) => t) / idxB.length : null;
  const meanSqA = idxA.length ? sum(idxA, (t) => t * t) / idxA.length : null;
  const meanSqB = idxB.length ? sum(idxB, (t) => t * t) / idxB.length : null;
  const linearImbalance = (meanSlotA != null && meanSlotB != null) ? +(meanSlotA - meanSlotB).toFixed(6) : null;
  const quadraticImbalance = (meanSqA != null && meanSqB != null) ? +(meanSqA - meanSqB).toFixed(6) : null;
  return {
    countA: idxA.length,
    countB: idxB.length,
    meanSlotA,
    meanSlotB,
    linearImbalance,
    quadraticImbalance,
    cancelsLinearDrift: linearImbalance === 0,
    cancelsQuadraticDrift: quadraticImbalance === 0,
    note: quadraticImbalance === 0
      ? 'arm order balances both linear and quadratic drift in slot index.'
      : (linearImbalance === 0
        ? 'arm order balances LINEAR drift only; curvature between slots is not removed. Run a second (mirrored) block to balance it.'
        : 'arm order does NOT balance linear drift; the arm difference still contains session drift.'),
  };
}

/** Numeric columns common to all readings — the "full vector". */
export function vectorKeys(readings) {
  const counts = new Map();
  for (const r of readings) {
    for (const [k, v] of Object.entries(r.vector || {})) {
      if (!Number.isFinite(Number(v))) continue;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, c]) => c === readings.length).map(([k]) => k).sort();
}

/**
 * ABBA effect estimate, per column.
 *
 * @param {{arm:'A'|'B', vector:Record<string,number>}[]} readings in slot order
 * @param {object} [opts]
 * @param {string} [opts.totalKey] TOTAL-01 column; its estimate is always emitted, and single-column
 *   estimates are marked unquotable when it is missing.
 */
export function estimateAbbaEffect(readings, { totalKey = 'totalPrivateMB' } = {}) {
  const arms = readings.map((r) => r.arm);
  const balance = driftBalance(arms);

  if (balance.countA < 2 || balance.countB < 2) {
    return {
      verdict: 'VOID',
      why: `ABBA needs at least two readings per arm to cancel drift; got A=${balance.countA}, B=${balance.countB}. `
        + 'A single A/B pair cannot distinguish the effect from the session curve, which is the entire reason this protocol exists.',
      balance,
    };
  }

  const keys = vectorKeys(readings);
  const mean = (arm, key) => {
    const xs = readings.filter((r) => r.arm === arm).map((r) => Number(r.vector[key]));
    return xs.reduce((s, x) => s + x, 0) / xs.length;
  };
  const spread = (arm, key) => {
    const xs = readings.filter((r) => r.arm === arm).map((r) => Number(r.vector[key]));
    return +(Math.max(...xs) - Math.min(...xs)).toFixed(3);
  };

  const columns = keys.map((key) => {
    const a = mean('A', key);
    const b = mean('B', key);
    const effect = +(a - b).toFixed(3);
    const withinArmSpread = Math.max(spread('A', key), spread('B', key));
    return {
      column: key,
      meanA: +a.toFixed(3),
      meanB: +b.toFixed(3),
      // A is the treated arm (kill switches ON / fixes active) by convention; B is the control.
      effectAMinusB: effect,
      withinArmSpread,
      // An effect smaller than the noise inside a single arm is not an effect.
      exceedsWithinArmSpread: Math.abs(effect) > withinArmSpread,
      interpretable: Math.abs(effect) > withinArmSpread
        ? 'effect exceeds within-arm spread'
        : 'effect is within the noise of a single arm — do not quote as a difference',
    };
  });

  const totalCol = columns.find((c) => c.column === totalKey) || null;

  return {
    verdict: 'MEASURED',
    protocol: 'DRIFT-ABBA-V1',
    balance,
    slots: readings.length,
    totalKey,
    total: totalCol,
    columns,
    // TOTAL-01 again, at the estimator level: a per-arena effect without the total effect beside it
    // is not quotable, so the estimator says so rather than leaving it to the report author.
    quotable: !!totalCol,
    quotableWhy: totalCol
      ? null
      : `TOTAL-01: no ${totalKey} column present in every reading, so per-arena effects are not quotable from this set.`,
    driftCaveat: balance.cancelsQuadraticDrift
      ? null
      : 'Arm order does not balance curvature; a non-linear session drift can still sit inside these effects.',
  };
}

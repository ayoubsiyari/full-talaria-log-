/**
 * ARENA-COLUMNS + TOTAL-01 + COV-01 remainder — checklist items 1, 4, and the input to 7.
 *
 * Item 1: per-arena columns in the 3-min sampler, in the SOAK ROW FORMAT. The soak row is a flat
 * object of scalar columns (`footprintTotalMB`, `residentBars`, `hours`, ...) appended per sample,
 * so arenas must arrive as flat scalar columns beside them — not as a nested blob a reader has to
 * dig through. One row per sample, every column present every row.
 *
 * Item 4 (TOTAL-01): NO SINGLE-ARENA DELTA IS QUOTABLE WITHOUT ITS TOTAL ROW. This is enforced in
 * code, not by convention: `quoteArenaDelta()` refuses to format a delta unless the total row for
 * both endpoints is present and finite. The failure mode it exists to prevent is real and mine —
 * "blink_gc grew 212 MB" travelled for a day without the total beside it, and the total is what
 * would have shown it was a growth on a heavy soak rather than a level anyone could compare to.
 *
 * COV-01 input: every row carries `arenaNamedTotalMB`, `arenaUnattributedMB` and `arenaCoveragePct`.
 * The remainder is ITS OWN LABELLED ROW (`arenaUnattributedMB`), never silently folded into an arena
 * and never dropped. Calibration to >=95% is item 7 and needs E's parsed detail dumps; this module
 * makes the shortfall visible on every reading in the meantime rather than at calibration time.
 */

/**
 * Canonical arena column order. Fixed so every row has the same columns in the same order even when
 * a dump omits an arena — a missing arena must read as an explicit 0/null column, not as an absent
 * key that quietly changes the row's shape between samples.
 */
export const ARENA_KEYS = [
  'v8',
  'partition_alloc',
  'malloc',
  'blink_gc',
  'blink_objects',
  'cc',
  'gpu',
  'shared_memory',
  'canvas',
  'skia',
  'discardable',
  'web_cache',
  'sqlite',
  'site_storage',
];

/** `partition_alloc` -> `arenaPartitionAllocMB`. Stable, so column names never drift between runs. */
export function arenaColumnName(key) {
  const camel = String(key).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return `arena${camel.charAt(0).toUpperCase()}${camel.slice(1)}MB`;
}

/**
 * Strict numeric read. `Number(null)` is 0 and `Number('')` is 0, so a plain isFinite check treats a
 * MISSING arena and a missing total as legitimate zeroes — which would let TOTAL-01 pass on a row that
 * has no total at all. Absent must stay absent.
 */
const num = (v) => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Flatten one process's allocator roots into soak-row columns.
 *
 * @param {Record<string, number>|null} rootsMB memory-infra roots in MB (E's summariseAllocators output)
 * @param {object} opts
 * @param {number|null} opts.totalPrivateMB TOTAL-01: the process/browser total this row is measured against
 * @param {string} opts.totalBasis what the total means, recorded so two runs cannot silently compare
 *   a renderer-only total against an all-process total
 * @param {string[]} opts.keys arena keys to emit (defaults to ARENA_KEYS)
 */
export function arenaColumns(rootsMB, {
  totalPrivateMB = null,
  totalBasis = 'all-chrome-process-private',
  keys = ARENA_KEYS,
} = {}) {
  const row = {};
  let named = 0;
  let seen = 0;
  for (const key of keys) {
    const v = num(rootsMB?.[key]);
    row[arenaColumnName(key)] = v;
    if (v != null) { named += v; seen += 1; }
  }

  // Arenas present in the dump but not in our canonical list. Silently dropping these is how a
  // coverage figure becomes a lie, so they are summed and named rather than ignored.
  const extraNames = [];
  let extra = 0;
  for (const [k, v] of Object.entries(rootsMB || {})) {
    if (keys.includes(k)) continue;
    if (k.includes('/')) continue; // children are inside their root already
    const n = num(v);
    if (n == null) continue;
    extra += n;
    extraNames.push(k);
  }

  const namedTotal = seen > 0 ? +(named + extra).toFixed(3) : null;
  const total = num(totalPrivateMB);
  const unattributed = (namedTotal != null && total != null) ? +(total - namedTotal).toFixed(3) : null;
  const coverage = (namedTotal != null && total > 0) ? +((namedTotal / total) * 100).toFixed(2) : null;

  return {
    ...row,
    // Arenas outside the canonical column set, kept as one labelled column rather than dropped.
    arenaOtherNamedMB: seen > 0 ? +extra.toFixed(3) : null,
    arenaOtherNames: extraNames.length ? extraNames.join('|') : null,
    // TOTAL-01 row — travels with every arena column, on every sample, by construction.
    arenaNamedTotalMB: namedTotal,
    totalPrivateMB: total,
    totalBasis,
    // COV-01 remainder as its own labelled row.
    arenaUnattributedMB: unattributed,
    arenaCoveragePct: coverage,
    arenaCoverageMeets95: coverage == null ? null : coverage >= 95,
    arenaColumnsVersion: 'ARENA-COLUMNS-V1',
  };
}

/** True when a row carries a usable TOTAL-01 total. Absent/null is NOT a total. */
export function hasTotalRow(row) {
  return !!row && num(row.totalPrivateMB) != null;
}

/**
 * TOTAL-01 ENFORCEMENT.
 *
 * Format a single-arena delta between two rows. Refuses — returns a REFUSED verdict rather than a
 * number — when either endpoint lacks its total row, or when the two endpoints were measured against
 * different total bases. A caller that wants the number must supply the total, which is the whole point.
 */
export function quoteArenaDelta(beforeRow, afterRow, arenaKey) {
  const col = arenaColumnName(arenaKey);
  const a = num(beforeRow?.[col]);
  const b = num(afterRow?.[col]);

  if (!hasTotalRow(beforeRow) || !hasTotalRow(afterRow)) {
    return {
      verdict: 'REFUSED_NO_TOTAL_ROW',
      quotable: false,
      arena: arenaKey,
      why: `TOTAL-01: a single-arena delta for ${arenaKey} is not quotable without the total row at BOTH endpoints. `
        + `before total=${beforeRow?.totalPrivateMB ?? 'absent'}, after total=${afterRow?.totalPrivateMB ?? 'absent'}.`,
    };
  }
  if (beforeRow.totalBasis !== afterRow.totalBasis) {
    return {
      verdict: 'REFUSED_TOTAL_BASIS_MISMATCH',
      quotable: false,
      arena: arenaKey,
      why: `TOTAL-01: totals measured on different bases (${beforeRow.totalBasis} vs ${afterRow.totalBasis}); `
        + 'the arena delta would be read against a total it does not belong to.',
    };
  }
  if (a == null || b == null) {
    return {
      verdict: 'REFUSED_ARENA_ABSENT',
      quotable: false,
      arena: arenaKey,
      why: `${arenaKey} is absent from ${a == null ? 'the before' : 'the after'} reading, so its delta is undefined rather than zero.`,
    };
  }

  const deltaMB = +(b - a).toFixed(3);
  const totalDeltaMB = +(afterRow.totalPrivateMB - beforeRow.totalPrivateMB).toFixed(3);
  const shareOfTotalDeltaPct = Math.abs(totalDeltaMB) > 0.001
    ? +((deltaMB / totalDeltaMB) * 100).toFixed(1)
    : null;

  return {
    verdict: 'QUOTABLE',
    quotable: true,
    arena: arenaKey,
    beforeMB: a,
    afterMB: b,
    deltaMB,
    // The total row that must be quoted alongside it.
    totalBeforeMB: beforeRow.totalPrivateMB,
    totalAfterMB: afterRow.totalPrivateMB,
    totalDeltaMB,
    totalBasis: beforeRow.totalBasis,
    shareOfTotalDeltaPct,
    coverageBeforePct: beforeRow.arenaCoveragePct ?? null,
    coverageAfterPct: afterRow.arenaCoveragePct ?? null,
    /** The sentence a report must carry. Assembled here so it cannot be quoted without the total. */
    quotableSentence: `${arenaKey} ${a} -> ${b} MB (${deltaMB >= 0 ? '+' : ''}${deltaMB}) `
      + `against total ${beforeRow.totalPrivateMB} -> ${afterRow.totalPrivateMB} MB `
      + `(${totalDeltaMB >= 0 ? '+' : ''}${totalDeltaMB}, basis ${beforeRow.totalBasis})`
      + (shareOfTotalDeltaPct != null ? `, ${shareOfTotalDeltaPct}% of the total move` : ''),
  };
}

/** Rank arena growth between two rows, every row TOTAL-01 checked. */
export function rankRowGrowth(beforeRow, afterRow, { keys = ARENA_KEYS, thresholdMB = 0.5 } = {}) {
  const quotes = keys.map((k) => quoteArenaDelta(beforeRow, afterRow, k));
  const usable = quotes.filter((q) => q.quotable);
  const refused = quotes.filter((q) => !q.quotable);
  usable.sort((x, y) => y.deltaMB - x.deltaMB);
  return {
    growers: usable.filter((q) => q.deltaMB > thresholdMB),
    flat: usable.filter((q) => Math.abs(q.deltaMB) <= thresholdMB),
    shrinkers: usable.filter((q) => q.deltaMB < -thresholdMB),
    refused,
    totalDeltaMB: usable.length ? usable[0].totalDeltaMB : null,
    totalBasis: usable.length ? usable[0].totalBasis : null,
    unattributedBeforeMB: beforeRow?.arenaUnattributedMB ?? null,
    unattributedAfterMB: afterRow?.arenaUnattributedMB ?? null,
    coverageNote: 'COV-01: the unattributed remainder is its own row and is NOT distributed across arenas.',
  };
}

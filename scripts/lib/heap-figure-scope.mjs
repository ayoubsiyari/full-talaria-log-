/**
 * HEAP-FIGURE-SCOPE-V1 — a heap figure in a release-facing document must name the
 * instrument that produced it.
 *
 * Why this exists: every heap number in plan3 came from `performance.memory
 * .usedJSHeapSize` read in the TOP frame. That call is blind to worker heaps (the
 * heap-cycle browser already says so in a comment) and, per the PO's Documents
 * counter, does not account for retained panel iframe documents — which is exactly
 * where the multichart leak lives. We quoted 131–192 MB for days against a real
 * figure reported as ~789 MB. Nobody lied; the figures never carried their scope,
 * so a main-frame reading was read as a footprint.
 *
 * The rule: in a gated document, a megabyte figure that sits near heap/memory
 * language must have a scope token on the same line. Scope vocabulary is closed, so
 * "heap" alone cannot pay for itself.
 *
 * Deliberately NOT gated: journals and dated evidence records. Those are the
 * historical account of what we believed when, and rewriting them to satisfy a lint
 * would destroy the audit trail. Corrections are appended there instead.
 */

export const HEAP_FIGURE_SCOPE_V1 = 'TALARIA_HEAP_FIGURE_SCOPE_V1';
export const HEAP_FIGURE_SCOPE_GATE_NAME = 'HEAP-FIGURE-SCOPE-V1';

/**
 * Closed vocabulary. Each token states what the number counts, so a reader can tell
 * a JS-heap figure from a process footprint without asking the author.
 */
export const HEAP_SCOPE_TOKENS = Object.freeze([
  'main-frame JS heap',
  'top-frame JS heap',
  'per-realm JS heap',
  'cross-realm JS heap',
  // Added 2026-07-30 after C's W86. `performance.memory` is per-ISOLATE, not per-frame:
  // panels sharing the host renderer's isolate are included in a top-frame read, which
  // C proved with panel-realm ballast moving the host reading by +18 MB. "main-frame JS
  // heap" was therefore the wrong name for what we had been measuring all week, and a
  // vocabulary that only offered the wrong name pushed writers towards it.
  'JS heap in the host isolate',
  'JS heap, host isolate',
  'host-isolate JS heap',
  'renderer-process footprint',
  'process footprint',
  // Added 2026-07-30 11:47 for the image asset census. The 62 MB the PO found sits in
  // Brave's "Image cache" column, which is decoded bitmap storage — not JS heap and not
  // process footprint. Without a name for it, the only vocabulary available to a writer
  // was a heap token, which is how a decoded-bitmap number would have entered a release
  // note as a memory-leak figure.
  'decoded image bytes',
  'image cache',
  'detached-node count',
  'usedJSHeapSize',
  'measureUserAgentSpecificMemory',
]);

/** Documents whose numbers can reach the Director, the PO or a customer. */
export const HEAP_FIGURE_GATED_DOCS = Object.freeze([
  'docs/plan3/PLAN-CANARY-24H-20260729-2230.md',
  'docs/plan3/GATE-NAME-RESERVATIONS.md',
  // The one document that reaches people outside the team. It carried a ~50 MB
  // per-cycle figure with no instrument named, and told testers to disregard
  // footprint readings as an "over-read" — which would have suppressed the
  // observation that started this correction.
  'docs/plan3/evidence/B-M4/release/CANARY-DISCLOSURE-DRAFT-20260729.md',
  'docs/plan3/evidence/B-M4/release/PO-HEAP-INSTRUMENT-CORRECTION-20260730.md',
  // Quotes three different instruments (decoded image bytes, image cache, disk bytes) in
  // the same tables, which is precisely the mix this gate exists to keep honest.
  'docs/plan3/evidence/B-M4/release/IMAGE-ASSET-CENSUS-20260730-1147.md',
]);

/** Heap/memory context words that make a megabyte figure a *heap* figure. */
const HEAP_CONTEXT = /(heap|memory|footprint|rss)/i;

/** A megabyte or gigabyte figure. Cycle-relative or absolute, both count. */
const SIZE_FIGURE = /\b\d+(?:[.,]\d+)?\s*(?:MB|MiB|GB|GiB)\b/i;

/**
 * Lines that mention a size but cannot mislead: identifier definitions, thresholds
 * named after their own constant, and code fences.
 */
const EXEMPT_LINE = [
  /^\s*(?:\/\/|\*|#)/,           // comment lines inside fenced samples
  /_MB\b/,                        // HEAP_CYCLE_PO_FLOOR_MB — the name carries the unit
  /^\s*\|?\s*`[^`]*`\s*\|/,      // table rows whose first cell is pure code
];

/**
 * @param {string} line
 * @returns {boolean} whether this line is claimed by the rule
 */
export function lineNeedsScope(line) {
  if (typeof line !== 'string' || line.length === 0) return false;
  if (!SIZE_FIGURE.test(line)) return false;
  if (!HEAP_CONTEXT.test(line)) return false;
  return !EXEMPT_LINE.some((pattern) => pattern.test(line));
}

/**
 * @param {string} line
 * @returns {string|null} the scope token found, or null
 */
export function scopeTokenOf(line) {
  const haystack = String(line).toLowerCase();
  for (const token of HEAP_SCOPE_TOKENS) {
    if (haystack.includes(token.toLowerCase())) return token;
  }
  return null;
}

/**
 * Audit one document body.
 * @param {{ path: string, source: string }} doc
 */
export function auditDocument({ path, source }) {
  const lines = String(source ?? '').split(/\r?\n/);
  const offenders = [];
  const labelled = [];
  let inFence = false;
  lines.forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return;
    }
    // Inside a fenced block the text is a command or a log, not a claim.
    if (inFence) return;
    if (!lineNeedsScope(line)) return;
    const token = scopeTokenOf(line);
    const record = { line: index + 1, text: line.trim().slice(0, 200), scope: token };
    if (token) labelled.push(record);
    else offenders.push(record);
  });
  return { path, offenders, labelled, figureLines: offenders.length + labelled.length };
}

/**
 * @param {{ readFile: (relativePath: string) => string, docs?: readonly string[] }} deps
 */
export function runHeapFigureScopeCells({ readFile, docs = HEAP_FIGURE_GATED_DOCS }) {
  const cells = [];
  const audits = [];
  let unreadable = [];

  for (const relativePath of docs) {
    let source;
    try {
      source = readFile(relativePath);
    } catch (error) {
      unreadable.push({ path: relativePath, reason: String(error?.message ?? error) });
      continue;
    }
    audits.push(auditDocument({ path: relativePath, source }));
  }

  const allOffenders = audits.flatMap((audit) =>
    audit.offenders.map((o) => ({ path: audit.path, ...o })));

  cells.push({
    cell: 'HEAP-FIGURE-SCOPE-LABELLED',
    coverage: 'soundness',
    pass: allOffenders.length === 0 && unreadable.length === 0,
    detail: allOffenders.length === 0
      ? `every heap figure in ${audits.length} gated document(s) names its instrument scope`
      : `${allOffenders.length} heap figure(s) carry no instrument scope`,
    offenders: allOffenders,
    unreadable,
  });

  // Non-vacuity: a gate that finds nothing to check proves nothing. At least one
  // correctly-labelled figure must exist, or the rule is not actually engaged.
  const labelledCount = audits.reduce((sum, audit) => sum + audit.labelled.length, 0);
  cells.push({
    cell: 'HEAP-FIGURE-SCOPE-NON-VACUOUS',
    coverage: 'soundness',
    pass: labelledCount > 0,
    detail: `${labelledCount} labelled heap figure(s) seen — the rule is engaged`,
    labelledCount,
  });

  return {
    signature: HEAP_FIGURE_SCOPE_V1,
    gate: HEAP_FIGURE_SCOPE_GATE_NAME,
    cells,
    allPass: cells.every((c) => c.pass === true),
    audits,
  };
}

/**
 * KNOWN-WEAKNESS-01 — a caveat nothing is required to read is a comment.
 *
 * Ruled 2026-08-03 20:56+01:00, after the same failure twice in one day:
 *
 *   1. COV-01 coverage has been on every arena row since ARENA-COLUMNS-V1 and nobody read it until it
 *      became a gate.
 *   2. The fact that a renderer's allocator roots cover 99.9% of that renderer's private memory — the
 *      single measurement that explains the whole 59.84% coverage shortfall — sat in my own W90 slim
 *      artifact for weeks, in a field literally named `knownWeakness`.
 *
 * Neither was hidden. Both were written down by the person who then failed to act on them. Writing a
 * caveat is therefore not evidence that the caveat was considered, and a process that treats it as
 * evidence will keep producing headlines that its own footnotes contradict.
 *
 * So: a rung that carries a `knownWeakness` cannot produce a published headline until that weakness
 * has been ADDRESSED or DISMISSED **in writing, naming the weakness**. Not acknowledged in passing —
 * dispositioned, with text that a reader can disagree with.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * It does not judge whether the disposition is correct. A gate that tried would either be wrong or be
 * unfalsifiable. It enforces that a decision was made and recorded against that specific weakness, so
 * that a wrong call is visible and attributable rather than absent.
 */

/** A disposition shorter than this is a gesture, not a decision. */
export const MIN_DISPOSITION_CHARS = 40;

export const ADDRESSED = 'addressed';
export const DISMISSED = 'dismissed';

/**
 * Walk any artifact and collect every `knownWeakness` it carries, with the path it was found at.
 * Depth matters: W90's sat at `instrument.knownWeakness`, four levels from anything anyone read.
 */
export function collectWeaknesses(obj, { path = '', seen = new Set(), out = [] } = {}) {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return out;
  seen.add(obj);
  for (const [k, v] of Object.entries(obj)) {
    const here = path ? `${path}.${k}` : k;
    if (k === 'knownWeakness' || k === 'knownWeaknesses') {
      for (const text of (Array.isArray(v) ? v : [v])) {
        if (typeof text === 'string' && text.trim()) out.push({ at: here, text: text.trim() });
      }
      continue;
    }
    if (v && typeof v === 'object') collectWeaknesses(v, { path: here, seen, out });
  }
  return out;
}

/**
 * May a headline be published from this rung?
 *
 * @param {object} opts
 * @param {string} opts.headline what would be published, named so the refusal is legible
 * @param {Array<{at:string,text:string}>|object} opts.rung weaknesses, or the artifact to scan
 * @param {Array<{weakness:string,disposition:'addressed'|'dismissed',by?:string,text:string}>} opts.dispositions
 */
export function assessHeadline({ headline = 'this headline', rung = null, dispositions = [] } = {}) {
  const weaknesses = Array.isArray(rung) ? rung : collectWeaknesses(rung);
  if (weaknesses.length === 0) {
    return { state: 'NO_WEAKNESS', publishable: true, weaknesses: [], unaddressed: [],
      reason: `no knownWeakness on this rung; ${headline} is not blocked by KNOWN-WEAKNESS-01` };
  }

  const matched = [];
  const unaddressed = [];
  const hollow = [];

  for (const w of weaknesses) {
    // Matched on a substring of the weakness text, so a disposition cannot be written against a
    // weakness that does not exist, and a generic "all caveats considered" cannot cover the field.
    const d = (dispositions || []).find((x) => x && typeof x.weakness === 'string'
      && x.weakness.trim() && w.text.toLowerCase().includes(x.weakness.trim().toLowerCase()));
    if (!d) { unaddressed.push(w); continue; }
    if (d.disposition !== ADDRESSED && d.disposition !== DISMISSED) { unaddressed.push({ ...w, why: `disposition must be '${ADDRESSED}' or '${DISMISSED}', got '${d.disposition}'` }); continue; }
    if (typeof d.text !== 'string' || d.text.trim().length < MIN_DISPOSITION_CHARS) {
      hollow.push({ ...w, why: `disposition is ${(d.text || '').trim().length} chars; a decision must be at least ${MIN_DISPOSITION_CHARS}` });
      continue;
    }
    matched.push({ weakness: w, disposition: d });
  }

  if (hollow.length) {
    return { state: 'DISPOSITION_HOLLOW', publishable: false, weaknesses, unaddressed: hollow, addressed: matched,
      reason: `${hollow.length} weakness(es) carry a disposition too short to be a decision — `
        + 'signing the form is not the same as reading it' };
  }
  if (unaddressed.length) {
    return { state: 'WEAKNESS_UNADDRESSED', publishable: false, weaknesses, unaddressed, addressed: matched,
      reason: `${headline} is blocked: ${unaddressed.length} of ${weaknesses.length} knownWeakness entries `
        + `have no written disposition (${unaddressed.map((u) => u.at).join(', ')})` };
  }
  return { state: 'WEAKNESS_DISPOSITIONED', publishable: true, weaknesses, unaddressed: [], addressed: matched,
    reason: `all ${weaknesses.length} knownWeakness entries carry a written disposition; `
      + `${headline} may be published carrying them` };
}

/** Convenience for instruments: attach the verdict and a publishable flag to an artifact. */
export function withWeaknessGate(artifact, { headline, dispositions } = {}) {
  const verdict = assessHeadline({ headline, rung: artifact, dispositions });
  return { ...artifact, knownWeaknessGate: verdict, headlinePublishable: verdict.publishable };
}

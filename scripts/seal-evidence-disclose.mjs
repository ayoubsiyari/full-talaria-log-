/**
 * SEAL-EVIDENCE-01 — make each static-only gate say so, and refuse by name.
 *
 * Two edits per gate, both mechanical:
 *
 * 1. A disclosure line printed at load, so the token travels with the gate into
 *    any sweep log. The rule is that a static check must say so in its own
 *    verdict line; a note in an audit document does not travel with the result.
 *    It is deliberately NOT a test cell — a cell asserting `true` to announce a
 *    limitation would be a vacuous green defending against vacuous greens.
 *
 * 2. `readSubject()` in place of a bare `readFileSync` on the subject. A gate
 *    that cannot find what it tests has tested nothing, and a raw ENOENT makes
 *    that indistinguishable from the subject being broken — the same confusion
 *    that let 34 gates read as ordinary reds this morning.
 *
 * Both copies of every mirrored gate are edited, so they stay byte-identical.
 *
 *   node scripts/seal-evidence-disclose.mjs --dry
 *   node scripts/seal-evidence-disclose.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertParity } from './mirror-parity-check.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const log = (m) => console.log(`[seal-disclose] ${m}`);

/** A-lane static-only gates, from A-SEAL-EVIDENCE-AUDIT-20260803.md §2. */
const GATES = [
  ['chart v 1.4/chart/modules/order-01b-market-cursor.test.mjs', 'ORDER-01B step ladder'],
  ['chart v 1.4/chart/modules/forming-renderer-step-clock.test.mjs', 'ORDER-01B forming renderer step clock'],
  ['chart v 1.4/chart/modules/tick-off-candle-only-playback.test.mjs', 'ORDER-01B tick-path deletion'],
  ['chart v 1.4/chart/modules/b75-po-v5-1d-tick-speed-routing.red.test.mjs', 'ORDER-01B 1d tick-speed routing'],
  ['chart v 1.4/chart/modules/tf-downshift-anchor.test.mjs', 'ORDER-01B timeframe downshift anchor'],
  ['chart v 1.4/chart/modules/a2-resolvebar-transcript.test.mjs', 'A2 resolveBar transcript'],
  ['chart v 1.4/chart/modules/a3-speed-fill-journal-parity.test.mjs', 'A3 speed/fill journal parity'],
  ['chart v 1.4/chart/modules/a3-daily-money-path-boundary.test.mjs', 'A3 daily bucketing on session day'],
  ['chart v 1.4/chart/modules/tz01-tool-label-timezone.test.mjs', 'TZ-01 tool label timezone'],
  ['chart v 1.4/chart/modules/drawing-market-time-persist.test.mjs', 'TZ-01 drawing market-time persistence'],
  ['chart v 1.4/chart/modules/shell-play-override-receiver.test.mjs', 'SHELL-PLAY override receiver'],
];

const MARK = 'SEAL-EVIDENCE-01';

const disclosure = (label) => `
// ${MARK}: source evidence cannot bless served bytes. This gate reads the chart
// SOURCE, so it can show what the code says and not what the sealed build does.
// The token travels in the output because an audit document does not travel with
// a sweep log.
console.log("[${MARK}] STATIC_ONLY_SOURCE_GATE ${label} \\u2014 reads source; served behaviour unobserved");
`;

const READ_SUBJECT = `
/**
 * Named refusal instead of a bare ENOENT. A gate that cannot find its subject
 * has not tested it, and must not report that as the subject being defective.
 */
function readSubject(file) {
  if (!fs.existsSync(file)) throw new Error(\`SUBJECT_ABSENT: \${file}\`);
  return fs.readFileSync(file, 'utf8');
}
`;

function twin(rel) {
  return rel.startsWith('chart v 1.4/chart/')
    ? rel.replace('chart v 1.4/chart/', 'homepage/public/chart/')
    : rel.replace('homepage/public/chart/', 'chart v 1.4/chart/');
}

function rewrite(full, label) {
  let src = fs.readFileSync(full, 'utf8');
  if (src.includes(MARK)) return { skipped: 'already disclosed' };
  const actions = [];

  const usesFs = /^import fs from 'node:fs';$/m.test(src);
  const readsSubject = /fs\.readFileSync\(/.test(src);
  if (usesFs && readsSubject && !src.includes('function readSubject(')) {
    // Only the 'utf8' source reads become refusals; a gate reading its own
    // fixtures as bytes is doing something else and is left alone.
    const before = src;
    const candidate = src.replace(/fs\.readFileSync\(([^;]*?),\s*'utf8'\)/g, 'readSubject($1)');
    const anchor = /^const __dirname = .*$/m.exec(candidate);
    if (candidate !== before && anchor) {
      const at = anchor.index + anchor[0].length;
      src = `${candidate.slice(0, at)}\n${READ_SUBJECT}${candidate.slice(at)}`;
      actions.push('readSubject');
    } else if (candidate !== before) {
      // No `__dirname` to hang the helper on. The disclosure still applies, and
      // dropping both because one could not be placed is how a partial failure
      // turns into a silent skip.
      actions.push('readSubject-skipped(no anchor)');
    }
  }

  // Disclosure goes after the last import so it prints before any cell runs.
  const imports = [...src.matchAll(/^import .*;$/gm)];
  if (!imports.length) return { skipped: 'no import block to place the disclosure after' };
  const last = imports[imports.length - 1];
  const at = last.index + last[0].length;
  src = `${src.slice(0, at)}\n${disclosure(label)}${src.slice(at)}`;
  actions.push('disclosure');

  return { out: src, actions };
}

function main() {
  const dry = process.argv.includes('--dry');
  let changed = 0;
  const written = [];
  for (const [rel, label] of GATES) {
    for (const target of [rel, twin(rel)]) {
      const full = path.join(ROOT, target);
      if (!fs.existsSync(full)) { log(`skip: ${target} — absent`); continue; }
      const r = rewrite(full, label);
      if (r.skipped) { log(`skip: ${target} — ${r.skipped}`); continue; }
      if (!dry) { fs.writeFileSync(full, r.out); written.push(target); }
      changed += 1;
      log(`${dry ? 'would edit' : 'edited'} ${target} (${r.actions.join(' + ')})`);
    }
  }
  log(`${changed} file(s) ${dry ? 'would be ' : ''}edited`);

  // MIRROR-PARITY-01: a skip on one side of a pair is a divergence, and this
  // codemod skips per file. Checking here catches the half-applied case that
  // the per-file log reads past.
  if (!dry && written.length) assertParity(written, 'seal-evidence-disclose');
}

main();

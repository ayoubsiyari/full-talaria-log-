/**
 * CLOCK-01 gate — find wall-clock numbers written without their offset.
 *
 * "The digest already honours a stated offset and defaults to local. Give it
 * something to honour." This is the something: a check that fails on a bare
 * number rather than a convention nobody can verify.
 *
 * CLOCK-01-EXEMPT-FILE: the comments below quote bare numbers to explain the two
 * regex faults they describe; stamping those quotes would destroy the example.
 *
 *   node scripts/clock-01-audit.mjs                       # A-lane files
 *   node scripts/clock-01-audit.mjs --files=a.md,b.md
 *   node scripts/clock-01-audit.mjs --commits=20          # recent commit messages
 *   node scripts/clock-01-audit.mjs --json
 *
 * States, and none of them may be reached by looking at nothing:
 *   CLOCK_OK              every wall-clock number in scope carries an offset
 *   BARE_WALL_CLOCK       at least one does not                        (exit 1)
 *   NO_TIME_TOKENS_FOUND  nothing time-like in scope, so nothing was verified
 *   SUBJECT_ABSENT: path  a named file is missing; not the same as clean
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..');

/** A-lane surfaces. Other lanes pass --files; nobody edits another board. */
/**
 * Every board, not one lane's.
 *
 * CLOCK-01 is binding repo-wide and board prose is the first surface it names, so
 * a default of A-lane files meant `gate:clock-01` could report green while four
 * other boards carried bare numbers. Scope that is narrower than the rule reads
 * as coverage in exactly the way a never-executed gate does, and every sweep
 * summary we have would have shown it as a tick.
 *
 * Adding a board here is deliberately cheap; a lane whose board is outside the
 * default is a lane the rule does not actually reach.
 */
export const DEFAULT_FILES = [
  'docs/plan3/board/BOARD-A.md',
  'docs/plan3/board/BOARD-B.md',
  'docs/plan3/board/BOARD-C.md',
  'docs/plan3/board/BOARD-D.md',
  'docs/plan3/board/BOARD-E.md',
  'docs/plan3/RUN-LOCK-01-ADOPTION-20260803.md',
  'docs/plan3/A-SEAL-EVIDENCE-AUDIT-20260803.md',
];

/**
 * A time of day: 0-23 : 00-59, optional seconds. Deliberately narrow — four
 * digit pairs like `5576:5670` are source line ranges and `4:1` is a ratio.
 *
 * The trailing `(?!\d)` replaces a `\b`, and the difference is not cosmetic. On
 * `09:59:48Z` the word boundary after `48` fails against `Z`, so the engine
 * backtracks and matches `09:59` instead — leaving `:48Z` behind. The --fix pass
 * then wrote `09:59+01:00:48Z`. It corrupted 118 stamps in my own board before
 * the diff review caught it, which is the argument for reviewing a mechanical
 * sweep rather than trusting its own summary.
 */
const TIME = /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(?!\d)/g;

/**
 * What counts as carrying its offset, checked on the text that follows. The
 * optional fractional part matters: `2026-08-02T09:15:33.171Z` is fully stamped,
 * and an audit that flags it teaches people to ignore the audit.
 */
const OFFSET_AFTER = new RegExp(
  '^(?:\\.\\d+)?[*_`\\s]*(?:'
  + 'Z\\b|[+-]\\d{2}:?\\d{2}\\b'
  + '|UTC\\b|GMT\\b|BST\\b|EST\\b|EDT\\b|NY\\b|New York\\b|local\\b'
  // An IANA zone is a stated clock too: `17:00 America/New_York` is a session
  // boundary, and stamping a host offset onto it would corrupt a correct line.
  + '|[A-Za-z]+/[A-Za-z_]+'
  + ')', 'i',
);

/**
 * The digits of an offset are not themselves a time. `11:08+01:00` matched twice
 * on the first pass and reported the `01:00` as bare, which would have stamped an
 * offset onto an offset.
 */
const INSIDE_AN_OFFSET = /[+-]$/;

/**
 * A LIST of times rather than a numeric pair: `11:16:55+01:00 / 11:21:12 / …`.
 *
 * This distinction is load-bearing, because the numeric-pair excuse below reads
 * the text before the number and a slash-separated list of times ends in exactly
 * the same shape — `…:00 / ` — as a ratio's left-hand side. Every time after the
 * first was therefore excused, so a list of four probe timestamps with three bare
 * numbers in it reported CLOCK_OK. Found in B's own board line, where the gate had
 * blessed the line it should have failed.
 *
 * The excuse it guards is narrower than it looks: `5576:5670` and `4:1` produce
 * no time tokens at all, because TIME requires 1-2 hour digits and `[0-5]\d`
 * minutes. So suppressing it after a time costs nothing that was being protected.
 */
const LIST_OF_TIMES = new RegExp(
  '\\d{1,2}:[0-5]\\d(?::[0-5]\\d)?(?:\\.\\d+)?(?:[+-]\\d{2}:?\\d{2}|Z)?[*_`\\s]*[:/]\\s*$',
  'i',
);

/**
 * Contexts where the number is not a wall clock at all.
 *
 * `afterTime: false` marks an excuse that must NOT fire when a time immediately
 * precedes the separator, because there the neighbour is a sibling timestamp
 * rather than the other half of a pair.
 */
const NOT_A_CLOCK = [
  { re: INSIDE_AN_OFFSET, why: 'the digits of an offset, not a time' },
  { re: /\b(?:L|line|lines?)\s*$/i, why: 'source line reference' },
  { re: /\b(?:ratio|aspect|odds)\s*$/i, why: 'ratio' },
  { re: /[\d.]+\s*[:/]\s*$/, why: 'part of a numeric pair', afterTime: false },
  { re: /\bv?\d+\.\d+\s*$/i, why: 'version' },
];

/**
 * Declared exemptions. The audit cannot tell prose from a fixture: a test that
 * asserts a bare number is caught must contain a bare number, and this file's own
 * comments quote `09:59` to explain a backtracking bug. Stamping either would
 * break the thing it was checking, so intent is declared rather than guessed.
 *
 *   CLOCK-01-EXEMPT           on the line
 *   CLOCK-01-EXEMPT-FILE: why anywhere in the first 40 lines
 */
/**
 * Scope decides the anchoring. A line-scoped opt-out may sit anywhere on its
 * line, because board entries open with their own stamp and the blast radius is
 * that one line. The FILE marker must OPEN a line: unanchored, it exempted my own
 * commit message, which merely described the marker mid-sentence, and a gate any
 * text can switch off by naming it is not a gate.
 */
const EXEMPT_LINE = /CLOCK-01-EXEMPT\b(?!-FILE)/;
const EXEMPT_FILE = /^[\s*#/>|-]*CLOCK-01-EXEMPT-FILE:\s*(.+)$/m;

const isIsoStamped = (line, index) => {
  // `2026-08-03T12:04:34Z` and `2026-08-03 12:04:34+01:00`: the date prefix plus
  // a trailing offset means the whole token is already citable.
  const before = line.slice(Math.max(0, index - 12), index);
  return /\d{4}-\d{2}-\d{2}[T ]$/.test(before);
};

export function scanText(text) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  const fileExempt = EXEMPT_FILE.exec(lines.slice(0, 40).join('\n'));
  let total = 0;
  if (fileExempt) return { total: 0, findings: [], exemptFile: fileExempt[1].trim() };
  lines.forEach((line, i) => {
    if (EXEMPT_LINE.test(line)) return;
    // An entry heading like `- 13:22+01:00 · A · ...` is the case that already
    // works; it still goes through the same test rather than being trusted.
    for (const m of line.matchAll(TIME)) {
      total += 1;
      const after = line.slice(m.index + m[0].length);
      const before = line.slice(0, m.index);
      if (OFFSET_AFTER.test(after)) continue;
      if (isIsoStamped(line, m.index) && OFFSET_AFTER.test(after)) continue;
      // Accepted trade-off: `ratio 12:30 / 13:45` now flags its second number,
      // because suppressing the pair excuse after a time cannot distinguish a
      // ratio list from a timestamp list. That direction is deliberate — a false
      // positive argues with you and a false green blesses bare numbers silently,
      // and the silent one is what let a four-timestamp line report CLOCK_OK.
      // Genuine non-clock lists declare themselves with CLOCK-01-EXEMPT.
      const inAList = LIST_OF_TIMES.test(before);
      const excuse = NOT_A_CLOCK.find((n) => n.re.test(before)
        && !(n.afterTime === false && inAList));
      if (excuse) continue;
      findings.push({
        line: i + 1,
        token: m[0],
        context: line.trim().slice(0, 140),
        isoPrefixed: isIsoStamped(line, m.index),
        // Where an offset would go. Carried so the fixer stamps exactly what the
        // gate reported, instead of deciding a second time and disagreeing.
        endsAt: m.index + m[0].length,
      });
    }
  });
  return { total, findings };
}

function scanFile(rel) {
  const abs = path.join(REPO_ROOT, rel);
  if (!fs.existsSync(abs)) return { rel, state: `SUBJECT_ABSENT: ${rel}`, total: 0, findings: [] };
  const { total, findings, exemptFile } = scanText(fs.readFileSync(abs, 'utf8'));
  if (exemptFile) return { rel, state: 'CLOCK_EXEMPT_DECLARED', total: 0, findings: [], why: exemptFile };
  return { rel, state: findings.length ? 'BARE_WALL_CLOCK' : total ? 'CLOCK_OK' : 'NO_TIME_TOKENS_FOUND', total, findings };
}

function scanCommits(n) {
  const out = execFileSync('git', ['log', `-${n}`, '--format=%h%x00%s%x00%b%x1e'], {
    cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  return out.split('\x1e').map((rec) => rec.trim()).filter(Boolean).map((rec) => {
    const [sha, subject, body] = rec.split('\x00');
    const { total, findings } = scanText(`${subject}\n${body || ''}`);
    return {
      rel: `commit ${sha}`,
      state: findings.length ? 'BARE_WALL_CLOCK' : total ? 'CLOCK_OK' : 'NO_TIME_TOKENS_FOUND',
      total,
      findings,
    };
  });
}

/**
 * Stamp bare numbers in a file with a stated offset.
 *
 * Only ever run this on your own text with an offset you know, and read the diff:
 * the audit can see that a number is unstamped, never which clock produced it.
 * Guessing would manufacture exactly the false certainty CLOCK-01 exists to stop.
 */
export function fixFile(rel, offset) {
  const abs = path.join(REPO_ROOT, rel);
  const src = fs.readFileSync(abs, 'utf8');
  // Terminators are kept and written back unchanged. Joining on '\n' rewrites
  // every line of a CRLF file, which on a shared board turns an 11-number sweep
  // into a 102-line diff and a conflict for whoever is mid-entry. BOARD-E.md is
  // CRLF and BOARD-B.md is LF, so this is not hypothetical here.
  const parts = src.split(/(\r\n|\n)/);
  const changed = [];
  const stampLine = (line, i) => {
    // One decision, taken once. This loop used to re-test OFFSET_AFTER and
    // NOT_A_CLOCK itself, so the fixer and the gate could disagree -- and they
    // did: after the list-of-times narrowing landed in scanText only, the gate
    // reported three bare numbers on a board line and the fixer stamped none of
    // them, printing "stamped 0", which reads exactly like "nothing needed".
    const { findings } = scanText(line);
    if (!findings.length) return line;
    // Right to left, so an earlier insertion cannot shift a later index.
    const next = [...findings]
      .sort((a, b) => b.endsAt - a.endsAt)
      .reduce((acc, f) => acc.slice(0, f.endsAt) + offset + acc.slice(f.endsAt), line);
    changed.push({ line: i + 1, from: line.trim().slice(0, 120), to: next.trim().slice(0, 120) });
    return next;
  };
  for (let i = 0; i < parts.length; i += 2) {
    parts[i] = stampLine(parts[i], i / 2);
  }
  fs.writeFileSync(abs, parts.join(''));
  return changed;
}

function main() {
  const argOf = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  const json = process.argv.includes('--json');
  // Positional paths count here too. `clock-01-audit BOARD-A.md` silently ignored
  // the argument and audited the default A-lane set, so it answered a question
  // about C's board while I read it as an answer about mine.
  const files = [
    ...(argOf('files') || '').split(','),
    ...process.argv.slice(2).filter((a) => !a.startsWith('-')),
  ].map((s) => s.trim()).filter(Boolean);
  const commits = Number(argOf('commits') || 0);
  const fix = argOf('fix');

  if (fix) {
    if (!/^[+-]\d{2}:\d{2}$/.test(fix)) {
      console.error(`[clock-01] --fix needs an explicit offset, e.g. --fix=+01:00 (got ${fix})`);
      process.exit(2);
    }
    if (!files.length) {
      console.error('[clock-01] --fix needs --files=... — never sweep a default set of files you did not name');
      process.exit(2);
    }
    for (const rel of files) {
      const changed = fixFile(rel, fix);
      console.log(`[clock-01] stamped ${changed.length} number(s) in ${rel} with ${fix}`);
      for (const c of changed) console.log(`   ${rel}:${c.line}  ${c.to}`);
    }
    return;
  }

  const results = [
    ...(files.length ? files : DEFAULT_FILES).map(scanFile),
    ...(commits ? scanCommits(commits) : []),
  ];
  const bare = results.filter((r) => r.state === 'BARE_WALL_CLOCK');
  const absent = results.filter((r) => String(r.state).startsWith('SUBJECT_ABSENT'));
  const vacuous = results.filter((r) => r.state === 'NO_TIME_TOKENS_FOUND');

  if (json) {
    console.log(JSON.stringify({ results }, null, 2));
  } else {
    for (const r of results) {
      if (r.state === 'CLOCK_OK') { console.log(`[clock-01] CLOCK_OK ${r.rel} — ${r.total} stamped`); continue; }
      if (r.state === 'NO_TIME_TOKENS_FOUND') { console.log(`[clock-01] NO_TIME_TOKENS_FOUND ${r.rel} — nothing verified here`); continue; }
      if (r.state === 'CLOCK_EXEMPT_DECLARED') { console.log(`[clock-01] CLOCK_EXEMPT_DECLARED ${r.rel} — ${r.why}`); continue; }
      if (String(r.state).startsWith('SUBJECT_ABSENT')) { console.log(`[clock-01] ${r.state}`); continue; }
      console.log(`[clock-01] BARE_WALL_CLOCK ${r.rel} — ${r.findings.length} of ${r.total}`);
      for (const f of r.findings.slice(0, 40)) {
        console.log(`   ${r.rel}:${f.line}  ${f.token}   ${f.context}`);
      }
      if (r.findings.length > 40) console.log(`   ... and ${r.findings.length - 40} more`);
    }
    /**
     * The scanned count leads, because "across 0 file(s)" meant "0 files had
     * violations" and I read it as "0 files were examined" — then quoted CLOCK_OK on a
     * board I had not verified. A summary whose green is indistinguishable from
     * having looked at nothing is the same fault this gate exists to catch.
     */
    console.log(`[clock-01] ${bare.length ? 'BARE_WALL_CLOCK' : 'CLOCK_OK'} — `
      + `${results.length} scanned, ${bare.reduce((n, r) => n + r.findings.length, 0)} bare number(s) `
      + `in ${bare.length} file(s); ${vacuous.length} with no time tokens; ${absent.length} absent`);
  }
  process.exitCode = bare.length ? 1 : absent.length ? 2 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}

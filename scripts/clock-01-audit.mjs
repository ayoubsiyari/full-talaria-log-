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
const DEFAULT_FILES = [
  'docs/plan3/board/BOARD-A.md',
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

/** Contexts where the number is not a wall clock at all. */
const NOT_A_CLOCK = [
  { re: INSIDE_AN_OFFSET, why: 'the digits of an offset, not a time' },
  { re: /\b(?:L|line|lines?)\s*$/i, why: 'source line reference' },
  { re: /\b(?:ratio|aspect|odds)\s*$/i, why: 'ratio' },
  { re: /[\d.]+\s*[:/]\s*$/, why: 'part of a numeric pair' },
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
      const excuse = NOT_A_CLOCK.find((n) => n.re.test(before));
      if (excuse) continue;
      findings.push({
        line: i + 1,
        token: m[0],
        context: line.trim().slice(0, 140),
        isoPrefixed: isIsoStamped(line, m.index),
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
  const lines = src.split(/\r?\n/);
  const changed = [];
  const out = lines.map((line, i) => {
    const { findings } = scanText(line);
    if (!findings.length) return line;
    let next = '';
    let at = 0;
    for (const m of line.matchAll(TIME)) {
      const after = line.slice(m.index + m[0].length);
      const before = line.slice(0, m.index);
      if (OFFSET_AFTER.test(after)) continue;
      if (NOT_A_CLOCK.some((n) => n.re.test(before))) continue;
      next += line.slice(at, m.index + m[0].length) + offset;
      at = m.index + m[0].length;
    }
    if (!next) return line;
    next += line.slice(at);
    changed.push({ line: i + 1, from: line.trim().slice(0, 120), to: next.trim().slice(0, 120) });
    return next;
  });
  fs.writeFileSync(abs, out.join('\n'));
  return changed;
}

function main() {
  const argOf = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  const json = process.argv.includes('--json');
  const files = (argOf('files') || '').split(',').map((s) => s.trim()).filter(Boolean);
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
    console.log(`[clock-01] ${bare.length ? 'BARE_WALL_CLOCK' : 'CLOCK_OK'} — `
      + `${bare.reduce((n, r) => n + r.findings.length, 0)} bare number(s) across ${bare.length} file(s); `
      + `${vacuous.length} scanned with no time tokens; ${absent.length} absent`);
  }
  process.exitCode = bare.length ? 1 : absent.length ? 2 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}

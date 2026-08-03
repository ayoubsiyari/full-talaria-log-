#!/usr/bin/env node
/**
 * STATE-BLOCK-01 — maintain C's CURRENT STATE convention in place, and check it.
 *
 * The convention (C, b02846abd): one block at the top of a board, overwritten
 * rather than appended, every number carrying its state, plus an explicit list of
 * what is NOT quotable. An append-only log read bottom-up produces confident
 * sentences that a later entry already retired.
 *
 * A block maintained by hand has two failure modes, and both of them read as a
 * healthy board:
 *
 *   1. IT ROTS. Fifteen entries get appended below it and the block still
 *      describes the morning. It is now worse than no block, because it is the
 *      part a reader trusts to be current.
 *   2. ITS STAMP IS GUESSED. On 2026-08-03 I typed `16:34+01:00` on twelve board
 *      lines and committed them at `16:09:59+01:00`, and `15:52+01:00` on nine
 *      committed at `15:47:10+01:00`. CLOCK-01 passed all of them: it checks that
 *      a number carries an offset, never that the number is true. A block whose
 *      "last updated" is in the future is asserting a freshness it does not have.
 *
 * So the write path is mechanical (it cannot silently become an append) and there
 * is a check for both failures.
 *
 *   node scripts/board-state-block.mjs --check
 *   node scripts/board-state-block.mjs --check --file=docs/plan3/board/BOARD-B.md
 *   node scripts/board-state-block.mjs --file=<board> --from=<file with the new block body>
 *
 * States:
 *   STATE_BLOCK_CURRENT     markers present, stamp sane, no later edits
 *   STATE_BLOCK_ABSENT      the board has not adopted the convention (exit 1)
 *   STATE_BLOCK_UNSTAMPED   markers present, no parseable "last updated" (exit 1)
 *   FUTURE_STAMP            "last updated" is ahead of now (exit 1)
 *   STATE_BLOCK_STALE       the file was committed well after the block's stamp (exit 1)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const argOf = (n, d = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};

const BEGIN = '<!-- CURRENT-STATE-BLOCK:BEGIN';
const END = '<!-- CURRENT-STATE-BLOCK:END -->';

/**
 * How long after the block's own stamp a commit is still assumed to BE that
 * update rather than a later edit. Writing the block, running the gate and
 * committing takes a few minutes; thirty is generous enough not to cry wolf on
 * the commit that lands the block itself, and short enough that an afternoon of
 * appended entries over a morning block is caught.
 */
const GRACE_MIN = 30;

export const BOARDS = Object.freeze([
  'docs/plan3/board/BOARD-A.md',
  'docs/plan3/board/BOARD-B.md',
  'docs/plan3/board/BOARD-C.md',
  'docs/plan3/board/BOARD-D.md',
  'docs/plan3/board/BOARD-E.md',
]);

/**
 * Markers first, then the heading C actually used.
 *
 * The first version of this checker looked for the HTML markers only and reported
 * C, D and E as STATE_BLOCK_ABSENT -- C, who invented the convention at
 * b02846abd. A checker that demands my syntax rather than the agreed convention
 * measures conformance to me, which is not a thing anyone asked for and is the
 * fastest way to make a shared gate unwelcome. The markers are how the WRITE path
 * finds its edges; `## CURRENT STATE` is how a READER finds the block.
 */
export function findBlock(text) {
  const marked = text.indexOf(BEGIN);
  if (marked >= 0) {
    const to = text.indexOf(END, marked);
    if (to >= 0) {
      const ends = to + END.length;
      return { from: marked, to: ends, body: text.slice(marked, ends), marked: true };
    }
  }
  const m = text.match(/^##\s+CURRENT STATE\b.*$/im);
  if (!m) return null;
  const from = m.index;
  const after = text.slice(from + m[0].length);
  // Ends at the next horizontal rule or the next heading of the same level,
  // whichever comes first; otherwise the rest of the file.
  const rule = after.search(/\r?\n---\r?\n/);
  const head = after.search(/\r?\n##\s/);
  const ends = [rule, head].filter((i) => i >= 0);
  const to = ends.length ? from + m[0].length + Math.min(...ends) : text.length;
  return { from, to, body: text.slice(from, to), marked: false };
}

/**
 * The ISO instant is what gets compared; the local stamp is for humans. Requiring
 * both is deliberate -- a bare local time cannot be compared against a git commit
 * date without assuming an offset, and assuming one is how three investigations
 * started today.
 */
export function stampOf(body, today = new Date()) {
  const line = (body.match(/^.*last updated.*$/im) || [''])[0];
  const iso = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)Z/);
  if (iso) {
    const at = new Date(`${iso[1].length === 16 ? `${iso[1]}:00` : iso[1]}Z`);
    return Number.isNaN(at.getTime()) ? null : at;
  }
  // An offset-bearing local time is a real instant once a date is supplied, so a
  // block stamped `16:08+01:00` is comparable and must not be called unstamped --
  // CLOCK-01 asks for the offset and this is what honouring it looks like. The
  // date is the board's own day; only the offset is taken from the text, never
  // assumed.
  const local = line.match(/(\d{1,2}):([0-5]\d)(?::([0-5]\d))?\s*([+-]\d{2}):?(\d{2})/);
  if (!local) return null;
  const [, h, mi, s, oh, om] = local;
  const y = today.getFullYear();
  const mo = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const at = new Date(`${y}-${mo}-${d}T${h.padStart(2, '0')}:${mi}:${s || '00'}${oh}:${om}`);
  return Number.isNaN(at.getTime()) ? null : at;
}

function lastCommitDate(rel) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%aI', '--', rel], {
      cwd: REPO_ROOT, encoding: 'utf8',
    }).trim();
    return out ? new Date(out) : null;
  } catch { return null; }
}

/**
 * The whole decision, with no filesystem and no git in it, so every branch can be
 * reached from a test. A verdict function that can only be exercised by arranging
 * a real repository is one whose RED paths never get run -- which is the defect
 * class this gate is part of answering.
 */
export function verdict({ present, body, stamp, committed, now }) {
  if (!present) return { state: 'STATE_BLOCK_ABSENT', ok: false };
  if (!stamp) return { state: 'STATE_BLOCK_UNSTAMPED', ok: false };
  if (stamp.getTime() > now.getTime()) {
    return {
      state: 'FUTURE_STAMP',
      ok: false,
      detail: `block says ${stamp.toISOString()} but it is ${now.toISOString()}`,
    };
  }
  if (committed) {
    const behindMin = Math.round((committed.getTime() - stamp.getTime()) / 60000);
    if (behindMin > GRACE_MIN) {
      return {
        state: 'STATE_BLOCK_STALE',
        ok: false,
        detail: `last commit to this board is ${behindMin} min after the block's stamp `
          + `(grace ${GRACE_MIN}); entries were added without refreshing the block`,
      };
    }
  }
  // An empty shell with the right heading must not read as adopted.
  if (!/not quotable/i.test(body || '')) {
    return { state: 'STATE_BLOCK_INCOMPLETE', ok: false, detail: 'no "Not quotable" section' };
  }
  return { state: 'STATE_BLOCK_CURRENT', ok: true };
}

export function checkBoard(rel, now = new Date()) {
  const abs = path.join(REPO_ROOT, rel);
  if (!fs.existsSync(abs)) return { rel, state: 'SUBJECT_ABSENT', ok: false };
  const text = fs.readFileSync(abs, 'utf8');
  const block = findBlock(text);
  return {
    rel,
    ...verdict({
      present: !!block,
      body: block ? block.body : '',
      stamp: block ? stampOf(block.body, now) : null,
      committed: lastCommitDate(rel),
      now,
    }),
  };
}

function write() {
  const rel = argOf('file');
  const from = argOf('from');
  if (!rel || !from) {
    console.error('usage: --file=<board> --from=<file containing the replacement block>');
    process.exit(2);
  }
  const abs = path.join(REPO_ROOT, rel);
  const text = fs.readFileSync(abs, 'utf8');
  const block = findBlock(text);
  if (!block) {
    console.error(`[state-block] STATE_BLOCK_ABSENT ${rel} — add the markers once by hand, then this `
      + 'tool maintains it. Refusing to guess where the top of your board is.');
    process.exit(1);
  }
  let body = fs.readFileSync(path.join(REPO_ROOT, from), 'utf8').replace(/\s+$/, '');
  if (!body.startsWith(BEGIN)) body = `${BEGIN} — overwritten in place. -->\n\n${body}`;
  if (!body.endsWith(END)) body = `${body}\n\n${END}`;
  // Match the file's existing line endings, or a one-line edit rewrites every
  // line of a shared file and becomes a guaranteed conflict for whoever is
  // mid-entry. Learned on E's board, the expensive way.
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const next = text.slice(0, block.from) + body.replace(/\r?\n/g, eol) + text.slice(block.to);
  fs.writeFileSync(abs, next);
  console.log(`[state-block] replaced the block in ${rel} in place (${eol === '\r\n' ? 'CRLF' : 'LF'})`);
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  if (argOf('from')) {
    write();
  } else {
    const only = argOf('file');
    const subjects = only ? [only] : BOARDS;
    const results = subjects.map((rel) => checkBoard(rel));
    for (const r of results) {
      console.log(`[state-block] ${r.state.padEnd(22)} ${r.rel}${r.detail ? ` — ${r.detail}` : ''}`);
    }
    const bad = results.filter((r) => !r.ok);
    console.log(`\n[state-block] ${results.length - bad.length} of ${results.length} board(s) carry a current state block`);
    if (bad.length) {
      console.log('  A stale or future-stamped block is worse than no block: it is the part a reader');
      console.log('  trusts to be true now. Refresh it, or remove the markers and say so.');
    }
    process.exit(bad.length ? 1 : 0);
  }
}

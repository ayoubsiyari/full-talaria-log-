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
 *   STATE_BLOCK_STALE_LANE  the LANE committed elsewhere after the stamp (exit 1)
 *   STATE_BLOCK_STALENESS_UNPROVEN
 *                           commits landed after the stamp but carry no Manager:
 *                           trailer, so lane-scoped staleness cannot be determined
 *                           (exit 9, distinct from a proven stale board)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// One definition of "which lane produced this commit", shared with the director digest
// rather than reimplemented. Two readers of the same trailer that disagree would be a
// new way to be wrong about attribution, which is the thing being fixed.
import { laneOfCommit } from './director-digest.mjs';

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

/** BOARD-B.md -> B. The board's own name is the only lane fact a filename carries. */
export function laneOfBoardPath(rel) {
  const m = /BOARD-([A-E])\.md$/i.exec(rel);
  return m ? m[1].toUpperCase() : null;
}

/**
 * STATE-BLOCK-02. What the lane did ANYWHERE since the block was stamped.
 *
 * The hole this closes: staleness was scoped to the board FILE, so a lane that works
 * all afternoon without touching its own board stayed CURRENT. Live on BOARD-B at
 * 18:36+01:00 with roughly 35 commits since and the gate green -- found by the gate's
 * own author, on the gate's own board, which is the least defensible place for it.
 *
 * Returns the lane's newest attributable commit, plus how many commits since the stamp
 * could not be attributed to anyone. Those two facts support three different verdicts
 * and collapsing them would put back a false green:
 *
 *   the lane committed elsewhere after the stamp   -> the block is stale, provably
 *   nothing at all landed after the stamp          -> the block is current, provably
 *   things landed but carry no Manager: trailer    -> unknowable, and it says so
 */
export function laneActivity({ lane, since, root = REPO_ROOT, run = null }) {
  const git = run || ((args) => execFileSync('git', args, {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024,
  }));
  if (!lane || !since) return { lane, at: null, unattributedSince: 0, totalSince: 0 };
  let raw = '';
  try {
    raw = git(['log', `--since=${since.toISOString()}`, '--format=%aI%x1f%B%x1e']);
  } catch { return { lane, at: null, unattributedSince: 0, totalSince: 0, failed: true }; }

  let at = null;
  let unattributedSince = 0;
  let totalSince = 0;
  for (const rec of raw.split('\x1e').map((r) => r.trim()).filter(Boolean)) {
    const [iso, body = ''] = rec.split('\x1f');
    const when = new Date(iso);
    if (Number.isNaN(when.getTime()) || when <= since) continue;
    totalSince += 1;
    const declared = laneOfCommit(body);
    if (!declared) { unattributedSince += 1; continue; }
    if (declared === lane && (!at || when > at)) at = when;
  }
  return { lane, at, unattributedSince, totalSince };
}

/**
 * The whole decision, with no filesystem and no git in it, so every branch can be
 * reached from a test. A verdict function that can only be exercised by arranging
 * a real repository is one whose RED paths never get run -- which is the defect
 * class this gate is part of answering.
 */
export function verdict({ present, body, stamp, committed, now, activity = null }) {
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

  // Lane-scoped staleness, checked after the file-scoped one so the more specific
  // finding wins the report when both hold.
  if (activity) {
    if (activity.at) {
      const behind = Math.round((activity.at.getTime() - stamp.getTime()) / 60000);
      if (behind > GRACE_MIN) {
        return {
          state: 'STATE_BLOCK_STALE_LANE',
          ok: false,
          detail: `lane ${activity.lane} committed elsewhere ${behind} min after the block's `
            + 'stamp without refreshing it; the block describes a state the lane has moved past',
        };
      }
    } else if (activity.unattributedSince > 0) {
      // The honest third answer. Saying CURRENT here is the false green that was live
      // on this very board; saying STALE would accuse a lane that may have been idle.
      return {
        state: 'STATE_BLOCK_STALENESS_UNPROVEN',
        ok: false,
        detail: `${activity.unattributedSince} of ${activity.totalSince} commit(s) since the `
          + `stamp carry no Manager: trailer, so whether lane ${activity.lane} worked without `
          + 'refreshing this block cannot be determined. File-scoped checks all passed.',
      };
    }
  }
  return { state: 'STATE_BLOCK_CURRENT', ok: true };
}

export function checkBoard(rel, now = new Date()) {
  const abs = path.join(REPO_ROOT, rel);
  if (!fs.existsSync(abs)) return { rel, state: 'SUBJECT_ABSENT', ok: false };
  const text = fs.readFileSync(abs, 'utf8');
  const block = findBlock(text);
  const stamp = block ? stampOf(block.body, now) : null;
  const lane = laneOfBoardPath(rel);
  return {
    rel,
    lane,
    ...verdict({
      present: !!block,
      body: block ? block.body : '',
      stamp,
      committed: lastCommitDate(rel),
      now,
      activity: stamp && lane ? laneActivity({ lane, since: stamp }) : null,
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
      console.log(`[state-block] ${r.state.padEnd(30)} ${r.rel}${r.detail ? `\n    ${r.detail}` : ''}`);
    }
    const unproven = results.filter((r) => r.state === 'STATE_BLOCK_STALENESS_UNPROVEN');
    const bad = results.filter((r) => !r.ok && r.state !== 'STATE_BLOCK_STALENESS_UNPROVEN');
    console.log(`\n[state-block] ${results.filter((r) => r.ok).length} of ${results.length} board(s) carry a `
      + `provably current state block; ${unproven.length} cannot be determined`);
    if (bad.length) {
      console.log('  A stale or future-stamped block is worse than no block: it is the part a reader');
      console.log('  trusts to be true now. Refresh it, or remove the markers and say so.');
    }
    if (unproven.length) {
      console.log('  UNPROVEN is not a pass and not an accusation. Staleness used to be scoped to the');
      console.log('  board FILE, so a lane working all afternoon without touching its own board stayed');
      console.log('  CURRENT. Answering it needs Manager: trailers on commits; until those land, this');
      console.log('  gate can prove a block current only when nothing at all was committed after it.');
    }
    // 9 matches territory-preflight: "could not be determined" never shares a code with
    // "determined and wrong". A proven defect outranks an undeterminable one.
    process.exit(bad.length ? 1 : unproven.length ? 9 : 0);
  }
}

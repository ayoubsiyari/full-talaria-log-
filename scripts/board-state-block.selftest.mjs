#!/usr/bin/env node
/**
 * STATE-BLOCK-01 selftest.
 *
 * The load-bearing cell is FUTURE_STAMP, because that is the defect that produced
 * this gate: on 2026-08-03 I typed `16:34+01:00` onto twelve board lines and
 * committed them at `16:09:59+01:00`. CLOCK-01 passed every one — it asks whether
 * a number carries an offset, never whether the number is true.
 *
 *   node scripts/board-state-block.selftest.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BOARDS, findBlock, laneActivity, laneOfBoardPath, stampOf, verdict,
} from './board-state-block.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
const cell = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); pass += 1; } catch (err) {
    console.log(`  FAIL  ${name}\n        ${err.message.split('\n')[0]}`);
    fail += 1;
  }
};

const now = new Date('2026-08-03T15:30:00Z');
const QUOTE = 'Not quotable, and why — nothing yet.';

console.log('STATE-BLOCK-01 selftest\n');
console.log('EVIDENCE CLASS: STATIC_SOURCE for findBlock/stampOf against the real boards; '
  + 'pure-function for every verdict branch. No served surface is involved and none is claimed.\n');

cell('THE DEFECT THAT CAUSED THIS GATE: a future stamp is refused', () => {
  const r = verdict({
    present: true, body: QUOTE, stamp: new Date('2026-08-03T15:34:00Z'), committed: null, now,
  });
  assert.equal(r.state, 'FUTURE_STAMP');
  assert.equal(r.ok, false);
  // 16:34+01:00 committed at 16:09:59+01:00 is exactly this shape, 24 minutes out.
  assert.match(r.detail, /but it is/);
});

cell('a stamp one second in the past is fine — the check is not a tolerance game', () => {
  const r = verdict({
    present: true, body: QUOTE, stamp: new Date('2026-08-03T15:29:59Z'), committed: null, now,
  });
  assert.equal(r.state, 'STATE_BLOCK_CURRENT');
});

cell('STALE: entries committed well after the block stop it reading as current', () => {
  const r = verdict({
    present: true,
    body: QUOTE,
    stamp: new Date('2026-08-03T09:00:00Z'),
    committed: new Date('2026-08-03T15:00:00Z'),
    now,
  });
  assert.equal(r.state, 'STATE_BLOCK_STALE');
  assert.match(r.detail, /360 min after/);
});

cell('ANTI-VACUITY: a commit inside the grace window is NOT stale', () => {
  // Otherwise the gate reds on the very commit that lands the block, everyone
  // learns to ignore it, and it protects nothing.
  const r = verdict({
    present: true,
    body: QUOTE,
    stamp: new Date('2026-08-03T15:00:00Z'),
    committed: new Date('2026-08-03T15:20:00Z'),
    now,
  });
  assert.equal(r.state, 'STATE_BLOCK_CURRENT');
});

cell('ABSENT and UNSTAMPED are distinct states, not one red', () => {
  assert.equal(verdict({ present: false, now }).state, 'STATE_BLOCK_ABSENT');
  assert.equal(verdict({ present: true, body: QUOTE, stamp: null, now }).state, 'STATE_BLOCK_UNSTAMPED');
});

cell('INCOMPLETE: a block with no "Not quotable" section does not count as adopted', () => {
  const r = verdict({
    present: true,
    body: '## CURRENT STATE — last updated 16:00+01:00\n\nEverything is fine.',
    stamp: new Date('2026-08-03T15:00:00Z'),
    committed: null,
    now,
  });
  assert.equal(r.state, 'STATE_BLOCK_INCOMPLETE');
  assert.match(r.detail, /Not quotable/);
});

cell('stampOf: accepts an ISO instant and an offset-bearing local time, rejects a bare one', () => {
  assert.equal(
    stampOf('last updated 16:23+01:00 / 2026-08-03T15:23Z').toISOString(),
    '2026-08-03T15:23:00.000Z',
  );
  const local = stampOf('## CURRENT STATE — C\'s lane · last updated 16:08+01:00', new Date('2026-08-03T12:00:00Z'));
  assert.equal(local.toISOString(), '2026-08-03T15:08:00.000Z', 'an offset makes a local time a real instant');
  // A bare time cannot be compared without assuming an offset, and assuming one is
  // what CLOCK-01 exists to stop.
  assert.equal(stampOf('last updated 16:08'), null);
});

cell('ANTI-VACUITY: the real BOARD-C block is found by HEADING, not by my markers', () => {
  // The first version of this checker was marker-only and called C -- who invented
  // the convention -- non-adopting. This cell exists so that cannot come back.
  const text = fs.readFileSync(path.join(REPO_ROOT, 'docs/plan3/board/BOARD-C.md'), 'utf8');
  const block = findBlock(text);
  assert.ok(block, 'C has a state block and it must be discoverable');
  assert.equal(block.marked, false, 'C uses no HTML markers, and must not need them');
  assert.match(block.body, /CURRENT STATE/);
  assert.match(block.body, /[Nn]ot quotable/);
  // And it must stop at the block, not swallow the log below it.
  assert.ok(block.body.length < text.length / 2, 'the block must be bounded, not the whole file');
});

cell('findBlock: a board with no block returns null rather than the whole file', () => {
  assert.equal(findBlock('# BOARD-X\n\nsome log entries\n'), null);
});

cell('the write path preserves CRLF, because boards are shared files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stateblock-'));
  const f = path.join(dir, 'b.md');
  const begin = '<!-- CURRENT-STATE-BLOCK:BEGIN -->';
  const end = '<!-- CURRENT-STATE-BLOCK:END -->';
  fs.writeFileSync(f, `# B\r\n\r\n${begin}\r\nold\r\n${end}\r\n\r\n- entry\r\n`);
  const text = fs.readFileSync(f, 'utf8');
  const block = findBlock(text);
  assert.ok(block && block.marked, 'markers must win when present, for the write path');
  const body = `${begin}\n## CURRENT STATE\nNot quotable: none\n${end}`;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const next = text.slice(0, block.from) + body.replace(/\r?\n/g, eol) + text.slice(block.to);
  fs.writeFileSync(f, next);
  const after = fs.readFileSync(f, 'utf8');
  assert.ok(!/[^\r]\n/.test(after), 'a bare LF appeared in a CRLF file');
  assert.match(after, /CURRENT STATE/);
});

cell('every lane board is in scope, or a green means one lane', () => {
  assert.equal(BOARDS.length, 5);
  for (const b of ['A', 'B', 'C', 'D', 'E']) {
    assert.ok(BOARDS.includes(`docs/plan3/board/BOARD-${b}.md`), `BOARD-${b} missing from scope`);
  }
});

// --- STATE-BLOCK-02: the file-scoped hole -------------------------------------

const FULL = '## CURRENT STATE — last updated 12:00+01:00 / 2026-08-03T11:00Z\n\nNot quotable: nothing.\n';
const stamp = new Date('2026-08-03T11:00:00Z');
const base = { present: true, body: FULL, stamp, committed: stamp, now };

cell('laneOfBoardPath: reads the lane from the board filename', () => {
  assert.equal(laneOfBoardPath('docs/plan3/board/BOARD-B.md'), 'B');
  assert.equal(laneOfBoardPath('docs/plan3/board/BOARD-e.md'), 'E');
  assert.equal(laneOfBoardPath('docs/plan3/board/MEASUREMENT-QUEUE.md'), null);
});

cell('DISCRIMINATING: a lane that worked elsewhere is STALE_LANE, where it used to be CURRENT', () => {
  // The exact hole. File-scoped inputs are all clean -- the board itself was committed
  // at the stamp -- and the old verdict returned CURRENT for precisely this shape.
  const activity = {
    lane: 'B', at: new Date('2026-08-03T14:26:00Z'), unattributedSince: 0, totalSince: 4,
  };
  const withActivity = verdict({ ...base, activity });
  const withoutActivity = verdict({ ...base, activity: null });
  assert.equal(withoutActivity.state, 'STATE_BLOCK_CURRENT', 'file-scoped alone still says CURRENT');
  assert.equal(withActivity.state, 'STATE_BLOCK_STALE_LANE');
  assert.equal(withActivity.ok, false);
  assert.match(withActivity.detail, /lane B committed elsewhere 206 min after/);
});

cell('a lane whose only commit is inside the grace window stays CURRENT', () => {
  const activity = {
    lane: 'B', at: new Date('2026-08-03T11:20:00Z'), unattributedSince: 0, totalSince: 1,
  };
  assert.equal(verdict({ ...base, activity }).state, 'STATE_BLOCK_CURRENT');
});

cell('DISCRIMINATING: untrailered commits after the stamp are UNPROVEN, not CURRENT', () => {
  const activity = { lane: 'D', at: null, unattributedSince: 7, totalSince: 7 };
  const result = verdict({ ...base, activity });
  assert.equal(result.state, 'STATE_BLOCK_STALENESS_UNPROVEN');
  assert.equal(result.ok, false, 'unproven must not read as a pass');
  assert.match(result.detail, /7 of 7 commit\(s\) since the stamp carry no Manager: trailer/);
  assert.match(result.detail, /cannot be determined/);
});

cell('ANTI-VACUITY: nothing committed after the stamp is provably CURRENT, not unproven', () => {
  // Without this branch the gate would red a quiet repository, and "always red" is as
  // uninformative as "always green".
  const activity = { lane: 'E', at: null, unattributedSince: 0, totalSince: 0 };
  const result = verdict({ ...base, activity });
  assert.equal(result.state, 'STATE_BLOCK_CURRENT');
  assert.equal(result.ok, true);
});

cell('a proven lane-stale board outranks the unprovable case', () => {
  // Both signals present: the lane has an attributable commit AND there are untrailered
  // ones. The provable finding must win, or a lane could bury a real stall in noise.
  const activity = {
    lane: 'B', at: new Date('2026-08-03T14:00:00Z'), unattributedSince: 9, totalSince: 12,
  };
  assert.equal(verdict({ ...base, activity }).state, 'STATE_BLOCK_STALE_LANE');
});

cell('file-scoped staleness still wins over lane-scoped, since it is the narrower fact', () => {
  const activity = {
    lane: 'B', at: new Date('2026-08-03T14:00:00Z'), unattributedSince: 0, totalSince: 3,
  };
  const result = verdict({
    ...base, committed: new Date('2026-08-03T14:30:00Z'), activity,
  });
  assert.equal(result.state, 'STATE_BLOCK_STALE');
});

cell('laneActivity: counts only commits strictly after the stamp, and splits attributed from not', () => {
  const rec = (iso, body) => `${iso}\u001f${body}\u001e`;
  const run = () => [
    rec('2026-08-03T14:00:00Z', 'feat: mine\n\nManager: B\n'),
    rec('2026-08-03T13:00:00Z', 'feat: someone\n'),
    rec('2026-08-03T12:30:00Z', 'feat: another lane\n\nManager: D\n'),
    rec('2026-08-03T10:00:00Z', 'feat: before the stamp\n\nManager: B\n'),
  ].join('');
  const activity = laneActivity({ lane: 'B', since: stamp, run });
  assert.equal(activity.totalSince, 3, 'the pre-stamp commit is out of scope');
  assert.equal(activity.unattributedSince, 1);
  assert.equal(activity.at.toISOString(), '2026-08-03T14:00:00.000Z');
});

cell('laneActivity: another lane\'s trailer is neither this lane\'s work nor unattributed', () => {
  const run = () => `2026-08-03T14:00:00Z\u001ffeat: D's work\n\nManager: D\n\u001e`;
  const activity = laneActivity({ lane: 'B', since: stamp, run });
  assert.equal(activity.at, null, 'B did not commit');
  assert.equal(activity.unattributedSince, 0, 'and D\'s commit is attributed, just not to B');
  assert.equal(activity.totalSince, 1);
});

cell('laneActivity: a git failure does not fabricate a clean history', () => {
  const activity = laneActivity({ lane: 'B', since: stamp, run: () => { throw new Error('no git'); } });
  assert.equal(activity.failed, true);
  assert.equal(activity.at, null);
  assert.equal(activity.totalSince, 0);
});

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

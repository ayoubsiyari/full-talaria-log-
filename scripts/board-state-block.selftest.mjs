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
  BOARDS, findBlock, stampOf, verdict,
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

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

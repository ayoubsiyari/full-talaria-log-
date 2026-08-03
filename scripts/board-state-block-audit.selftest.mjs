#!/usr/bin/env node
/**
 * Cells for BOARD-STATE-01. The distinctions being defended are the four states:
 * a board with no block, a block never wired to the check, a block that has gone
 * stale, and a current one. Collapsing any two of them reproduces the failure the
 * gate exists to catch.
 */

import assert from 'node:assert/strict';
import { auditText, fixText } from './board-state-block-audit.mjs';

let pass = 0; let fail = 0;
const results = [];
function test(name, fn) {
  try { fn(); pass++; results.push(['PASS', name]); } catch (e) { fail++; results.push(['FAIL', name, e.message]); }
}

const board = ({ marker = null, entries = 0, extraSection = false, heading = true } = {}) => [
  '# BOARD-X — manager X',
  '',
  '**One writer: X.**',
  '',
  '---',
  '',
  ...(heading ? [
    '## CURRENT STATE — X\'s lane · maintained in place · last updated 09:00+01:00',
    '',
    ...(marker === null ? [] : [`<!-- STATE-BLOCK-FRESHNESS entriesBelow=${marker} -->`]),
    '',
    '| row | value | grade |',
    '|---|---|---|',
    '| a thing | **12 MB** | `MEASURED` |',
    '',
    // A clocked bullet INSIDE the block: state blocks quote the entries they
    // summarise, and counting from the top of the file would inflate the tally
    // with the block's own prose.
    '- 07:00+01:00 · X · a line the block quotes from an entry below it',
    '',
  ] : []),
  ...(extraSection ? ['## PINNED — something else', '', '- 08:00+01:00 a pinned note', ''] : []),
  '---',
  '',
  ...Array.from({ length: entries }, (_v, i) => `- 1${i}:00+01:00 · X · an appended entry`),
  // A bullet below the block with no clock: prose, not an entry. Without the
  // offset in the pattern this would be counted and every board would read stale.
  '- a plain bullet that is prose rather than a dated entry',
  '',
].join('\n');

test('a board whose marker matches the entries below it is current', () => {
  const v = auditText(board({ marker: 3, entries: 3 }));
  assert.equal(v.state, 'STATE_BLOCK_CURRENT');
  assert.equal(v.entriesBelow, 3);
});

test('entries appended without refreshing the block are STALE, with the count', () => {
  const v = auditText(board({ marker: 3, entries: 7 }));
  assert.equal(v.state, 'STATE_BLOCK_STALE');
  assert.equal(v.delta, 4);
  assert.match(v.why, /4 entries have been appended/);
  assert.match(v.why, /reads as current and is not/);
});

test('one appended entry reads as singular, because a gate people ignore is a gate that reads badly', () => {
  const v = auditText(board({ marker: 3, entries: 4 }));
  assert.match(v.why, /1 entry has been appended/);
});

test('a block never wired to the check is FRESHNESS_MARKER_ABSENT, not STALE', () => {
  // The distinction that matters: nothing to refresh versus something to refresh.
  const v = auditText(board({ marker: null, entries: 5 }));
  assert.equal(v.state, 'FRESHNESS_MARKER_ABSENT');
  assert.equal(v.entriesBelow, 5);
  assert.match(v.why, /currency is a claim rather than a check/);
});

test('a board with no state block at all is named as such', () => {
  const v = auditText(board({ heading: false, entries: 9 }));
  assert.equal(v.state, 'STATE_BLOCK_ABSENT');
  assert.match(v.why, /what happened, not what is true/);
});

test('the block\'s own rows are never counted, even a clocked line it quotes', () => {
  // The fixture's block contains `- 07:00+01:00 …`. Counting from the top of the
  // file rather than from the end of the block would make every board stale by
  // one, permanently and invisibly.
  const v = auditText(board({ marker: 0, entries: 0 }));
  assert.equal(v.state, 'STATE_BLOCK_CURRENT', `the block's own clocked line was counted: ${JSON.stringify(v)}`);
  assert.equal(v.entriesBelow, 0);
});

test('a bullet with no clock below the block is prose, not an entry', () => {
  // The fixture always appends one unclocked bullet below the rule. If the entry
  // pattern loses its offset requirement, this counts and the board reads stale
  // with no way for a writer to satisfy it.
  const v = auditText(board({ marker: 2, entries: 2 }));
  assert.equal(v.state, 'STATE_BLOCK_CURRENT', `an unclocked bullet was counted as an entry: ${JSON.stringify(v)}`);
  assert.equal(v.entriesBelow, 2);
});

test('a second section below the block does not have its notes counted as A\'s entries', () => {
  // extraSection contributes one `- 08:00+01:00` line ABOVE the closing rule.
  // It sits outside the state block, so it counts once and only once.
  const withSection = auditText(board({ marker: 4, entries: 3, extraSection: true }));
  assert.equal(withSection.state, 'STATE_BLOCK_CURRENT', `expected the pinned note to count exactly once, got ${JSON.stringify(withSection)}`);
});

test('--fix rewrites the marker and the stamp together, never one alone', () => {
  const before = board({ marker: 3, entries: 7 });
  const at = new Date('2026-08-03T18:31:00Z');
  const out = fixText(before, at);
  assert.equal(out.changed, true);
  assert.equal(out.entriesBelow, 7);
  assert.match(out.text, /entriesBelow=7/);
  assert.ok(!/last updated 09:00\+01:00/.test(out.text), 'the stamp must move with the count');
  assert.match(out.text, /last updated \d{1,2}:\d{2}[+-]\d{2}:\d{2}/);
  assert.equal(auditText(out.text).state, 'STATE_BLOCK_CURRENT');
});

test('--fix inserts a marker into a block that never had one', () => {
  const out = fixText(board({ marker: null, entries: 2 }));
  assert.match(out.text, /entriesBelow=2/);
  assert.equal(auditText(out.text).state, 'STATE_BLOCK_CURRENT');
});

test('--fix on a board with no block changes nothing rather than inventing one', () => {
  const before = board({ heading: false, entries: 2 });
  const out = fixText(before);
  assert.equal(out.changed, false);
  assert.equal(out.text, before);
});

for (const [state, name, why] of results) {
  console.log(`  ${state}  ${name}${why ? `\n        ${why}` : ''}`);
}
console.log(`\n  ${pass}/${pass + fail} cells`);
process.exitCode = fail ? 1 : 0;

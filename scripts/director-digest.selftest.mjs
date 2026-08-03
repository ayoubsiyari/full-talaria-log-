#!/usr/bin/env node
/**
 * PROGRESS-ATTRIB-01 selftest.
 *
 * The defect under test is one the Director steered off all day: any commit or
 * board line containing an item's tag advanced that item, while the item's owner
 * came from a static table. One lane's commit cleared another lane's stall.
 *
 * Every cell drives the pure `classifyProgress` on fixtures, so the RED paths are
 * reachable without arranging a repository, a clock, or a real stall. The two cells
 * that matter most are the DISCRIMINATING one (the old bug, now caught) and the
 * ANTI-VACUITY one (the new state cannot swallow real owner progress).
 */
import assert from 'node:assert/strict';

import {
  classifyProgress, laneOfCommit, laneOfBoardLine, STALL_MINUTES,
} from './director-digest.mjs';

let pass = 0;
let fail = 0;
const cell = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); pass += 1; } catch (err) {
    console.log(`  FAIL  ${name}\n        ${err.message.split('\n')[0]}`);
    fail += 1;
  }
};

const NOW = Date.parse('2026-08-03T20:00:00Z');
const minsAgo = (m) => NOW - m * 60000;
const ITEM = { id: 7, tag: 'COV-01', alt: ['coverage calibration'], owner: 'C' };

const sig = (over = {}) => ({
  at: minsAgo(5), text: 'cov-01 basis finding', lane: 'C', source: 'commit', ...over,
});

console.log('PROGRESS-ATTRIB-01 selftest\n');

// ------------------------------------------------------------ commit attribution

cell('laneOfCommit: reads a Manager: trailer, case-insensitively, and Director', () => {
  assert.equal(laneOfCommit('body text\n\nManager: C\nRow: 4\n'), 'C');
  assert.equal(laneOfCommit('Manager: e'), 'E');
  assert.equal(laneOfCommit('Manager: Director'), 'Director');
});

cell('laneOfCommit: absent, malformed, or non-lane trailer is null, never a guess', () => {
  assert.equal(laneOfCommit('no trailer at all'), null);
  assert.equal(laneOfCommit('Manager: Z'), null, 'Z is not a lane');
  assert.equal(laneOfCommit('Manager: C and D'), null, 'ambiguous is unattributed, not C');
  assert.equal(laneOfCommit(''), null);
  assert.equal(laneOfCommit(undefined), null);
});

cell('DISCRIMINATING: a subject prefix is NOT authorship — board(C): names the recipient', () => {
  // This is the inversion trap. `board(C): ...` is nearly always a different lane
  // leaving C a note, so reading it as authorship would credit C for another
  // lane's work -- the very bug being removed, re-entered through a side door.
  assert.equal(laneOfCommit('board(C): COV-01 basis finding, E\'s handoff wired'), null);
  assert.equal(laneOfCommit('BOARD-A: the lost slot, and B\'s trap reproduced'), null);
  assert.equal(laneOfCommit('soak(C): ARM-EQUALITY-01'), null);
});

// ------------------------------------------------------------- board attribution

cell('laneOfBoardLine: reads the · X · marker on a stamped entry heading', () => {
  assert.equal(laneOfBoardLine('- 18:36+01:00 · B · THE CENSUS RAN'), 'B');
  assert.equal(laneOfBoardLine('- 09:41+01:00 · C · arena columns landed'), 'C');
  assert.equal(laneOfBoardLine('  - 21:00:05+01:00 · A · run-lock closed'), 'A');
});

cell('laneOfBoardLine: a cross-lane note keeps the AUTHOR, not the addressee', () => {
  // `· B → A ·` is B writing to A. The author is B.
  assert.equal(laneOfBoardLine('- 18:36+01:00 · B → A · a trap in run-lock'), 'B');
});

cell('laneOfBoardLine: unmarked line is null — which file it is in is not who wrote it', () => {
  assert.equal(laneOfBoardLine('- 18:36+01:00 the census ran'), null);
  assert.equal(laneOfBoardLine('- some prose without a stamp'), null);
  assert.equal(laneOfBoardLine(''), null);
});

// ------------------------------------------------------------------- the verdict

cell('PROGRESS: the owner has a signal inside the window', () => {
  const r = classifyProgress({ item: ITEM, signals: [sig()], now: NOW });
  assert.equal(r.state, 'PROGRESS');
  assert.equal(r.mins, 5);
  assert.equal(r.stalled, false);
  assert.equal(r.unattributed, null);
});

cell('STALLED: the owner\'s newest signal is older than the threshold', () => {
  const r = classifyProgress({ item: ITEM, signals: [sig({ at: minsAgo(200) })], now: NOW });
  assert.equal(r.state, 'STALLED');
  assert.equal(r.stalled, true);
  assert.ok(r.mins > STALL_MINUTES);
});

cell('NOT_STARTED: no signal names the tag at all', () => {
  const r = classifyProgress({
    item: ITEM, signals: [sig({ text: 'unrelated work', lane: 'C' })], now: NOW,
  });
  assert.equal(r.state, 'NOT_STARTED');
  assert.equal(r.unattributed, null);
});

cell('DISCRIMINATING: another lane\'s commit on C\'s tag does NOT read as C\'s progress', () => {
  // The exact bug. Before this change, D's commit mentioning COV-01 set C's item
  // to 5 minutes and the Director read C as on pace.
  const r = classifyProgress({
    item: ITEM, signals: [sig({ lane: 'D' })], now: NOW,
  });
  assert.equal(r.state, 'PROGRESS_UNATTRIBUTED');
  assert.equal(r.stalled, false, 'not stalled either — it is a question, not a verdict');
  assert.equal(r.at, 0, 'no owner-attributed instant exists, so none is published');
  assert.match(r.unattributed.why, /attributed to D, not owner C/);
});

cell('DISCRIMINATING: an unattributable commit does not clear an existing stall', () => {
  // Owner progress 200m old, plus an unattributed touch 2m ago. The stall stands
  // and the recent touch is carried alongside it rather than replacing it.
  const r = classifyProgress({
    item: ITEM,
    signals: [sig({ at: minsAgo(200), lane: 'C' }), sig({ at: minsAgo(2), lane: null })],
    now: NOW,
  });
  assert.equal(r.state, 'STALLED', 'the recent unattributed touch must not rescue the item');
  assert.equal(r.mins, 200, 'the published age is the OWNER\'s, not the anonymous one');
  assert.ok(r.unattributed, 'but the touch is disclosed');
  assert.equal(Math.round((NOW - r.unattributed.at) / 60000), 2);
  assert.match(r.unattributed.why, /no Manager: trailer or board · marker/);
});

cell('a null lane and a wrong lane are DIFFERENT facts, and say so', () => {
  const anon = classifyProgress({ item: ITEM, signals: [sig({ lane: null })], now: NOW });
  const other = classifyProgress({ item: ITEM, signals: [sig({ lane: 'E' })], now: NOW });
  assert.equal(anon.state, 'PROGRESS_UNATTRIBUTED');
  assert.equal(other.state, 'PROGRESS_UNATTRIBUTED');
  assert.match(anon.unattributed.why, /cannot be tied to C/);
  assert.match(other.unattributed.why, /attributed to E/);
  assert.notEqual(anon.unattributed.why, other.unattributed.why);
});

cell('ANTI-VACUITY: the new state cannot swallow real owner progress', () => {
  // Same fixture as the discriminating cell, with the owner's own signal added.
  // If PROGRESS_UNATTRIBUTED could win here, the change would have replaced
  // over-crediting with under-crediting everything.
  const r = classifyProgress({
    item: ITEM,
    signals: [sig({ lane: 'D', at: minsAgo(1) }), sig({ lane: 'C', at: minsAgo(9) })],
    now: NOW,
  });
  assert.equal(r.state, 'PROGRESS', 'the owner worked 9m ago; a foreign mention 1m ago is irrelevant');
  assert.equal(r.mins, 9);
  assert.ok(r.unattributed, 'the foreign mention is still disclosed, not hidden');
});

cell('ANTI-VACUITY: owner attribution via a BOARD marker counts, not just commits', () => {
  const r = classifyProgress({
    item: ITEM,
    signals: [sig({ lane: 'C', source: 'board', at: minsAgo(30) })],
    now: NOW,
  });
  assert.equal(r.state, 'PROGRESS');
  assert.equal(r.source, 'board');
});

cell('alt tags are matched, and matching is case-insensitive on the fixture text', () => {
  const r = classifyProgress({
    item: ITEM,
    signals: [sig({ text: 'coverage calibration basis corrected', lane: 'C' })],
    now: NOW,
  });
  assert.equal(r.state, 'PROGRESS');
});

cell('the newest OWNER signal wins, not the newest signal overall', () => {
  const r = classifyProgress({
    item: ITEM,
    signals: [
      sig({ lane: 'C', at: minsAgo(50) }),
      sig({ lane: 'C', at: minsAgo(10) }),
      sig({ lane: 'B', at: minsAgo(1) }),
    ],
    now: NOW,
  });
  assert.equal(r.mins, 10);
});

cell('Director commits do not count as a lane\'s progress', () => {
  const r = classifyProgress({ item: ITEM, signals: [sig({ lane: 'Director' })], now: NOW });
  assert.equal(r.state, 'PROGRESS_UNATTRIBUTED');
  assert.match(r.unattributed.why, /attributed to Director, not owner C/);
});

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

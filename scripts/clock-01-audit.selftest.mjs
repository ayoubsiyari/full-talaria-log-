/**
 * CLOCK-01 audit selftest.
 *
 * Every case here is one the audit got wrong on a real file first. It flagged
 * fractional ISO stamps, it read the digits of `+01:00` as a time and would have
 * stamped an offset onto an offset, it flagged a session boundary written in an
 * IANA zone, and its --fix pass truncated `09:59:48Z` into `09:59+01:00:48Z` by
 * backtracking over a word boundary. The gate exists to stop bare numbers; a
 * gate that mangles stamped ones would cost more than the gap.
 *
 * CLOCK-01-EXEMPT-FILE: fixtures. A cell proving a bare number is caught has to
 * contain one, so stamping these would assert the opposite of their intent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fileURLToPath, pathToFileURL } from 'node:url';

import { DEFAULT_FILES, REPO_ROOT, fixFile, scanText } from './clock-01-audit.mjs';
import { clockOf, offsetOf, stampLocal, stampUtc, both, localToStamped } from './lib/clock.mjs';

const bare = (text) => scanText(text).findings.map((f) => f.token);
const HERE = path.dirname(fileURLToPath(import.meta.url));

test('a bare time of day is caught', () => {
  assert.deepEqual(bare('started 12:18:54 and ended 12:27'), ['12:18:54', '12:27']);
});

test('a stated offset or zone is accepted in every form we actually write', () => {
  for (const line of [
    '- 12:47+01:00 · A · entry heading',
    'builtAt 09:59:48Z',
    'at 2026-08-02T09:15:33.171Z',
    'crosshair read 16:04 EST',
    'FX opens at **17:00 America/New_York**',
    'the cut at 12:21 UTC',
    'held since 13:00 local',
  ]) assert.deepEqual(bare(line), [], line);
});

test('REGRESSION: seconds before a Z are part of the token, not left behind', () => {
  // The backtracking bug. If this returns ['09:59'] the --fix pass will write
  // 09:59+01:00:48Z into somebody's evidence line.
  assert.deepEqual(bare('builtAt 09:59:48Z'), []);
  assert.deepEqual(scanText('x 11:26:31Z y').total, 1);
});

test('REGRESSION: the digits of an offset are not a second time', () => {
  const r = scanText('- 11:08+01:00 · B → A · text');
  assert.deepEqual(r.findings, []);
  // Two tokens are seen (11:08 and 01:00); neither is reported.
  assert.equal(r.total, 2);
});

test('non-clocks are left alone', () => {
  assert.deepEqual(bare('replay-system.js 5576:5670'), []);
  assert.deepEqual(bare('aspect ratio 4:3'), []);
  assert.deepEqual(bare('L298/L356'), []);
});

test('a bare number inside an otherwise stamped line is still caught', () => {
  // The commonest real shape: entry heading stamped, prose inside it not.
  const r = scanText('- 12:47+01:00 · A → C · two suites landed at 12:18:54 and 12:19:47');
  assert.deepEqual(r.findings.map((f) => f.token), ['12:18:54', '12:19:47']);
});

test('fixFile stamps only the bare numbers and leaves stamped ones untouched', async () => {
  const { fixFile, REPO_ROOT } = await import('./clock-01-audit.mjs');
  const rel = path.join('.scratch', `clock-fix-${process.pid}.md`);
  const abs = path.join(REPO_ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, [
    '- 12:47+01:00 · A · started 12:04:34, builtAt 09:59:48Z, opens 17:00 America/New_York',
    'nothing time-like here',
  ].join('\n'));
  try {
    const changed = fixFile(rel, '+01:00');
    const out = fs.readFileSync(abs, 'utf8');
    assert.equal(changed.length, 1);
    assert.match(out, /started 12:04:34\+01:00/);
    assert.match(out, /builtAt 09:59:48Z/);
    assert.match(out, /opens 17:00 America\/New_York/);
    assert.doesNotMatch(out, /\+01:00\+01:00/);
    // Idempotent: a second pass must not double-stamp.
    assert.equal(fixFile(rel, '+01:00').length, 0);
  } finally { fs.rmSync(abs, { force: true }); }
});

test('REGRESSION: describing the exemption marker does not grant it', () => {
  // My own commit message documented the marker mid-sentence and thereby exempted
  // itself, so the message's real bare numbers went unreported.
  const prose = 'declare it with CLOCK-01-EXEMPT-FILE: <why> at the top.\nstarted 12:04';
  const r = scanText(prose);
  assert.equal(r.exemptFile, undefined);
  assert.deepEqual(r.findings.map((f) => f.token), ['12:04']);
  // Anchored at the start of a line, with or without comment punctuation, it holds.
  assert.equal(scanText(' * CLOCK-01-EXEMPT-FILE: fixtures\nstarted 12:04').exemptFile, 'fixtures');
  // Line scope is unanchored on purpose: a board entry opens with its own stamp,
  // and the exemption reaches no further than the line it sits on.
  assert.deepEqual(scanText('- 13:49+01:00 · A · CLOCK-01-EXEMPT quoting bytes: 09:59').findings, []);
  assert.deepEqual(
    scanText('- 13:49+01:00 · A · CLOCK-01-EXEMPT quotes 09:59\n- 13:50+01:00 · A · started 12:04')
      .findings.map((f) => f.token),
    ['12:04'], 'a line-scoped exemption must not leak to the next line');
});

test('scanText counts what it looked at, so a clean file is distinguishable from an empty one', () => {
  assert.equal(scanText('no times at all').total, 0);
  assert.equal(scanText('12:00Z').total, 1);
});

// --- the emitters -----------------------------------------------------------

test('offsetOf returns Z or a signed offset, never a bare number', () => {
  assert.match(offsetOf(new Date()), /^(?:Z|[+-]\d{2}:\d{2})$/);
});

test('every emitter produces something the audit accepts', () => {
  const now = new Date();
  for (const s of [stampUtc(now), stampLocal(now), clockOf(now), clockOf(now, { seconds: true }), both(now)]) {
    assert.deepEqual(bare(s), [], s);
  }
});

test('localToStamped returns null on absent input rather than inventing now', () => {
  assert.equal(localToStamped(null), null);
  assert.equal(localToStamped('not a date'), null);
  assert.match(localToStamped('2026-08-03T12:04:34Z'), /Z$/);
});

// ---------------------------------------------------------------------------
// B's cells. Both are defects found by running this gate over BOARD-B.md.
// ---------------------------------------------------------------------------

test("B: a SLASH-SEPARATED LIST of times — every member is checked, not just the first", () => {
  // The gate read this line as CLOCK_OK. `11:16:55+01:00 / 11:21:12 / …` leaves
  // each later number preceded by `…:00 / `, which is the same shape as a ratio's
  // left-hand side, so the numeric-pair excuse swallowed all of them. Four
  // timestamps, three of them bare, reported clean — on a line whose whole purpose
  // was proving where I was during E's lost run.
  assert.deepEqual(
    bare('probes were 11:16:55+01:00 / 11:21:12 / 11:23:49 / 11:25:46 local'),
    ['11:21:12', '11:23:49'],
    'a list of timestamps must be checked per member; 11:25:46 is declared by the trailing "local"',
  );
  assert.deepEqual(bare('probes were 11:21:12 / 11:23:49'), ['11:21:12', '11:23:49']);
  assert.deepEqual(bare('window 09:03:21 : 09:48:44'), ['09:03:21', '09:48:44']);
  // And the excuse still does its job where nothing time-like precedes it.
  assert.deepEqual(bare('anchors at lines 5576:5670'), []);
  assert.deepEqual(bare('a 4:1 ratio'), []);
  assert.deepEqual(bare('ratio 12:30'), []);
  assert.deepEqual(bare('ports 8080:3000 mapped'), []);
});

test('B: the fixer stamps exactly what the gate reports, because two copies disagreed', () => {
  // Not a style point. fixFile re-tested OFFSET_AFTER and NOT_A_CLOCK itself, so
  // when the narrowing above landed in scanText the gate found three bare numbers
  // and the fixer stamped none, printing `stamped 0` — indistinguishable from
  // "nothing needed". A fixer that silently declines is worse than no fixer,
  // because the operator reads the summary and stops looking.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clock-fix-'));
  const rel = path.relative(REPO_ROOT, path.join(dir, 'subject.md'));
  const subject = [
    'probes were 11:16:55+01:00 / 11:21:12 / 11:23:49 local',
    'commit at 10:13 and the build at 10:15',
    'anchors at lines 5576:5670 and a 4:1 ratio',
  ].join('\n');
  try {
    fs.writeFileSync(path.join(dir, 'subject.md'), subject);
    const expected = scanText(subject).findings.length;
    assert.equal(expected, 3, 'fixture should present exactly three bare numbers');

    const changed = fixFile(rel, '+01:00');
    assert.ok(changed.length > 0, 'the fixer reported no changes while the gate reported three');

    const after = fs.readFileSync(path.join(dir, 'subject.md'), 'utf8');
    assert.deepEqual(scanText(after).findings.map((f) => f.token), [],
      `fixer left bare numbers the gate can still see: ${after}`);
    // It must not have touched what was never a clock, nor doubled an offset.
    assert.match(after, /5576:5670/);
    assert.match(after, /4:1 ratio/);
    assert.doesNotMatch(after, /\+01:00\+01:00/);
    assert.match(after, /11:16:55\+01:00/, 'an already-stamped number must be left alone');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B: ANTI-VACUITY — restoring the pair excuse un-narrowed makes the list cell fail', () => {
  // If the list cell passes against a scanner that still excuses everything after
  // a separator, it is testing its own expectations rather than the narrowing.
  const src = fs.readFileSync(path.join(HERE, 'clock-01-audit.mjs'), 'utf8');
  const anchor = 'const inAList = LIST_OF_TIMES.test(before);';
  assert.ok(src.includes(anchor), 'mutation anchor not found — fix the arm before trusting it');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clock-mutant-'));
  try {
    const file = path.join(dir, 'clock-01-audit.mjs');
    fs.writeFileSync(file, src.replace(anchor, 'const inAList = false;'));
    return import(pathToFileURL(file).href).then((mut) => {
      const found = mut.scanText('probes were 11:16:55+01:00 / 11:21:12 / 11:23:49 local').findings;
        assert.equal(found.length, 0,
          'the un-narrowed scanner should reproduce the original false green; if it '
          + 'does not, the list cell is not bound to this narrowing');
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

test('B: the default scope covers every lane board, or a green means one lane', () => {
  // The rule is repo-wide and boards are the surface it names first. While the
  // default was A-lane only, `gate:clock-01` could read green with 32 bare numbers
  // sitting on D's and E's boards. A gate whose scope is narrower than its rule is
  // the same failure as one that never executes: indistinguishable from a pass in
  // every sweep summary we have.
  const boards = fs.readdirSync(path.join(REPO_ROOT, 'docs/plan3/board'))
    .filter((n) => /^BOARD-[A-Z]\.md$/.test(n))
    .map((n) => `docs/plan3/board/${n}`);
  assert.ok(boards.length >= 5, `expected the five lane boards, found ${boards.length}`);
  const missing = boards.filter((b) => !DEFAULT_FILES.includes(b));
  assert.deepEqual(missing, [],
    `outside the default scope, so a green says nothing about them: ${missing.join(', ')}`);
});

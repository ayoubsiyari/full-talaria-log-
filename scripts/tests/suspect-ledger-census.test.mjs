/**
 * Selftest for suspect-ledger-census.
 *
 * The instrument's whole claim is that it can tell ABSENT from STATED from ILLEGAL_OPEN.
 * An instrument that reports "0 absent" is worthless unless it demonstrably reports
 * non-zero on a ledger with a known hole -- that is the anti-vacuity requirement this
 * project applies to every other lane's gates, and it applies to mine.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS_MAP, CURATED, parseTicketLedger, axesOf, ledgerStates, seatAudit, idsIn,
  stateOfLine, assertingLines, statesForId,
} from '../suspect-ledger-census.mjs';

test('idsIn finds each id shape, and does not invent ids', () => {
  assert.deepEqual([...idsIn('fixed TAL-01696 today')], ['TAL-01696']);
  assert.deepEqual([...idsIn('Rayan #8 and Rayan #11')], ['Rayan #8', 'Rayan #11']);
  assert.deepEqual([...idsIn('E-SUS-04 hoard')], ['E-SUS-04']);
  assert.deepEqual([...idsIn('LAG-1a and MEM-1c')], ['LAG-1a', 'MEM-1c']);
  // Not an id shape: a bare four-digit number, or a policy name.
  assert.equal(idsIn('BIND-01 governs this, see 4297').size, 0);
});

test('ledgerStates reads the asserted state per id', () => {
  const led = [
    '| TAL-01696 | **OPEN** | packet |',
    '| TAL-01617 | **CLEARED** | PO signed |',
    '| E-SUS-04 | **DEFERRED** | seat |',
    '| LAG-1a | **KILLED** | PROC-3 GREEN |',
  ].join('\n');
  const s = ledgerStates(led);
  assert.deepEqual(s.get('TAL-01696').map((x) => x.state), ['OPEN']);
  assert.deepEqual(s.get('TAL-01617').map((x) => x.state), ['CLEARED']);
  assert.deepEqual(s.get('E-SUS-04').map((x) => x.state), ['DEFERRED']);
  assert.deepEqual(s.get('LAG-1a').map((x) => x.state), ['KILLED']);
});

test('DISCRIMINATING: an id in no row is absent, and the same id in a row is not', () => {
  const withHole = '| TAL-01696 | **KILLED** | x |';
  assert.equal(ledgerStates(withHole).has('TAL-09999'), false, 'unmentioned id must be absent');
  const patched = `${withHole}\n| TAL-09999 | **CLEARED** | y |`;
  assert.equal(ledgerStates(patched).has('TAL-09999'), true, 'once stated it must stop being absent');
  // Anti-vacuity: the fixture really does assert something, so the negative is meaningful.
  assert.equal(ledgerStates(withHole).get('TAL-01696')[0].state, 'KILLED');
});

test('DISCRIMINATING: two states on one id are visible, because the law says exactly one', () => {
  const led = [
    '| TAL-01865 | **OPEN** | owner-blocked |',
    '| TAL-01865-VIEWPORT-CONSUMER | **KILLED** | landed |',
  ].join('\n');
  const states = ledgerStates(led).get('TAL-01865').map((x) => x.state);
  assert.deepEqual([...new Set(states)].sort(), ['KILLED', 'OPEN']);
});

test('parseTicketLedger reads id/status/commit/gate and skips header and rule rows', () => {
  const t = [
    '| Ticket | Status | Commit | Gate | Note |',
    '| --- | --- | --- | --- | --- |',
    '| TAL-01930 | fixed | `42d01a1dc` | GREEN: some.test.mjs | note |',
    'not a table row',
    '| TAL-01891 | broken | — | — | live |',
  ].join('\n');
  const rows = parseTicketLedger(t);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, 'TAL-01930');
  assert.equal(rows[0].status, 'fixed');
  assert.equal(rows[1].status, 'broken');
});

test('axesOf separates the four KILLED axes and does not conflate them', () => {
  const full = axesOf({ commit: '`abc1234`', gate: 'GREEN: x.test.mjs', note: 'kill `__TALARIA_DISABLE_X_V1`' });
  assert.deepEqual(full, { commit: true, gate: true, green: true, killSwitch: true });

  // A commit and a gate, but NO switch recorded. This is the real shape of 48 rows and
  // it must not read as fully evidenced.
  const noSwitch = axesOf({ commit: '`abc1234`', gate: 'GREEN: x.test.mjs', note: 'nothing' });
  assert.equal(noSwitch.killSwitch, false, 'absent switch must be false, not assumed');
  assert.equal(noSwitch.green, true);

  // A gate cell that exists but asserts nothing green.
  const notGreen = axesOf({ commit: '`abc`', gate: 'RED local: repro.test.mjs', note: '' });
  assert.equal(notGreen.gate, true);
  assert.equal(notGreen.green, false, 'a RED gate is not a green gate');

  // Em-dash placeholders are absence, not content.
  const none = axesOf({ commit: '—', gate: '—', note: '' });
  assert.deepEqual(none, { commit: false, gate: false, green: false, killSwitch: false });
});

test('the status map covers every status the real ticket ledger uses', async () => {
  const fs = await import('node:fs');
  const rows = parseTicketLedger(fs.readFileSync('docs/plan3/TICKET-STATUS-LEDGER-20260729.md', 'utf8'));
  assert.ok(rows.length > 100, 'fixture sanity: the real ledger has many rows');
  const unmapped = [...new Set(rows.map((r) => r.status.toLowerCase()))].filter((s) => !STATUS_MAP[s]);
  assert.deepEqual(unmapped, [], `every status needs a rule; unmapped: ${unmapped.join(', ')}`);
});

test('unsafe mappings are marked unsafe, so they cannot be applied silently', () => {
  for (const s of ['broken', 'verify-gone', 'scoped']) {
    assert.equal(STATUS_MAP[s].safe, false, `${s} must require an individual statement`);
  }
  for (const s of ['fixed', 'superseded', 'po-eyes', 'owner-blocked']) {
    assert.equal(STATUS_MAP[s].safe, true);
  }
  // No status may map to OPEN: the law removed it.
  const states = new Set(Object.values(STATUS_MAP).map((m) => m.state));
  assert.deepEqual([...states].sort(), ['CLEARED', 'DEFERRED', 'KILLED']);
});

test('DISCRIMINATING: seatAudit reports a cited seat that does not exist, and stops once it does', () => {
  const led = '| E-SUS-03 | **DEFERRED** | `POST-SOAK-LEDGER-E-01` | |';
  assert.deepEqual(seatAudit(led, '# empty ledger').dangling, ['POST-SOAK-LEDGER-E-01']);
  // Seat now present under its own heading -> no longer dangling.
  const withSeat = '### PSL-10\ntext\nPOST-SOAK-LEDGER-E-01 is seated here';
  assert.deepEqual(seatAudit(led, withSeat).dangling, []);
  // Anti-vacuity: the audit really did parse a citation.
  assert.deepEqual(seatAudit(led, '# empty').cited, ['POST-SOAK-LEDGER-E-01']);
});

test('the curated control list is non-empty and contains the PO-named items', () => {
  assert.ok(CURATED.length >= 16);
  const ids = CURATED.map((c) => c.id);
  for (const id of ['SHELL-PLAY-01', 'REPLAY-4297-PRODUCT', 'HOARD-FLOOR-CURVE', 'SECOND-GPU-BOX', 'R7-MACHINE-COVERAGE-BACKFILL']) {
    assert.ok(ids.includes(id), `${id} must be in the population`);
  }
  // Every curated control must carry an anchor, or it is matched on a handle nobody wrote.
  for (const c of CURATED) {
    assert.equal(typeof c.anchor, 'string');
    assert.ok(c.anchor.length > 3, `${c.id} needs a real anchor`);
  }
});

test('DISCRIMINATING: a bold status outranks a state word used in prose', () => {
  // The exact line that broke this: a DEFERRED row explaining why it is not KILLED.
  const line = '| 1 | **SHELL-PLAY-01** | **DEFERRED** | A fix with no mechanism is not a fix, so this cannot be KILLED. |';
  assert.equal(stateOfLine(line), 'DEFERRED', 'bold assertion must win over prose');
  // Anti-vacuity: with no bold marker, the bare word is still read, so the fallback works.
  assert.equal(stateOfLine('| x | this row is KILLED outright |'), 'KILLED');
  // And a backticked state is a quotation, not an assertion, so it is ignored entirely.
  assert.equal(stateOfLine('| TAL-01 | `OPEN` | **KILLED** | restated |'), 'KILLED');
  assert.equal(stateOfLine('| TAL-02 | was `OPEN` before |'), null, 'a quoted state alone asserts nothing');
});

test('DISCRIMINATING: a curated control is found by its anchor, and a broken anchor reports absence', () => {
  const led = '| 9 | **The second GPU box** | **DEFERRED** | `PSL-30` | not located |';
  const lines = assertingLines(led);
  const states = ledgerStates(led);
  // Bound anchor -> stated.
  assert.deepEqual(statesForId('second GPU box', states, lines).map((s) => s.state), ['DEFERRED']);
  // The handle itself appears nowhere, which is exactly why anchors exist.
  assert.deepEqual(statesForId('SECOND-GPU-BOX', states, lines), []);
  // A reworded row breaks the anchor and must report absence loudly rather than pass.
  const reworded = '| 9 | **A second graphics host** | **DEFERRED** | `PSL-30` | not located |';
  assert.deepEqual(statesForId('second GPU box', ledgerStates(reworded), assertingLines(reworded)), []);
});

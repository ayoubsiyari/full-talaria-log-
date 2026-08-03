#!/usr/bin/env node
/**
 * SUSPECT-LEDGER-CENSUS — does every named thing this campaign raised appear in the
 * suspect ledger, in exactly one of three states?
 *
 * The law being checked (PO, 2026-08-03 23:33+01:00):
 *   every named thing appears in exactly one of KILLED / CLEARED / DEFERRED,
 *   and ABSENCE is the only forbidden state.
 *
 * WHY THIS IS AN INSTRUMENT AND NOT A READ-THROUGH. The failure mode of a hand-read
 * ledger is identical in shape to the one that made copy-absence-census report a
 * manufactured zero: a census that cannot see something reports it as fine. So this
 * script makes distinguishable four outcomes a read-through collapses into one.
 *
 *   STATED                 the id appears under exactly one legal state
 *   ILLEGAL_OPEN           the id appears, but under `OPEN`, which the new law removed
 *   AMBIGUOUS_MULTI_STATE  the id appears under two states; the law says exactly one
 *   ABSENT                 the id is in the population and appears in no ledger row
 *
 * TWO DELIBERATE SCOPE DECISIONS, both of which the first version of this script got
 * wrong and which are recorded here so the numbers are readable:
 *
 * 1. THE POPULATION IS NOT "EVERY ID EVER MENTIONED". Scanning all tracked markdown for
 *    `TAL-\d{5}` yields 231 apparent absences, which is a category error, not a finding:
 *    it counts every ticket ever referenced in passing, including long-closed ones, and
 *    it counts POLICIES (`BIND-01`, `INSTRUMENT-01`) as if a policy could be KILLED. The
 *    authoritative population for tickets is `TICKET-STATUS-LEDGER`, which carries a
 *    status column; for campaign rows it is the suspect ledger's own sections; and for
 *    controls-with-known-gaps it is an explicit curated list, because no regex can infer
 *    that DRAW-SMOKE-01's gap is a suspect while BIND-01 is the rule it was judged by.
 *
 * 2. `fixed` IS A STATUS WORD, NOT FOUR AXES. KILLED requires fix, switch, green gate and
 *    commit. This script reports how many rows actually evidence each axis, so a status
 *    word cannot be laundered into a guarantee. Measured result at the time of writing:
 *    all 49 `fixed` rows carry a commit and a gate asserted GREEN, and exactly 1 of 149
 *    rows records a kill-switch anywhere, so the SWITCH axis is unverified for the rest.
 *
 * FLOOR, NOT CEILING. Extraction is id-shaped. It cannot see a suspect named only in
 * prose, only in an untracked file, under two different names (which counts as two), or
 * only in a commit message. The population is a LOWER BOUND, and this script prints that
 * sentence itself so a reader quoting the number gets the caveat attached to it.
 *
 *   node scripts/suspect-ledger-census.mjs
 *   node scripts/suspect-ledger-census.mjs --json --out=<path>
 *
 * Exit codes, distinct so a reader can tell the failures apart:
 *   0  CENSUS_CLEAN          every population id is STATED under exactly one legal state
 *   1  ABSENT_IDS_FOUND      at least one population id is in no ledger row
 *   2  ILLEGAL_STATE_FOUND   at least one row is OPEN, or carries two states
 *   3  SOURCE_UNREADABLE     refusal. No census was taken. NOT a zero.
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const LEDGER = 'docs/plan3/SUSPECT-LEDGER-SEAL.md';
const TICKETS = 'docs/plan3/TICKET-STATUS-LEDGER-20260729.md';
const POST_SOAK = 'docs/plan3/POST-SOAK-LEDGER.md';

const args = process.argv.slice(2);
const wantJson = args.includes('--json');
const outArg = args.find((a) => a.startsWith('--out='));
const OUT = outArg ? outArg.slice('--out='.length) : null;

const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };

/**
 * Ticket-ledger status -> which of the three states the row maps to, and whether the
 * mapping is safe to apply mechanically. `safe: false` means a human must state the row
 * individually; the script will not invent a verdict for it.
 */
export const STATUS_MAP = {
  fixed: { state: 'KILLED', safe: true, why: 'fix landed; commit and green gate recorded in the ticket ledger' },
  cleared: { state: 'CLEARED', safe: true, why: 'already cleared with a reason' },
  closed: { state: 'CLEARED', safe: true, why: 'closed' },
  superseded: { state: 'CLEARED', safe: true, why: 'replaced by a later row; cite the successor' },
  'closed-scratched': { state: 'CLEARED', safe: true, why: 'withdrawn by its author' },
  'feature-request': { state: 'CLEARED', safe: true, why: 'not a defect; out of scope for a defect ledger' },
  intended: { state: 'CLEARED', safe: true, why: 'behaviour is as designed' },
  'po-eyes': { state: 'DEFERRED', safe: true, why: 'needs a PO decision, which is what a deferral seat is for' },
  'owner-blocked': { state: 'DEFERRED', safe: true, why: 'real open work behind a named owner' },
  'blocked-on-build': { state: 'DEFERRED', safe: true, why: 'fix may exist but verification needs a build' },
  scoped: { state: 'DEFERRED', safe: false, why: 'scoped but not started; needs an owner named before it can be seated' },
  broken: { state: 'DEFERRED', safe: false, why: 'a live defect. Must be stated individually, never mapped' },
  'verify-gone': { state: 'DEFERRED', safe: false, why: 'the verification vanished. Cannot be cleared without re-verification' },
};

/**
 * Campaign controls whose GAPS are suspects. No regex can infer this list, so it is curated
 * and can be argued with.
 *
 * Each carries an ANCHOR: the literal text that must appear in the ledger row stating it. A
 * handle like `SECOND-GPU-BOX` is my shorthand and appears nowhere in the prose, so matching
 * on the handle reported nine rows absent that were in fact stated a few lines away. Binding
 * to an anchor makes the check real: if someone rewords the row, the anchor breaks and this
 * reports absence LOUDLY rather than passing on a handle nobody uses. That is BIND-01 applied
 * to the census itself -- a broken anchor must not look like a missing row.
 */
export const CURATED = [
  { id: 'SHELL-PLAY-01', anchor: 'SHELL-PLAY-01' },
  { id: 'DRAW-SMOKE-01', anchor: 'DRAW-SMOKE-01' },
  { id: 'COPY-ABSENCE-01', anchor: 'COPY-ABSENCE-01' },
  { id: 'CLOCK-01-FILE-SCOPE', anchor: 'file-scope relabel' },
  { id: 'GATE-DEPTH-SWEEP', anchor: 'GATE-DEPTH-SWEEP' },
  { id: 'EVIDENCE-CITE-01', anchor: 'EVIDENCE-CITE-01' },
  { id: 'TERRITORY-DUPLICATE-MANAGERS', anchor: 'TERRITORY-DUPLICATE-MANAGERS' },
  { id: 'TERRITORY-FOUR-TRAILERS', anchor: 'TERRITORY-FOUR-TRAILERS' },
  { id: 'REPLAY-4297-PRODUCT', anchor: 'product change' },
  { id: 'M20Q6-CPU-DOMAIN', anchor: 'CPU-freeze angle' },
  { id: 'ZERO-TRADE-LAG-CENSUS', anchor: 'zero-trade lag census' },
  { id: 'MS-PER-SECOND-724-OWNER', anchor: '724 ms/s owner' },
  { id: 'HOARD-FLOOR-CURVE', anchor: 'hoard-floor curve' },
  { id: 'UNLIT-DARK-ROOMS', anchor: 'unlit dark rooms' },
  { id: 'SECOND-GPU-BOX', anchor: 'second GPU box' },
  { id: 'R7-MACHINE-COVERAGE-BACKFILL', anchor: 'machine-coverage backfill' },
];

export function parseTicketLedger(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const c = line.split('|').map((x) => x.trim());
    if (c.length < 5) continue;
    const [, id, status, commit, gate] = c;
    if (!id || id === 'Ticket' || /^-+$/.test(id)) continue;
    rows.push({ id, status, commit, gate, note: c[5] || '' });
  }
  return rows;
}

const EMPTY = (v) => !v || v === '—' || v === '-';
const GREEN = (g) => /GREEN|PASS/i.test(g || '');
const SWITCH = (s) => /__TALARIA_DISABLE|kill.?switch|killswitch/i.test(s || '');

/** Which axes of KILLED does a ticket row actually evidence? */
export function axesOf(row) {
  return {
    commit: !EMPTY(row.commit),
    gate: !EMPTY(row.gate),
    green: GREEN(row.gate),
    killSwitch: SWITCH(`${row.gate} ${row.note}`),
  };
}

/**
 * A state word inside an inline-code span is QUOTED VOCABULARY, not an assertion. Rows that
 * restate a verdict record the former one in a `was` column as `` `OPEN` ``, and reading that
 * as a live OPEN makes an audit trail look like an illegal state -- which it did, on the first
 * assembled run. Assertions are bold; quotations are backticked. Strip code spans first.
 */
export function stateOfLine(line) {
  const bare = line.replace(/`[^`]*`/g, '');
  // An ASSERTION is bold and lives in the status column; prose that merely names a state is
  // not one. Without this precedence, a row reading "...so this cannot be KILLED" was graded
  // KILLED and collided with its own bolded DEFERRED, reporting a legal row as carrying two
  // states. Take the FIRST bold state, because the status column precedes the prose.
  const bold = bare.match(/\*\*(KILLED|CLEARED|DEFERRED|OPEN)\*\*/);
  if (bold) return bold[1];
  if (/\bKILLED\b/.test(bare)) return 'KILLED';
  if (/\bCLEARED\b/.test(bare)) return 'CLEARED';
  if (/\bDEFERRED\b/.test(bare)) return 'DEFERRED';
  if (/\bOPEN\b/.test(bare)) return 'OPEN';
  return null;
}

const ID_SHAPES = [
  /\bTAL-\d{5}\b/g,
  /\bRayan #\d+\b/g,
  /\b[A-E]-SUS-\d{2}\b/g,
  /\b(?:LAG|MEM|LIFE|HYG|DEF)-\d+[a-d]?\b/g,
];

export function idsIn(text) {
  const out = new Set();
  for (const re of ID_SHAPES) for (const m of text.matchAll(re)) out.add(m[0]);
  return out;
}

/** States asserted about each id anywhere in the ledger, keyed by extracted id shape. */
export function ledgerStates(ledgerText) {
  const byId = new Map();
  ledgerText.split(/\r?\n/).forEach((line, i) => {
    const state = stateOfLine(line);
    if (!state) return;
    for (const id of idsIn(line)) {
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push({ state, line: i + 1 });
    }
  });
  return byId;
}

/**
 * Every state-asserting line, kept whole. Needed because id SHAPES cannot cover ids like
 * `SEL-01`, `Rayan #6b`, `PO value-box shaky` or `TAL-DATA-LOAD-ERROR-SURFACE`. Adding a
 * regex per naming convention is a losing game -- the ticket ledger's ids were written by
 * hand over ten days -- so a population id is also matched as a literal substring. Without
 * this, 9 rows that ARE stated in the ledger were reported absent, which would have been a
 * false accusation rather than a missed one.
 */
export function assertingLines(ledgerText) {
  const out = [];
  ledgerText.split(/\r?\n/).forEach((line, i) => {
    const state = stateOfLine(line);
    if (state) out.push({ state, line: i + 1, text: line });
  });
  return out;
}

/** States asserted about one population id, by shape match or by literal match. */
export function statesForId(id, states, lines) {
  const byShape = [...idsIn(id)].flatMap((k) => states.get(k) || []);
  if (byShape.length) return byShape;
  return lines.filter((l) => l.text.includes(id)).map((l) => ({ state: l.state, line: l.line }));
}

export function seatAudit(ledgerText, postSoakText) {
  const cited = new Set();
  for (const m of ledgerText.matchAll(/\bPOST-SOAK-LEDGER-[A-Z]-\d{2}\b/g)) cited.add(m[0]);
  for (const m of ledgerText.matchAll(/\bPSL-\d{2}\b/g)) cited.add(m[0]);
  const existing = new Set();
  if (postSoakText) {
    for (const m of postSoakText.matchAll(/^### (PSL-\d{2})/gm)) existing.add(m[1]);
    for (const m of postSoakText.matchAll(/\bPOST-SOAK-LEDGER-[A-Z]-\d{2}\b/g)) existing.add(m[0]);
  }
  return { cited: [...cited].sort(), dangling: [...cited].filter((s) => !existing.has(s)).sort() };
}

function main() {
  const ledgerText = read(LEDGER);
  const ticketText = read(TICKETS);
  if (!ledgerText || !ticketText) {
    const refusal = {
      state: 'SOURCE_UNREADABLE',
      why: `${!ledgerText ? LEDGER : TICKETS} could not be read`,
      notACensus: true,
      counts: null,
    };
    if (OUT) fs.writeFileSync(OUT, `${JSON.stringify(refusal, null, 2)}\n`);
    console.log(`[suspect-census] SOURCE_UNREADABLE — ${refusal.why}.`);
    console.log('[suspect-census] No census was taken. This is a refusal, not zero absences.');
    return 3;
  }
  const postSoakText = read(POST_SOAK);

  const tickets = parseTicketLedger(ticketText);
  const states = ledgerStates(ledgerText);

  // Population: every ticket-ledger row, plus the curated controls.
  const population = [
    ...tickets.map((t) => ({ id: t.id, source: 'ticket-ledger', status: t.status, axes: axesOf(t) })),
    ...CURATED.map((c) => ({ id: c.id, anchor: c.anchor, source: 'curated-control', status: null, axes: null })),
  ];

  const lines = assertingLines(ledgerText);
  const rows = population.map((p) => {
    const all = statesForId(p.anchor || p.id, states, lines);
    const uniq = [...new Set(all.map((a) => a.state))];
    let verdict;
    if (!all.length) verdict = 'ABSENT';
    else if (uniq.includes('OPEN')) verdict = 'ILLEGAL_OPEN';
    else if (uniq.length > 1) verdict = 'AMBIGUOUS_MULTI_STATE';
    else verdict = 'STATED';
    const mapped = p.status ? STATUS_MAP[p.status.toLowerCase()] : null;
    return { ...p, verdict, ledgerStates: uniq, mapsTo: mapped ? mapped.state : null, safeMapping: mapped ? mapped.safe : null };
  });

  const by = (v) => rows.filter((r) => r.verdict === v);
  const needIndividual = rows.filter((r) => r.safeMapping === false);
  const fixed = tickets.filter((t) => t.status.toLowerCase() === 'fixed');
  const axesTally = {
    fixedRows: fixed.length,
    withCommit: fixed.filter((t) => axesOf(t).commit).length,
    withGreenGate: fixed.filter((t) => axesOf(t).green).length,
    withKillSwitchRecorded: tickets.filter((t) => axesOf(t).killSwitch).length,
    totalTicketRows: tickets.length,
  };
  const seats = seatAudit(ledgerText, postSoakText);

  const statusTally = {};
  for (const t of tickets) statusTally[t.status] = (statusTally[t.status] || 0) + 1;

  const report = {
    instrument: 'suspect-ledger-census',
    law: 'exactly one of KILLED / CLEARED / DEFERRED; absence is the only forbidden state',
    sources: { ledger: LEDGER, tickets: TICKETS, postSoak: POST_SOAK },
    counts: {
      population: rows.length,
      ticketRows: tickets.length,
      curatedControls: CURATED.length,
      stated: by('STATED').length,
      absent: by('ABSENT').length,
      illegalOpen: by('ILLEGAL_OPEN').length,
      ambiguousMultiState: by('AMBIGUOUS_MULTI_STATE').length,
      needIndividualStatement: needIndividual.length,
    },
    statusTally,
    killedAxes: axesTally,
    seats,
    floorNotCeiling:
      'Id-shaped extraction over the ticket ledger plus a curated control list. A suspect named '
      + 'only in prose, only in an untracked file, under two names, or only in a commit message is '
      + 'invisible here. The population is a LOWER BOUND: this instrument can prove an absence and '
      + 'cannot prove completeness.',
    rows,
  };

  if (OUT) fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  if (wantJson) console.log(JSON.stringify(report, null, 2));
  else {
    console.log('SUSPECT LEDGER CENSUS');
    console.log(`  ledger   ${LEDGER}`);
    console.log(`  tickets  ${TICKETS}  (${tickets.length} rows)`);
    console.log(`  curated  ${CURATED.length} campaign controls whose gaps are suspects`);
    console.log(`  population ${rows.length}   <-- a FLOOR; see the caveat at the end`);
    console.log('');
    console.log(`  STATED                  ${by('STATED').length}`);
    console.log(`  ILLEGAL_OPEN            ${by('ILLEGAL_OPEN').length}   <-- OPEN is no longer legal`);
    console.log(`  AMBIGUOUS_MULTI_STATE   ${by('AMBIGUOUS_MULTI_STATE').length}   <-- law says EXACTLY one`);
    console.log(`  ABSENT                  ${by('ABSENT').length}   <-- the forbidden state`);
    console.log('');
    console.log('  KILLED requires four axes. What the ticket ledger actually evidences:');
    console.log(`    rows with status "fixed"          ${axesTally.fixedRows}`);
    console.log(`      ... carrying a commit           ${axesTally.withCommit}`);
    console.log(`      ... carrying a GREEN gate       ${axesTally.withGreenGate}`);
    console.log(`    rows recording a kill-SWITCH      ${axesTally.withKillSwitchRecorded} of ${axesTally.totalTicketRows}`);
    console.log('    => the switch axis is UNRECORDED for the rest. A gap in evidence, not a pass.');
    console.log('');
    console.log('  status -> state mapping applied:');
    for (const [s, n] of Object.entries(statusTally).sort((a, b) => b[1] - a[1])) {
      const m = STATUS_MAP[s.toLowerCase()];
      const tag = m ? `${m.state}${m.safe ? '' : '  (UNSAFE — needs an individual statement)'}` : 'UNMAPPED — needs a rule';
      console.log(`    ${String(n).padStart(3)}  ${s.padEnd(18)} -> ${tag}`);
    }
    console.log('');
    for (const label of ['ILLEGAL_OPEN', 'AMBIGUOUS_MULTI_STATE', 'ABSENT']) {
      const set = by(label);
      if (!set.length) continue;
      console.log(`  ${label} (${set.length}):`);
      for (const r of set) {
        const extra = r.mapsTo ? ` status=${r.status} -> ${r.mapsTo}` : '';
        const st = r.ledgerStates.length ? ` ledger=${r.ledgerStates.join('+')}` : '';
        console.log(`      ${r.id.padEnd(34)}${st}${extra}`);
      }
      console.log('');
    }
    if (needIndividual.length) {
      console.log(`  MUST BE STATED INDIVIDUALLY, never mapped (${needIndividual.length}):`);
      for (const r of needIndividual) console.log(`      ${r.id.padEnd(34)} status=${r.status}  ${STATUS_MAP[r.status.toLowerCase()].why}`);
      console.log('');
    }
    if (seats.dangling.length) {
      console.log(`  DANGLING POST-SOAK SEATS cited by a DEFERRED row but absent from ${POST_SOAK}:`);
      for (const s of seats.dangling) console.log(`      ${s}`);
      console.log('');
    }
    console.log('  FLOOR, NOT CEILING. This instrument can prove an absence. It cannot prove');
    console.log('  completeness, so the population is a lower bound and must be quoted as one.');
  }

  if (by('ABSENT').length) return 1;
  if (by('ILLEGAL_OPEN').length || by('AMBIGUOUS_MULTI_STATE').length) return 2;
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  process.exitCode = main();
}

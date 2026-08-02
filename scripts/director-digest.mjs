#!/usr/bin/env node
/**
 * Director rolling digest + STALL-01 detector.
 *
 * Implements the PO's EVENT-DRIVEN-FIRE amendment: one line per open item,
 * compiled from the board and git rather than from anyone's memory, and a
 * 90-minute no-progress flag.
 *
 * Progress for an item = the most recent of (a) a commit whose subject or body
 * names its tag, (b) a BOARD-*.md line naming its tag. Board lines carry HH:MM
 * with no date, so git timestamps are preferred and board times are assumed to
 * be today unless that puts them in the future. A line that states its own
 * offset is read in that zone; the header stamps local so both sides of the
 * age arithmetic share one clock.
 *
 *   node scripts/director-digest.mjs            # digest
 *   node scripts/director-digest.mjs --stalled  # STALL-01 lines only
 */

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const STALL_MINUTES = 90;
const BOARD_DIR = 'docs/plan3/board';

/** owner, tag(s) matched case-insensitively, due, and whether STALL-01 may auto-reassign. */
const ITEMS = [
  // Instrument checklist — PO 03-SOAK-HOLD-RULING §3
  { id: 1,  tag: 'ARENA-COLUMNS',           alt: ['arena column', 'arena-timeseries', 'arena time series'], owner: 'C', due: 'Mon', kind: 'instrument' },
  { id: 2,  tag: 'SETTLE-PROTOCOL',         alt: ['settle protocol'],                owner: 'C', due: 'Mon', kind: 'instrument' },
  { id: 3,  tag: 'DRIFT-ABBA',              alt: ['ABBA', 'drift control'],          owner: 'C', due: 'Mon', kind: 'instrument' },
  { id: 4,  tag: 'TOTAL-01',                alt: [],                                 owner: 'C', due: 'Mon', kind: 'instrument' },
  { id: 5,  tag: 'ARRAYBUFFER-JOIN',        alt: ['arraybuffer'],                    owner: 'E', due: 'tonight', kind: 'instrument' },
  { id: 6,  tag: 'DETAILED-DUMP-CAPTURE',   alt: ['detailed dump', 'memory-infra dump'], owner: 'E', due: 'Mon', kind: 'instrument' },
  { id: 7,  tag: 'COV-01',                  alt: ['coverage calibration'],           owner: 'C', due: 'Tue', kind: 'instrument' },
  { id: 8,  tag: 'GATE-01-CAPABILITY',      alt: ['capability proof'],               owner: 'E', due: 'Mon', kind: 'instrument' },
  { id: 9,  tag: 'FORCED-GC-PAUSE-PROBE',   alt: ['pause-probe', 'pause probe'],     owner: 'C', due: 'Mon', kind: 'instrument' },
  { id: 10, tag: 'OVERHEAD-CHECK',          alt: ['overhead check'],                 owner: 'C', due: 'Tue', kind: 'instrument' },
  { id: 11, tag: 'COMMON-WINDOW',           alt: ['common window', 'common-window'], owner: 'C', due: 'Mon', kind: 'instrument' },
  { id: 12, tag: 'FRAME-GOV-SEALED-VERIFY', alt: ['frame01', 'frame governor'],      owner: 'E', due: 'at seal', kind: 'instrument' },
  { id: 13, tag: 'CANONICAL-FLOOR-RETAKE',  alt: ['canonical floor', 'floor re-take', 'floor retake'], owner: 'C', due: 'Tue', kind: 'instrument' },
  { id: 14, tag: 'COMPETITOR-REFERENCE',    alt: ['tradezella', 'fx replay'],        owner: 'A', due: 'Mon', kind: 'instrument' },

  // Product deliverables that gate the seal
  { id: 20, tag: 'C02',                     alt: ['compare linked-pane', 'linked pane'], owner: 'A', due: 'Mon', kind: 'product' },
  { id: 21, tag: 'ACCUMULATION-TEST',       alt: ['accumulation test', 'consecutive pair switch'], owner: 'D', due: 'tonight', kind: 'product' },
  { id: 22, tag: 'DAILY-MONEY-PATH-ARM',    alt: ['daily boundary', 'daily arm'],    owner: 'D', due: 'Mon', kind: 'product' },
  { id: 23, tag: 'TAL-01696',               alt: ['drag lag'],                       owner: 'D', due: 'Mon', kind: 'product' },
  { id: 24, tag: 'TAL-01698',               alt: ['multi-tp', 'multi tp'],           owner: 'D', due: 'Mon', kind: 'product' },
  { id: 25, tag: 'TEXT-MEASURE',            alt: ['text-measure', 'C13'],            owner: 'E', due: 'Mon', kind: 'product' },
  { id: 26, tag: 'CLIPPATH',                alt: ['clip-path', 'clippath'],          owner: 'E', due: 'Mon', kind: 'product' },
  { id: 27, tag: 'PROVENANCE',              alt: ['rebuild-constraint'],             owner: 'B', due: 'Mon', kind: 'product' },
  { id: 28, tag: 'PER-PANEL-RESTORE',       alt: ['per-panel slice', 'panel slice'], owner: 'B', due: 'Mon', kind: 'product' },
  { id: 29, tag: 'SHELL-PLAY-01',           alt: ['shell play', 'play override'],    owner: 'B', due: 'Mon', kind: 'discovery' },
];

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 });
  } catch {
    return '';
  }
}

/** Commits in the last 48h as {epochMs, subject, body}. */
function recentCommits() {
  const raw = sh('git log --since="48 hours ago" --format=%ct%x1f%s%x1f%b%x1e');
  return raw
    .split('\x1e')
    .map((rec) => rec.trim())
    .filter(Boolean)
    .map((rec) => {
      const [ct, subject = '', body = ''] = rec.split('\x1f');
      return { at: Number(ct) * 1000, text: `${subject}\n${body}`.toLowerCase() };
    })
    .filter((c) => Number.isFinite(c.at));
}

/** Board lines as {epochMs, text}. Board times are HH:MM with no date. */
function boardLines() {
  const out = [];
  let files = [];
  try {
    files = readdirSync(BOARD_DIR).filter((f) => /^BOARD-.*\.md$/i.test(f));
  } catch {
    return out;
  }
  const now = new Date();
  for (const f of files) {
    let content = '';
    try {
      content = readFileSync(join(BOARD_DIR, f), 'utf8');
    } catch {
      continue;
    }
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*-\s*(\d{1,2}):(\d{2})(?:\s*([+-]\d{2}):?(\d{2}))?/);
      if (!m) continue;
      const hh = String(m[1]).padStart(2, '0');
      let at;
      if (m[3]) {
        // The line states its offset: read it in that zone, not the reader's.
        // Reading a UTC-stamped line as local ages it by the offset, which on a
        // 90-minute threshold can flag a manager who reported 30 minutes ago.
        const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        at = Date.parse(`${day}T${hh}:${m[2]}:00${m[3]}:${m[4] ?? '00'}`);
      } else {
        const d = new Date(now);
        d.setHours(Number(m[1]), Number(m[2]), 0, 0);
        at = d.getTime();
      }
      if (!Number.isFinite(at)) continue;
      // No date on board lines: a time in the future must belong to yesterday.
      if (at > now.getTime() + 60_000) at -= 86_400_000;
      out.push({ at, text: line.toLowerCase() });
    }
  }
  return out;
}

function lastProgress(item, commits, board) {
  const needles = [item.tag, ...item.alt].map((s) => s.toLowerCase());
  const hit = (text) => needles.some((n) => text.includes(n));
  let best = 0;
  let source = null;
  for (const c of commits) if (c.at > best && hit(c.text)) { best = c.at; source = 'commit'; }
  for (const b of board) if (b.at > best && hit(b.text)) { best = b.at; source = 'board'; }
  return { at: best, source };
}

function minutesSince(ms) {
  return ms ? Math.round((Date.now() - ms) / 60000) : null;
}

function main() {
  const stalledOnly = process.argv.includes('--stalled');
  const commits = recentCommits();
  const board = boardLines();

  const rows = ITEMS.map((item) => {
    const { at, source } = lastProgress(item, commits, board);
    const mins = minutesSince(at);
    const stalled = mins === null || mins > STALL_MINUTES;
    return { ...item, at, source, mins, stalled };
  });

  // STALL-01 is "progress stopped", which is not the same as "never began".
  // An item dispatched an hour ago with no signal is pending, not stalled.
  const stalls = rows.filter((r) => r.at && r.stalled);
  const notStarted = rows.filter((r) => !r.at);
  const moving = rows.filter((r) => r.at && !r.stalled);

  const nowLocal = new Date();
  const offMin = -nowLocal.getTimezoneOffset();
  const offset = `${offMin < 0 ? '-' : '+'}${String(Math.floor(Math.abs(offMin) / 60)).padStart(2, '0')}:${String(Math.abs(offMin) % 60).padStart(2, '0')}`;
  const stamp = `${String(nowLocal.getHours()).padStart(2, '0')}:${String(nowLocal.getMinutes()).padStart(2, '0')}${offset}`;
  console.log(`\nDIRECTOR DIGEST · ${stamp} · STALL-01 threshold ${STALL_MINUTES}m\n`);

  if (stalls.length) {
    console.log(`STALL-01 — ${stalls.length} item(s) began and then stopped for >${STALL_MINUTES}m:`);
    for (const r of stalls) {
      const note = r.kind === 'discovery' ? ' [discovery — no auto-reassign, owes a search line]' : '';
      console.log(`  ! ${r.owner}  #${String(r.id).padStart(2)}  ${r.tag.padEnd(26)} ${String(r.mins + 'm').padStart(10)}  due ${r.due}${note}`);
    }
    console.log('');
  } else {
    console.log('STALL-01 — clear.\n');
  }

  if (notStarted.length) {
    console.log(`Not started — no signal in 48h (pending, not stalled):`);
    for (const r of notStarted) {
      const urgent = r.due === 'tonight' ? '  <-- due tonight' : '';
      console.log(`    ${r.owner}  #${String(r.id).padStart(2)}  ${r.tag.padEnd(26)}            due ${r.due}${urgent}`);
    }
    console.log('');
  }

  if (stalledOnly) return;

  console.log('On pace:');
  for (const r of moving.sort((a, b) => a.mins - b.mins)) {
    console.log(`    ${r.owner}  #${String(r.id).padStart(2)}  ${r.tag.padEnd(26)} ${String(r.mins + 'm').padStart(10)}  via ${r.source}  due ${r.due}`);
  }

  const instr = rows.filter((r) => r.kind === 'instrument');
  const instrMoving = instr.filter((r) => !r.stalled).length;
  console.log(`\nInstrument checklist: ${instrMoving}/${instr.length} showing progress inside the window.`);
  console.log('\nBlind spots this instrument declares (COV-01):');
  console.log('  - Motion is not green. Green is declared on the board by the owner.');
  console.log('  - Tag matching is textual, so an unrelated mention of a tag reads as progress.');
  console.log('  - Board lines carry HH:MM with no date; times are assumed to be today.');
  console.log('  - Owner activity is not observable from the repo, so a stall flag is a');
  console.log('    prompt to ask, not a verdict that someone is idle.\n');
}

main();

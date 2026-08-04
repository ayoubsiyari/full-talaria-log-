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
import path, { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STALL_MINUTES = 90;
const BOARD_DIR = 'docs/plan3/board';

/** owner, tag(s) matched case-insensitively, due, and whether STALL-01 may auto-reassign. */
export const ITEMS = [
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

/**
 * Which lane a COMMIT can be attributed to, or null.
 *
 * The `Manager:` trailer is the only signal, and it is the same one
 * territory-preflight requires. Deliberately NOT used:
 *
 *   - git author/committer. Every commit in this repo is
 *     `Manager B release rehearsal <b-release@local>`, so identity distinguishes
 *     nobody. Binding the trailer to identity is TERR-F3, deferred until after the
 *     seal by Director ruling.
 *   - subject prefixes like `board(C):` or `BOARD-A:`. These name the board being
 *     WRITTEN TO, which is almost always another lane's. Reading them as authorship
 *     inverts attribution: `board(C):` is typically a different lane leaving C a
 *     note, so crediting C would be exactly the cross-credit this change removes.
 */
export function laneOfCommit(body) {
  // The leading `\s*` is load-bearing for a reason that is NOT obvious, and it is accidental
  // safety rather than a guarantee: ECMAScript's `\s` includes U+FEFF, so this reads straight
  // through a UTF-8 byte-order mark. The same rule written in POSIX shell does NOT --
  // `[[:space:]]` excludes it -- which is how the commit-msg hook's
  // `sed -n 's/^Manager:...'` was blind to a BOM-led trailer, appended a second Manager from
  // the environment, and made git report one lane's commit as another's. Measured and fixed at
  // `fc9894d13`; 41 commit subjects in 400 still carry the mark (`PSL-39`).
  //
  // So: if you port this matcher to sh, awk, sed or grep, strip the BOM explicitly first. This
  // function survived that defect by a property of the language, and nobody chose it.
  const m = String(body || '').match(/^\s*Manager:\s*([A-Za-z]+)\s*$/m);
  if (!m) return null;
  const id = m[1].trim();
  if (/^Director$/i.test(id)) return 'Director';
  return /^[A-E]$/i.test(id) ? id.toUpperCase() : null;
}

/**
 * Which lane a BOARD LINE can be attributed to, or null. An entry heading reads
 * `- 18:36+01:00 · B · ...`, and that marker is written by the lane making the
 * entry, so unlike a commit subject it does name the author. Coverage is uneven
 * (74% of B's entries, 15% of A's when measured 21:0x+01:00), which is why an
 * unmarked line is unattributed rather than assumed to belong to the board's owner:
 * lanes write on each other's boards constantly, so "which file" is not "who".
 */
export function laneOfBoardLine(line) {
  const m = String(line || '').match(/^\s*-\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*[+-]\d{2}:?\d{2})?\s*·\s*([A-E])\s*(?:·|→)/);
  return m ? m[1].toUpperCase() : null;
}

/** Commits in the last 48h as {epochMs, text, lane}. */
function recentCommits() {
  const raw = sh('git log --since="48 hours ago" --format=%ct%x1f%s%x1f%b%x1e');
  return raw
    .split('\x1e')
    .map((rec) => rec.trim())
    .filter(Boolean)
    .map((rec) => {
      const [ct, subject = '', body = ''] = rec.split('\x1f');
      return {
        at: Number(ct) * 1000,
        text: `${subject}\n${body}`.toLowerCase(),
        lane: laneOfCommit(body),
        source: 'commit',
      };
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
      out.push({
        at, text: line.toLowerCase(), lane: laneOfBoardLine(line), source: 'board',
      });
    }
  }
  return out;
}

/**
 * PROGRESS-ATTRIB-01. Progress on an item must be attributable to that item's
 * OWNER, and progress that is not attributable is reported rather than counted.
 *
 * The defect this replaces: any commit or board line containing an item's tag
 * advanced that item, while the owner came from the static table above. So a
 * commit from any lane mentioning `COV-01` cleared C's COV-01 stall, and the
 * Director steered off it all day. Ownership and evidence came from different
 * places and were never reconciled.
 *
 * Four states, and the third is the new one:
 *
 *   PROGRESS               the owner has a signal inside the window
 *   STALLED                the owner has a signal, and it is older than the threshold
 *   PROGRESS_UNATTRIBUTED  the tag moved, but not provably by the owner. This does
 *                          NOT clear a stall and does NOT count as pace. It is a
 *                          prompt to find out who, not a credit.
 *   NOT_STARTED            no signal of any kind in the window
 *
 * A more recent unattributed signal is carried alongside a stall rather than
 * replacing it, because "someone touched this 5 minutes ago and we cannot say who"
 * is precisely the fact a stall line would otherwise hide.
 *
 * Pure: no git, no clock of its own, so every branch is reachable from a fixture.
 */
export function classifyProgress({ item, signals, now, stallMinutes = STALL_MINUTES }) {
  const needles = [item.tag, ...(item.alt || [])].map((s) => s.toLowerCase());
  const hits = signals.filter((s) => needles.some((n) => s.text.includes(n)));

  const owned = hits.filter((s) => s.lane === item.owner);
  const foreign = hits.filter((s) => s.lane !== item.owner);

  const newest = (list) => list.reduce((a, b) => (b.at > (a ? a.at : 0) ? b : a), null);
  const ownerHit = newest(owned);
  const otherHit = newest(foreign);

  const unattributed = otherHit ? {
    at: otherHit.at,
    source: otherHit.source,
    // A signal carrying a DIFFERENT lane letter is a different fact from one
    // carrying none, and the Director acts differently on each: the first is a
    // question for that lane, the second is a missing trailer or board marker.
    lane: otherHit.lane,
    why: otherHit.lane
      ? `attributed to ${otherHit.lane}, not owner ${item.owner}`
      : `no Manager: trailer or board · marker, so the ${otherHit.source} cannot be tied to ${item.owner}`,
  } : null;

  if (!ownerHit) {
    return {
      state: unattributed ? 'PROGRESS_UNATTRIBUTED' : 'NOT_STARTED',
      at: 0,
      source: null,
      mins: null,
      stalled: false,
      unattributed,
    };
  }

  const mins = Math.round((now - ownerHit.at) / 60000);
  return {
    state: mins > stallMinutes ? 'STALLED' : 'PROGRESS',
    at: ownerHit.at,
    source: ownerHit.source,
    mins,
    stalled: mins > stallMinutes,
    unattributed,
  };
}

function main() {
  const stalledOnly = process.argv.includes('--stalled');
  const commits = recentCommits();
  const board = boardLines();

  const signals = [...commits, ...board];
  const now = Date.now();
  const rows = ITEMS.map((item) => ({
    ...item,
    ...classifyProgress({ item, signals, now }),
  }));

  // STALL-01 is "progress stopped", which is not the same as "never began".
  // An item dispatched an hour ago with no signal is pending, not stalled.
  const stalls = rows.filter((r) => r.state === 'STALLED');
  const notStarted = rows.filter((r) => r.state === 'NOT_STARTED');
  const moving = rows.filter((r) => r.state === 'PROGRESS');
  const unattributed = rows.filter((r) => r.state === 'PROGRESS_UNATTRIBUTED');

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
      // Named on the stall line itself: this is the signal that used to clear the
      // stall silently, and the Director needs to see that it exists and that it
      // proves nothing about the owner.
      if (r.unattributed) {
        const ago = Math.round((now - r.unattributed.at) / 60000);
        console.log(`        └ a ${r.unattributed.source} touched this tag ${ago}m ago but did NOT clear the stall — ${r.unattributed.why}`);
      }
    }
    console.log('');
  } else {
    console.log('STALL-01 — clear.\n');
  }

  if (unattributed.length) {
    console.log(`PROGRESS_UNATTRIBUTED — ${unattributed.length} item(s) moved, but not provably by the owner:`);
    for (const r of unattributed) {
      const ago = Math.round((now - r.unattributed.at) / 60000);
      console.log(`  ? ${r.owner}  #${String(r.id).padStart(2)}  ${r.tag.padEnd(26)} ${String(ago + 'm').padStart(10)}  due ${r.due}`);
      console.log(`        └ ${r.unattributed.why}`);
    }
    console.log('  These are NOT on pace and NOT stalled. Ask who, or land the trailer.\n');
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
  console.log('  - Tag matching is textual, so an unrelated mention of a tag by the OWNER still');
  console.log('    reads as progress. Attribution is checked; relevance is not.');
  console.log('  - Attribution is self-declared: a `Manager:` trailer or a board `· X ·` marker.');
  console.log('    Git identity proves nothing here — every lane commits as b-release@local —');
  console.log('    and binding the two is TERR-F3, deferred until after the seal.');
  console.log('  - A lane that does not stamp its trailer or marker reads as PROGRESS_UNATTRIBUTED');
  console.log('    however hard it is working. That is under-crediting, chosen over the previous');
  console.log('    behaviour of crediting the wrong lane.');
  console.log('  - Board lines carry HH:MM with no date; times are assumed to be today.');
  console.log('  - Owner activity is not observable from the repo, so a stall flag is a');
  console.log('    prompt to ask, not a verdict that someone is idle.\n');
}

// Importable without running, so the selftest can drive classifyProgress on
// fixtures instead of arranging a repository and a clock.
const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();

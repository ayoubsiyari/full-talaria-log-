#!/usr/bin/env node
/**
 * BOARD-STATE-01 — a maintained-in-place state block that stopped being
 * maintained is worse than no state block, because it reads as current.
 *
 * C's convention (`b02846abd`) fixes the failure where a reader works bottom-up
 * through an append-only log and quotes a figure a later entry retired. It
 * introduces one new failure of its own: the block carries `last updated HH:MM`,
 * and nothing checks it. A stale block is indistinguishable from a fresh one, and
 * it is *more* authoritative than the log it sits above — the same shape as a
 * `gate:clock-01` pass, where every offset is present and none is verified.
 *
 * So the check is mechanical and needs no date arithmetic: the block records how
 * many appended entries sat below it when it was last written. Entries only ever
 * accumulate, so a count that no longer matches means events were logged without
 * the state being revisited.
 *
 *   node scripts/board-state-block-audit.mjs [--fix] [--files=a,b]
 *
 * States, kept distinct on purpose (BIND-01): a missing file, a board with no
 * block, a block with no marker, and a block whose marker disagrees are four
 * different problems with four different fixes, and collapsing them into one red
 * is how the last three weeks of vacuous greens happened.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clockOf } from './lib/clock.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOARD_DIR = path.join(__dirname, '..', 'docs/plan3/board');

export const STATE_HEADING = /^##\s+CURRENT STATE\b/m;
export const MARKER = /<!--\s*STATE-BLOCK-FRESHNESS\s+entriesBelow=(\d+)\s*-->/;
/** An appended entry: `- 19:31+01:00 ...`. Table rows and prose are not entries. */
export const ENTRY = /^-\s+\d{1,2}:\d{2}(?::\d{2})?[+-]\d{2}:\d{2}/;

/**
 * Where the state block ends. The first `---` or `## ` after the heading, so a
 * board that grows a second section below the block is measured from the right
 * place rather than counting its own table rows.
 */
export function blockEnd(lines, headingIdx) {
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (/^---\s*$/.test(lines[i]) || /^##\s+/.test(lines[i])) return i;
  }
  return lines.length;
}

export function auditText(text) {
  const lines = text.split(/\r?\n/);
  const headingIdx = lines.findIndex((l) => STATE_HEADING.test(l));
  if (headingIdx < 0) {
    return { state: 'STATE_BLOCK_ABSENT', why: 'no `## CURRENT STATE` heading — this board answers what happened, not what is true' };
  }
  const end = blockEnd(lines, headingIdx);
  const block = lines.slice(headingIdx, end).join('\n');
  const entriesBelow = lines.slice(end).filter((l) => ENTRY.test(l)).length;
  const marker = MARKER.exec(block);
  if (!marker) {
    // Deliberately not STALE: an absent marker means the block was never wired
    // to the check, which is a different job from refreshing a stale one.
    return { state: 'FRESHNESS_MARKER_ABSENT', entriesBelow, why: 'the block has no `<!-- STATE-BLOCK-FRESHNESS entriesBelow=N -->` marker, so its currency is a claim rather than a check' };
  }
  const recorded = Number(marker[1]);
  if (recorded !== entriesBelow) {
    return {
      state: 'STATE_BLOCK_STALE',
      recorded,
      entriesBelow,
      delta: entriesBelow - recorded,
      why: `${entriesBelow - recorded} entr${entriesBelow - recorded === 1 ? 'y has' : 'ies have'} been appended since the state block was last written — it reads as current and is not`,
    };
  }
  return { state: 'STATE_BLOCK_CURRENT', recorded, entriesBelow };
}

/** Rewrites the marker and the `last updated` stamp together, never one alone. */
export function fixText(text, now = new Date()) {
  /**
   * Split on \r?\n and join on '\n' silently converted an entire CRLF board to LF:
   * one two-line edit arrived as 185 changed lines, which on a shared board is
   * indistinguishable from someone having rewritten it. A fixer that touches lines
   * it was not asked about cannot be run on a file two people are editing.
   */
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const headingIdx = lines.findIndex((l) => STATE_HEADING.test(l));
  if (headingIdx < 0) return { changed: false, text };
  const end = blockEnd(lines, headingIdx);
  const entriesBelow = lines.slice(end).filter((l) => ENTRY.test(l)).length;
  const stamp = clockOf(now);

  let block = lines.slice(headingIdx, end).join('\n');
  block = MARKER.test(block)
    ? block.replace(MARKER, `<!-- STATE-BLOCK-FRESHNESS entriesBelow=${entriesBelow} -->`)
    : block.replace(/^(##\s+CURRENT STATE.*)$/m, `$1\n\n<!-- STATE-BLOCK-FRESHNESS entriesBelow=${entriesBelow} -->`);
  block = block.replace(/last updated\s+\d{1,2}:\d{2}(?::\d{2})?[+-]\d{2}:\d{2}/, `last updated ${stamp}`);

  const next = [...lines.slice(0, headingIdx), ...block.split('\n'), ...lines.slice(end)].join(eol);
  return { changed: next !== text, text: next, entriesBelow, stamp };
}

function main() {
  const fix = process.argv.includes('--fix');
  const only = process.argv.find((a) => a.startsWith('--files='));
  /**
   * Positional paths count. They did not, and the omission cost three lanes their
   * freshness stamps: `--fix docs/plan3/board/BOARD-A.md` silently ignored the
   * path, fell through to every board in the directory, and restamped B, C and D
   * as "last updated" at a time when I, not they, had touched the file. A tool for
   * one lane's board defaulting to all of them is the one-writer rule broken by
   * its own auditor.
   */
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const explicit = [
    ...(only ? only.slice('--files='.length).split(',') : []),
    ...positional,
  ].map((f) => path.resolve(f.trim())).filter(Boolean);

  if (fix && explicit.length === 0) {
    console.error('[board-state] FIX_REFUSED_NO_EXPLICIT_TARGET — --fix rewrites a board, and a board has one writer.\n'
      + '              Name the file: --fix docs/plan3/board/BOARD-A.md, or --files=a,b --fix.\n'
      + '              Auditing every board is read-only and needs no argument; rewriting every board is never what was meant.');
    process.exitCode = 2;
    return;
  }

  const files = explicit.length
    ? explicit
    : fs.readdirSync(BOARD_DIR).filter((f) => /^BOARD-[A-Z]\.md$/.test(f)).map((f) => path.join(BOARD_DIR, f));

  let bad = 0;
  for (const file of files) {
    const rel = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
    if (!fs.existsSync(file)) {
      console.log(`[board-state] SUBJECT_ABSENT: ${rel}`);
      bad++;
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    if (fix) {
      const out = fixText(text);
      if (out.changed) {
        fs.writeFileSync(file, out.text);
        console.log(`[board-state] REFRESHED ${rel} — entriesBelow=${out.entriesBelow}, stamped ${out.stamp}`);
        continue;
      }
    }
    const v = auditText(text);
    const detail = v.why ? ` — ${v.why}` : ` — entriesBelow=${v.entriesBelow}`;
    console.log(`[board-state] ${v.state} ${rel}${detail}`);
    // A board with no block at all is reported, not failed: adoption is a lane's
    // own decision and this gate is not the place to compel it.
    if (v.state === 'STATE_BLOCK_STALE') bad++;
  }
  process.exitCode = bad ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();

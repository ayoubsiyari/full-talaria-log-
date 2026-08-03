#!/usr/bin/env node
/**
 * Mutation arm for BOARD-STATE-01. A staleness gate that cannot fail is the
 * stalest thing in the repository, so each mutant is a way this gate could pass a
 * board it should have refused.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUBJECT = path.join(__dirname, 'board-state-block-audit.mjs');
const SELFTEST = path.join(__dirname, 'board-state-block-audit.selftest.mjs');
const original = fs.readFileSync(SUBJECT, 'utf8');

const MUTANTS = [
  {
    name: 'a stale block passes — the whole point, deleted',
    find: '  if (recorded !== entriesBelow) {',
    replace: '  if (false) {',
  },
  {
    name: 'a block with no marker is reported as stale, collapsing two different fixes into one',
    find: "    return { state: 'FRESHNESS_MARKER_ABSENT', entriesBelow,",
    replace: "    return { state: 'STATE_BLOCK_STALE', entriesBelow,",
  },
  {
    name: 'a board with no state block reads as current',
    find: "    return { state: 'STATE_BLOCK_ABSENT',",
    replace: "    return { state: 'STATE_BLOCK_CURRENT',",
  },
  {
    name: 'entries are counted from the top, so the block counts its own rows',
    find: '  const entriesBelow = lines.slice(end).filter((l) => ENTRY.test(l)).length;\n  const marker = MARKER.exec(block);',
    replace: '  const entriesBelow = lines.filter((l) => ENTRY.test(l)).length;\n  const marker = MARKER.exec(block);',
  },
  {
    name: 'the entry pattern drops its offset, so any dash-and-number line counts',
    find: 'export const ENTRY = /^-\\s+\\d{1,2}:\\d{2}(?::\\d{2})?[+-]\\d{2}:\\d{2}/;',
    replace: 'export const ENTRY = /^-\\s+/;',
  },
  {
    name: 'the block end is not found, so it runs to the end of the file',
    find: '    if (/^---\\s*$/.test(lines[i]) || /^##\\s+/.test(lines[i])) return i;',
    replace: '    if (false) return i;',
  },
  {
    name: '--fix moves the count but leaves the stamp lying',
    find: "  block = block.replace(/last updated\\s+\\d{1,2}:\\d{2}(?::\\d{2})?[+-]\\d{2}:\\d{2}/, `last updated ${stamp}`);",
    replace: '  // stamp left as it was',
  },
  {
    name: '--fix invents a state block on a board that has none',
    find: '  if (headingIdx < 0) return { changed: false, text };',
    replace: '  if (headingIdx < 0) return { changed: true, text: `## CURRENT STATE\\n${text}` };',
  },
];

let killed = 0;
let survived = 0;
const lines = [];
try {
  for (const m of MUTANTS) {
    if (!original.includes(m.find)) {
      lines.push(['ANCHOR_MISSING', m.name, `anchor not in subject: ${m.find.slice(0, 70)}`]);
      survived++;
      continue;
    }
    fs.writeFileSync(SUBJECT, original.replace(m.find, m.replace));
    let out = '';
    let failed = false;
    try {
      out = execFileSync(process.execPath, [SELFTEST], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      failed = true;
      out = String((e.stdout || '') + (e.stderr || ''));
    }
    const caught = (out.match(/^\s*FAIL\s+(.+)$/gm) || []).map((s) => s.trim()).slice(0, 2);
    if (failed) { killed++; lines.push(['KILLED', m.name, caught.join(' | ')]); }
    else { survived++; lines.push(['SURVIVED', m.name, 'no cell noticed']); }
  }
} finally {
  fs.writeFileSync(SUBJECT, original);
}

for (const [state, name, why] of lines) {
  console.log(`  ${state}  ${name}${why ? `\n          caught by: ${why}` : ''}`);
}
console.log(`\n  ${killed}/${killed + survived} mutants killed`);
process.exitCode = survived ? 1 : 0;

#!/usr/bin/env node
/**
 * CLOCK-01 — stamp only the lines you wrote, on a board you do not own.
 *
 * Boards are shared surfaces. When the repo-wide gate went red, 5 of the 32 bare
 * numbers on D's and E's boards were on lines beginning `B → D` / `B → E`: mine,
 * sitting in someone else's file. `--fix` is whole-file, so the choice was to
 * either leave my own numbers bare or sweep two other lanes' prose with an offset
 * I cannot verify. The audit itself is explicit that it can see a number is
 * unstamped and never which clock produced it, and E's lane has already lost time
 * to a UTC/local mix-up, so guessing there would manufacture exactly the false
 * certainty CLOCK-01 exists to prevent.
 *
 * So: same decision, narrower blast radius. The bare/not-bare call comes from
 * scanText, unchanged, and this only chooses WHICH LINES to act on.
 *
 *   node scripts/clock-01-stamp-lines.mjs --files=a.md,b.md --match="^- \d\d:\d\d\S* · B " --offset=+01:00
 *   ... --dry                                       # report, write nothing
 *
 * States:
 *   STAMPED <n>            numbers stamped on matching lines
 *   NO_MATCHING_LINES      the pattern matched nothing — not a pass, a miss
 *   NO_BARE_ON_MATCHES     matching lines exist and are already clean
 *   SUBJECT_ABSENT: path
 */
import fs from 'node:fs';
import path from 'node:path';

import { REPO_ROOT, scanText } from './clock-01-audit.mjs';

const argOf = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const files = (argOf('files') || '').split(',').map((s) => s.trim()).filter(Boolean);
const match = argOf('match');
const offset = argOf('offset') || '+01:00';
const dry = process.argv.includes('--dry');

if (!files.length || !match) {
  console.error('usage: --files=<a,b> --match=<regex over the whole line> [--offset=+01:00] [--dry]');
  process.exit(2);
}
if (!/^[+-]\d{2}:\d{2}$/.test(offset)) {
  console.error(`refusing: --offset=${offset} is not of the form +01:00`);
  process.exit(2);
}

const re = new RegExp(match);
let stampedTotal = 0;
let matchedTotal = 0;
let exit = 0;

for (const rel of files) {
  const abs = path.join(REPO_ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.log(`[clock-01-lines] SUBJECT_ABSENT: ${rel}`);
    exit = 1;
    continue;
  }
  // Split KEEPING the terminators, so a CRLF file is written back as CRLF.
  // Learned the expensive way: joining on '\n' rewrote all 102 lines of E's
  // board while stamping 11, which in a shared file is a guaranteed conflict
  // for whoever is mid-entry — a whitespace bomb dressed as a one-line fix.
  const parts = fs.readFileSync(abs, 'utf8').split(/(\r\n|\n)/);
  const lineCount = Math.ceil(parts.length / 2);
  let matched = 0;
  let stamped = 0;

  for (let i = 0; i < parts.length; i += 2) {
    const line = parts[i];
    if (!re.test(line)) continue;
    matched += 1;
    const { findings } = scanText(line);
    if (!findings.length) continue;
    stamped += findings.length;
    // Right to left, so an earlier insertion cannot move a later index.
    parts[i] = [...findings]
      .sort((a, b) => b.endsAt - a.endsAt)
      .reduce((acc, f) => acc.slice(0, f.endsAt) + offset + acc.slice(f.endsAt), line);
  }

  matchedTotal += matched;
  stampedTotal += stamped;

  if (!matched) {
    // A pattern that matches nothing must not look like a clean file.
    console.log(`[clock-01-lines] NO_MATCHING_LINES ${rel} — pattern matched 0 of ${lineCount} lines`);
    exit = 1;
    continue;
  }
  if (!stamped) {
    console.log(`[clock-01-lines] NO_BARE_ON_MATCHES ${rel} — ${matched} matching line(s), all stamped`);
    continue;
  }
  if (!dry) fs.writeFileSync(abs, parts.join(''));
  console.log(`[clock-01-lines] ${dry ? 'WOULD STAMP' : 'STAMPED'} ${stamped} on ${matched} matching line(s) in ${rel}`);
}

console.log(`[clock-01-lines] ${dry ? 'would stamp' : 'stamped'} ${stampedTotal} number(s) `
  + `across ${matchedTotal} matching line(s) with ${offset}`);
process.exit(exit);

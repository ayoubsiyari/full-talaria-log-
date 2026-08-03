#!/usr/bin/env node
/**
 * CLOCK-01 board gate: every wall-clock mention in board prose carries an
 * explicit UTC offset or Z. Durations/rates such as "150s" or "10 bars/s" are
 * not HH:MM clock mentions and are therefore ignored by construction.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function argOf(name, fallback = '') {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  if (hit) return hit.slice(pref.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const CLOCK_RE = /(?<![\w:+-])((?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?)(?![\w:])/g;
const OFFSET_RE = /^(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)/;

export function boardFiles(root = repoRoot) {
  const boardDir = path.join(root, 'docs', 'plan3', 'board');
  return fs.readdirSync(boardDir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => path.join(boardDir, name));
}

export function scanClock01Text(text, file = '<text>') {
  const findings = [];
  const lines = String(text).split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    CLOCK_RE.lastIndex = 0;
    let match;
    while ((match = CLOCK_RE.exec(line))) {
      const token = match[1];
      const after = line.slice(match.index + token.length);
      if (OFFSET_RE.test(after)) continue;
      findings.push({
        file,
        line: lineIndex + 1,
        column: match.index + 1,
        token,
        text: line,
      });
    }
  }
  return findings;
}

export function scanClock01Boards(root = repoRoot) {
  return boardFiles(root).flatMap((file) => scanClock01Text(fs.readFileSync(file, 'utf8'), file));
}

function main() {
  const root = path.resolve(argOf('root', repoRoot));
  const findings = scanClock01Boards(root);
  if (!findings.length) {
    console.log('CLOCK-01_BOARD_TIME_OFFSET_GATE PASS — board wall-clock mentions are offset-bound');
    return 0;
  }

  console.error(`CLOCK-01_BOARD_TIME_OFFSET_GATE FAIL — ${findings.length} bare board wall-clock mention(s)`);
  for (const finding of findings) {
    const rel = path.relative(root, finding.file).replace(/\\/g, '/');
    console.error(`${rel}:${finding.line}:${finding.column} bare "${finding.token}" needs offset or Z`);
    console.error(`  ${finding.text}`);
  }
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}

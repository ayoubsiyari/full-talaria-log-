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
const DEFAULT_BASELINE = path.join(repoRoot, 'docs', 'plan3', 'baselines', 'clock01-board-time-offset-baseline.json');

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

function normalizeFinding(root, finding) {
  return {
    file: path.relative(root, finding.file).replace(/\\/g, '/'),
    line: finding.line,
    column: finding.column,
    token: finding.token,
    text: finding.text,
  };
}

function baselineKey(entry) {
  return `${entry.file}\0${entry.token}\0${entry.text}`;
}

export function makeClock01Baseline(root, findings) {
  return {
    signature: 'CLOCK-01-BOARD-TIME-OFFSET-BASELINE-V1',
    status: 'UNKNOWN_OFFSET',
    generatedAt: new Date().toISOString(),
    note: 'These bare board wall-clock mentions predate CLOCK-01 enforcement. Do not infer UTC or local offset.',
    entries: findings.map((finding) => ({
      ...normalizeFinding(root, finding),
      status: 'UNKNOWN_OFFSET',
    })),
  };
}

export function readClock01Baseline(file = DEFAULT_BASELINE) {
  if (!fs.existsSync(file)) return { entries: [] };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function partitionClock01Findings(root, findings, baseline) {
  const remainingBaseline = new Map();
  for (const entry of baseline.entries || []) {
    const key = baselineKey(entry);
    remainingBaseline.set(key, (remainingBaseline.get(key) || 0) + 1);
  }

  const newFindings = [];
  let grandfathered = 0;
  for (const finding of findings) {
    const normalized = normalizeFinding(root, finding);
    const key = baselineKey(normalized);
    const remaining = remainingBaseline.get(key) || 0;
    if (remaining > 0) {
      remainingBaseline.set(key, remaining - 1);
      grandfathered += 1;
    } else {
      newFindings.push(finding);
    }
  }
  return { newFindings, grandfathered };
}

function main() {
  const root = path.resolve(argOf('root', repoRoot));
  const baselinePath = path.resolve(root, argOf('baseline', path.relative(root, DEFAULT_BASELINE)));
  const findings = scanClock01Boards(root);
  if (process.argv.includes('--write-baseline')) {
    const baseline = makeClock01Baseline(root, findings);
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`CLOCK-01_BOARD_TIME_OFFSET_BASELINE wrote ${baseline.entries.length} UNKNOWN_OFFSET entries to ${path.relative(root, baselinePath).replace(/\\/g, '/')}`);
    return 0;
  }

  const baseline = readClock01Baseline(baselinePath);
  const { newFindings, grandfathered } = partitionClock01Findings(root, findings, baseline);
  if (!newFindings.length) {
    console.log(`CLOCK-01_BOARD_TIME_OFFSET_GATE PASS — ${grandfathered} UNKNOWN_OFFSET entries grandfathered, 0 new bare board wall-clock mentions`);
    return 0;
  }

  console.error(`CLOCK-01_BOARD_TIME_OFFSET_GATE FAIL — ${newFindings.length} new bare board wall-clock mention(s); ${grandfathered} UNKNOWN_OFFSET entries grandfathered`);
  for (const finding of newFindings) {
    const rel = path.relative(root, finding.file).replace(/\\/g, '/');
    console.error(`${rel}:${finding.line}:${finding.column} bare "${finding.token}" needs offset or Z`);
    console.error(`  ${finding.text}`);
  }
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}

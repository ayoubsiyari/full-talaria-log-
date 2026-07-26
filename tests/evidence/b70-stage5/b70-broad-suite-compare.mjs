#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const modulesDir = path.join(repoRoot, 'chart v 1.4', 'chart', 'modules');
const evidenceDir = path.join(here, 'artifacts');
const baselinePath = path.join(evidenceDir, 'broad-baseline.json');
const candidatePath = path.join(evidenceDir, 'broad-candidate.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const tests = fs.readdirSync(modulesDir)
  .filter((name) => name.endsWith('.test.mjs'))
  .map((name) => path.join(modulesDir, name));

const run = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: repoRoot,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, B70_BROAD_ROLE: 'candidate-default-off' },
});
const output = `${run.stdout || ''}\n${run.stderr || ''}`;
const failureTitles = Array.from(output.matchAll(/^✖ (.+?) \([\d.]+ms\)$/gm))
  .map((match) => match[1])
  .filter((title, index, all) => all.indexOf(title) === index)
  .sort();
const summaryValue = (name) => {
  const match = output.match(new RegExp(`^ℹ ${name} (\\d+)$`, 'm'));
  return match ? Number(match[1]) : null;
};
const expected = [...baseline.failureTitles].sort();
const exactFailureMatch = JSON.stringify(failureTitles) === JSON.stringify(expected);
const body = {
  schemaVersion: 1,
  role: 'candidate-default-off',
  command: `node --test ${tests.map((file) => JSON.stringify(path.relative(repoRoot, file))).join(' ')}`,
  generatedAt: new Date().toISOString(),
  exitCode: run.status,
  summary: {
    tests: summaryValue('tests'),
    pass: summaryValue('pass'),
    fail: summaryValue('fail'),
    skipped: summaryValue('skipped'),
  },
  failureTitles,
  baselineFailureTitles: expected,
  exactFailureMatch,
  classification: failureTitles.map((title) => ({
    title,
    classification: expected.includes(title)
      ? 'exact-baseline-match' : 'candidate-only-failure',
  })),
};
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(candidatePath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  exactFailureMatch,
  summary: body.summary,
  candidatePath,
}, null, 2)}\n`);
process.exitCode = exactFailureMatch ? 0 : 1;

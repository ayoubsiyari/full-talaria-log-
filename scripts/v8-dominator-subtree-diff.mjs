#!/usr/bin/env node
/**
 * V8-DOMINATOR-SUBTREE-DIFF
 *
 * No-browser fallback for D's stopping rule: when constructor naming explains
 * under a tenth of the measured V8 delta, compare retained size by dominator
 * subtree instead of by constructor self-size.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { diffDominatorSubtrees } from './lib/heap-dominator-subtrees.mjs';

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function positional() {
  return process.argv.slice(2).filter((a) => !a.startsWith('--'));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function main() {
  const [beforeFile, afterFile] = positional();
  const out = arg('out', null);
  const topN = Number(arg('topN', '40'));
  const candidateN = Number(arg('candidateN', '250'));
  const maxDepth = Number(arg('maxDepth', '12'));
  if (!beforeFile || !afterFile) {
    console.error('usage: node scripts/v8-dominator-subtree-diff.mjs <before.heapsnapshot> <after.heapsnapshot> [--out=report.json] [--topN=40]');
    process.exitCode = 2;
    return;
  }
  const report = {
    generatedAt: new Date().toISOString(),
    inputs: { before: beforeFile, after: afterFile },
    ...diffDominatorSubtrees(readJson(beforeFile), readJson(afterFile), { topN, candidateN, maxDepth }),
  };
  const text = JSON.stringify(report, null, 2);
  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
  }
  console.log(text);
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  await main();
}

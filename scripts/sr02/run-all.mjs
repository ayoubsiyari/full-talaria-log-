#!/usr/bin/env node
/**
 * SR-02 full battery. One entry point so the packet is reproducible.
 *
 * Prerequisite: acorn is not a repo dependency (the root package.json carries
 * none deliberately), so run from a scratch install, exactly as scripts/sr01
 * documents:
 *
 *   mkdir _sr02_tools && cd _sr02_tools
 *   npm init -y && npm install acorn acorn-walk
 *   cp ../scripts/sr02/*.mjs .
 *   node run-all.mjs <repoRoot>
 *
 * Note: Node resolves imports relative to the SCRIPT's location, not cwd, so
 * the scripts must be copied next to node_modules — running them in place from
 * scripts/sr02/ fails with ERR_MODULE_NOT_FOUND.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.argv[2] || process.cwd();
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const EVID = path.join(ROOT, 'docs', 'plan3', 'evidence', 'A-SR02-FOCUS-ROUTING-20260731');
fs.mkdirSync(EVID, { recursive: true });

const CHART = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');

const run = (script, args) => {
  try {
    const out = execFileSync(process.execPath, [path.join(HERE, script), ...args], { encoding: 'utf8' });
    return { exit: 0, out };
  } catch (e) {
    return { exit: e.status === undefined ? 1 : e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
};

// Booted path = chart.js plus every module loaded by the two SHIPPING shells
// (dist-v9/index.html single-chart, multichart-prod/chart-embed.html panel).
function bootedFiles() {
  const shells = [
    path.join(ROOT, 'chart v 1.4', 'chart', 'dist-v9', 'index.html'),
    path.join(ROOT, 'chart v 1.4', 'chart', 'multichart-prod', 'chart-embed.html'),
  ];
  const mods = new Set();
  for (const s of shells) {
    const src = fs.readFileSync(s, 'utf8');
    for (const m of src.matchAll(/modules\/([A-Za-z0-9_.-]+\.js)/g)) mods.add(m[1]);
  }
  const files = [CHART];
  const missing = [];
  for (const m of [...mods].sort()) {
    const p = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', m);
    if (fs.existsSync(p)) files.push(p); else missing.push(m);
  }
  return { files, missing };
}

const steps = [];
const { files, missing } = bootedFiles();
if (missing.length) console.log(`NOTE: shells reference modules not on disk: ${missing.join(', ')}`);

steps.push(['census-positive-control', run('sr02-census-control.mjs', [])]);
steps.push(['classification', run('sr02-classify.mjs', [path.join(EVID, 'window-chart-classification.json'), ...files])]);
steps.push(['focus-seam-source-bound', run('sr02-focus-seam-controls.mjs', [ROOT, path.join(EVID, 'focus-seam-controls.json')])]);
steps.push(['resize-suite', run('sr02-resize-harness.mjs', [CHART, path.join(EVID, 'resize-suite.json')])]);
steps.push(['mutants', run('sr02-mutants.mjs', [ROOT, path.join(EVID, 'mutants.json')])]);

const summary = steps.map(([name, r]) => ({ step: name, exit: r.exit, verdict: r.exit === 0 ? 'GREEN' : 'RED' }));
console.log(JSON.stringify({ signature: 'TALARIA_SR02_RUN_ALL_V1', bootedFileCount: files.length, summary }, null, 2));
for (const [name, r] of steps) {
  if (r.exit !== 0) console.log(`\n--- ${name} (exit ${r.exit}) ---\n${r.out}`);
}
fs.writeFileSync(path.join(EVID, 'run-all-summary.json'),
  `${JSON.stringify({ bootedFileCount: files.length, summary, measuredAt: new Date().toISOString() }, null, 2)}\n`);
process.exit(summary.every((s) => s.exit === 0) ? 0 : 1);

#!/usr/bin/env node
/**
 * INSTRUMENT-01 — a result is not citable until the instrument that produced it is committed.
 *
 * WHY A CHECK AND NOT A CONVENTION. Twice today a tree was lost to truncation, and tonight a
 * measurement instrument was committed by another lane while two of its imports were still
 * untracked — HEAD carried a soak that could not resolve its own modules. The policy was already
 * agreed; what was missing was anything that could answer "is this result citable" without a human
 * remembering to look.
 *
 * COMMITTED IS NOT ENOUGH, AND THAT IS THE POINT OF THE THIRD CHECK. An instrument whose own
 * imports are untracked is committed and still unreproducible: a clean checkout fails at module
 * resolution before the first sample. So this walks the local import graph, not just the entry file.
 * That is the exact defect that put `sealed-two-arm-soak.mjs` into HEAD broken at 23:17.
 *
 * FIVE STATES, KEPT APART (BIND-01), because the fix differs for each:
 *   NOT_A_REPO            no git working tree — cannot verify, and must not claim citable
 *   INSTRUMENT_MISSING    the path does not exist
 *   INSTRUMENT_UNTRACKED  exists on disk only; a truncation loses the instrument and the run
 *   INSTRUMENT_DIRTY      tracked but modified; the committed bytes are not what ran
 *   DEPENDENCY_UNTRACKED  the entry is committed but its import graph is not — broken at HEAD
 *   CITABLE               entry and every local dependency are tracked and clean
 *
 *   node scripts/instrument-provenance.mjs scripts/arena-timeseries.mjs
 *   node scripts/instrument-provenance.mjs --all          # every instrument under scripts/
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..');

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[^'"\n]*from\s*['"](\.[^'"]+)['"]/g;
const DYNAMIC_RE = /import\(\s*['"](\.[^'"]+)['"]\s*\)/g;
/**
 * Side-effect imports (`import './register.mjs';`) carry no `from` clause and were missed by the
 * first pass. They are dependencies like any other — a clean checkout without them fails exactly
 * the same way — and the self-test caught this before the tool was ever committed.
 */
const SIDE_EFFECT_RE = /(?:^|\n)\s*import\s*['"](\.[^'"]+)['"]/g;

/** Local (relative) specifiers only. Bare specifiers are npm's problem, not provenance's. */
export function localImportsOf(source) {
  const out = new Set();
  for (const re of [IMPORT_RE, DYNAMIC_RE, SIDE_EFFECT_RE]) {
    re.lastIndex = 0;
    let m = re.exec(source);
    while (m) { out.add(m[1]); m = re.exec(source); }
  }
  return [...out];
}

const toRepoRel = (abs) => path.relative(REPO_ROOT, abs).replace(/\\/g, '/');

/**
 * Walk the local import graph from an entry file. `readFile` is injectable so the self-test can
 * describe a graph without touching disk.
 */
export function collectGraph(entryAbs, { readFile = (p) => fs.readFileSync(p, 'utf8') } = {}) {
  const seen = new Set();
  const missing = [];
  const stack = [entryAbs];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    let src;
    try { src = readFile(file); } catch { missing.push(toRepoRel(file)); continue; }
    for (const spec of localImportsOf(src)) {
      const resolved = path.resolve(path.dirname(file), spec);
      if (!seen.has(resolved)) stack.push(resolved);
    }
  }
  return { files: [...seen], missing };
}

/** `git ls-files` for a set of paths, returning the tracked subset. */
function trackedSubset(repoRelPaths, cwd = REPO_ROOT) {
  if (!repoRelPaths.length) return new Set();
  try {
    const raw = execFileSync('git', ['ls-files', '-z', '--', ...repoRelPaths], { cwd, encoding: 'utf8', maxBuffer: 1 << 24 });
    return new Set(raw.split('\0').filter(Boolean).map((p) => p.replace(/\\/g, '/')));
  } catch { return new Set(); }
}

/** Paths with uncommitted modifications (staged or not). */
function dirtySubset(repoRelPaths, cwd = REPO_ROOT) {
  if (!repoRelPaths.length) return new Set();
  try {
    const raw = execFileSync('git', ['status', '--porcelain=v1', '-z', '--', ...repoRelPaths], { cwd, encoding: 'utf8', maxBuffer: 1 << 24 });
    const out = new Set();
    for (const entry of raw.split('\0')) {
      if (!entry) continue;
      const p = entry.slice(3);
      if (p && entry.slice(0, 2) !== '??') out.add(p.replace(/\\/g, '/'));
    }
    return out;
  } catch { return new Set(); }
}

export function isRepo(cwd = REPO_ROOT) {
  try { execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, stdio: 'pipe' }); return true; } catch { return false; }
}

export function headSha(cwd = REPO_ROOT) {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim(); } catch { return null; }
}

/**
 * The decision, pure so it is testable without git. `tracked` and `dirty` are sets of repo-relative
 * paths; `graph` is the output of collectGraph.
 */
export function judge({ entryRel, graph, tracked, dirty, repo = true }) {
  if (!repo) return { state: 'NOT_A_REPO', citable: false, reason: 'no git working tree; provenance cannot be verified here' };
  if (graph.missing.includes(entryRel)) {
    return { state: 'INSTRUMENT_MISSING', citable: false, reason: `${entryRel} does not exist` };
  }
  const rels = graph.files.map((f) => (path.isAbsolute(f) ? toRepoRel(f) : f));
  const deps = rels.filter((r) => r !== entryRel);

  if (!tracked.has(entryRel)) {
    return { state: 'INSTRUMENT_UNTRACKED', citable: false, entryRel, reason: `${entryRel} exists on disk only — a truncation loses the instrument and every run behind it` };
  }
  if (dirty.has(entryRel)) {
    return { state: 'INSTRUMENT_DIRTY', citable: false, entryRel, reason: `${entryRel} is tracked but modified; the committed bytes are not what ran` };
  }
  const untrackedDeps = deps.filter((d) => !tracked.has(d));
  if (untrackedDeps.length) {
    return {
      state: 'DEPENDENCY_UNTRACKED', citable: false, entryRel, untrackedDeps,
      reason: `${entryRel} is committed but ${untrackedDeps.length} of its imports are not: ${untrackedDeps.join(', ')}. `
        + 'A clean checkout fails at module resolution before the first sample.',
    };
  }
  const dirtyDeps = deps.filter((d) => dirty.has(d));
  if (dirtyDeps.length) {
    return { state: 'DEPENDENCY_DIRTY', citable: false, entryRel, dirtyDeps, reason: `${entryRel} is clean but ${dirtyDeps.length} of its imports are modified: ${dirtyDeps.join(', ')}` };
  }
  return { state: 'CITABLE', citable: true, entryRel, dependencyCount: deps.length, reason: `${entryRel} and its ${deps.length} local dependencies are committed and clean` };
}

export function checkInstrument(entryPath, { cwd = REPO_ROOT } = {}) {
  const entryAbs = path.resolve(cwd, entryPath);
  const entryRel = toRepoRel(entryAbs);
  const repo = isRepo(cwd);
  const graph = collectGraph(entryAbs);
  const rels = graph.files.map(toRepoRel);
  const verdict = judge({ entryRel, graph, tracked: trackedSubset(rels, cwd), dirty: dirtySubset(rels, cwd), repo });
  return { ...verdict, headSha: repo ? headSha(cwd) : null, files: rels };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  let targets = args;
  if (process.argv.includes('--all')) {
    targets = fs.readdirSync(path.join(REPO_ROOT, 'scripts'))
      .filter((f) => f.endsWith('.mjs') && !f.includes('selftest'))
      .map((f) => `scripts/${f}`);
  }
  if (!targets.length) {
    console.error('usage: node scripts/instrument-provenance.mjs <instrument.mjs> [...]  |  --all');
    process.exit(1);
  }
  let worst = 0;
  const byState = new Map();
  for (const t of targets) {
    const v = checkInstrument(t);
    byState.set(v.state, [...(byState.get(v.state) || []), v.entryRel || t]);
    if (!v.citable) worst = 2;
    if (targets.length === 1) console.log(`[instrument-01] ${v.state} — ${v.reason}`);
  }
  if (targets.length > 1) {
    for (const [state, list] of [...byState.entries()].sort()) {
      console.log(`[instrument-01] ${state}: ${list.length}`);
      if (state !== 'CITABLE') list.forEach((p) => console.log(`    ${p}`));
    }
  }
  process.exit(worst);
}

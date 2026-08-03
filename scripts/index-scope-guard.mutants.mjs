/**
 * Mutants for INDEX-SCOPE-01. Each edit is a plausible way to write the guard
 * wrong in a way that still reads as working; a SURVIVED mutant means the cells
 * describe the code rather than constrain it.
 *
 *   node scripts/index-scope-guard.mutants.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(__dirname, 'index-scope-guard.mjs');
const WRAP = path.join(__dirname, 'commit-scoped.mjs');
const CELLS = path.join(__dirname, 'index-scope-guard.selftest.mjs');

const MUTANTS = [
  {
    name: 'unnamed becomes a warning instead of a refusal',
    file: GUARD,
    from: "      state: 'INDEX_CARRIES_UNNAMED',",
    to: "      state: 'INDEX_SCOPED',",
  },
  {
    name: 'exit code softened to 0 so the hook never blocks',
    file: GUARD,
    from: '  if (!res.ok) process.exitCode = 3;',
    to: '  if (!res.ok) process.exitCode = 0;',
  },
  {
    name: 'naming nothing passes vacuously',
    file: GUARD,
    from: "      state: 'NOTHING_NAMED',",
    to: "      state: 'INDEX_SCOPED',",
  },
  {
    name: 'covers matches by prefix, so naming scripts/lib covers scripts/libextra',
    file: GUARD,
    from: '  return file === named || file.startsWith(`${named}/`);',
    to: '  return file === named || file.startsWith(named);',
  },
  {
    name: 'a mistyped name is silently ignored',
    file: GUARD,
    from: '    if (absent.length) {',
    to: '    if (false && absent.length) {',
  },
  {
    name: 'renames collapse so a foreign delete stops being visible',
    file: GUARD,
    from: "  return gitZ(['diff', '--cached', '--name-only', '--no-renames', '-z'], root);",
    to: "  return gitZ(['diff', '--cached', '--name-only', '-z'], root);",
  },
  {
    name: 'outside-the-repo normalizes to the root, which covers everything',
    file: GUARD,
    from: "  if (s.startsWith('../')) return null; // outside the repo; never in scope",
    to: "  if (s.startsWith('../')) return ''; // outside the repo; never in scope",
  },
  {
    name: 'root resolved from __dirname, so the guard watches the wrong repo',
    file: GUARD,
    from: "  const root = resolveRoot(argv);",
    to: "  const root = REPO_ROOT;",
  },
  {
    name: 'commit post-condition always agrees with itself',
    file: WRAP,
    from: '  if (unnamed.length) {\n    return { state: \'COMMIT_CARRIES_UNNAMED\', ok: false, unnamed };',
    to: '  if (false && unnamed.length) {\n    return { state: \'COMMIT_CARRIES_UNNAMED\', ok: false, unnamed };',
  },
  {
    name: 'scope file left behind, blessing the next commit',
    file: WRAP,
    from: '  try { fs.unlinkSync(scopeFile); } catch { /* best effort */ }',
    to: '  try { void scopeFile; } catch { /* best effort */ }',
  },
];

function runCells() {
  const res = spawnSync(process.execPath, ['--test', '--test-reporter=tap', CELLS], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8',
  });
  return res.status === 0;
}

function main() {
  if (!runCells()) {
    console.log('[mutants] BASELINE_RED — cells fail unmutated; fix that before reading any of this');
    process.exitCode = 1;
    return;
  }
  console.log('[mutants] baseline green');

  let survived = 0;
  for (const m of MUTANTS) {
    const original = fs.readFileSync(m.file, 'utf8');
    if (!original.includes(m.from)) {
      console.log(`[mutants] ANCHOR_BROKEN  ${m.name}`);
      console.log('           the text this mutant edits is gone; the mutant tested nothing');
      survived += 1; // a mutant that cannot be applied is not a kill
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    let killed;
    try { killed = !runCells(); } finally { fs.writeFileSync(m.file, original); }
    console.log(`[mutants] ${killed ? 'KILLED  ' : 'SURVIVED'}  ${m.name}`);
    if (!killed) survived += 1;
  }

  console.log(`[mutants] ${MUTANTS.length - survived}/${MUTANTS.length} killed`);
  if (survived) process.exitCode = 1;
}

main();

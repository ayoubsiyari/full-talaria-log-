/**
 * INDEX-SCOPE-01 — a commit may not carry a file its author did not name.
 *
 * The defect this exists to stop, in its own words: four files belonging to C
 * and E rode into e6f4f6d69 because the shared index already carried them. The
 * commit message described a change it did not own. `git commit --only` fixes
 * one author's habit; refusing when the index holds anything unnamed fixes the
 * class, because the index is shared and the habit is not.
 *
 * The board rule is that the author's lane owns the file. This applies the same
 * rule to the index, with one honest limitation stated up front: ownership is
 * not machine-knowable for a script in this repo. Every lane commits under the
 * same git author, and no manifest maps paths to lanes. So the guard cannot ask
 * "whose file is this?" — it can only ask "did you name it?", which is the same
 * question one layer earlier and is answerable without a registry.
 *
 * States, in BIND-01 shape:
 *   INDEX_SCOPED          — every staged path is covered by a named path.
 *   INDEX_CARRIES_UNNAMED — the index holds paths the author did not name. RED.
 *   NOTHING_STAGED        — no index content; nothing to bless or refuse.
 *   NOTHING_NAMED         — the caller named nothing, so the check is vacuous
 *                           and says so rather than passing.
 *   NAMED_PATH_ABSENT     — a named path is neither staged nor on disk. A typo
 *                           in a name silently widens the scope it was meant to
 *                           narrow, so it is a refusal, not a warning.
 *
 * Usage:
 *   node scripts/index-scope-guard.mjs <path>...      # exit 3 if unnamed present
 *   node scripts/index-scope-guard.mjs --json <path>...
 *   node scripts/index-scope-guard.mjs --hook         # names read from .git/COMMIT_SCOPE
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Repo-relative, forward slashes, no trailing slash. Accepts absolute paths,
 * backslashes, and `./` prefixes because those are what a shell hands over.
 *
 * `chart v 1.4/` has a space in it, which is why every git read below uses -z:
 * git's default output quotes and escapes some paths, and a guard that mangles
 * one path in the tree it protects is worse than no guard.
 */
export function normalizeRel(p, root = REPO_ROOT) {
  if (typeof p !== 'string' || !p.length) return null;
  let s = p.replace(/\\/g, '/').trim();
  if (!s.length) return null;
  if (path.isAbsolute(p) || /^[A-Za-z]:\//.test(s)) {
    s = path.relative(root, p).replace(/\\/g, '/');
  }
  s = s.replace(/^\.\//, '').replace(/\/+$/, '');
  if (!s.length || s === '.') return '';
  if (s.startsWith('../')) return null; // outside the repo; never in scope
  return s;
}

/** Is `file` the named path itself, or inside it when the name is a directory? */
export function covers(named, file) {
  if (named === '') return true; // the repo root names everything
  return file === named || file.startsWith(`${named}/`);
}

function gitZ(args, root) {
  const raw = execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  return raw.split('\0').map((s) => s.trim()).filter(Boolean);
}

/** Staged paths, including deletions. -z so spaces and unicode survive intact. */
export function stagedPaths(root = REPO_ROOT) {
  // --no-renames on purpose: a staged rename reported as one new path hides the
  // old path, and a delete of another lane's file is exactly the shape of the
  // three deletions the board rule was written for.
  return gitZ(['diff', '--cached', '--name-only', '--no-renames', '-z'], root);
}

/**
 * The core, pure so it can be exercised without a repository.
 */
export function scopeCheck({ staged, named, root = REPO_ROOT, checkNamedExist = true }) {
  const namedRel = [];
  for (const n of named) {
    const rel = normalizeRel(n, root);
    if (rel === null) continue;
    namedRel.push(rel);
  }
  const stagedRel = staged.map((s) => normalizeRel(s, root)).filter((s) => s !== null);

  if (!stagedRel.length) {
    return { state: 'NOTHING_STAGED', unnamed: [], named: namedRel, staged: stagedRel, ok: true };
  }
  if (!namedRel.length) {
    return {
      state: 'NOTHING_NAMED',
      unnamed: stagedRel,
      named: [],
      staged: stagedRel,
      ok: false,
      why: 'nothing was named, so every staged path is unnamed; the check would otherwise pass vacuously',
    };
  }

  if (checkNamedExist) {
    const absent = namedRel.filter((n) => {
      if (stagedRel.some((f) => covers(n, f))) return false;
      return !fs.existsSync(path.join(root, n));
    });
    if (absent.length) {
      return {
        state: 'NAMED_PATH_ABSENT',
        unnamed: [],
        absent,
        named: namedRel,
        staged: stagedRel,
        ok: false,
        why: 'a named path matches nothing staged and does not exist; a mistyped name widens the scope it was meant to narrow',
      };
    }
  }

  const unnamed = stagedRel.filter((f) => !namedRel.some((n) => covers(n, f)));
  if (unnamed.length) {
    return {
      state: 'INDEX_CARRIES_UNNAMED',
      unnamed,
      named: namedRel,
      staged: stagedRel,
      ok: false,
      why: `${unnamed.length} staged path(s) were not named by this commit`,
    };
  }
  return { state: 'INDEX_SCOPED', unnamed: [], named: namedRel, staged: stagedRel, ok: true };
}

/**
 * Hook mode reads the declaration from `.git/COMMIT_SCOPE`, written by
 * commit-scoped.mjs. An absent file is not a pass: a plain `git commit` names
 * nothing, which is precisely the commit this guard exists to refuse.
 */
export function readHookScope(root = REPO_ROOT) {
  let gitDir;
  try {
    gitDir = execFileSync('git', ['rev-parse', '--git-dir'], { cwd: root, encoding: 'utf8' }).trim();
  } catch { return { declared: false, named: [], why: 'git rev-parse --git-dir failed' }; }
  const file = path.isAbsolute(gitDir) ? path.join(gitDir, 'COMMIT_SCOPE') : path.join(root, gitDir, 'COMMIT_SCOPE');
  if (!fs.existsSync(file)) return { declared: false, named: [], file, why: 'no .git/COMMIT_SCOPE — this commit named nothing' };
  const named = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((s) => s.trim())
    .filter((s) => s.length && !s.startsWith('#'));
  return { declared: true, named, file };
}

/**
 * A merge, rebase or cherry-pick commit legitimately carries files its author
 * never named — that is what merging is. Refusing them would make the hook
 * something every lane disables, and a guard that gets switched off protects
 * nothing. Exempt, and say so out loud rather than silently passing.
 */
export function sequencerInProgress(gitDirAbs) {
  const marks = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply'];
  return marks.filter((m) => fs.existsSync(path.join(gitDirAbs, m)));
}

export function gitDirOf(root = REPO_ROOT) {
  const gitDir = execFileSync('git', ['rev-parse', '--git-dir'], { cwd: root, encoding: 'utf8' }).trim();
  return path.isAbsolute(gitDir) ? gitDir : path.join(root, gitDir);
}

function report(res, { json }) {
  if (json) {
    console.log(JSON.stringify({ signature: 'INDEX-SCOPE-01', ...res }, null, 2));
    return;
  }
  const log = (m) => console.log(`[index-scope] ${m}`);
  log(`${res.state}${res.why ? ` — ${res.why}` : ''}`);
  if (res.state === 'INDEX_SCOPED') {
    log(`${res.staged.length} staged path(s), all named`);
    return;
  }
  for (const f of res.unnamed || []) log(`  UNNAMED  ${f}`);
  for (const f of res.absent || []) log(`  ABSENT   ${f}`);
  if (res.unnamed && res.unnamed.length) {
    log('');
    log('Either name them, or take them out of the index:');
    log(`  git restore --staged ${res.unnamed.map((f) => (f.includes(' ') ? `"${f}"` : f)).join(' ')}`);
  }
}

/**
 * Guard the repository you are committing in, not the one this file happens to
 * live in. Deriving the root from __dirname made the end-to-end cell read the
 * real repo's index while claiming to test a temporary one — a guard pointed at
 * the wrong tree, which is how the host-scope guard sat inert this evening.
 */
export function resolveRoot(argv = [], cwd = process.cwd()) {
  const i = argv.indexOf('--root');
  if (i >= 0 && argv[i + 1]) return path.resolve(argv[i + 1]);
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
  } catch {
    return REPO_ROOT;
  }
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const hook = argv.includes('--hook');
  const rootIdx = argv.indexOf('--root');
  const names = argv.filter((a, i) => !a.startsWith('--') && i !== rootIdx + 1);
  const root = resolveRoot(argv);

  let named = names;
  if (hook) {
    let marks = [];
    try { marks = sequencerInProgress(gitDirOf(root)); } catch { /* fall through */ }
    if (marks.length) {
      const res = { state: 'SEQUENCER_IN_PROGRESS', ok: true, exempt: marks, unnamed: [], staged: [], named: [] };
      report(res, { json });
      return;
    }
    const scope = readHookScope(root);
    named = scope.named;
    if (!scope.declared && !json) {
      console.log(`[index-scope] ${scope.why}`);
      console.log('[index-scope] commit with: node scripts/commit-scoped.mjs -F <msgfile> <path>...');
    }
  }

  let staged;
  try {
    staged = stagedPaths(root);
  } catch (err) {
    console.log(`[index-scope] GIT_READ_FAILED — ${err.message.split('\n')[0]}`);
    process.exitCode = 3; // unreadable index is a refusal, never a pass
    return;
  }

  const res = scopeCheck({ staged, named, root });
  report(res, { json });
  if (!res.ok) process.exitCode = 3;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}

/**
 * INDEX-SCOPE-01 — commit exactly the paths you name, and prove it afterwards.
 *
 * `git commit --only <paths>` already ignores the rest of the index, so the
 * pre-flight is not the interesting part; the post-condition is. This commits,
 * then reads back the commit's own file list and compares it to the names. A
 * commit whose contents disagree with its declaration is reported loudly with
 * the undo command, because that is the failure e6f4f6d69 was and nobody
 * noticed until the next morning.
 *
 * Also writes .git/COMMIT_SCOPE for the pre-commit hook, and removes it again
 * afterwards — a scope file left behind would bless the *next* commit, which is
 * a stale-token false green of the kind that has cost us a day already.
 *
 *   node scripts/commit-scoped.mjs -F .scratch/msg.txt <path>...
 *   node scripts/commit-scoped.mjs -m "message" <path>...
 *   node scripts/commit-scoped.mjs --dry-run -F ... <path>...
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

import { normalizeRel, covers, stagedPaths, scopeCheck } from './index-scope-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const log = (m) => console.log(`[commit-scoped] ${m}`);

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', ...opts });
}

export function parseArgs(argv) {
  const out = { paths: [], messageFile: null, message: null, dryRun: false, allowUntracked: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '-F' || a === '--file') { out.messageFile = argv[i + 1]; i += 1; continue; }
    if (a === '-m' || a === '--message') { out.message = argv[i + 1]; i += 1; continue; }
    if (a === '--dry-run') { out.dryRun = true; continue; }
    if (a.startsWith('-')) continue;
    out.paths.push(a);
  }
  return out;
}

/** Files in a commit, repo-relative, -z so `chart v 1.4/` survives. */
export function commitFiles(ref = 'HEAD') {
  const raw = git(['show', '--name-only', '--no-renames', '--format=', '-z', ref]);
  return raw.split('\0').map((s) => s.trim()).filter(Boolean);
}

/** Did the landed commit carry only what was named? The authoritative check. */
export function verifyCommit(files, named) {
  const namedRel = named.map((n) => normalizeRel(n)).filter((n) => n !== null);
  const unnamed = files.filter((f) => !namedRel.some((n) => covers(n, f)));
  if (unnamed.length) {
    return { state: 'COMMIT_CARRIES_UNNAMED', ok: false, unnamed };
  }
  return { state: 'COMMIT_SCOPED', ok: true, unnamed: [] };
}

function writeScopeFile(named) {
  const gitDir = git(['rev-parse', '--git-dir']).trim();
  const dir = path.isAbsolute(gitDir) ? gitDir : path.join(REPO_ROOT, gitDir);
  const file = path.join(dir, 'COMMIT_SCOPE');
  fs.writeFileSync(file, `${named.join('\n')}\n`);
  return file;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.paths.length) {
    log('REFUSED_NO_PATHS — name the paths this commit owns');
    process.exitCode = 2;
    return;
  }
  if (!args.messageFile && !args.message) {
    log('REFUSED_NO_MESSAGE — pass -F <file> or -m <message>');
    process.exitCode = 2;
    return;
  }

  const named = args.paths.map((p) => normalizeRel(p)).filter(Boolean);
  const missing = named.filter((n) => !fs.existsSync(path.join(REPO_ROOT, n)));
  // A named path that does not exist may be a staged deletion, which is
  // legitimate; anything else is a typo and typos widen scope.
  const staged = stagedPaths();
  const badNames = missing.filter((n) => !staged.some((f) => covers(n, f)));
  if (badNames.length) {
    log(`REFUSED_NAMED_PATH_ABSENT — ${badNames.join(', ')}`);
    process.exitCode = 3;
    return;
  }

  // Untracked files cannot be committed by --only unless they are in the index,
  // so stage exactly the named ones. Nothing else is touched.
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0')
    .map((s) => s.trim()).filter(Boolean);
  const toAdd = named.filter((n) => untracked.some((u) => covers(n, u)) || fs.existsSync(path.join(REPO_ROOT, n)));
  if (toAdd.length && !args.dryRun) git(['add', '-f', '--', ...toAdd]);

  const pre = scopeCheck({ staged: stagedPaths(), named });
  if (pre.state === 'INDEX_CARRIES_UNNAMED') {
    log(`index also holds ${pre.unnamed.length} unnamed path(s); --only will leave them alone:`);
    for (const f of pre.unnamed.slice(0, 12)) log(`  left in index: ${f}`);
  }

  if (args.dryRun) {
    log(`DRY_RUN — would commit ${named.length} named path(s)`);
    for (const n of named) log(`  ${n}`);
    return;
  }

  const scopeFile = writeScopeFile(named);
  const msgArgs = args.messageFile ? ['-F', args.messageFile] : ['-m', args.message];
  const res = spawnSync('git', ['commit', '--only', ...msgArgs, '--', ...named], {
    cwd: REPO_ROOT, encoding: 'utf8', stdio: 'inherit',
  });
  try { fs.unlinkSync(scopeFile); } catch { /* best effort */ }

  if (res.status !== 0) {
    log(`COMMIT_FAILED — git exited ${res.status}`);
    process.exitCode = res.status || 1;
    return;
  }

  const files = commitFiles('HEAD');
  const verdict = verifyCommit(files, named);
  const sha = git(['rev-parse', '--short', 'HEAD']).trim();
  if (!verdict.ok) {
    log(`${verdict.state} — ${sha} carries paths it did not name:`);
    for (const f of verdict.unnamed) log(`  UNNAMED  ${f}`);
    log('undo with: git reset --soft HEAD~1');
    process.exitCode = 3;
    return;
  }
  log(`COMMIT_SCOPED — ${sha}, ${files.length} file(s), all named`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}

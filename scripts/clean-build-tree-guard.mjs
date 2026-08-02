#!/usr/bin/env node
/**
 * CLEAN-TREE-01 — the twin of BUILD-ID-01, for the other half of the same disease.
 *
 * The V9 build compiles the working TREE, not the commit. We share a filesystem,
 * so a build run while another lane has uncommitted source on disk compiles that
 * source into the bundle. That is not hypothetical: the bundle committed at
 * c0c013b9c contains `__TALARIA_DISABLE_PANEL_STATE_PERSIST_V1` while ZERO
 * source files at that commit contain it. A rebuild at that SHA would produce
 * different bytes, which makes PASSPORT-3's source coordinate name a tree that
 * never produced the artefact it is stamped on.
 *
 * `rebuild-constraint:provenance` detects that after the fact. A gate that
 * catches a bad build once it exists still lets a bad build exist, so this
 * refuses up front: dirty build inputs, exit 2, nothing written, offending
 * paths named.
 *
 * Scope is deliberately narrow. Refusing on ANY dirty file would refuse on
 * board notes and gate files that cannot reach the bundle, and a gate that
 * fires on work it does not govern gets routed around within a day. Only paths
 * that can end up in built or mirrored bytes count.
 *
 *   node scripts/clean-build-tree-guard.mjs          # refuse, or say why it passed
 *   node scripts/clean-build-tree-guard.mjs --list   # show what it governs
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..');

/** Roots whose contents can reach built or mirrored bytes. */
export const BUILD_INPUT_ROOTS = [
  'chart v 1.4/talaria-design/src/',
  'chart v 1.4/talaria-design/live/',
  'chart v 1.4/chart/',
];

/** Written by the build itself, so their state before it starts proves nothing. */
const OUTPUT_PATTERNS = [
  /(^|\/)dist-v9\//,
  /(^|\/)node_modules\//,
  /(^|\/)\.vite\//,
];

/** Present in the roots but incapable of reaching a served byte. */
const NON_SHIPPING_PATTERNS = [
  /\.(test|spec|mutants|red|acceptance)\.[cm]?js$/i,
  /\.(md|log|txt)$/i,
  /(^|\/)(b-fixtures|evidence|harness|__tests__|tests)\//i,
];

/**
 * Can this path change what the build emits? Shared with
 * rebuild-constraint-check so "product source" means one thing in both tools:
 * a check that governs a wider set than the guard would flag work the guard
 * allowed, and the two would disagree at the worst moment.
 */
export function isBuildInput(repoRelPath) {
  const p = String(repoRelPath || '').replace(/\\/g, '/');
  if (!p) return false;
  if (!BUILD_INPUT_ROOTS.some((root) => p.startsWith(root))) return false;
  if (OUTPUT_PATTERNS.some((re) => re.test(p))) return false;
  if (NON_SHIPPING_PATTERNS.some((re) => re.test(p))) return false;
  return true;
}

export class DirtyTreeRefusal extends Error {
  constructor(reason, message, paths) {
    super(message);
    this.name = 'DirtyTreeRefusal';
    this.reason = reason;
    this.paths = paths;
  }
}

/**
 * Parse `git status --porcelain=v1 -z`. NUL-separated because repo paths contain
 * spaces ("chart v 1.4"), which the non-`-z` form quotes and escapes — parsing
 * that back is its own source of wrong answers.
 */
export function parsePorcelainZ(raw) {
  const out = [];
  const parts = String(raw || '').split('\0');
  for (let i = 0; i < parts.length; i += 1) {
    const entry = parts[i];
    if (!entry) continue;
    const xy = entry.slice(0, 2);
    const p = entry.slice(3);
    if (!p) continue;
    // A rename/copy carries its source path in the following record.
    if (xy[0] === 'R' || xy[0] === 'C') {
      const from = parts[i + 1];
      i += 1;
      out.push({ xy, path: p, from: from || null });
      continue;
    }
    out.push({ xy, path: p, from: null });
  }
  return out;
}

/** Entries that can change emitted bytes, with both sides of a rename counted. */
export function offendingEntries(entries) {
  const hits = [];
  for (const e of entries) {
    const candidates = [e.path, e.from].filter(Boolean);
    if (candidates.some(isBuildInput)) hits.push(e);
  }
  return hits;
}

function describe(xy) {
  if (xy === '??') return 'untracked';
  if (xy.includes('D')) return 'deleted';
  if (xy.includes('R')) return 'renamed';
  if (xy.includes('A')) return 'added';
  return 'modified';
}

/**
 * Returns null when there is no git working tree to inspect. That is not a
 * failure: Docker and CI build from source copied out of a commit, so there is
 * no working tree that could be carrying another lane's uncommitted edits — the
 * hazard this guard exists for cannot occur there. Refusing would break every
 * production build to defend against something structurally impossible.
 */
export function readStatus(cwd = REPO_ROOT) {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, stdio: 'pipe' });
  } catch {
    return null;
  }
  return execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=normal'], {
    cwd, encoding: 'utf8', maxBuffer: 1 << 26,
  });
}

/**
 * Throws DirtyTreeRefusal when the build would compile uncommitted source.
 * `statusLines` is injectable so the gate can drive it without a real tree.
 */
export function assertCleanBuildInputs({ cwd = REPO_ROOT, env = process.env, raw = null } = {}) {
  const status = raw == null ? readStatus(cwd) : raw;
  if (status === null) return { clean: true, unverifiable: true, offenders: [] };
  const entries = parsePorcelainZ(status);
  const offenders = offendingEntries(entries);
  if (offenders.length === 0) return { clean: true, offenders: [] };

  const override = String(env.TALARIA_ALLOW_DIRTY_BUILD || '').trim();
  if (override) {
    // Not a silent bypass: it costs a stated reason and it is printed every time.
    if (override.length < 12) {
      throw new DirtyTreeRefusal(
        'OVERRIDE_UNJUSTIFIED',
        [
          '[clean-build-tree] REFUSING TO BUILD — TALARIA_ALLOW_DIRTY_BUILD needs a reason, not a flag.',
          `  Got ${JSON.stringify(override)}. Give the reason you are shipping unreproducible bytes:`,
          '  TALARIA_ALLOW_DIRTY_BUILD="hotfix, D mid-commit, provenance waived by PO" npm run build:chart-v9',
        ].join('\n'),
        offenders.map((o) => o.path),
      );
    }
    return { clean: false, overridden: true, reason: override, offenders };
  }

  const lines = offenders.slice(0, 40).map((o) => `    ${describe(o.xy).padEnd(9)} ${o.path}`);
  const more = offenders.length > 40 ? [`    ... and ${offenders.length - 40} more`] : [];

  throw new DirtyTreeRefusal(
    'DIRTY_BUILD_INPUTS',
    [
      '[clean-build-tree] REFUSING TO BUILD — uncommitted build inputs. Nothing was written.',
      '',
      `  ${offenders.length} path(s) that can reach built or mirrored bytes are not committed:`,
      ...lines,
      ...more,
      '',
      '  The V9 build compiles the working tree, not the commit. Building now stamps a',
      '  source SHA onto bytes that SHA cannot reproduce, which is the failure found in',
      '  the bundle at c0c013b9c. Commit or stash these, then build.',
      '',
      '  Board notes, gate files and docs are not governed here — only paths that can',
      '  change what the build emits. Run --list to see the governed roots.',
      '',
      '  Verify after building:  npm run rebuild-constraint:provenance',
    ].join('\n'),
    offenders.map((o) => o.path),
  );
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  if (process.argv.includes('--list')) {
    console.log('[clean-build-tree] governed roots:');
    BUILD_INPUT_ROOTS.forEach((r) => console.log(`    ${r}`));
    console.log('[clean-build-tree] excluded within them: dist-v9, node_modules, gates, docs, fixtures, logs');
    process.exit(0);
  }
  try {
    const res = assertCleanBuildInputs();
    if (res.overridden) {
      console.warn('');
      console.warn('  !!  BUILDING ON A DIRTY TREE — PROVENANCE WAIVED');
      console.warn(`  !!  reason: ${res.reason}`);
      console.warn(`  !!  ${res.offenders.length} uncommitted build input(s); this bundle will not be`);
      console.warn('  !!  reproducible from the SHA it is stamped with.');
      console.warn('');
      process.exit(0);
    }
    if (res.unverifiable) {
      console.log('[clean-build-tree] no git working tree here (Docker/CI); nothing to contaminate.');
      process.exit(0);
    }
    console.log('[clean-build-tree] build inputs are committed; this build is reproducible from HEAD.');
    process.exit(0);
  } catch (error) {
    if (error instanceof DirtyTreeRefusal) {
      console.error(error.message);
      process.exit(2);
    }
    // A guard that cannot read the tree must not be mistaken for a clean tree.
    console.error('[clean-build-tree] could not evaluate the tree:', error.message);
    process.exit(1);
  }
}

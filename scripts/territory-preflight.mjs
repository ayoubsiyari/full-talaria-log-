#!/usr/bin/env node
// A11.2 item 1 - CI ownership preflight plus the append-only journal check.
//
// Compares a packet's touched-file list against the authoring manager's territory in
// docs/plan3/TERRITORY.yml and fails the build on any out-of-territory path. No human
// in the loop, no semantic analysis: the authoring manager comes from each commit's
// trailers, the file list comes from git, and the comparison is a glob match.
//
//   node scripts/territory-preflight.mjs --base origin/main --head HEAD
//   node scripts/territory-preflight.mjs --manager C --files-from touched.txt
//
// Exit 0 GREEN, exit 1 RED with every violation listed.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditTouchedPaths, loadTerritoryManifest, SIGNATURE } from './lib/territory-manifest.mjs';
import { auditJournalAppendOnly } from './lib/journal-append-only.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MANIFEST = 'docs/plan3/TERRITORY.yml';
const REQUIRED_TRAILERS = ['Manager', 'Row', 'Packet', 'Tier'];
const UNIT_SEPARATOR = '\u001f';
const RECORD_SEPARATOR = '\u001e';

export function gitRunner(root = repoRoot) {
  // stderr is captured rather than inherited: `ls-files --error-unmatch` and `check-ignore`
  // are used as predicates, and their expected failures must not litter the CI log.
  return (args) => execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function trailerValue(message, name) {
  const matches = [...message.matchAll(new RegExp(`^${name}:[ \\t]*(.+?)[ \\t]*$`, 'gm'))];
  return matches.length ? matches[matches.length - 1][1] : null;
}

// Attribution is per commit, not per range. A packet may legitimately carry a Director
// commit alongside a manager's commits, and auditing each commit against its own declared
// manager is strictly stricter than auditing the range: it also catches a manager who
// slips an out-of-territory edit into one commit and reverts it in the next.
export function commitAttribution(commit) {
  const short = commit.sha.slice(0, 9);
  const trailers = {};
  for (const name of REQUIRED_TRAILERS) {
    const value = trailerValue(commit.message, name);
    assert.ok(value, `commit ${short}: required trailer ${name}: is absent`);
    trailers[name] = value;
  }
  assert.match(trailers.Manager, /^(?:Director|[A-Z])$/, `commit ${short}: Manager: ${trailers.Manager} is not a valid manager id`);
  assert.match(trailers.Tier, /^[123]$/, `commit ${short}: Tier: ${trailers.Tier} is not 1, 2 or 3`);
  return { sha: commit.sha, author: trailers.Manager, row: trailers.Row, packet: trailers.Packet, tier: trailers.Tier };
}

// Oldest first, so the journal audit walks the packet in the order it was written.
export function readCommits(git, base, head) {
  const raw = git(['log', '--reverse', `--format=%H${UNIT_SEPARATOR}%B${RECORD_SEPARATOR}`, `${base}..${head}`]);
  return raw
    .split(RECORD_SEPARATOR)
    .map((block) => block.replace(/^\n+/, ''))
    .filter((block) => block.trim().length)
    .map((block) => {
      const [sha, message = ''] = block.split(UNIT_SEPARATOR);
      return { sha: sha.trim(), message };
    });
}

function parseNameStatus(raw) {
  const changes = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const fields = line.split('\t');
    const status = fields[0][0];
    if (status === 'R' || status === 'C') {
      changes.push({ status, previousPath: fields[1], path: fields[2] });
    } else {
      changes.push({ status, previousPath: null, path: fields[1] });
    }
  }
  return changes;
}

export function readChanges(git, base, head) {
  return parseNameStatus(git(['diff', '--name-status', '-M', '--find-renames', `${base}...${head}`]));
}

function parentOf(git, sha) {
  const [, ...parents] = git(['rev-list', '--parents', '-n', '1', sha]).trim().split(/\s+/);
  return parents.length ? parents[0] : null;
}

// One commit's own changes, against its first parent. Merge commits are audited the same
// way, so a conflict resolution inside another manager's file is still a violation.
export function readCommitChanges(git, sha) {
  const parent = parentOf(git, sha);
  return parent === null
    ? parseNameStatus(git(['diff-tree', '-r', '--root', '--no-commit-id', '--name-status', '-M', sha]))
    : parseNameStatus(git(['diff', '--name-status', '-M', '--find-renames', parent, sha]));
}

function blobAt(git, ref, file) {
  if (ref === null) return null;
  try {
    return git(['show', `${ref}:${file}`]);
  } catch {
    return null;
  }
}

// Touched-file list for the ownership comparison: both sides of a rename count, because
// moving a file out of your territory is as much a territory violation as editing it.
export function touchedPaths(changes) {
  const paths = new Set();
  for (const change of changes) {
    paths.add(change.path);
    if (change.previousPath) paths.add(change.previousPath);
  }
  return [...paths].sort();
}

// Append-only enforcement over a file git refuses to stage enforces nothing, and `docs/`
// is ignored in this repository. So every packet re-proves that the manifest and the
// journals are tracked and not ignored. A journal that exists on disk but not in history
// is the same capability-loss-without-failure class the gates exist to catch.
export function auditDeclaredArtifacts({ git, manifest, root, exists = (file) => fs.existsSync(file) }) {
  const declared = [manifest.manifestPath, ...manifest.journals.map((entry) => entry.path)];
  const checked = [];
  const violations = [];
  for (const file of declared) {
    let tracked = true;
    try {
      git(['ls-files', '--error-unmatch', '--', file]);
    } catch {
      tracked = false;
    }
    let ignored = false;
    try {
      git(['check-ignore', '-q', '--', file]);
      ignored = true;
    } catch {
      ignored = false;
    }
    const present = exists(path.resolve(root, file));
    checked.push({ path: file, present, tracked, ignored });
    if (present && !tracked) {
      violations.push({ path: file, kind: 'artifact-untracked', detail: 'declared artifact exists on disk but is not tracked by git; check .gitignore' });
    }
    if (ignored) {
      violations.push({ path: file, kind: 'artifact-ignored', detail: 'declared artifact is matched by a .gitignore rule, so an append can be silently dropped' });
    }
  }
  return { ok: violations.length === 0, checked, violations };
}

function auditCommit({ git, manifest, commit }) {
  const attribution = commitAttribution(commit);
  const changes = readCommitChanges(git, commit.sha);
  const ownership = auditTouchedPaths(manifest, attribution.author, touchedPaths(changes));

  const journalPaths = new Set(manifest.journals.map((entry) => entry.path));
  const parent = parentOf(git, commit.sha);
  const journalChanges = changes
    .filter((change) => journalPaths.has(change.path) || (change.previousPath && journalPaths.has(change.previousPath)))
    .map((change) => ({
      ...change,
      before: blobAt(git, parent, change.previousPath || change.path) ?? '',
      after: change.status === 'D' ? null : blobAt(git, commit.sha, change.path),
    }));

  const journal = journalChanges.length
    ? auditJournalAppendOnly({ journals: manifest.journals, changes: journalChanges, author: attribution.author })
    : { signature: 'TALARIA_JOURNAL_APPEND_ONLY_V1', author: attribution.author, ok: true, checked: [], violations: [] };

  return {
    sha: commit.sha,
    author: attribution.author,
    row: attribution.row,
    packet: attribution.packet,
    tier: attribution.tier,
    ok: ownership.ok && journal.ok,
    ownership,
    journal,
  };
}

export function runPreflight({
  root = repoRoot,
  manifestPath = DEFAULT_MANIFEST,
  base,
  head = 'HEAD',
  git = gitRunner(root),
  manager = null,
  filesFrom = null,
} = {}) {
  const manifest = loadTerritoryManifest({ file: path.resolve(root, manifestPath) });

  // Offline mode: audit a manager-supplied file list. Journal content cannot be read
  // without a commit range, so a listed journal path is reported unresolved, never GREEN.
  if (filesFrom) {
    assert.ok(manager, 'territory preflight: --files-from requires --manager');
    const listed = fs.readFileSync(path.resolve(root, filesFrom), 'utf8')
      .split('\n').map((line) => line.trim()).filter(Boolean);
    const ownership = auditTouchedPaths(manifest, manager, listed);
    const journalPaths = new Set(manifest.journals.map((entry) => entry.path));
    const unresolved = listed.filter((file) => journalPaths.has(file));
    const journal = {
      signature: 'TALARIA_JOURNAL_APPEND_ONLY_V1',
      author: manager,
      ok: unresolved.length === 0,
      checked: [],
      violations: unresolved.map((file) => ({
        path: file,
        kind: 'journal-unresolvable',
        detail: 'journal content cannot be read from a file list; run against a commit range',
      })),
    };
    return {
      signature: SIGNATURE,
      manifestVersion: manifest.version,
      mode: 'file-list',
      base: null,
      head: null,
      authors: [manager],
      commits: [{ sha: null, author: manager, row: null, packet: null, tier: null, ok: ownership.ok && journal.ok, ownership, journal }],
      ok: ownership.ok && journal.ok,
    };
  }

  assert.ok(base, 'territory preflight: --base is required');
  const commits = readCommits(git, base, head);
  assert.ok(commits.length, `territory preflight: ${base}..${head} contains no commits`);
  const artifacts = auditDeclaredArtifacts({ git, manifest, root });
  const audited = commits.map((commit) => auditCommit({ git, manifest, commit }));

  if (manager) {
    const declared = [...new Set(audited.map((entry) => entry.author))];
    assert.deepEqual(declared, [manager], `territory preflight: --manager ${manager} disagrees with the commit trailers (${declared.join(', ')})`);
  }

  return {
    signature: SIGNATURE,
    manifestVersion: manifest.version,
    mode: 'commit-range',
    base,
    head,
    authors: [...new Set(audited.map((entry) => entry.author))].sort(),
    rows: [...new Set(audited.map((entry) => entry.row))].sort(),
    packets: [...new Set(audited.map((entry) => entry.packet))].sort(),
    tiers: [...new Set(audited.map((entry) => entry.tier))].sort(),
    artifacts,
    commits: audited,
    ok: artifacts.ok && audited.every((entry) => entry.ok),
  };
}

export function violationsOf(result) {
  return [
    ...(result.artifacts?.violations || []).map((violation) => ({ sha: null, author: null, ...violation })),
    ...result.commits.flatMap((commit) => [
      ...commit.ownership.violations.map((violation) => ({ sha: commit.sha, author: commit.author, ...violation })),
      ...commit.journal.violations.map((violation) => ({ sha: commit.sha, author: commit.author, ...violation })),
    ]),
  ];
}

export function formatReport(result) {
  const lines = [];
  const scope = result.mode === 'commit-range' ? `${result.base}..${result.head}` : 'file list';
  lines.push(`[territory-preflight] manifest ${result.manifestVersion} · ${scope} · ${result.commits.length} commit(s) · manager(s) ${result.authors.join(', ')}`);
  for (const commit of result.commits) {
    const label = commit.sha ? commit.sha.slice(0, 9) : 'file-list';
    lines.push(`  ${commit.ok ? 'ok ' : 'RED'} ${label} Manager ${commit.author} · ${commit.ownership.checked.length} path(s), ${commit.journal.checked.length} journal change(s)`);
  }
  for (const violation of violationsOf(result)) {
    const label = violation.sha ? violation.sha.slice(0, 9) : 'file-list';
    const kind = violation.verdict || violation.kind;
    lines.push(`  RED ${label} ${kind}: ${violation.path}${violation.rule ? ` [rule ${violation.rule}]` : ''} — ${violation.reason || violation.detail}`);
  }
  lines.push(`[territory-preflight] ${result.ok ? 'GREEN' : 'RED'}`);
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    assert.match(token, /^--[a-z-]+$/, `territory preflight: unexpected argument ${token}`);
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = argv[index + 1];
    assert.ok(value !== undefined && !value.startsWith('--'), `territory preflight: ${token} requires a value`);
    options[key] = value;
    index += 1;
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { out, ...options } = parseArgs(process.argv.slice(2));
    const result = runPreflight(options);
    if (out) {
      fs.mkdirSync(path.dirname(path.resolve(repoRoot, out)), { recursive: true });
      fs.writeFileSync(path.resolve(repoRoot, out), `${JSON.stringify(result, null, 2)}\n`);
    }
    process.stdout.write(`${formatReport(result)}\n`);
    if (!result.ok) process.exit(1);
  } catch (error) {
    console.error(`[territory-preflight] ${error.message}`);
    process.exit(1);
  }
}

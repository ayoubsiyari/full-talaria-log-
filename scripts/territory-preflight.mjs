#!/usr/bin/env node
// A11.2 item 1 - CI ownership preflight plus the append-only journal check.
//
// Compares a packet's touched-file list against the authoring manager's territory in
// docs/plan3/TERRITORY.yml and fails the build on any out-of-territory path. No human
// in the loop, no semantic analysis: the authoring manager comes from each commit's
// Manager: trailer (self-declared free text), the file list comes from git, and the
// comparison is a glob match. The optional --manager flag is a branch-name cross-check
// only, not cryptographic identity.
//
//   node scripts/territory-preflight.mjs --base origin/main --head HEAD
//   node scripts/territory-preflight.mjs --manager C --files-from touched.txt
//
// Exit 0 GREEN, exit 1 RED with every violation listed.
//
// WHICH MANIFEST GOVERNS (B1). Each commit is judged by the manifest as it stood at
// that commit's first parent, never by the manifest at head. A gate that reads the
// rules from head lets a single commit rewrite the rules and then be scored against
// its own rewrite - grant yourself deploy/**, or point manifest_path at a decoy and
// drop protection from the real file, and the packet is GREEN. Reading from the first
// parent closes that hole: a manifest change is only ever scored against the manifest
// it replaces.
//
// WHAT THIS SCRIPT DOES NOT ENFORCE. Binding Manager trailers to git identity or
// signed commits is a Director ruling (TERR-F3), not enforced here. Journals for
// managers A and B require Director grants in TERRITORY.yml (TERR-F4); this script
// does not gate manifest edits to Director-only commits.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  auditTouchedPaths,
  globToRegExp,
  parseStrictYaml,
  patternSpecificity,
  validateTerritoryManifest,
  SIGNATURE,
} from './lib/territory-manifest.mjs';
import { auditJournalAppendOnly, SIGNATURE as JOURNAL_SIGNATURE } from './lib/journal-append-only.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MANIFEST = 'docs/plan3/TERRITORY.yml';
const REQUIRED_TRAILERS = ['Manager', 'Row', 'Packet', 'Tier'];
const UNIT_SEPARATOR = '\u001f';
const RECORD_SEPARATOR = '\u001e';
const PROVENANCE = ['ruling', 'inferred'];
const SHA_LABEL_LENGTH = 12;

const CLI_FLAGS = new Map([
  ['--base', 'base'],
  ['--head', 'head'],
  ['--manager', 'manager'],
  ['--files-from', 'filesFrom'],
  ['--manifest-path', 'manifestPath'],
  ['--root', 'root'],
  ['--out', 'out'],
]);

function assertKnownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    assert.ok(allowed.includes(key), `${label}: unknown key ${key}`);
  }
}

export function shortSha(sha) {
  return typeof sha === 'string' && sha.length ? sha.slice(0, SHA_LABEL_LENGTH) : null;
}

// The runner takes an encoding so that blob reads can ask for raw bytes. Anything that
// substitutes its own runner must honour it; blobAt below refuses a decoded string.
export function gitRunner(root = repoRoot) {
  // stderr is captured rather than inherited: `ls-files --error-unmatch` and `check-ignore`
  // are used as predicates, and their expected failures must not litter the CI log.
  return (args, { encoding = 'utf8' } = {}) => execFileSync('git', args, {
    cwd: root,
    encoding,
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
  const short = shortSha(commit.sha);
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

export function parentOf(git, sha) {
  const [, ...parents] = git(['rev-list', '--parents', '-n', '1', sha]).trim().split(/\s+/);
  return parents.length ? parents[0] : null;
}

// One commit's own changes, against its first parent. Merge commits are audited the same
// way, so a conflict resolution inside another manager's file is still a violation, and a
// manifest rewrite arriving down the second parent is scored against the first parent's
// rules like any other edit.
export function readCommitChanges(git, sha, parent = parentOf(git, sha)) {
  return parent === null
    ? parseNameStatus(git(['diff-tree', '-r', '--root', '--no-commit-id', '--name-status', '-M', sha]))
    : parseNameStatus(git(['diff', '--name-status', '-M', '--find-renames', parent, sha]));
}

// Blob reads are raw bytes. A utf8 decode here would fold every invalid byte onto
// U+FFFD, and swapping 0xFF for 0xFE inside a committed journal line would compare
// equal to its own base. A runner that ignores the encoding request and hands back a
// string is a defect in the caller, not a reason to fall back to a weaker comparison.
function blobAt(git, ref, file) {
  if (ref === null || ref === undefined) return { ok: true, content: null };
  let content;
  try {
    content = git(['show', `${ref}:${file}`], { encoding: 'buffer' });
  } catch (error) {
    return { ok: false, content: null, error: error.message };
  }
  assert.ok(
    Buffer.isBuffer(content),
    `territory preflight: the git runner returned ${typeof content} for ${file}; byte-exact journal comparison requires a Buffer`,
  );
  return { ok: true, content };
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

function compileDirectorPathRules(entries = []) {
  assert.ok(Array.isArray(entries), 'director_paths: expected a list');
  return entries.map((entry) => {
    assert.ok(entry && typeof entry === 'object', 'director_paths: expected a mapping per entry');
    assertKnownKeys(entry, ['pattern', 'provenance', 'reason', 'authority', 'except'], 'director_paths entry');
    assert.equal(typeof entry.pattern, 'string', 'director_paths: pattern absent');
    assert.ok(PROVENANCE.includes(entry.provenance), `director_paths ${entry.pattern}: provenance must be one of ${PROVENANCE.join('/')}`);
    const except = entry.except || [];
    assert.ok(Array.isArray(except), `director_paths ${entry.pattern}: except must be a list`);
    for (const path of except) {
      assert.equal(typeof path, 'string', `director_paths ${entry.pattern}: except entries must be strings`);
    }
    return {
      pattern: entry.pattern,
      regex: globToRegExp(entry.pattern),
      specificity: patternSpecificity(entry.pattern),
      provenance: entry.provenance,
      reason: entry.reason || entry.authority || '',
      except,
    };
  });
}

function withDirectorPaths(manifest, rawDirectorPaths) {
  if (rawDirectorPaths === undefined) return manifest;
  const directorPaths = compileDirectorPathRules(rawDirectorPaths);
  return {
    ...manifest,
    directorPaths,
    managers: [
      ...manifest.managers,
      {
        id: 'Director',
        role: 'director',
        deploySurface: 'none',
        ownedRows: [],
        owned: directorPaths,
        denied: [],
      },
    ],
  };
}

// `expectedPath` binds the document to the path it was read from. Without it a manifest
// can rename manifest_path to a decoy, keep director_only pointed at the decoy, and leave
// the file actually being read unprotected while every internal check still passes.
export function loadPreflightManifest({ file, text = fs.readFileSync(file, 'utf8'), expectedPath = null } = {}) {
  const raw = parseStrictYaml(text);
  return withDirectorPaths(validateTerritoryManifest(raw, { expectedPath }), raw.director_paths);
}

function manifestPathOption(value) {
  const posix = String(value).replace(/\\/g, '/').replace(/^\.\//, '');
  assert.ok(posix.length > 0, 'territory preflight: --manifest-path must not be empty');
  assert.equal(posix.startsWith('/'), false, 'territory preflight: --manifest-path must be repository-relative');
  assert.equal(posix.split('/').includes('..'), false, 'territory preflight: --manifest-path must not contain ..');
  return posix;
}

// Memoized per ref: a packet of n commits reads at most n+1 distinct manifests.
function manifestReader({ git, manifestPath }) {
  const cache = new Map();
  return (ref) => {
    if (!cache.has(ref)) {
      let entry;
      try {
        const text = git(['show', `${ref}:${manifestPath}`]);
        entry = { ok: true, ref, manifest: loadPreflightManifest({ file: manifestPath, text, expectedPath: manifestPath }) };
      } catch (error) {
        entry = { ok: false, ref, manifest: null, detail: String(error.message).split('\n')[0].trim() };
      }
      cache.set(ref, entry);
    }
    return cache.get(ref);
  };
}

function auditTouchedPathsForPreflight(manifest, author, paths) {
  const result = auditTouchedPaths(manifest, author, paths);
  if (!manifest.directorPaths?.length) return result;

  const directorPathPatterns = new Set(manifest.directorPaths.map((rule) => rule.pattern));
  const checked = result.checked.map((entry) => {
    if (entry.owner !== 'Director' || !directorPathPatterns.has(entry.rule)) return entry;
    if (author === 'Director' && entry.verdict === 'director') {
      return { ...entry, ok: true, verdict: 'owned', owner: 'Director', reason: '' };
    }
    if (author !== 'Director' && entry.verdict === 'out-of-territory') {
      return { ...entry, reason: 'path is owned by Director' };
    }
    return entry;
  });
  const violations = checked.filter((entry) => !entry.ok);
  return { ...result, ok: violations.length === 0, checked, violations };
}

// Append-only enforcement over a file git refuses to stage enforces nothing, and `docs/`
// is ignored in this repository. So every packet re-proves that the manifest and the
// journals are tracked and not ignored. A journal that exists on disk but not in history
// is the same capability-loss-without-failure class the gates exist to catch.
export function auditDeclaredArtifacts({
  git,
  manifest = null,
  root,
  manifestPath = manifest?.manifestPath,
  journals = manifest?.journals || [],
  author = null,
  authors = null,
  exists = (file) => fs.existsSync(file),
}) {
  assert.equal(typeof manifestPath, 'string', 'artifact audit: manifestPath is required');
  const owners = new Map(journals.map((entry) => [entry.path, entry.owner]));
  const declared = [manifestPath, ...journals.map((entry) => entry.path)];
  const scopedAuthors = [...new Set(author ? [author] : (authors || []))].sort();
  const checked = [];
  const violations = [];
  const observations = [];
  for (const file of declared) {
    const owner = file === manifestPath ? 'Director' : (owners.get(file) ?? null);
    let tracked = true;
    try {
      git(['ls-files', '--error-unmatch', '--', file]);
    } catch {
      tracked = false;
    }
    let ignored = false;
    try {
      git(['check-ignore', '-q', '--no-index', '--', file]);
      ignored = true;
    } catch {
      ignored = false;
    }
    const present = exists(path.resolve(root, file));
    checked.push({ path: file, owner, present, tracked, ignored });
    if (!present && !tracked) {
      if (scopedAuthors.length === 0 || scopedAuthors.includes(owner)) {
        violations.push({ path: file, owner, kind: 'artifact-missing', detail: 'declared artifact is absent on disk and not tracked by git' });
      } else {
        observations.push({
          path: file,
          owner,
          authors: scopedAuthors,
          kind: 'artifact-missing-other-owner',
          detail: 'declared artifact is absent on disk and not tracked by git; non-blocking because the audited author does not own it',
        });
      }
    } else if (present && !tracked) {
      if (scopedAuthors.length === 0 || scopedAuthors.includes(owner)) {
        violations.push({ path: file, owner, kind: 'artifact-untracked', detail: 'declared artifact exists on disk but is not tracked by git; check .gitignore' });
      } else {
        observations.push({
          path: file,
          owner,
          authors: scopedAuthors,
          kind: 'artifact-untracked-other-owner',
          detail: 'declared artifact exists on disk but is not tracked by git; non-blocking because the audited author does not own it',
        });
      }
    }
    if (ignored) {
      violations.push({ path: file, owner, kind: 'artifact-ignored', detail: 'declared artifact is matched by a .gitignore rule, so an append can be silently dropped' });
    }
  }
  return { ok: violations.length === 0, checked, violations, observations };
}

function emptyOwnership(manifest, author) {
  return {
    signature: SIGNATURE,
    schema: manifest?.schema ?? null,
    manifestVersion: manifest?.version ?? null,
    author,
    ok: true,
    checked: [],
    violations: [],
  };
}

function emptyJournal(author) {
  return { signature: JOURNAL_SIGNATURE, author, ok: true, checked: [], violations: [] };
}

function auditCommit({ git, commit, readManifestAt, fallbackRef, manifestPath }) {
  const attribution = commitAttribution(commit);
  const parent = parentOf(git, commit.sha);
  // The rules in force *before* this commit landed. A root commit has no parent to be
  // judged by, so it falls back to the packet base, which is outside the audited range
  // and therefore not something this packet could have rewritten.
  const governedBy = parent ?? fallbackRef;
  const governing = readManifestAt(governedBy);
  const identity = {
    sha: commit.sha,
    author: attribution.author,
    row: attribution.row,
    packet: attribution.packet,
    tier: attribution.tier,
    governedBy,
    manifestVersion: governing.ok ? governing.manifest.version : null,
  };

  if (!governing.ok) {
    return {
      ...identity,
      ok: false,
      manifest: {
        ok: false,
        violations: [{
          path: manifestPath,
          kind: 'manifest-ungovernable',
          detail: `the territory manifest could not be read from ${shortSha(governedBy)}, so this commit has no rules to be judged by; ${governing.detail}`,
        }],
      },
      ownership: emptyOwnership(null, attribution.author),
      journal: emptyJournal(attribution.author),
    };
  }

  const manifest = governing.manifest;
  if (attribution.author !== 'Director' && !manifest.managerIds.includes(attribution.author)) {
    return {
      ...identity,
      ok: false,
      manifest: {
        ok: false,
        violations: [{
          path: manifestPath,
          kind: 'author-undeclared',
          detail: `Manager ${attribution.author} is not declared in the territory manifest in force at ${shortSha(governedBy)}; a Director grant must land before the packet, not inside it`,
        }],
      },
      ownership: emptyOwnership(manifest, attribution.author),
      journal: emptyJournal(attribution.author),
    };
  }

  const changes = readCommitChanges(git, commit.sha, parent);
  const ownership = auditTouchedPathsForPreflight(manifest, attribution.author, touchedPaths(changes));

  // Journal set pinned from the governing manifest, so a commit that both removes a
  // `journals:` entry and rewrites that journal is still audited against the entry.
  const journalPaths = new Set(manifest.journals.map((entry) => entry.path));
  const journalChanges = changes
    .filter((change) => journalPaths.has(change.path) || (change.previousPath && journalPaths.has(change.previousPath)))
    .map((change) => {
      const before = blobAt(git, parent, change.previousPath || change.path);
      const after = change.status === 'D' ? { ok: true, content: null } : blobAt(git, commit.sha, change.path);
      return {
        ...change,
        before: before.content,
        beforeUnreadable: !before.ok,
        after: after.content,
        afterUnreadable: !after.ok,
      };
    });

  const journal = journalChanges.length
    ? auditJournalAppendOnly({ journals: manifest.journals, changes: journalChanges, author: attribution.author })
    : emptyJournal(attribution.author);

  return {
    ...identity,
    ok: ownership.ok && journal.ok,
    manifest: { ok: true, violations: [] },
    ownership,
    journal,
  };
}

// --manager is a cross-check against the branch name, not a source of truth. A
// disagreement is recorded as a violation rather than thrown, so the packet still
// produces its --out evidence file on the way to exit 1.
function auditManagerFlag(manager, audited) {
  const declared = [...new Set(audited.map((entry) => entry.author).filter((author) => author !== 'Director'))].sort();
  if (!manager) return { expected: [], declared, ok: true, violations: [] };
  const expected = [...new Set(manager.split(',').map((entry) => entry.trim()).filter(Boolean))].sort();
  const agrees = expected.length === declared.length && expected.every((id, index) => id === declared[index]);
  return {
    expected,
    declared,
    ok: agrees,
    violations: agrees ? [] : [{
      path: null,
      kind: 'manager-mismatch',
      detail: `--manager ${expected.join(',')} disagrees with the non-Director commit trailers (${declared.join(', ') || 'none'})`,
    }],
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
  const manifestFile = manifestPathOption(manifestPath);

  // Offline mode: audit a manager-supplied file list. Journal content cannot be read
  // without a commit range, so a listed journal path is reported unresolved, never GREEN.
  if (filesFrom) {
    assert.ok(manager, 'territory preflight: --files-from requires --manager');
    const manifest = loadPreflightManifest({ file: path.resolve(root, manifestFile), expectedPath: manifestFile });
    const listed = fs.readFileSync(path.resolve(root, filesFrom), 'utf8')
      .split('\n').map((line) => line.trim()).filter(Boolean);
    const ownership = auditTouchedPathsForPreflight(manifest, manager, listed);
    const journalPaths = new Set(manifest.journals.map((entry) => entry.path));
    const unresolved = listed.filter((file) => journalPaths.has(file));
    const journal = {
      signature: JOURNAL_SIGNATURE,
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
      governingVersions: [manifest.version],
      mode: 'file-list',
      base: null,
      head: null,
      authors: [manager],
      manager: { expected: [manager], declared: [manager], ok: true, violations: [] },
      commits: [{
        sha: null,
        author: manager,
        row: null,
        packet: null,
        tier: null,
        governedBy: null,
        manifestVersion: manifest.version,
        ok: ownership.ok && journal.ok,
        manifest: { ok: true, violations: [] },
        ownership,
        journal,
      }],
      ok: ownership.ok && journal.ok,
    };
  }

  assert.ok(base, 'territory preflight: --base is required');
  const readManifestAt = manifestReader({ git, manifestPath: manifestFile });
  const baseRef = git(['rev-parse', '--verify', `${base}^{commit}`]).trim();
  const headRef = git(['rev-parse', '--verify', `${head}^{commit}`]).trim();
  const commits = readCommits(git, base, head);
  assert.ok(commits.length, `territory preflight: ${base}..${head} contains no commits`);
  const audited = commits.map((commit) => auditCommit({ git, commit, readManifestAt, fallbackRef: baseRef, manifestPath: manifestFile }));

  // Declared-artifact set is the union of every manifest that governed a commit plus the
  // manifest at head, so neither end of the range can retire an artifact from the audit.
  const headManifest = readManifestAt(headRef);
  const pinned = new Map();
  for (const entry of audited) {
    const governing = readManifestAt(entry.governedBy);
    if (!governing.ok) continue;
    for (const journal of governing.manifest.journals) pinned.set(journal.path, journal.owner);
  }
  if (headManifest.ok) {
    for (const journal of headManifest.manifest.journals) pinned.set(journal.path, journal.owner);
  }
  const journals = [...pinned.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([journalPath, owner]) => ({ path: journalPath, owner }));

  const artifactAudit = auditDeclaredArtifacts({
    git,
    root,
    manifestPath: manifestFile,
    journals,
    authors: audited.map((entry) => entry.author),
  });
  const headManifestViolations = headManifest.ok ? [] : [{
    path: manifestFile,
    owner: 'Director',
    kind: 'manifest-unloadable',
    detail: `the territory manifest at ${shortSha(headRef)} could not be loaded; ${headManifest.detail}`,
  }];
  const artifacts = {
    ...artifactAudit,
    ok: artifactAudit.ok && headManifestViolations.length === 0,
    violations: [...headManifestViolations, ...artifactAudit.violations],
  };

  const managerCheck = auditManagerFlag(manager, audited);

  return {
    signature: SIGNATURE,
    manifestVersion: headManifest.ok ? headManifest.manifest.version : null,
    governingVersions: [...new Set(audited.map((entry) => entry.manifestVersion).filter(Boolean))].sort(),
    mode: 'commit-range',
    base,
    head,
    authors: [...new Set(audited.map((entry) => entry.author))].sort(),
    rows: [...new Set(audited.map((entry) => entry.row))].sort(),
    packets: [...new Set(audited.map((entry) => entry.packet))].sort(),
    tiers: [...new Set(audited.map((entry) => entry.tier))].sort(),
    manager: managerCheck,
    artifacts,
    commits: audited,
    ok: artifacts.ok && managerCheck.ok && audited.every((entry) => entry.ok),
  };
}

export function violationsOf(result) {
  return [
    ...(result.manager?.violations || []).map((violation) => ({ sha: null, author: null, ...violation })),
    ...(result.artifacts?.violations || []).map((violation) => ({ sha: null, author: null, ...violation })),
    ...result.commits.flatMap((commit) => [
      ...(commit.manifest?.violations || []).map((violation) => ({ sha: commit.sha, author: commit.author, ...violation })),
      ...commit.ownership.violations.map((violation) => ({ sha: commit.sha, author: commit.author, ...violation })),
      ...commit.journal.violations.map((violation) => ({ sha: commit.sha, author: commit.author, ...violation })),
    ]),
  ];
}

export function observationsOf(result) {
  return [
    ...(result.artifacts?.observations || []).map((observation) => ({ sha: null, author: null, ...observation })),
  ];
}

export function formatReport(result) {
  const lines = [];
  const scope = result.mode === 'commit-range' ? `${result.base}..${result.head}` : 'file list';
  // Packet-scoped rows carry no sha. Labelling them `file-list` inside a commit-range run
  // told the reader the wrong thing about where the finding came from.
  const packetLabel = result.mode === 'commit-range' ? 'packet' : 'file-list';
  const label = (sha) => shortSha(sha) ?? packetLabel;
  lines.push(`[territory-preflight] manifest ${result.manifestVersion ?? 'unloadable'} · ${scope} · ${result.commits.length} commit(s) · manager(s) ${result.authors.join(', ')}`);
  for (const commit of result.commits) {
    const governed = shortSha(commit.governedBy);
    lines.push(`  ${commit.ok ? 'ok ' : 'RED'} ${label(commit.sha)} Manager ${commit.author} · ${commit.ownership.checked.length} path(s), ${commit.journal.checked.length} journal change(s)${governed ? ` · governed by ${governed} (${commit.manifestVersion ?? 'unloadable'})` : ''}`);
  }
  for (const violation of violationsOf(result)) {
    const kind = violation.verdict || violation.kind;
    lines.push(`  RED ${label(violation.sha)} ${kind}: ${violation.path ?? '(packet)'}${violation.rule ? ` [rule ${violation.rule}]` : ''} — ${violation.reason || violation.detail}`);
  }
  for (const observation of observationsOf(result)) {
    lines.push(`  OBS ${label(observation.sha)} ${observation.kind}: ${observation.path} — ${observation.detail}`);
  }
  lines.push(`[territory-preflight] ${result.ok ? 'GREEN' : 'RED'}`);
  return lines.join('\n');
}

// Unknown flags are refused rather than ignored. A silently dropped `--managers C` is a
// gate that quietly stops cross-checking the branch against the trailers.
export function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    assert.ok(
      CLI_FLAGS.has(token),
      `territory preflight: unknown argument ${token}; known flags are ${[...CLI_FLAGS.keys()].join(', ')}`,
    );
    const key = CLI_FLAGS.get(token);
    assert.equal(Object.hasOwn(options, key), false, `territory preflight: ${token} given more than once`);
    const value = argv[index + 1];
    assert.ok(value !== undefined && !value.startsWith('--'), `territory preflight: ${token} requires a value`);
    options[key] = value;
    index += 1;
  }
  if (options.manager !== undefined) {
    for (const id of options.manager.split(',').map((entry) => entry.trim())) {
      assert.match(id, /^[A-Z]$/, `territory preflight: --manager ${options.manager} must be a comma-separated list of single-letter manager ids`);
    }
  }
  assert.ok(options.base !== undefined || options.filesFrom !== undefined, 'territory preflight: --base or --files-from is required');
  assert.ok(
    !(options.base !== undefined && options.filesFrom !== undefined),
    'territory preflight: --base and --files-from are mutually exclusive',
  );
  if (options.filesFrom !== undefined) {
    assert.ok(options.manager !== undefined, 'territory preflight: --files-from requires --manager');
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { out, root: rootOption, ...options } = parseArgs(process.argv.slice(2));
    const root = rootOption ? path.resolve(repoRoot, rootOption) : repoRoot;
    const result = runPreflight({ ...options, root });
    if (out) {
      const target = path.resolve(root, out);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`);
    }
    process.stdout.write(`${formatReport(result)}\n`);
    if (!result.ok) process.exit(1);
  } catch (error) {
    console.error(`[territory-preflight] ${error.message}`);
    process.exit(1);
  }
}

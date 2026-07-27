import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  auditTouchedPaths,
  globToRegExp,
  loadTerritoryManifest,
  parseStrictYaml,
  patternSpecificity,
  resolveOwnership,
  validateTerritoryManifest,
} from '../lib/territory-manifest.mjs';
import { appendedLines, auditJournalAppendOnly, isAppendOnly } from '../lib/journal-append-only.mjs';
import {
  auditDeclaredArtifacts,
  commitAttribution,
  gitRunner,
  readChanges,
  readCommits,
  runPreflight,
  touchedPaths,
  violationsOf,
} from '../territory-preflight.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const manifestFile = path.join(root, 'docs/plan3/TERRITORY.yml');
const manifestText = fs.readFileSync(manifestFile, 'utf8');

const SYNTHETIC_MANIFEST = `schema: talaria.territory.v1
version: test-001
owner: Director
manifest_path: docs/plan3/TERRITORY.yml
director_only:
  - pattern: docs/plan3/TERRITORY.yml
    reason: manifest
    provenance: ruling
journals:
  - path: docs/plan3/journal/MANAGER-A.md
    owner: A
  - path: docs/plan3/journal/MANAGER-B.md
    owner: B
  - path: docs/plan3/journal/MANAGER-C.md
    owner: C
shared_paths:
  - pattern: docs/plan3/evidence/**
    reason: per-packet evidence
    provenance: inferred
managers:
  - id: A
    role: product
    deploy_surface: TEST-1
    owned_rows:
      - M19-I
    owned_paths:
      - pattern: chart v 1.4/chart/chart.js
        provenance: ruling
      - pattern: chart v 1.4/chart/modules/**
        provenance: inferred
      - pattern: docs/plan3/journal/MANAGER-A.md
        provenance: ruling
    denied_paths:
      - pattern: docs/plan3/journal/MANAGER-C.md
        reason: another manager's journal
        provenance: ruling
  - id: B
    role: orders
    deploy_surface: TEST-2
    owned_paths:
      - pattern: chart v 1.4/chart/modules/order-manager.js
        provenance: inferred
    denied_paths:
      - pattern: chart v 1.4/chart/chart.js
        reason: A11.3
        provenance: ruling
  - id: C
    role: verification
    deploy_surface: none
    owned_paths:
      - pattern: scripts/tests/**
        provenance: ruling
      - pattern: docs/plan3/journal/MANAGER-C.md
        provenance: ruling
    denied_paths:
      - pattern: chart v 1.4/chart/chart.js
        reason: C touches no chart.js
        provenance: ruling
`;

// --- strict YAML subset -------------------------------------------------------

test('the shipped territory manifest parses and validates', () => {
  const manifest = loadTerritoryManifest({ file: manifestFile });
  assert.equal(manifest.schema, 'talaria.territory.v1');
  assert.deepEqual(manifest.managerIds, ['A', 'B', 'C']);
  assert.deepEqual(manifest.journals.map((entry) => entry.owner).sort(), ['A', 'B', 'C', 'Director']);
  for (const manager of manifest.managers) {
    assert.ok(manager.owned.length, `${manager.id}: owned_paths absent`);
  }
});

test('YAML subset parses nested maps, sequences and typed scalars', () => {
  const parsed = parseStrictYaml([
    'schema: talaria.territory.v1',
    'version: 20260727-C-001',
    'count: 3',
    'enabled: true',
    'quoted: "a: b # c"',
    'managers:',
    '  - id: C',
    '    owned_rows:',
    '      - A11.2-territory-preflight',
    '      - A7-differential-parity-oracle',
    '    owned_paths:',
    '      - pattern: scripts/tests/**',
    '        provenance: ruling',
  ].join('\n'));
  assert.equal(parsed.count, 3);
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.quoted, 'a: b # c');
  assert.equal(parsed.managers[0].owned_paths[0].pattern, 'scripts/tests/**');
  assert.deepEqual(parsed.managers[0].owned_rows, ['A11.2-territory-preflight', 'A7-differential-parity-oracle']);
});

test('YAML subset refuses every construct it does not implement', () => {
  const cases = [
    ['tab indentation', 'a:\n\tb: c'],
    ['odd indent', 'a:\n   b: c'],
    ['duplicate key', 'a: 1\na: 2'],
    ['anchor', 'a: &anchor 1'],
    ['alias', 'a: *anchor'],
    ['flow map', 'a: {b: c}'],
    ['flow sequence', 'a: [1, 2]'],
    ['block scalar', 'a: |\n  text'],
    ['unterminated quote', 'a: "text'],
    ['document marker', '---\na: 1'],
    ['empty document', '# comment only\n'],
    ['keyless line', 'a:\n  - \n'],
    ['value-less key', 'a:\n'],
  ];
  for (const [label, text] of cases) {
    assert.throws(() => parseStrictYaml(text), Error, `${label}: should have been rejected`);
  }
});

test('inline comments are stripped outside quotes only', () => {
  const parsed = parseStrictYaml('a: value # trailing\nb: "keep # this"');
  assert.equal(parsed.a, 'value');
  assert.equal(parsed.b, 'keep # this');
});

// --- glob and specificity -----------------------------------------------------

test('glob subset matches the shapes the manifest uses', () => {
  assert.equal(globToRegExp('scripts/tests/**').test('scripts/tests/a/b.mjs'), true);
  assert.equal(globToRegExp('scripts/tests/**').test('scripts/tests'), false);
  assert.equal(globToRegExp('chart v 1.4/chart/*.html').test('chart v 1.4/chart/legacy-index.html'), true);
  assert.equal(globToRegExp('chart v 1.4/chart/*.html').test('chart v 1.4/chart/dist/index.html'), false);
  assert.equal(globToRegExp('**/*.test.mjs').test('scripts/tests/x.test.mjs'), true);
  assert.equal(globToRegExp('package.json').test('homepage/package.json'), false);
  assert.equal(globToRegExp('docs/plan3/TERRITORY.yml').test('docs/plan3/TERRITORY.yml'), true);
});

test('glob subset refuses patterns that could smuggle regex or escape the repo', () => {
  for (const pattern of ['/abs/path', '../escape', 'a\\b', 'a{b,c}', 'a[b]', 'a(b)', 'a|b', 'a+', '', '*'.repeat(9)]) {
    assert.throws(() => globToRegExp(pattern), Error, `pattern ${pattern} should have been rejected`);
  }
});

test('an exact carve-out outranks a tree grant, so B keeps order-manager.js inside A tree', () => {
  const manifest = validateTerritoryManifest(parseStrictYaml(SYNTHETIC_MANIFEST));
  const target = 'chart v 1.4/chart/modules/order-manager.js';
  assert.equal(resolveOwnership(manifest, target, 'B').verdict, 'owned');
  const asA = resolveOwnership(manifest, target, 'A');
  assert.equal(asA.ok, false);
  assert.equal(asA.verdict, 'out-of-territory');
  assert.equal(asA.owner, 'B');
  assert.equal(resolveOwnership(manifest, 'chart v 1.4/chart/modules/replay-system.js', 'A').verdict, 'owned');
  assert.ok(
    patternSpecificity(target).exact > patternSpecificity('chart v 1.4/chart/modules/**').exact,
    'exact patterns must outrank wildcard patterns',
  );
});

test('two managers claiming one path at equal specificity is RED, not first-match-wins', () => {
  const raw = parseStrictYaml(SYNTHETIC_MANIFEST);
  raw.managers[2].owned_paths.push({ pattern: 'chart v 1.4/chart/chart.js', provenance: 'inferred' });
  raw.managers[2].denied_paths = [];
  const manifest = validateTerritoryManifest(raw);
  const verdict = resolveOwnership(manifest, 'chart v 1.4/chart/chart.js', 'C');
  assert.equal(verdict.ok, false);
  assert.equal(verdict.verdict, 'ambiguous');
  assert.match(verdict.reason, /Director ruling is required/);
});

// --- ownership verdicts against the shipped manifest --------------------------

test('shipped manifest holds Manager C to its declared territory', () => {
  const manifest = loadTerritoryManifest({ file: manifestFile });
  const green = auditTouchedPaths(manifest, 'C', [
    'scripts/territory-preflight.mjs',
    'scripts/lib/territory-manifest.mjs',
    'scripts/tests/territory-preflight.test.mjs',
    '.github/workflows/territory-preflight.yml',
    'docs/plan3/journal/MANAGER-C.md',
    'docs/plan3/GATE-NAME-RESERVATIONS.md',
  ]);
  assert.equal(green.ok, true, JSON.stringify(green.violations));

  const red = auditTouchedPaths(manifest, 'C', [
    'chart v 1.4/chart/chart.js',
    'chart v 1.4/chart/modules/indicator-performance.js',
    'homepage/public/chart/dist-v9/index.html',
    'docs/plan3/TERRITORY.yml',
    'docs/plan3/journal/MANAGER-A.md',
    'journal-backend/app.py',
  ]);
  assert.equal(red.ok, false);
  assert.deepEqual(
    red.violations.map((violation) => [violation.path, violation.verdict]).sort(),
    [
      ['chart v 1.4/chart/chart.js', 'denied'],
      ['chart v 1.4/chart/modules/indicator-performance.js', 'denied'],
      ['docs/plan3/TERRITORY.yml', 'director-only'],
      ['docs/plan3/journal/MANAGER-A.md', 'denied'],
      ['homepage/public/chart/dist-v9/index.html', 'denied'],
      ['journal-backend/app.py', 'unowned'],
    ],
  );
});

test('shipped manifest keeps B out of chart.js per A11.3 and lets A keep it', () => {
  const manifest = loadTerritoryManifest({ file: manifestFile });
  assert.equal(resolveOwnership(manifest, 'chart v 1.4/chart/chart.js', 'B').verdict, 'denied');
  assert.equal(resolveOwnership(manifest, 'chart v 1.4/chart/chart.js', 'A').verdict, 'owned');
  assert.equal(resolveOwnership(manifest, 'chart v 1.4/chart/modules/order-manager.js', 'B').verdict, 'owned');
  assert.equal(resolveOwnership(manifest, 'docs/plan3/evidence/some-packet.json', 'B').verdict, 'shared');
});

test('unowned paths are RED by fail-closed default for every manager', () => {
  const manifest = loadTerritoryManifest({ file: manifestFile });
  for (const author of manifest.managerIds) {
    const verdict = resolveOwnership(manifest, 'deploy/nginx.conf', author);
    assert.equal(verdict.ok, false, `${author}: unowned path must be RED`);
    assert.equal(verdict.verdict, 'unowned');
  }
});

test('only the Director may touch the manifest and the rulings', () => {
  const manifest = loadTerritoryManifest({ file: manifestFile });
  for (const file of ['docs/plan3/TERRITORY.yml', 'docs/plan3/DIRECTOR-RULINGS-20260727.md']) {
    for (const author of ['A', 'B', 'C']) {
      assert.equal(resolveOwnership(manifest, file, author).verdict, 'director-only', `${author} must not own ${file}`);
      assert.equal(resolveOwnership(manifest, file, author).ok, false);
    }
    assert.equal(resolveOwnership(manifest, file, 'Director').ok, true);
  }
});

test('manifest validation refuses a manifest that does not protect itself', () => {
  const raw = parseStrictYaml(SYNTHETIC_MANIFEST);
  raw.director_only = [{ pattern: 'docs/plan3/DIRECTOR-RULINGS-20260727.md', reason: 'policy', provenance: 'ruling' }];
  assert.throws(() => validateTerritoryManifest(raw), /manifest_path is not director_only/);

  for (const mutate of [
    (value) => { value.schema = 'talaria.territory.v2'; },
    (value) => { value.owner = 'Manager C'; },
    (value) => { value.managers[0].owned_paths = []; },
    (value) => { value.managers[0].owned_paths[0].provenance = 'assumed'; },
    (value) => { value.managers.push({ id: 'C', owned_paths: [{ pattern: 'x', provenance: 'ruling' }] }); },
    (value) => { value.journals.push({ path: 'docs/plan3/journal/MANAGER-Z.md', owner: 'Z' }); },
    (value) => { delete value.manifest_path; },
  ]) {
    const raw2 = parseStrictYaml(SYNTHETIC_MANIFEST);
    mutate(raw2);
    assert.throws(() => validateTerritoryManifest(raw2), Error, 'corrupted manifest should be rejected');
  }
});

// --- append-only journal check ------------------------------------------------

test('append-only accepts appends and refuses every other edit shape', () => {
  const base = '# journal\n- entry one\n- entry two\n';
  assert.equal(isAppendOnly(base, `${base}- entry three\n`), true);
  assert.equal(isAppendOnly(base, base), true);
  assert.equal(isAppendOnly(base, '# journal\n- entry one\n'), false, 'removal');
  assert.equal(isAppendOnly(base, '# journal\n- entry ONE\n- entry two\n'), false, 'modification');
  assert.equal(isAppendOnly(base, '# journal\n- entry one\n- inserted\n- entry two\n'), false, 'middle insert');
  assert.equal(isAppendOnly(base, '# journal\n- entry two\n- entry one\n'), false, 'reorder');
  assert.equal(isAppendOnly('- entry', '- entry extended\n'), false, 'extending the final line is not an append');
  assert.equal(isAppendOnly('- entry', '- entry\n- next\n'), true);
  assert.deepEqual(appendedLines(base, `${base}- three\n- four\n`), ['- three', '- four']);
});

test('journal gate reports the specific violation kind for each hazard', () => {
  const journals = [{ path: 'docs/plan3/journal/MANAGER-C.md', owner: 'C' }];
  const base = '# C\n- one\n';

  const ok = auditJournalAppendOnly({
    journals, author: 'C',
    changes: [{ status: 'M', path: 'docs/plan3/journal/MANAGER-C.md', before: base, after: `${base}- two\n` }],
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.checked, [{ path: 'docs/plan3/journal/MANAGER-C.md', owner: 'C', status: 'M', appended: 1 }]);

  const kinds = (changes, author = 'C') => auditJournalAppendOnly({ journals, author, changes })
    .violations.map((violation) => violation.kind);

  assert.deepEqual(kinds([{ status: 'M', path: 'docs/plan3/journal/MANAGER-C.md', before: base, after: '# C\n' }]), ['journal-not-append-only']);
  assert.deepEqual(kinds([{ status: 'D', path: 'docs/plan3/journal/MANAGER-C.md', before: base, after: null }]), ['journal-removed']);
  assert.deepEqual(kinds([{ status: 'R', previousPath: 'docs/plan3/journal/MANAGER-C.md', path: 'docs/plan3/journal/OLD.md', before: base, after: base }]), ['journal-renamed']);
  assert.deepEqual(kinds([{ status: 'A', path: 'docs/plan3/journal/MANAGER-C.md', before: base, after: base }]), ['journal-rewritten']);
  assert.deepEqual(kinds([{ status: 'M', path: 'docs/plan3/journal/MANAGER-C.md', before: base, after: `${base}- two\n` }], 'A'), ['journal-owner']);

  const untouched = auditJournalAppendOnly({
    journals, author: 'C',
    changes: [{ status: 'M', path: 'scripts/tests/x.test.mjs', before: 'a', after: 'b' }],
  });
  assert.equal(untouched.ok, true);
  assert.deepEqual(untouched.checked, []);
});

// --- commit trailers ----------------------------------------------------------

test('trailers attribute each commit and refuse an unattributable one', () => {
  const commit = (message, sha = 'a'.repeat(40)) => ({ sha, message });
  const resolved = commitAttribution(commit('feat: gate\n\nManager: C\nRow: A11.2-territory-preflight\nPacket: PACKET-C-001\nTier: 2\n'));
  assert.equal(resolved.author, 'C');
  assert.equal(resolved.packet, 'PACKET-C-001');
  assert.equal(resolved.tier, '2');
  assert.equal(commitAttribution(commit('chore: adopt\n\nManager: Director\nRow: r\nPacket: p\nTier: 2\n')).author, 'Director');

  assert.throws(() => commitAttribution(commit('feat: gate\n\nRow: r\nPacket: p\nTier: 2\n')), /trailer Manager: is absent/);
  assert.throws(() => commitAttribution(commit('feat: gate\n\nManager: C\nPacket: p\nTier: 2\n')), /trailer Row: is absent/);
  assert.throws(() => commitAttribution(commit('feat: gate\n\nManager: C\nRow: r\nTier: 2\n')), /trailer Packet: is absent/);
  assert.throws(() => commitAttribution(commit('feat: x\n\nManager: C\nRow: r\nPacket: p\nTier: 4\n')), /Tier: 4 is not 1, 2 or 3/);
  assert.throws(() => commitAttribution(commit('feat: x\n\nManager: manager-c\nRow: r\nPacket: p\nTier: 2\n')), /is not a valid manager id/);
});

// --- end to end over a real git repository ------------------------------------

function scratchRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-territory-'));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Manager C', GIT_AUTHOR_EMAIL: 'c@talaria.invalid',
    GIT_COMMITTER_NAME: 'Manager C', GIT_COMMITTER_EMAIL: 'c@talaria.invalid',
    GIT_AUTHOR_DATE: '2026-07-27T00:00:00+0000', GIT_COMMITTER_DATE: '2026-07-27T00:00:00+0000',
    GIT_CONFIG_GLOBAL: path.join(dir, '.gitconfig-absent'), GIT_CONFIG_SYSTEM: path.join(dir, '.gitconfig-absent'),
  };
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (relative, content) => {
    const target = path.join(dir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  const commit = (message) => { git(['add', '-A']); git(['commit', '-m', message]); };

  git(['init', '-b', 'main']);
  write('docs/plan3/TERRITORY.yml', SYNTHETIC_MANIFEST);
  write('docs/plan3/journal/MANAGER-C.md', '# Manager C journal\n- base entry\n');
  write('docs/plan3/journal/MANAGER-A.md', '# Manager A journal\n- base entry\n');
  write('chart v 1.4/chart/chart.js', '// engine\n');
  write('scripts/tests/existing.test.mjs', '// cell\n');
  commit('chore: base\n\nManager: Director\nRow: A11.2-territory-preflight\nPacket: PACKET-BASE\nTier: 2\n');
  return { dir, git, write, commit, base: git(['rev-parse', 'HEAD']).trim() };
}

const TRAILERS = 'Manager: C\nRow: A11.2-territory-preflight\nPacket: PACKET-C-001\nTier: 2\n';

test('end to end: an in-territory packet with a journal append is GREEN', () => {
  const repo = scratchRepo();
  try {
    repo.write('scripts/tests/new-cell.test.mjs', '// new cell\n');
    repo.write('docs/plan3/journal/MANAGER-C.md', '# Manager C journal\n- base entry\n- appended entry\n');
    repo.commit(`test: add cell\n\n${TRAILERS}`);

    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git });
    assert.equal(result.ok, true, JSON.stringify(violationsOf(result)));
    assert.deepEqual(result.authors, ['C']);
    assert.equal(result.commits.length, 1);
    assert.deepEqual(result.commits[0].journal.checked, [{ path: 'docs/plan3/journal/MANAGER-C.md', owner: 'C', status: 'M', appended: 1 }]);
    assert.deepEqual(touchedPaths(readChanges(repo.git, repo.base, 'HEAD')), [
      'docs/plan3/journal/MANAGER-C.md', 'scripts/tests/new-cell.test.mjs',
    ]);
    assert.equal(readCommits(repo.git, repo.base, 'HEAD').length, 1);
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: a Director commit may ride the same packet as a manager commit', () => {
  const repo = scratchRepo();
  try {
    repo.write('docs/plan3/TERRITORY.yml', `${SYNTHETIC_MANIFEST}# Director amendment\n`);
    repo.commit('chore: amend territory manifest\n\nManager: Director\nRow: A11.2-territory-preflight\nPacket: PACKET-C-001\nTier: 2\n');
    repo.write('scripts/tests/new-cell.test.mjs', '// new cell\n');
    repo.commit(`test: add cell\n\n${TRAILERS}`);

    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git });
    assert.equal(result.ok, true, JSON.stringify(violationsOf(result)));
    assert.deepEqual(result.authors, ['C', 'Director']);
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: per-commit auditing catches a violation that a later commit reverts', () => {
  const repo = scratchRepo();
  try {
    repo.write('chart v 1.4/chart/chart.js', '// engine\n// C edited this\n');
    repo.commit(`test: touch product code\n\n${TRAILERS}`);
    repo.write('chart v 1.4/chart/chart.js', '// engine\n');
    repo.commit(`test: revert product code\n\n${TRAILERS}`);

    // The range diff is empty, so a range-level gate would report GREEN here.
    assert.deepEqual(readChanges(repo.git, repo.base, 'HEAD'), []);
    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git });
    assert.equal(result.ok, false, 'a reverted out-of-territory edit is still a territory violation');
    assert.deepEqual(violationsOf(result).map((violation) => violation.verdict), ['denied', 'denied']);
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: per-commit auditing catches a journal rewrite hidden behind a later append', () => {
  const repo = scratchRepo();
  try {
    repo.write('docs/plan3/journal/MANAGER-C.md', '# Manager C journal\n- rewritten entry\n');
    repo.commit(`test: rewrite journal\n\n${TRAILERS}`);
    repo.write('docs/plan3/journal/MANAGER-C.md', '# Manager C journal\n- rewritten entry\n- appended entry\n');
    repo.commit(`test: append to journal\n\n${TRAILERS}`);

    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git });
    assert.equal(result.ok, false);
    assert.deepEqual(violationsOf(result).map((violation) => violation.kind), ['journal-not-append-only']);
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: out-of-territory, manifest self-grant, journal rewrite and journal delete are each RED', () => {
  const cases = [
    ['out-of-territory product edit', (repo) => repo.write('chart v 1.4/chart/chart.js', '// engine\n// C edited this\n'), 'denied'],
    ['manifest self-grant', (repo) => repo.write('docs/plan3/TERRITORY.yml', `${SYNTHETIC_MANIFEST}# tampered\n`), 'director-only'],
    // Reached by ownership rather than by an explicit deny, because the synthetic
    // manifest grants MANAGER-A.md to A without listing it in C's denied_paths.
    ['another manager journal', (repo) => repo.write('docs/plan3/journal/MANAGER-A.md', '# Manager A journal\n- base entry\n- C wrote here\n'), 'out-of-territory'],
  ];
  for (const [label, mutate, expected] of cases) {
    const repo = scratchRepo();
    try {
      mutate(repo);
      repo.commit(`test: ${label}\n\n${TRAILERS}`);
      const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git });
      assert.equal(result.ok, false, `${label}: expected RED`);
      assert.ok(
        violationsOf(result).some((violation) => violation.verdict === expected),
        `${label}: expected verdict ${expected}, got ${JSON.stringify(violationsOf(result))}`,
      );
    } finally {
      fs.rmSync(repo.dir, { recursive: true, force: true });
    }
  }

  const removal = scratchRepo();
  try {
    fs.rmSync(path.join(removal.dir, 'docs/plan3/journal/MANAGER-C.md'));
    removal.commit(`test: delete journal\n\n${TRAILERS}`);
    const result = runPreflight({ root: removal.dir, base: removal.base, head: 'HEAD', git: removal.git });
    assert.equal(result.ok, false);
    assert.deepEqual(violationsOf(result).map((violation) => violation.kind), ['journal-removed']);
  } finally {
    fs.rmSync(removal.dir, { recursive: true, force: true });
  }
});

test('end to end: an untrailered commit cannot be attributed and is RED', () => {
  const repo = scratchRepo();
  try {
    repo.write('scripts/tests/new-cell.test.mjs', '// new cell\n');
    repo.commit('test: add cell without trailers');
    assert.throws(
      () => runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git }),
      /trailer Manager: is absent/,
    );
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: a journal that exists on disk but is untracked is RED', () => {
  const repo = scratchRepo();
  try {
    // Declared in the manifest, present in the working tree, never committed — the exact
    // state `docs/` being git-ignored produces.
    repo.write('docs/plan3/journal/MANAGER-B.md', '# Manager B journal\n- local only\n');
    repo.write('scripts/tests/new-cell.test.mjs', '// new cell\n');
    repo.git(['add', '--', 'scripts/tests/new-cell.test.mjs']);
    repo.git(['commit', '-m', `test: add cell\n\n${TRAILERS}`]);

    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git });
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.artifacts.violations.map((violation) => [violation.path, violation.kind]),
      [['docs/plan3/journal/MANAGER-B.md', 'artifact-untracked']],
    );
    // A journal that does not exist yet is not a violation; only a lost one is.
    assert.deepEqual(
      result.artifacts.checked.find((entry) => entry.path === 'docs/plan3/journal/MANAGER-B.md'),
      { path: 'docs/plan3/journal/MANAGER-B.md', present: true, tracked: false, ignored: false },
    );
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: a journal matched by a .gitignore rule is RED even while tracked', () => {
  const repo = scratchRepo();
  try {
    repo.write('.gitignore', 'docs/\n');
    repo.write('scripts/tests/new-cell.test.mjs', '// new cell\n');
    repo.commit(`test: ignore the journals\n\n${TRAILERS}`);

    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git });
    assert.equal(result.ok, false, 'a tracked-but-ignored journal is a silent-append trap');
    assert.deepEqual(
      [...new Set(result.artifacts.violations.map((violation) => violation.kind))],
      ['artifact-ignored'],
    );
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('the live repository keeps its declared artifacts tracked and unignored', () => {
  const manifest = loadTerritoryManifest({ file: manifestFile });
  const result = auditDeclaredArtifacts({ git: gitRunner(root), manifest, root });
  assert.equal(result.ok, true, JSON.stringify(result.violations));
  const territory = result.checked.find((entry) => entry.path === 'docs/plan3/TERRITORY.yml');
  assert.deepEqual(territory, { path: 'docs/plan3/TERRITORY.yml', present: true, tracked: true, ignored: false });
});

// --- A5 negative control ------------------------------------------------------

test('negative control: removing the director_only rule is the only reason the self-grant is caught', () => {
  const raw = parseStrictYaml(SYNTHETIC_MANIFEST);
  raw.managers[2].owned_paths.push({ pattern: 'docs/plan3/TERRITORY.yml', provenance: 'inferred' });
  const withRule = validateTerritoryManifest(raw);
  assert.equal(resolveOwnership(withRule, 'docs/plan3/TERRITORY.yml', 'C').ok, false);

  // Mechanism disabled: the manifest no longer protects itself, so the same packet
  // passes. A gate whose negative control stays RED is not proven to be the thing
  // doing the work.
  const disabled = { ...withRule, directorOnly: [] };
  assert.equal(resolveOwnership(disabled, 'docs/plan3/TERRITORY.yml', 'C').ok, true);
});

test('negative control: an empty territory grant cannot silently pass a packet', () => {
  const manifest = loadTerritoryManifest({ file: manifestFile });
  const stripped = { ...manifest, managers: manifest.managers.map((manager) => ({ ...manager, owned: [], denied: [] })) };
  const result = auditTouchedPaths(stripped, 'C', ['scripts/tests/territory-preflight.test.mjs']);
  assert.equal(result.ok, false);
  assert.equal(result.violations[0].verdict, 'unowned');
});

// --- A5 four-state proof, repeat, alternate root and clock --------------------

test('four-state anti-lying proof', () => {
  const manifest = loadTerritoryManifest({ file: manifestFile });
  const inTerritory = ['scripts/tests/territory-preflight.test.mjs', 'docs/plan3/journal/MANAGER-C.md'];
  const outOfTerritory = ['chart v 1.4/chart/chart.js'];

  assert.equal(auditTouchedPaths(manifest, 'C', inTerritory).ok, true, 'fixed state passes');
  assert.equal(auditTouchedPaths(manifest, 'C', outOfTerritory).ok, false, 'broken state fails');

  const corrupted = { ...manifest, managers: manifest.managers.map((manager) => ({ ...manager, owned: manager.owned.slice(0, 1) })) };
  assert.equal(auditTouchedPaths(corrupted, 'C', inTerritory).ok, false, 'corrupted input fails');

  assert.throws(
    () => assert.equal(auditTouchedPaths(manifest, 'C', inTerritory).ok, false),
    /true !== false/,
    'inverted assertion flips',
  );
});

test('3x repeat is byte-identical, and stays identical on an alternate root and clock', () => {
  const manifest = loadTerritoryManifest({ file: manifestFile });
  const paths = ['scripts/tests/territory-preflight.test.mjs', 'chart v 1.4/chart/chart.js', 'journal-backend/app.py'];
  const runs = [1, 2, 3].map(() => JSON.stringify(auditTouchedPaths(manifest, 'C', paths)));
  assert.equal(new Set(runs).size, 1, 'assertion payload must not vary between runs');
  assert.equal(runs[0].includes('Date'), false, 'payload must not carry wall-clock values');

  const alternateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-territory-alt-'));
  const beforeNow = Date.now;
  try {
    const target = path.join(alternateRoot, 'docs/plan3/TERRITORY.yml');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, manifestText);
    Date.now = () => 1;
    const alternate = loadTerritoryManifest({ file: target });
    assert.equal(JSON.stringify(auditTouchedPaths(alternate, 'C', paths)), runs[0]);
  } finally {
    Date.now = beforeNow;
    fs.rmSync(alternateRoot, { recursive: true, force: true });
  }
});

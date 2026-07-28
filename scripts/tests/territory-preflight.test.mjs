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
  formatReport,
  gitRunner,
  loadPreflightManifest,
  observationsOf,
  parseArgs,
  readChanges,
  readCommitChanges,
  readCommits,
  runPreflight,
  shortSha,
  touchedPaths,
  violationsOf,
} from '../territory-preflight.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const manifestFile = path.join(root, 'docs/plan3/TERRITORY.yml');
const manifestText = fs.readFileSync(manifestFile, 'utf8');
const MANIFEST_PATH = 'docs/plan3/TERRITORY.yml';

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
      - pattern: docs/plan3/GATE-NAME-RESERVATIONS.md
        provenance: ruling
      - pattern: docs/plan3/journal/MANAGER-C.md
        provenance: ruling
    denied_paths:
      - pattern: chart v 1.4/chart/chart.js
        reason: C touches no chart.js
        provenance: ruling
`;

const SYNTHETIC_MANIFEST_WITH_DIRECTOR_PATHS = `${SYNTHETIC_MANIFEST}director_paths:
  - pattern: docs/plan3/FINDING-*.md
    reason: Director findings
    provenance: ruling
  - pattern: docs/plan3/*.md
    authority: Director document tree
    provenance: inferred
    except:
      - docs/plan3/BOARD-VIEW.md
      - docs/plan3/PO-QUEUE.md
      - docs/plan3/GATE-NAME-RESERVATIONS.md
`;

// Attack fixtures are built by anchored substitution rather than written out in full, so
// that a drift in the synthetic manifest fails loudly here instead of silently producing
// an attack manifest that no longer carries the attack.
function mutateManifest(text, replacements) {
  return replacements.reduce((current, [from, to]) => {
    assert.ok(current.includes(from), `manifest fixture anchor not found:\n${from}`);
    return current.replace(from, to);
  }, text);
}

const DIRECTOR_ONLY_ANCHOR = `director_only:
  - pattern: docs/plan3/TERRITORY.yml
    reason: manifest
    provenance: ruling
`;
const C_GRANTS_ANCHOR = `      - pattern: docs/plan3/journal/MANAGER-C.md
        provenance: ruling
    denied_paths:
`;
const C_SELF_GRANT = `      - pattern: docs/plan3/journal/MANAGER-C.md
        provenance: ruling
      - pattern: docs/plan3/TERRITORY.yml
        provenance: inferred
      - pattern: deploy/**
        provenance: inferred
    denied_paths:
`;

// B1a. director_only still names the manifest, so `manifest_path is director_only` still
// holds - but the carve-out means the rule no longer matches the file it names, and the
// same commit grants Manager C the manifest and the deploy tree.
const ATTACK_DIRECTOR_ONLY_EXCEPT = mutateManifest(SYNTHETIC_MANIFEST, [
  [DIRECTOR_ONLY_ANCHOR, `${DIRECTOR_ONLY_ANCHOR}    except:
      - docs/plan3/TERRITORY.yml
`],
  [C_GRANTS_ANCHOR, C_SELF_GRANT],
]);

// B1b. manifest_path is repointed at a file that does not exist and director_only follows
// it, leaving the file CI actually reads unprotected and granted to Manager C.
const ATTACK_DECOY_MANIFEST_PATH = mutateManifest(SYNTHETIC_MANIFEST, [
  ['manifest_path: docs/plan3/TERRITORY.yml\n', 'manifest_path: docs/plan3/TERRITORY-DECOY.yml\n'],
  [DIRECTOR_ONLY_ANCHOR, `director_only:
  - pattern: docs/plan3/TERRITORY-DECOY.yml
    reason: manifest
    provenance: ruling
`],
  [C_GRANTS_ANCHOR, C_SELF_GRANT],
]);

// B1c. The journals list is the audit's index of append-only files; dropping an entry in
// the same commit that rewrites that journal must not retire the check.
const ATTACK_DROPPED_JOURNAL = mutateManifest(SYNTHETIC_MANIFEST, [
  ['  - path: docs/plan3/journal/MANAGER-C.md\n    owner: C\n', ''],
]);

// B2. One byte of an existing journal line is flipped from 0xFF to 0xFE and a new line is
// appended. Both bytes decode to U+FFFD, so any comparison that decodes before comparing
// sees an untouched prefix.
const BYTE_JOURNAL_PREFIX = Buffer.from('# Manager C journal\n- base entry ', 'utf8');
const BYTE_JOURNAL_BASE = Buffer.concat([BYTE_JOURNAL_PREFIX, Buffer.from([0xff]), Buffer.from('\n', 'utf8')]);
const BYTE_JOURNAL_HONEST = Buffer.concat([BYTE_JOURNAL_BASE, Buffer.from('- appended entry\n', 'utf8')]);
const BYTE_JOURNAL_TAMPERED = Buffer.concat([
  BYTE_JOURNAL_PREFIX,
  Buffer.from([0xfe]),
  Buffer.from('\n- appended entry\n', 'utf8'),
]);

// --- strict YAML subset -------------------------------------------------------

test('the shipped territory manifest parses and validates', () => {
  const manifest = loadTerritoryManifest({ file: manifestFile, expectedPath: MANIFEST_PATH });
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

test('YAML subset folds multiline plain scalar continuations', () => {
  const parsed = parseStrictYaml([
    'entry:',
    '  status: RULED 2026-07-28 - standing policy, FINDING-*.md, PO-SWEEP-RESULTS and',
    '    journal/FORMAT.md are tracked at ced58667c. Evidence for the ruling - a Director',
    '    script overwrote two manager journals and git reported nothing, because they were',
    '    untracked. Evidence documents (evidence/, probes/, worker-reports/) stay local.',
    '  provenance: ruling',
  ].join('\n'));
  assert.equal(
    parsed.entry.status,
    'RULED 2026-07-28 - standing policy, FINDING-*.md, PO-SWEEP-RESULTS and journal/FORMAT.md are tracked at ced58667c. Evidence for the ruling - a Director script overwrote two manager journals and git reported nothing, because they were untracked. Evidence documents (evidence/, probes/, worker-reports/) stay local.',
  );
  assert.equal(parsed.entry.provenance, 'ruling');
});

test('the live territory manifest loads without throwing', () => {
  assert.doesNotThrow(() => loadTerritoryManifest({ file: manifestFile }));
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

test('A16.1: every journals entry resolves owned for its declared owner on the shipped manifest', () => {
  const manifest = loadTerritoryManifest({ file: manifestFile, expectedPath: MANIFEST_PATH });
  const successVerdicts = new Set(['owned', 'director-only', 'director']);
  for (const entry of manifest.journals) {
    const verdict = resolveOwnership(manifest, entry.path, entry.owner);
    assert.equal(verdict.ok, true, `${entry.owner} must own ${entry.path}: ${JSON.stringify(verdict)}`);
    assert.ok(
      successVerdicts.has(verdict.verdict),
      `${entry.path} for ${entry.owner}: expected owned or equivalent success, got ${verdict.verdict}`,
    );
  }
});

test('A16.1: Manager A, B and C each own their journal on the shipped manifest', () => {
  const manifest = loadTerritoryManifest({ file: manifestFile, expectedPath: MANIFEST_PATH });
  for (const [journalPath, owner] of [
    ['docs/plan3/journal/MANAGER-A.md', 'A'],
    ['docs/plan3/journal/MANAGER-B.md', 'B'],
    ['docs/plan3/journal/MANAGER-C.md', 'C'],
  ]) {
    const verdict = resolveOwnership(manifest, journalPath, owner);
    assert.equal(verdict.ok, true, `${owner} must own ${journalPath}: ${JSON.stringify(verdict)}`);
    assert.equal(verdict.verdict, 'owned', `${journalPath} must resolve to owned for Manager ${owner}`);
  }
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
    (value) => { value.manifest_path = 'docs/plan3/*.yml'; },
    (value) => { value.manifest_path = '/etc/TERRITORY.yml'; },
  ]) {
    const raw2 = parseStrictYaml(SYNTHETIC_MANIFEST);
    mutate(raw2);
    assert.throws(() => validateTerritoryManifest(raw2), Error, 'corrupted manifest should be rejected');
  }
});

test('manifest validation rejects unknown keys instead of ignoring typos', () => {
  const topLevel = parseStrictYaml(SYNTHETIC_MANIFEST);
  topLevel.denied_path = 'chart v 1.4/chart/chart.js';
  assert.throws(() => validateTerritoryManifest(topLevel), /territory manifest: unknown key denied_path/);

  const managerRule = parseStrictYaml(SYNTHETIC_MANIFEST);
  managerRule.managers[2].owned_paths[0].denied_path = 'scripts/tests/oops.test.mjs';
  assert.throws(() => validateTerritoryManifest(managerRule), /manager C owned_paths entry: unknown key denied_path/);

  const journal = parseStrictYaml(SYNTHETIC_MANIFEST);
  journal.journals[0].owners = 'C';
  assert.throws(() => validateTerritoryManifest(journal), /journals entry: unknown key owners/);
});

test('except entries are honored on manager rule lists', () => {
  const raw = parseStrictYaml(SYNTHETIC_MANIFEST);
  raw.managers[2].denied_paths.push({
    pattern: 'scripts/tests/**',
    except: ['scripts/tests/allowed.test.mjs'],
    reason: 'test carve-out',
    provenance: 'ruling',
  });
  const manifest = validateTerritoryManifest(raw);

  assert.equal(resolveOwnership(manifest, 'scripts/tests/allowed.test.mjs', 'C').verdict, 'owned');
  const blocked = resolveOwnership(manifest, 'scripts/tests/blocked.test.mjs', 'C');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.verdict, 'denied');
});

// --- B1: the manifest cannot unprotect itself ---------------------------------

test('B1a: except on a director_only rule is refused outright', () => {
  assert.throws(
    () => loadPreflightManifest({ file: MANIFEST_PATH, text: ATTACK_DIRECTOR_ONLY_EXCEPT, expectedPath: MANIFEST_PATH }),
    /director_only docs\/plan3\/TERRITORY\.yml: except is not permitted/,
  );
  // except stays legal everywhere it only narrows a grant.
  assert.doesNotThrow(() => loadPreflightManifest({
    file: MANIFEST_PATH,
    text: SYNTHETIC_MANIFEST_WITH_DIRECTOR_PATHS,
    expectedPath: MANIFEST_PATH,
  }));
});

test('B1a negative control: honoring except on director_only is what would have let C own the manifest', () => {
  const manifest = validateTerritoryManifest(parseStrictYaml(SYNTHETIC_MANIFEST));
  const grant = {
    pattern: MANIFEST_PATH,
    regex: globToRegExp(MANIFEST_PATH),
    specificity: patternSpecificity(MANIFEST_PATH),
    provenance: 'inferred',
    reason: '',
    except: [],
  };
  const carvedOut = {
    ...manifest,
    directorOnly: manifest.directorOnly.map((rule) => ({ ...rule, except: [MANIFEST_PATH] })),
    managers: manifest.managers.map((entry) => (entry.id === 'C' ? { ...entry, owned: [...entry.owned, grant] } : entry)),
  };
  assert.equal(resolveOwnership(carvedOut, MANIFEST_PATH, 'C').ok, true, 'the carve-out is the mechanism under test');
  assert.equal(resolveOwnership({ ...carvedOut, directorOnly: manifest.directorOnly }, MANIFEST_PATH, 'C').ok, false);
});

test('B1b: a manifest that misnames its own location is refused, and an owned_paths claim on it is refused', () => {
  assert.throws(
    () => loadPreflightManifest({ file: MANIFEST_PATH, text: ATTACK_DECOY_MANIFEST_PATH, expectedPath: MANIFEST_PATH }),
    /loaded from docs\/plan3\/TERRITORY\.yml but declares manifest_path docs\/plan3\/TERRITORY-DECOY\.yml/,
  );

  const selfGrant = parseStrictYaml(SYNTHETIC_MANIFEST);
  selfGrant.managers[2].owned_paths.push({ pattern: MANIFEST_PATH, provenance: 'inferred' });
  assert.throws(() => validateTerritoryManifest(selfGrant), /manager C: owned_paths claims the manifest/);

  const shared = parseStrictYaml(SYNTHETIC_MANIFEST);
  shared.shared_paths.push({ pattern: 'docs/plan3/*.yml', reason: 'oops', provenance: 'inferred' });
  assert.throws(() => validateTerritoryManifest(shared), /manifest_path is listed as a shared path/);
});

test('B1b negative control: the decoy manifest is internally consistent and would have gone GREEN', () => {
  // Loaded without the location binding, the decoy passes every other check and hands
  // Manager C both the manifest and the deploy tree. That is what head-governance saw.
  const decoy = validateTerritoryManifest(parseStrictYaml(ATTACK_DECOY_MANIFEST_PATH));
  const verdicts = auditTouchedPaths(decoy, 'C', [MANIFEST_PATH, 'deploy/nginx.conf']);
  assert.equal(verdicts.ok, true, 'the decoy must actually be an effective attack');
  assert.deepEqual(verdicts.checked.map((entry) => entry.verdict), ['owned', 'owned']);
});

// --- append-only journal check ------------------------------------------------

test('append-only accepts a pure append of new lines at EOF', () => {
  const base = '# journal\n- entry one\n- entry two\n';
  assert.equal(isAppendOnly(base, `${base}- entry three\n`), true);
  assert.equal(isAppendOnly(base, base), true);
  assert.equal(isAppendOnly('- entry', '- entry\n- next\n'), true);
  assert.deepEqual(appendedLines(base, `${base}- three\n- four\n`), ['- three', '- four']);
});

test('append-only rejects modifying an existing line', () => {
  const base = '# journal\n- entry one\n- entry two\n';
  assert.equal(isAppendOnly(base, '# journal\n- entry ONE\n- entry two\n'), false, 'modification');
  assert.equal(isAppendOnly('- entry', '- entry extended\n'), false, 'extending the final line is not an append');
});

test('append-only rejects deleting an existing line', () => {
  const base = '# journal\n- entry one\n- entry two\n';
  assert.equal(isAppendOnly(base, '# journal\n- entry one\n'), false, 'removal');
});

test('append-only rejects inserting a line between existing lines', () => {
  const base = '# journal\n- entry one\n- entry two\n';
  assert.equal(isAppendOnly(base, '# journal\n- entry one\n- inserted\n- entry two\n'), false, 'middle insert');
  assert.equal(isAppendOnly(base, '# journal\n- entry two\n- entry one\n'), false, 'reorder');
});

test('append-only rejects prepending content before existing lines', () => {
  const base = '# journal\n- entry one\n- entry two\n';
  assert.equal(isAppendOnly(base, `# prepended\n${base}`), false, 'prepend');
});

test('append-only accepts empty-to-nonempty first journal writes', () => {
  assert.equal(isAppendOnly('', '# journal\n- first entry\n'), true);
  assert.deepEqual(appendedLines('', '# journal\n- first entry\n'), ['# journal', '- first entry']);
  assert.equal(isAppendOnly(null, 'x'), false);
  assert.equal(isAppendOnly('x', undefined), false);
});

test('B2: append-only compares bytes, so a 0xFF to 0xFE swap inside a kept line is RED', () => {
  // The mechanism, isolated. Decoding first maps both bytes onto U+FFFD and the tampered
  // head looks like an untouched prefix plus an append.
  assert.equal(
    BYTE_JOURNAL_BASE.toString('utf8'),
    BYTE_JOURNAL_TAMPERED.toString('utf8').slice(0, BYTE_JOURNAL_BASE.toString('utf8').length),
    'the two byte sequences must be indistinguishable after a utf8 decode',
  );
  assert.equal(isAppendOnly(BYTE_JOURNAL_BASE.toString('utf8'), BYTE_JOURNAL_TAMPERED.toString('utf8')), true);
  assert.equal(isAppendOnly(BYTE_JOURNAL_BASE, BYTE_JOURNAL_TAMPERED), false);
  assert.equal(isAppendOnly(BYTE_JOURNAL_BASE, BYTE_JOURNAL_HONEST), true);
  assert.deepEqual(appendedLines(BYTE_JOURNAL_BASE, BYTE_JOURNAL_HONEST), ['- appended entry']);
});

test('append-only payload is deterministic for identical inputs', () => {
  const journals = [{ path: 'docs/plan3/journal/MANAGER-C.md', owner: 'C' }];
  const change = {
    status: 'M',
    path: 'docs/plan3/journal/MANAGER-C.md',
    before: '# C\n- one\n',
    after: '# C\n- one\n- two\n',
  };
  const payloads = [1, 2, 3].map(() => JSON.stringify(auditJournalAppendOnly({ journals, author: 'C', changes: [change] })));
  assert.equal(new Set(payloads).size, 1, 'three identical journal payloads must produce identical audit output');
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
  assert.deepEqual(kinds([{ status: 'A', path: 'docs/plan3/journal/MANAGER-C.md', before: Buffer.alloc(0), after: base }]), []);
  assert.deepEqual(kinds([{ status: 'M', path: 'docs/plan3/journal/MANAGER-C.md', before: base, after: `${base}- two\n` }], 'A'), ['journal-owner']);

  const untouched = auditJournalAppendOnly({
    journals, author: 'C',
    changes: [{ status: 'M', path: 'scripts/tests/x.test.mjs', before: 'a', after: 'b' }],
  });
  assert.equal(untouched.ok, true);
  assert.deepEqual(untouched.checked, []);
});

test('journal gate fails closed when a modified journal base blob is unreadable', () => {
  const journals = [{ path: 'docs/plan3/journal/MANAGER-C.md', owner: 'C' }];
  const result = auditJournalAppendOnly({
    journals,
    author: 'C',
    changes: [{
      status: 'M',
      path: 'docs/plan3/journal/MANAGER-C.md',
      before: null,
      beforeUnreadable: true,
      after: '# Manager C journal\n- base entry\n- appended entry\n',
    }],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.violations.map((violation) => violation.kind), ['journal-base-unreadable']);

  const add = auditJournalAppendOnly({
    journals,
    author: 'C',
    changes: [{
      status: 'A',
      path: 'docs/plan3/journal/MANAGER-C.md',
      before: null,
      beforeUnreadable: true,
      after: '# Manager C journal\n- first entry\n',
    }],
  });
  assert.equal(add.ok, true, 'empty base remains valid for a true add');
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

// --- CLI surface --------------------------------------------------------------

test('CLI refuses unknown, repeated, valueless and incoherent flag sets', () => {
  assert.deepEqual(
    parseArgs(['--base', 'origin/main', '--head', 'HEAD', '--manager', 'C', '--out', 'r.json']),
    { base: 'origin/main', head: 'HEAD', manager: 'C', out: 'r.json' },
  );
  // A silently swallowed typo is a gate that quietly stops cross-checking the branch.
  assert.throws(() => parseArgs(['--managers', 'C', '--base', 'x']), /unknown argument --managers/);
  assert.throws(() => parseArgs(['--base', 'x', '--verbose', 'y']), /unknown argument --verbose/);
  assert.throws(() => parseArgs(['--base', 'x', '--base', 'y']), /--base given more than once/);
  assert.throws(() => parseArgs(['--base']), /--base requires a value/);
  assert.throws(() => parseArgs(['--head', 'HEAD']), /--base or --files-from is required/);
  assert.throws(() => parseArgs(['--base', 'x', '--files-from', 'f', '--manager', 'C']), /mutually exclusive/);
  assert.throws(() => parseArgs(['--files-from', 'f']), /--files-from requires --manager/);
  assert.throws(() => parseArgs(['--base', 'x', '--manager', 'Director']), /single-letter manager ids/);
  assert.deepEqual(parseArgs(['--base', 'x', '--manager', 'A,C']).manager, 'A,C');
});

// --- end to end over a real git repository ------------------------------------

function scratchRepo({ manifest = SYNTHETIC_MANIFEST, journalC = '# Manager C journal\n- base entry\n' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-territory-'));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Manager C', GIT_AUTHOR_EMAIL: 'c@talaria.invalid',
    GIT_COMMITTER_NAME: 'Manager C', GIT_COMMITTER_EMAIL: 'c@talaria.invalid',
    GIT_AUTHOR_DATE: '2026-07-27T00:00:00+0000', GIT_COMMITTER_DATE: '2026-07-27T00:00:00+0000',
    GIT_CONFIG_GLOBAL: path.join(dir, '.gitconfig-absent'), GIT_CONFIG_SYSTEM: path.join(dir, '.gitconfig-absent'),
  };
  // Honors the encoding request, exactly as gitRunner does. A stand-in that always
  // decoded would defeat the byte-exact journal comparison, so the preflight asserts
  // on the type it gets back rather than trusting the runner.
  const git = (args, { encoding = 'utf8' } = {}) => execFileSync('git', args, {
    cwd: dir, encoding, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const write = (relative, content) => {
    const target = path.join(dir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  const commit = (message) => { git(['add', '-A']); git(['commit', '-m', message]); };

  git(['init', '-b', 'main']);
  write('docs/plan3/TERRITORY.yml', manifest);
  write('docs/plan3/journal/MANAGER-C.md', journalC);
  write('docs/plan3/journal/MANAGER-A.md', '# Manager A journal\n- base entry\n');
  write('docs/plan3/journal/MANAGER-B.md', '# Manager B journal\n- base entry\n');
  write('chart v 1.4/chart/chart.js', '// engine\n');
  write('scripts/tests/existing.test.mjs', '// cell\n');
  commit('chore: base\n\nManager: Director\nRow: A11.2-territory-preflight\nPacket: PACKET-BASE\nTier: 2\n');
  return { dir, git, write, commit, base: git(['rev-parse', 'HEAD']).trim() };
}

const TRAILERS = 'Manager: C\nRow: A11.2-territory-preflight\nPacket: PACKET-C-001\nTier: 2\n';
const TRAILERS_A = 'Manager: A\nRow: A11.2-territory-preflight\nPacket: PACKET-A-001\nTier: 2\n';
const TRAILERS_DIRECTOR = 'Manager: Director\nRow: A11.2-territory-preflight\nPacket: PACKET-DIRECTOR-001\nTier: 2\n';

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
    assert.equal(result.commits[0].governedBy, repo.base, 'the packet base governs the first commit');
    assert.equal(result.commits[0].manifestVersion, 'test-001');
    assert.deepEqual(result.commits[0].journal.checked, [{ path: 'docs/plan3/journal/MANAGER-C.md', owner: 'C', status: 'M', appended: 1 }]);
    assert.deepEqual(touchedPaths(readChanges(repo.git, repo.base, 'HEAD')), [
      'docs/plan3/journal/MANAGER-C.md', 'scripts/tests/new-cell.test.mjs',
    ]);
    assert.equal(readCommits(repo.git, repo.base, 'HEAD').length, 1);
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: unreadable parent journal blob is RED, not an empty base', () => {
  const repo = scratchRepo();
  try {
    repo.write('docs/plan3/journal/MANAGER-C.md', '# Manager C journal\n- base entry\n- appended entry\n');
    repo.commit(`test: append journal\n\n${TRAILERS}`);
    const poisonedGit = (args, options) => {
      if (args[0] === 'show' && args[1] === `${repo.base}:docs/plan3/journal/MANAGER-C.md`) {
        throw new Error('simulated parent blob read failure');
      }
      return repo.git(args, options);
    };

    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: poisonedGit });
    assert.equal(result.ok, false);
    assert.deepEqual(violationsOf(result).map((violation) => violation.kind), ['journal-base-unreadable']);
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: a git runner that decodes blobs is refused instead of silently weakening the check', () => {
  const repo = scratchRepo();
  try {
    repo.write('docs/plan3/journal/MANAGER-C.md', '# Manager C journal\n- base entry\n- appended entry\n');
    repo.commit(`test: append journal\n\n${TRAILERS}`);
    const decodingGit = (args) => repo.git(args);

    assert.throws(
      () => runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: decodingGit }),
      /byte-exact journal comparison requires a Buffer/,
    );
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: B2 a byte swap inside a committed journal line is RED, an honest append is GREEN', () => {
  const honest = scratchRepo({ journalC: BYTE_JOURNAL_BASE });
  try {
    // git must hand the bytes back unchanged, or this cell would be testing git.
    assert.deepEqual(
      honest.git(['show', 'HEAD:docs/plan3/journal/MANAGER-C.md'], { encoding: 'buffer' }),
      BYTE_JOURNAL_BASE,
    );
    honest.write('docs/plan3/journal/MANAGER-C.md', BYTE_JOURNAL_HONEST);
    honest.commit(`test: honest append over invalid utf8\n\n${TRAILERS}`);

    const result = runPreflight({ root: honest.dir, base: honest.base, head: 'HEAD', git: honest.git });
    assert.equal(result.ok, true, JSON.stringify(violationsOf(result)));
    assert.deepEqual(result.commits[0].journal.checked, [{ path: 'docs/plan3/journal/MANAGER-C.md', owner: 'C', status: 'M', appended: 1 }]);
  } finally {
    fs.rmSync(honest.dir, { recursive: true, force: true });
  }

  const tampered = scratchRepo({ journalC: BYTE_JOURNAL_BASE });
  try {
    tampered.write('docs/plan3/journal/MANAGER-C.md', BYTE_JOURNAL_TAMPERED);
    tampered.commit(`test: swap one byte of history and append\n\n${TRAILERS}`);

    const result = runPreflight({ root: tampered.dir, base: tampered.base, head: 'HEAD', git: tampered.git });
    assert.equal(result.ok, false, 'a one-byte edit of an existing journal line must be RED');
    assert.deepEqual(violationsOf(result).map((violation) => violation.kind), ['journal-not-append-only']);

    // The mechanism, on the real blobs: read the same two commits through a decoding
    // runner and the tampered head is indistinguishable from an honest append.
    const decodedBase = tampered.git(['show', `${tampered.base}:docs/plan3/journal/MANAGER-C.md`]);
    const decodedHead = tampered.git(['show', 'HEAD:docs/plan3/journal/MANAGER-C.md']);
    assert.equal(isAppendOnly(decodedBase, decodedHead), true, 'decoded blobs are what let this through');
    assert.equal(
      isAppendOnly(
        tampered.git(['show', `${tampered.base}:docs/plan3/journal/MANAGER-C.md`], { encoding: 'buffer' }),
        tampered.git(['show', 'HEAD:docs/plan3/journal/MANAGER-C.md'], { encoding: 'buffer' }),
      ),
      false,
    );
  } finally {
    fs.rmSync(tampered.dir, { recursive: true, force: true });
  }
});

test('end to end: B1a a director_only carve-out plus a self-grant in one commit is RED', () => {
  const repo = scratchRepo();
  try {
    repo.write('docs/plan3/TERRITORY.yml', ATTACK_DIRECTOR_ONLY_EXCEPT);
    repo.write('deploy/nginx.conf', 'server {}\n');
    repo.commit(`test: carve the manifest out of its own protection\n\n${TRAILERS}`);

    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git });
    assert.equal(result.ok, false, 'a manager may not rewrite the rules it is judged by');
    assert.deepEqual(
      result.commits[0].ownership.violations.map((violation) => [violation.path, violation.verdict]),
      [['deploy/nginx.conf', 'unowned'], ['docs/plan3/TERRITORY.yml', 'director-only']],
    );
    // Second, independent barrier: the rewritten manifest does not even load.
    assert.deepEqual(
      result.artifacts.violations.map((violation) => violation.kind),
      ['manifest-unloadable'],
    );
    assert.match(formatReport(result), /manifest-unloadable/);
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: B1b a decoy manifest_path with the real file unprotected is RED', () => {
  const repo = scratchRepo();
  try {
    repo.write('docs/plan3/TERRITORY.yml', ATTACK_DECOY_MANIFEST_PATH);
    repo.write('deploy/nginx.conf', 'server {}\n');
    repo.commit(`test: repoint manifest_path at a decoy\n\n${TRAILERS}`);

    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git });
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.commits[0].ownership.violations.map((violation) => [violation.path, violation.verdict]),
      [['deploy/nginx.conf', 'unowned'], ['docs/plan3/TERRITORY.yml', 'director-only']],
    );
    assert.deepEqual(result.artifacts.violations.map((violation) => violation.kind), ['manifest-unloadable']);
    assert.equal(result.manifestVersion, null, 'the head manifest is not trusted and not reported as in force');
    assert.deepEqual(result.governingVersions, ['test-001']);

    // The mechanism, on this exact commit: score the same touched paths against the
    // manifest the commit itself installed - which is what head-governance did - and the
    // packet passes. Parent-governance is the only thing standing between the two.
    const headSha = repo.git(['rev-parse', 'HEAD']).trim();
    const asHeadGoverned = auditTouchedPaths(
      validateTerritoryManifest(parseStrictYaml(repo.git(['show', `${headSha}:docs/plan3/TERRITORY.yml`]))),
      'C',
      touchedPaths(readCommitChanges(repo.git, headSha)),
    );
    assert.equal(asHeadGoverned.ok, true, 'head-governance is exactly what would have passed this packet');
    assert.deepEqual(asHeadGoverned.checked.map((entry) => entry.verdict), ['owned', 'owned']);
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: B1c dropping a journals entry does not retire the append-only audit', () => {
  // The head manifest no longer declares Manager C's journal at all.
  const headManifest = loadPreflightManifest({ file: MANIFEST_PATH, text: ATTACK_DROPPED_JOURNAL, expectedPath: MANIFEST_PATH });
  assert.equal(headManifest.journals.some((entry) => entry.path.endsWith('MANAGER-C.md')), false);

  const repo = scratchRepo();
  try {
    repo.write('docs/plan3/TERRITORY.yml', ATTACK_DROPPED_JOURNAL);
    repo.write('docs/plan3/journal/MANAGER-C.md', '# Manager C journal\n- history rewritten\n');
    repo.commit(`test: drop the journal entry and rewrite the journal\n\n${TRAILERS}`);

    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git });
    assert.equal(result.ok, false);
    assert.deepEqual(
      violationsOf(result).map((violation) => violation.verdict || violation.kind).sort(),
      ['director-only', 'journal-not-append-only'],
    );
    // Pinned from the parent, so the artifact audit still knows the journal exists.
    assert.ok(result.artifacts.checked.some((entry) => entry.path === 'docs/plan3/journal/MANAGER-C.md'));
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: a Director manifest amendment mid-packet governs the commits after it', () => {
  const repo = scratchRepo();
  try {
    const granted = mutateManifest(SYNTHETIC_MANIFEST, [[C_GRANTS_ANCHOR, `      - pattern: docs/plan3/journal/MANAGER-C.md
        provenance: ruling
      - pattern: deploy/**
        provenance: ruling
    denied_paths:
`]]);
    repo.write('docs/plan3/TERRITORY.yml', granted);
    repo.commit(`chore: Director grants C the deploy tree\n\n${TRAILERS_DIRECTOR}`);
    repo.write('deploy/nginx.conf', 'server {}\n');
    repo.commit(`test: C uses the new grant\n\n${TRAILERS}`);

    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git, manager: 'C' });
    assert.equal(result.ok, true, JSON.stringify(violationsOf(result)));
    assert.deepEqual(result.authors, ['C', 'Director']);

    // Same two edits, same order, without the Director commit in front: RED.
    const ungranted = scratchRepo();
    try {
      ungranted.write('deploy/nginx.conf', 'server {}\n');
      ungranted.commit(`test: C uses a grant that has not landed\n\n${TRAILERS}`);
      const red = runPreflight({ root: ungranted.dir, base: ungranted.base, head: 'HEAD', git: ungranted.git });
      assert.equal(red.ok, false);
    } finally {
      fs.rmSync(ungranted.dir, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: the governing manifest is the parent commit, not the worktree', () => {
  const repo = scratchRepo();
  try {
    repo.write('deploy/nginx.conf', 'server {}\n');
    repo.commit(`test: touch unowned deploy file\n\n${TRAILERS}`);
    const dirtySelfGrant = mutateManifest(SYNTHETIC_MANIFEST, [[C_GRANTS_ANCHOR, C_SELF_GRANT]]);
    repo.write('docs/plan3/TERRITORY.yml', dirtySelfGrant);

    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git });
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.commits[0].ownership.violations.map((violation) => [violation.path, violation.verdict]),
      [['deploy/nginx.conf', 'unowned']],
    );
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

    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git, manager: 'C' });
    assert.equal(result.ok, true, JSON.stringify(violationsOf(result)));
    assert.deepEqual(result.authors, ['C', 'Director']);
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: --manager disagreement is a recorded violation, not a thrown gate', () => {
  const repo = scratchRepo();
  try {
    repo.write('docs/plan3/TERRITORY.yml', `${SYNTHETIC_MANIFEST}# Director amendment\n`);
    repo.commit(`test: Director amendment\n\n${TRAILERS_DIRECTOR}`);
    repo.write('chart v 1.4/chart/chart.js', '// engine\n// A owned edit\n');
    repo.commit(`test: A owned edit\n\n${TRAILERS_A}`);

    const agrees = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git, manager: 'A' });
    assert.equal(agrees.ok, true, JSON.stringify(violationsOf(agrees)));
    assert.deepEqual(agrees.manager, { expected: ['A'], declared: ['A'], ok: true, violations: [] });

    const disagrees = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git, manager: 'C' });
    assert.equal(disagrees.ok, false);
    assert.deepEqual(disagrees.manager.violations.map((violation) => violation.kind), ['manager-mismatch']);
    assert.match(
      disagrees.manager.violations[0].detail,
      /--manager C disagrees with the non-Director commit trailers \(A\)/,
    );
    // Everything else still resolved, so the evidence file is complete rather than absent.
    assert.equal(disagrees.commits.length, 2);
    assert.match(formatReport(disagrees), /RED packet manager-mismatch/);
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
    assert.deepEqual(violationsOf(result).map((violation) => violation.kind), ['artifact-missing', 'journal-removed']);
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

test('end to end: a manager the governing manifest does not declare is RED', () => {
  const repo = scratchRepo();
  try {
    repo.write('scripts/tests/new-cell.test.mjs', '// new cell\n');
    repo.commit('test: add cell\n\nManager: Z\nRow: A11.2-territory-preflight\nPacket: PACKET-Z-001\nTier: 2\n');

    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git });
    assert.equal(result.ok, false);
    assert.deepEqual(violationsOf(result).map((violation) => violation.kind), ['author-undeclared']);
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: Manager C packet records Manager A untracked journal without going RED', () => {
  const repo = scratchRepo();
  try {
    repo.write('scripts/tests/new-cell.test.mjs', '// new cell\n');
    repo.git(['add', '--', 'scripts/tests/new-cell.test.mjs']);
    repo.git(['commit', '-m', `test: add cell\n\n${TRAILERS}`]);
    repo.git(['rm', '--cached', '--', 'docs/plan3/journal/MANAGER-A.md']);

    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git });
    assert.equal(result.ok, true, JSON.stringify(violationsOf(result)));
    assert.deepEqual(
      result.artifacts.observations.map((observation) => [observation.path, observation.owner, observation.kind]),
      [['docs/plan3/journal/MANAGER-A.md', 'A', 'artifact-untracked-other-owner']],
    );
    assert.deepEqual(
      result.artifacts.checked.find((entry) => entry.path === 'docs/plan3/journal/MANAGER-A.md'),
      { path: 'docs/plan3/journal/MANAGER-A.md', owner: 'A', present: true, tracked: false, ignored: false },
    );
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('artifact audit: other-owner untracked journals are observations, not violations', () => {
  const repo = scratchRepo();
  try {
    repo.git(['rm', '--cached', '--', 'docs/plan3/journal/MANAGER-A.md']);
    const manifest = loadTerritoryManifest({ file: path.join(repo.dir, 'docs/plan3/TERRITORY.yml') });
    const result = auditDeclaredArtifacts({ git: repo.git, manifest, root: repo.dir, author: 'C' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.violations, []);
    assert.deepEqual(
      result.observations.map((observation) => [observation.path, observation.owner, observation.kind]),
      [['docs/plan3/journal/MANAGER-A.md', 'A', 'artifact-untracked-other-owner']],
    );
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('artifact audit: absent and untracked declared artifacts are owner violations', () => {
  const repo = scratchRepo();
  try {
    repo.git(['rm', '-f', '--', 'docs/plan3/journal/MANAGER-A.md']);
    const manifest = loadTerritoryManifest({ file: path.join(repo.dir, 'docs/plan3/TERRITORY.yml') });
    const result = auditDeclaredArtifacts({ git: repo.git, manifest, root: repo.dir, author: 'A' });
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.violations.map((violation) => [violation.path, violation.owner, violation.kind]),
      [['docs/plan3/journal/MANAGER-A.md', 'A', 'artifact-missing']],
    );
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('formatReport labels packet-scoped rows as packet and commit rows by short sha', () => {
  const repo = scratchRepo();
  try {
    repo.write('scripts/tests/new-cell.test.mjs', '// new cell\n');
    repo.git(['add', '--', 'scripts/tests/new-cell.test.mjs']);
    repo.git(['commit', '-m', `test: add cell\n\n${TRAILERS}`]);
    repo.git(['rm', '--cached', '--', 'docs/plan3/journal/MANAGER-A.md']);

    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git });
    assert.equal(result.ok, true, JSON.stringify(violationsOf(result)));
    assert.equal(observationsOf(result).length, 1);
    const report = formatReport(result);
    // The finding is packet-scoped, not from a file list, and the old label said so.
    assert.match(report, /OBS packet artifact-untracked-other-owner: docs\/plan3\/journal\/MANAGER-A\.md/);
    assert.equal(report.includes('file-list'), false);
    assert.equal(shortSha(result.commits[0].sha).length, 12);
    assert.ok(report.includes(`ok  ${shortSha(result.commits[0].sha)} Manager C`));
    assert.match(report, /governed by [0-9a-f]{12} \(test-001\)/);
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: Manager A packet is RED when Manager A journal is untracked', () => {
  const repo = scratchRepo();
  try {
    repo.write('chart v 1.4/chart/chart.js', '// engine\n// A owned edit\n');
    repo.git(['add', '--', 'chart v 1.4/chart/chart.js']);
    repo.git(['commit', '-m', `test: A owned edit\n\n${TRAILERS_A}`]);
    repo.git(['rm', '--cached', '--', 'docs/plan3/journal/MANAGER-A.md']);

    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git });
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.artifacts.violations.map((violation) => [violation.path, violation.owner, violation.kind]),
      [['docs/plan3/journal/MANAGER-A.md', 'A', 'artifact-untracked']],
    );
    assert.deepEqual(result.artifacts.observations, []);
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: ignored declared artifacts are RED for every author including Director', () => {
  for (const [author, trailers, mutate] of [
    ['C', TRAILERS, (repo) => repo.write('scripts/tests/new-cell.test.mjs', '// new cell\n')],
    ['Director', TRAILERS_DIRECTOR, (repo) => repo.write('docs/plan3/TERRITORY.yml', `${SYNTHETIC_MANIFEST}# Director amendment\n`)],
  ]) {
    const repo = scratchRepo();
    try {
      mutate(repo);
      repo.commit(`test: ${author} packet\n\n${trailers}`);
      repo.write('.gitignore', 'docs/\n');

      const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git });
      assert.equal(result.ok, false, `${author}: ignored artifacts must be RED`);
      assert.deepEqual(
        [...new Set(result.artifacts.violations.map((violation) => violation.kind))],
        ['artifact-ignored'],
      );
    } finally {
      fs.rmSync(repo.dir, { recursive: true, force: true });
    }
  }
});

test('end to end: the manifest itself untracked is RED for a Director-authored commit', () => {
  const repo = scratchRepo();
  try {
    repo.write('docs/plan3/TERRITORY.yml', `${SYNTHETIC_MANIFEST}# Director amendment\n`);
    repo.commit(`test: Director updates manifest\n\n${TRAILERS_DIRECTOR}`);
    repo.git(['rm', '--cached', '--', 'docs/plan3/TERRITORY.yml']);

    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git });
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.artifacts.violations.map((violation) => [violation.path, violation.owner, violation.kind]),
      [['docs/plan3/TERRITORY.yml', 'Director', 'artifact-untracked']],
    );
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: director_paths grants Director and rejects Manager C', () => {
  const director = scratchRepo({ manifest: SYNTHETIC_MANIFEST_WITH_DIRECTOR_PATHS });
  try {
    director.write('docs/plan3/FINDING-001.md', '# finding\n');
    director.commit(`test: Director finding\n\n${TRAILERS_DIRECTOR}`);
    const result = runPreflight({ root: director.dir, base: director.base, head: 'HEAD', git: director.git });
    assert.equal(result.ok, true, JSON.stringify(violationsOf(result)));
    assert.deepEqual(
      result.commits[0].ownership.checked.map((entry) => [entry.path, entry.ok, entry.verdict, entry.owner]),
      [['docs/plan3/FINDING-001.md', true, 'owned', 'Director']],
    );
  } finally {
    fs.rmSync(director.dir, { recursive: true, force: true });
  }

  const manager = scratchRepo({ manifest: SYNTHETIC_MANIFEST_WITH_DIRECTOR_PATHS });
  try {
    manager.write('docs/plan3/FINDING-001.md', '# finding\n');
    manager.commit(`test: Manager finding\n\n${TRAILERS}`);
    const result = runPreflight({ root: manager.dir, base: manager.base, head: 'HEAD', git: manager.git });
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.commits[0].ownership.violations.map((violation) => [violation.path, violation.verdict, violation.owner]),
      [['docs/plan3/FINDING-001.md', 'out-of-territory', 'Director']],
    );
  } finally {
    fs.rmSync(manager.dir, { recursive: true, force: true });
  }
});

test('end to end: exact manager grants beat director_paths wildcards on specificity', () => {
  const repo = scratchRepo({ manifest: SYNTHETIC_MANIFEST_WITH_DIRECTOR_PATHS });
  try {
    repo.write('docs/plan3/GATE-NAME-RESERVATIONS.md', '# gate names\n');
    repo.commit(`test: update gate names\n\n${TRAILERS}`);

    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git });
    assert.equal(result.ok, true, JSON.stringify(violationsOf(result)));
    assert.deepEqual(
      result.commits[0].ownership.checked.map((entry) => [entry.path, entry.verdict, entry.owner, entry.rule]),
      [['docs/plan3/GATE-NAME-RESERVATIONS.md', 'owned', 'C', 'docs/plan3/GATE-NAME-RESERVATIONS.md']],
    );
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: director_paths except removes Director wildcard ownership', () => {
  const repo = scratchRepo({ manifest: SYNTHETIC_MANIFEST_WITH_DIRECTOR_PATHS });
  try {
    repo.write('docs/plan3/GATE-NAME-RESERVATIONS.md', '# gate names\n');
    repo.commit(`test: Director touches excepted gate list\n\n${TRAILERS_DIRECTOR}`);

    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git });
    assert.equal(result.ok, true, JSON.stringify(violationsOf(result)));
    assert.deepEqual(
      result.commits[0].ownership.checked.map((entry) => [entry.path, entry.verdict, entry.owner, entry.rule]),
      [['docs/plan3/GATE-NAME-RESERVATIONS.md', 'director', 'C', 'docs/plan3/GATE-NAME-RESERVATIONS.md']],
    );
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: unowned paths remain RED for Director without a director_paths grant', () => {
  const repo = scratchRepo();
  try {
    repo.write('deploy/nginx.conf', 'server {}\n');
    repo.commit(`test: Director unowned path\n\n${TRAILERS_DIRECTOR}`);

    const result = runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git });
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.commits[0].ownership.violations.map((violation) => [violation.path, violation.verdict, violation.owner]),
      [['deploy/nginx.conf', 'unowned', null]],
    );
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('end to end: territory preflight payload is deterministic and path-stable', () => {
  const repo = scratchRepo({ manifest: SYNTHETIC_MANIFEST_WITH_DIRECTOR_PATHS });
  try {
    repo.write('docs/plan3/FINDING-001.md', '# finding\n');
    repo.commit(`test: Director finding\n\n${TRAILERS_DIRECTOR}`);
    const payloads = [1, 2, 3].map(() => JSON.stringify(runPreflight({ root: repo.dir, base: repo.base, head: 'HEAD', git: repo.git })));
    assert.equal(new Set(payloads).size, 1, 'three identical inputs must produce identical payloads');
    assert.equal(payloads[0].includes(repo.dir), false, 'payload must not include an absolute scratch path');
    assert.equal(payloads[0].includes(os.tmpdir()), false, 'payload must not include an absolute temp path');
    assert.equal(/Date|T\d{2}:\d{2}:\d{2}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(payloads[0]), false);
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
  assert.deepEqual(territory, { path: 'docs/plan3/TERRITORY.yml', owner: 'Director', present: true, tracked: true, ignored: false });
});

// --- the shipped CLI and the shipped workflow ---------------------------------

function runCli(args) {
  try {
    return {
      status: 0,
      stdout: execFileSync(process.execPath, [path.join(root, 'scripts/territory-preflight.mjs'), ...args], {
        cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      }),
      stderr: '',
    };
  } catch (error) {
    return { status: error.status, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

test('CLI: a RED packet still writes its --out evidence before exiting 1', () => {
  const repo = scratchRepo();
  try {
    repo.write('chart v 1.4/chart/chart.js', '// engine\n// C edited this\n');
    repo.commit(`test: out of territory\n\n${TRAILERS}`);

    const outcome = runCli([
      '--root', repo.dir,
      '--base', repo.base,
      '--head', 'HEAD',
      '--manager', 'A',
      '--out', 'evidence/report.json',
    ]);
    assert.equal(outcome.status, 1, outcome.stderr);
    assert.match(outcome.stdout, /\[territory-preflight\] RED/);

    const report = JSON.parse(fs.readFileSync(path.join(repo.dir, 'evidence/report.json'), 'utf8'));
    assert.equal(report.ok, false);
    assert.deepEqual(report.manager.violations.map((violation) => violation.kind), ['manager-mismatch']);
    assert.deepEqual(report.commits[0].ownership.violations.map((violation) => violation.verdict), ['denied']);
  } finally {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  }
});

test('CLI: an unknown flag exits 1 rather than being ignored', () => {
  const outcome = runCli(['--managers', 'C', '--base', 'HEAD']);
  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, /unknown argument --managers/);
});

test('workflow: a branch with no manager prefix is audited, not skipped by a shell failure', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/territory-preflight.yml'), 'utf8');
  assert.equal(workflow.includes('Cannot derive manager'), false, 'an unexpected branch must not hard-fail the shell');
  assert.match(workflow, /manager=""/);
  assert.match(workflow, /if \[ -n "\$PACKET_MANAGER" \]/);
  assert.match(workflow, /--out territory-preflight-report\.json/);
  assert.match(workflow, /fetch-depth: 0/);
});

// --- A5 negative control ------------------------------------------------------

test('negative control: removing the director_only rule is the only reason the self-grant is caught', () => {
  const manifest = validateTerritoryManifest(parseStrictYaml(SYNTHETIC_MANIFEST));
  const grant = {
    pattern: MANIFEST_PATH,
    regex: globToRegExp(MANIFEST_PATH),
    specificity: patternSpecificity(MANIFEST_PATH),
    provenance: 'inferred',
    reason: '',
    except: [],
  };
  const selfGranted = {
    ...manifest,
    managers: manifest.managers.map((entry) => (entry.id === 'C' ? { ...entry, owned: [...entry.owned, grant] } : entry)),
  };
  assert.equal(resolveOwnership(selfGranted, MANIFEST_PATH, 'C').ok, false);

  // Mechanism disabled: the manifest no longer protects itself, so the same packet
  // passes. A gate whose negative control stays RED is not proven to be the thing
  // doing the work.
  assert.equal(resolveOwnership({ ...selfGranted, directorOnly: [] }, MANIFEST_PATH, 'C').ok, true);
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

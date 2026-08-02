/**
 * Self-test for INSTRUMENT-01 — no git, no disk, no network.
 * node --test scripts/instrument-provenance.selftest.mjs
 *
 * The headline case is the real one from 2026-08-02 23:17: an instrument committed by another
 * lane while two of its imports were still untracked, leaving HEAD carrying a soak that could not
 * resolve its own modules. A checker that only looked at the entry file would have called it citable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { judge, localImportsOf, collectGraph } from './instrument-provenance.mjs';

const S = (...p) => new Set(p);
const graphOf = (...files) => ({ files, missing: [] });

test('local imports are extracted; bare specifiers are ignored', () => {
  const src = [
    "import fs from 'node:fs';",
    "import { a } from './lib/a.mjs';",
    "import puppeteer from 'puppeteer';",
    "export { b } from '../shared/b.mjs';",
    "const c = await import('./lib/c.mjs');",
    "import './lib/register.mjs';", // side-effect import: no `from`, still a dependency
  ].join('\n');
  const got = localImportsOf(src).sort();
  assert.deepEqual(got, ['../shared/b.mjs', './lib/a.mjs', './lib/c.mjs', './lib/register.mjs']);
});

test('CITABLE when the entry and every dependency are committed and clean', () => {
  const v = judge({
    entryRel: 'scripts/arena-timeseries.mjs',
    graph: graphOf('scripts/arena-timeseries.mjs', 'scripts/lib/arena-columns.mjs'),
    tracked: S('scripts/arena-timeseries.mjs', 'scripts/lib/arena-columns.mjs'),
    dirty: S(),
  });
  assert.equal(v.state, 'CITABLE');
  assert.equal(v.citable, true);
  assert.equal(v.dependencyCount, 1);
});

test('DEPENDENCY_UNTRACKED — the 23:17 defect a naive check would pass', () => {
  const v = judge({
    entryRel: 'scripts/sealed-two-arm-soak.mjs',
    graph: graphOf('scripts/sealed-two-arm-soak.mjs', 'scripts/lib/forced-gc-pause-probe.mjs', 'scripts/lib/arena-columns.mjs'),
    tracked: S('scripts/sealed-two-arm-soak.mjs'), // committed alone, exactly as it happened
    dirty: S(),
  });
  assert.equal(v.state, 'DEPENDENCY_UNTRACKED');
  assert.equal(v.citable, false);
  assert.equal(v.untrackedDeps.length, 2);
  assert.match(v.reason, /fails at module resolution/);
});

test('INSTRUMENT_UNTRACKED is distinct from a dependency problem', () => {
  const v = judge({
    entryRel: 'scripts/forced-gc-hoard-slope.mjs',
    graph: graphOf('scripts/forced-gc-hoard-slope.mjs'),
    tracked: S(),
    dirty: S(),
  });
  assert.equal(v.state, 'INSTRUMENT_UNTRACKED');
  assert.match(v.reason, /truncation loses the instrument/);
});

test('INSTRUMENT_DIRTY — tracked is not the same as what ran', () => {
  const v = judge({
    entryRel: 'scripts/qw3-floor-census.mjs',
    graph: graphOf('scripts/qw3-floor-census.mjs'),
    tracked: S('scripts/qw3-floor-census.mjs'),
    dirty: S('scripts/qw3-floor-census.mjs'),
  });
  assert.equal(v.state, 'INSTRUMENT_DIRTY');
  assert.equal(v.citable, false);
});

test('a clean entry with a modified dependency is still not citable', () => {
  const v = judge({
    entryRel: 'scripts/a.mjs',
    graph: graphOf('scripts/a.mjs', 'scripts/lib/b.mjs'),
    tracked: S('scripts/a.mjs', 'scripts/lib/b.mjs'),
    dirty: S('scripts/lib/b.mjs'),
  });
  assert.equal(v.state, 'DEPENDENCY_DIRTY');
  assert.equal(v.citable, false);
});

test('a missing entry is its own state, not "untracked"', () => {
  const v = judge({
    entryRel: 'scripts/gone.mjs',
    graph: { files: ['scripts/gone.mjs'], missing: ['scripts/gone.mjs'] },
    tracked: S(),
    dirty: S(),
  });
  assert.equal(v.state, 'INSTRUMENT_MISSING');
});

test('outside a repo it refuses rather than claiming citable', () => {
  const v = judge({ entryRel: 'scripts/a.mjs', graph: graphOf('scripts/a.mjs'), tracked: S(), dirty: S(), repo: false });
  assert.equal(v.state, 'NOT_A_REPO');
  assert.equal(v.citable, false);
});

test('the graph walk follows imports transitively and survives a cycle', () => {
  // Keys go through path.resolve so the fixture matches what collectGraph produces on both
  // POSIX and Windows; a raw '/r/...' string only matches on POSIX.
  const entry = path.resolve('/r/scripts/a.mjs');
  const files = new Map([
    [entry, "import './lib/b.mjs';"],
    [path.resolve('/r/scripts/lib/b.mjs'), "import './c.mjs';"],
    [path.resolve('/r/scripts/lib/c.mjs'), "import '../a.mjs';"], // cycle back to the entry
  ]);
  const g = collectGraph(entry, {
    readFile: (p) => {
      if (!files.has(p)) throw new Error('missing');
      return files.get(p);
    },
  });
  assert.equal(g.files.length, 3, 'each file visited once despite the cycle');
  assert.equal(g.missing.length, 0);
});

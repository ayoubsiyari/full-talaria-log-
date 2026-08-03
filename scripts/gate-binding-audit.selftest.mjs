/**
 * Self-test for GATE-BINDING-AUDIT-01.
 *
 * The audit's own dependencies are injected, so these run without touching git. An audit that can
 * only be tested against the live tree would be graded by the thing it is grading.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  judgeGate, auditGates, isTestFile, isCliModule, npmScriptsInvoking, callersOf,
  C_LANE_GATES, SELF_MODULE,
} from './gate-binding-audit.mjs';

/** Build injectable deps from a plain map of file -> contents. */
const deps = (files, hits, worktreeHits) => ({
  readFile: (p) => (Object.prototype.hasOwnProperty.call(files, p) ? files[p] : null),
  grep: () => (hits || []).map((f) => `HEAD:${f}`).join('\n'),
  // Injected too, or these tests would reach the real git tree — an audit tested against the thing
  // it is auditing. Defaults to empty so an unspecified worktree means "nothing extra".
  worktreeCallers: () => (worktreeHits || []),
});

test('a test file is recognised however it is spelled', () => {
  assert.equal(isTestFile('scripts/foo.test.mjs'), true);
  assert.equal(isTestFile('scripts/foo.selftest.mjs'), true);
  assert.equal(isTestFile('scripts/tests/foo.mjs'), true);
  assert.equal(isTestFile('scripts/lib/foo.mutants.mjs'), true);
  assert.equal(isTestFile('scripts/sealed-two-arm-soak.mjs'), false);
  assert.equal(isTestFile('scripts/lib/arena-columns.mjs'), false);
});

test('SELF_TEST_ONLY: the ABBA shape — written, tested, never called', () => {
  const gate = { id: 'DRIFT-ABBA', symbol: 'abbaSequence', module: 'lib/abba.mjs', refuses: 'unpaired arms' };
  const r = judgeGate(gate, deps(
    { 'lib/abba.mjs': 'export function abbaSequence() {}' },
    ['lib/abba.mjs', 'scripts/instrument-checklist.selftest.mjs'],
  ));
  assert.equal(r.state, 'SELF_TEST_ONLY');
  assert.equal(r.ok, false);
  assert.deepEqual(r.callers, []);
  assert.match(r.why, /only in its own tests/);
});

/**
 * The third state. On 2026-08-03 this audit called SETTLE-CRITERION-V2 SELF_TEST_ONLY while the
 * binding was written and sitting uncommitted, and I went looking for a caller that already existed.
 * A binding that needs a commit is a different fact from a binding that needs writing.
 */
test('BOUND_BUT_UNCOMMITTED: written in the working tree, absent from HEAD', () => {
  const gate = { id: 'SETTLE-CRITERION-V2', symbol: 'assessSettled', module: 'lib/settle-criterion.mjs', refuses: 'an unsettled reading' };
  const r = judgeGate(gate, deps(
    { 'lib/settle-criterion.mjs': 'export function assessSettled() {}' },
    ['lib/settle-criterion.mjs', 'scripts/foo.selftest.mjs'],
    ['scripts/canonical-floor-retake.mjs'],
  ));
  assert.equal(r.state, 'BOUND_BUT_UNCOMMITTED');
  assert.equal(r.ok, false, 'not yet a pass: it does not exist in the tree that gets built');
  assert.deepEqual(r.worktreeCallers, ['scripts/canonical-floor-retake.mjs']);
  assert.match(r.why, /written and not committed/);
  assert.match(r.why, /Commit it/);
});

test('the two states are distinguished by the worktree, not by luck', () => {
  const gate = { id: 'G', symbol: 'g', module: 'lib/g.mjs', refuses: 'x' };
  const files = { 'lib/g.mjs': 'export function g() {}' };
  const head = ['lib/g.mjs', 'scripts/g.selftest.mjs'];
  assert.equal(judgeGate(gate, deps(files, head, [])).state, 'SELF_TEST_ONLY');
  assert.equal(judgeGate(gate, deps(files, head, ['scripts/real.mjs'])).state, 'BOUND_BUT_UNCOMMITTED');
});

test('a worktree caller that is only a test does not manufacture BOUND_BUT_UNCOMMITTED', () => {
  const gate = { id: 'G', symbol: 'g', module: 'lib/g.mjs', refuses: 'x' };
  const r = judgeGate(gate, deps(
    { 'lib/g.mjs': 'export function g() {}' },
    ['lib/g.mjs'],
    ['scripts/g.selftest.mjs', 'scripts/tests/h.mjs'],
  ));
  assert.equal(r.state, 'SELF_TEST_ONLY');
});

test('a committed binding never reaches the worktree question', () => {
  const gate = { id: 'G', symbol: 'g', module: 'lib/g.mjs', refuses: 'x' };
  const r = judgeGate(gate, deps(
    { 'lib/g.mjs': 'export function g() {}', 'scripts/real.mjs': 'g()' },
    ['lib/g.mjs', 'scripts/real.mjs'],
    ['scripts/other.mjs'],
  ));
  assert.equal(r.state, 'BOUND');
  assert.equal(r.ok, true);
});

test('BOUND: a real caller outside the tests', () => {
  const gate = { id: 'TOTAL-01', symbol: 'quoteArenaDelta', module: 'lib/arena.mjs', refuses: 'untotalled deltas' };
  const r = judgeGate(gate, deps(
    { 'lib/arena.mjs': 'export function quoteArenaDelta() {}' },
    ['lib/arena.mjs', 'scripts/soak.mjs', 'scripts/x.selftest.mjs'],
  ));
  assert.equal(r.state, 'BOUND');
  assert.equal(r.ok, true);
  assert.deepEqual(r.callers, ['scripts/soak.mjs']);
  assert.deepEqual(r.testCallers, ['scripts/x.selftest.mjs']);
});

test('ARMED_BY_ABSENT: the runway shape — called, but with the neutral default', () => {
  const gate = {
    id: 'CONF01-RUNWAY',
    symbol: 'computeRequiredRunwayMs',
    module: 'lib/dataset.mjs',
    refuses: 'nothing alone',
    armedBy: 'requiredRunwayMs',
  };
  const unarmed = judgeGate(gate, deps({
    'lib/dataset.mjs': 'export function computeRequiredRunwayMs() {}',
    'scripts/soak.mjs': 'import { computeRequiredRunwayMs } from "./lib/dataset.mjs";',
  }, ['lib/dataset.mjs', 'scripts/soak.mjs']));
  assert.equal(unarmed.state, 'ARMED_BY_ABSENT');
  assert.equal(unarmed.ok, false);
  assert.match(unarmed.why, /Called is not the same as armed/);

  const armed = judgeGate(gate, deps({
    'lib/dataset.mjs': 'export function computeRequiredRunwayMs() {}',
    'scripts/soak.mjs': 'bootConf01Session({ requiredRunwayMs: REQUIRED_RUNWAY_MS })',
  }, ['lib/dataset.mjs', 'scripts/soak.mjs']));
  assert.equal(armed.state, 'BOUND');
  assert.deepEqual(armed.armedIn, ['scripts/soak.mjs']);
});

test('SYMBOL_ABSENT is distinct from an unbound gate', () => {
  const missingSymbol = judgeGate(
    { id: 'X', symbol: 'nope', module: 'lib/a.mjs', refuses: 'x' },
    deps({ 'lib/a.mjs': 'export function somethingElse() {}' }, []),
  );
  assert.equal(missingSymbol.state, 'SYMBOL_ABSENT');
  assert.match(missingSymbol.why, /does not exist/);

  const missingFile = judgeGate(
    { id: 'X', symbol: 'nope', module: 'lib/gone.mjs', refuses: 'x' },
    deps({}, []),
  );
  assert.equal(missingFile.state, 'SYMBOL_ABSENT');
  assert.match(missingFile.why, /broken manifest entry/);
});

test('the module that defines a symbol is never counted as its own caller', () => {
  const r = judgeGate(
    { id: 'X', symbol: 'f', module: 'lib/a.mjs', refuses: 'x' },
    deps({ 'lib/a.mjs': 'export function f() {}' }, ['lib/a.mjs']),
  );
  assert.equal(r.state, 'SELF_TEST_ONLY');
});

test('auditGates aggregates and fails closed when any gate is unbound', () => {
  const files = { 'lib/a.mjs': 'export function f() {}', 'lib/b.mjs': 'export function g() {}' };
  const bound = auditGates(
    [{ id: 'A', symbol: 'f', module: 'lib/a.mjs', refuses: 'x' }],
    deps(files, ['lib/a.mjs', 'scripts/run.mjs']),
  );
  assert.equal(bound.ok, true);
  assert.equal(bound.bound, 1);
  assert.equal(bound.unbound, 0);

  const unbound = auditGates(
    [{ id: 'B', symbol: 'g', module: 'lib/b.mjs', refuses: 'x' }],
    deps(files, ['lib/b.mjs', 'scripts/b.selftest.mjs']),
  );
  assert.equal(unbound.ok, false);
  assert.equal(unbound.unbound, 1);
});

test('a command-line module is recognised however its entry guard is spelled', () => {
  assert.equal(isCliModule('#!/usr/bin/env node\n'), true);
  assert.equal(isCliModule('const invokedDirectly = true;'), true);
  assert.equal(isCliModule('if (process.argv[1] === x) {}'), true);
  assert.equal(isCliModule('export function f() { return 1; }'), false);
});

test('npm scripts that invoke a module are found by path', () => {
  const read = () => JSON.stringify({
    scripts: {
      'gate:prov': 'node scripts/instrument-provenance.mjs --all',
      unrelated: 'vite build',
    },
  });
  assert.deepEqual(npmScriptsInvoking('scripts/instrument-provenance.mjs', read), ['gate:prov']);
  assert.deepEqual(npmScriptsInvoking('scripts/nothing.mjs', read), []);
  assert.deepEqual(npmScriptsInvoking('scripts/x.mjs', () => null), []);
});

test('CLI_ONLY_NO_PIPELINE: a working command that nothing automated invokes', () => {
  const gate = { id: 'INSTRUMENT-01', symbol: 'checkInstrument', module: 'scripts/prov.mjs', refuses: 'citing dirty instruments' };
  const files = {
    'scripts/prov.mjs': '#!/usr/bin/env node\nexport function checkInstrument() {}',
    'package.json': JSON.stringify({ scripts: { build: 'vite build' } }),
  };
  const r = judgeGate(gate, deps(files, ['scripts/prov.mjs']));
  assert.equal(r.state, 'CLI_ONLY_NO_PIPELINE');
  assert.equal(r.ok, false);
  assert.match(r.why, /habit rather than a gate/);
});

test('BOUND_VIA_CLI: the same command, once a pipeline invokes it', () => {
  const gate = { id: 'INSTRUMENT-01', symbol: 'checkInstrument', module: 'scripts/prov.mjs', refuses: 'citing dirty instruments' };
  const files = {
    'scripts/prov.mjs': '#!/usr/bin/env node\nexport function checkInstrument() {}',
    'package.json': JSON.stringify({ scripts: { 'gate:prov': 'node scripts/prov.mjs --all' } }),
  };
  const r = judgeGate(gate, deps(files, ['scripts/prov.mjs']));
  assert.equal(r.state, 'BOUND_VIA_CLI');
  assert.equal(r.ok, true);
  assert.deepEqual(r.invokers, ['gate:prov']);
});

test('a non-CLI module with no callers is still SELF_TEST_ONLY, not excused as a command', () => {
  const r = judgeGate(
    { id: 'X', symbol: 'f', module: 'scripts/lib/a.mjs', refuses: 'x' },
    deps({ 'scripts/lib/a.mjs': 'export function f() {}', 'package.json': '{}' }, ['scripts/lib/a.mjs', 'scripts/a.selftest.mjs']),
  );
  assert.equal(r.state, 'SELF_TEST_ONLY');
});

test('the shipped manifest names real modules and carries a refusal for each gate', () => {
  for (const g of C_LANE_GATES) {
    assert.ok(g.id && g.symbol && g.module, `gate ${JSON.stringify(g)} is incomplete`);
    assert.ok(g.refuses && g.refuses.length > 5, `${g.id} does not say what it refuses`);
    assert.match(g.module, /^scripts\//, `${g.id} module path should be repo-relative`);
  }
});

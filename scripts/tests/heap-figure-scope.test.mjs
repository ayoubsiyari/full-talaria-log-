/**
 * Gate self-test for HEAP-FIGURE-SCOPE-V1.
 *
 *   node --test --test-concurrency=1 scripts/tests/heap-figure-scope.test.mjs
 *
 * The rule is only worth having if it (a) catches the shape that actually bit us —
 * "the heap is 192 MB" with no instrument named — and (b) leaves alone the things
 * that are not claims: fenced commands, constant names that carry their own unit,
 * and the journals, which are the historical record and must not be rewritten.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HEAP_FIGURE_SCOPE_V1,
  HEAP_FIGURE_GATED_DOCS,
  HEAP_SCOPE_TOKENS,
  auditDocument,
  lineNeedsScope,
  scopeTokenOf,
  runHeapFigureScopeCells,
} from '../lib/heap-figure-scope.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readFile = (relativePath) => fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');

test('the shape that bit us is caught: a heap figure with no instrument named', () => {
  const doc = 'Heap on b103 is ~12 MB per cycle, down from 23.5 MB.';
  const { offenders } = auditDocument({ path: 'x.md', source: doc });
  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].scope, null);
});

test('the same claim passes once it names its scope', () => {
  const doc = 'Main-frame JS heap on b103 is ~12 MB per cycle, down from 23.5 MB.';
  const { offenders, labelled } = auditDocument({ path: 'x.md', source: doc });
  assert.equal(offenders.length, 0);
  assert.equal(labelled.length, 1);
  assert.equal(labelled[0].scope, 'main-frame JS heap');
});

test('every token in the closed vocabulary actually pays', () => {
  for (const token of HEAP_SCOPE_TOKENS) {
    const line = `Growth was 40 MB per cycle on the ${token} instrument.`;
    assert.equal(scopeTokenOf(line), token, `${token} must be recognised`);
    assert.equal(auditDocument({ path: 'x.md', source: line }).offenders.length, 0);
  }
});

test('a size figure with no heap context is not this gate\'s business', () => {
  assert.equal(lineNeedsScope('The image bundle is 4 MB.'), false);
  assert.equal(lineNeedsScope('Tarball is 322 MB on disk.'), false);
});

test('heap words without a figure are not claimed either', () => {
  assert.equal(lineNeedsScope('The heap grew without bound across cycles.'), false);
});

test('fenced blocks are commands and logs, not claims', () => {
  const doc = [
    'Run this:',
    '```js',
    'console.log("heap 789 MB");',
    '```',
    'Main-frame JS heap read 192 MB.',
  ].join('\n');
  const { offenders, labelled } = auditDocument({ path: 'x.md', source: doc });
  assert.equal(offenders.length, 0, 'the fenced line must not be treated as a claim');
  assert.equal(labelled.length, 1);
});

test('a constant name carrying its own unit is exempt', () => {
  assert.equal(lineNeedsScope('Pinned: `HEAP_CYCLE_PO_BASELINE_MB=54` and 106 MB floors.'), false);
});

test('journals are deliberately outside the gated set — the record stays as written', () => {
  for (const doc of HEAP_FIGURE_GATED_DOCS) {
    assert.ok(!/journal/i.test(doc), `${doc} must not be gated: journals are the audit trail`);
  }
});

test('LIVE: every gated release-facing document passes', () => {
  const result = runHeapFigureScopeCells({ readFile });
  assert.equal(result.signature, HEAP_FIGURE_SCOPE_V1);
  const labelledCell = result.cells.find((c) => c.cell === 'HEAP-FIGURE-SCOPE-LABELLED');
  assert.deepEqual(labelledCell.unreadable, []);
  assert.deepEqual(
    labelledCell.offenders.map((o) => `${o.path}:${o.line} ${o.text}`),
    [],
    'unlabelled heap figures in a release-facing document',
  );
  assert.equal(result.allPass, true);
});

test('the gate is not vacuous — it sees real labelled figures in the repo', () => {
  const result = runHeapFigureScopeCells({ readFile });
  const nonVacuous = result.cells.find((c) => c.cell === 'HEAP-FIGURE-SCOPE-NON-VACUOUS');
  assert.equal(nonVacuous.pass, true);
  assert.ok(nonVacuous.labelledCount >= 1);
});

test('an unreadable gated document is RED, not a silent pass', () => {
  const result = runHeapFigureScopeCells({
    readFile: () => { throw new Error('ENOENT'); },
    docs: ['docs/plan3/does-not-exist.md'],
  });
  assert.equal(result.allPass, false);
});

test('MUTANT scope-vocabulary-widened: bare "heap" must not pay for itself', () => {
  // If the vocabulary admitted the word "heap", the original defect would pass.
  const line = 'The heap is 789 MB.';
  assert.equal(scopeTokenOf(line), null);
  assert.equal(auditDocument({ path: 'x.md', source: line }).offenders.length, 1);
});

test('MUTANT figure-detector-blind: the correction doc itself would go unchecked', () => {
  const doc = readFile('docs/plan3/evidence/B-M4/release/PO-HEAP-INSTRUMENT-CORRECTION-20260730.md');
  const audit = auditDocument({ path: 'correction', source: doc });
  assert.ok(audit.figureLines > 0,
    'the correction document must contain heap figures for this gate to be meaningful');
});

/**
 * DOM-COUNTER-STAIRCASE-V1 grading policy.
 *
 * The counter test answered in sixty seconds what snapshots did not, so the
 * policy is worth pinning: a document count that does not come back to baseline
 * across open/close cycles is a retained iframe and a blocking RED, and a report
 * that carries no counters must say SKIPPED rather than quietly pass.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDomCounterCell } from '../heap-cycle-memory-gate.mjs';

const m = (documents, nodes = 1000, jsEventListeners = 100) => ({
  documents, nodes, jsEventListeners, frames: documents, jsHeapUsedSize: null, jsHeapTotalSize: null,
});

function report(baselineDocs, floorDocs) {
  return {
    baseline: { perfMetrics: m(baselineDocs) },
    cycles: floorDocs.map((d, i) => ({ cycle: i + 1, returnSingle: { perfMetrics: m(d) } })),
  };
}

test('a document staircase is a blocking RED', () => {
  const cell = buildDomCounterCell(report(2, [5, 8, 11, 14]));
  assert.equal(cell.status, 'RED');
  assert.equal(cell.pass, false);
  assert.equal(cell.blocking, true);
  assert.match(cell.detail, /did NOT return to baseline/);
  assert.match(cell.detail, /delta \+12/);
});

test('documents returning to baseline is GREEN and not blocking', () => {
  const cell = buildDomCounterCell(report(2, [5, 2, 5, 2]));
  assert.equal(cell.status, 'GREEN');
  assert.equal(cell.pass, true);
  assert.equal(cell.blocking, false);
});

test('one extra document is tolerated as boot artefact, two is not', () => {
  assert.equal(buildDomCounterCell(report(2, [2, 3])).status, 'GREEN');
  assert.equal(buildDomCounterCell(report(2, [2, 4])).status, 'RED');
});

test('the last cycle decides, not the peak mid-run', () => {
  // Panels are open at peak by design; only the collapsed floor is evidence.
  const cell = buildDomCounterCell(report(2, [9, 9, 2]));
  assert.equal(cell.status, 'GREEN');
});

test('cycle labels fall back to position when rows carry no cycle number', () => {
  // The live report's rows had no `cycle` field and the first version of this cell
  // printed "cundefined:3" into the gate detail.
  const cell = buildDomCounterCell({
    baseline: { perfMetrics: m(2) },
    cycles: [{ returnSingle: { perfMetrics: m(3) } }, { returnSingle: { perfMetrics: m(5) } }],
  });
  assert.match(cell.detail, /c1:3 c2:5/);
  assert.doesNotMatch(cell.detail, /undefined/);
});

test('a report without counters is SKIPPED, never a silent pass', () => {
  const cell = buildDomCounterCell({ baseline: {}, cycles: [] });
  assert.equal(cell.status, 'SKIPPED');
  assert.equal(cell.nonBlocking, true);
});

test('nodes and listeners are reported alongside documents', () => {
  const rpt = {
    baseline: { perfMetrics: m(2, 5000, 200) },
    cycles: [{ cycle: 1, returnSingle: { perfMetrics: m(5, 117000, 950) } }],
  };
  const cell = buildDomCounterCell(rpt);
  assert.match(cell.detail, /nodes \+112000/);
  assert.match(cell.detail, /listeners \+750/);
  assert.equal(cell.counters.nodeDelta, 112_000);
});

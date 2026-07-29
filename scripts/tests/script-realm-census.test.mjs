import assert from 'node:assert/strict';
import test from 'node:test';

import { indexHeapSnapshotGraph } from '../lib/heap-retainer-paths.mjs';
import {
  assessScriptRealmRetention,
  normalizeScriptUrl,
  scriptUrlFromNodeName,
  summarizeScriptRealmCensus,
} from '../lib/script-realm-census.mjs';

/**
 * Build a snapshot where each spec is one Script node with a source string.
 * @param {{url: string|null, sourceBytes: number}[]} scripts
 */
function synthesizeScriptSnapshot(scripts) {
  const strings = ['', 'source'];
  const stringIx = new Map();
  const intern = (s) => {
    if (stringIx.has(s)) return stringIx.get(s);
    const ix = strings.length;
    strings.push(s);
    stringIx.set(s, ix);
    return ix;
  };
  const nodeFields = ['type', 'name', 'id', 'self_size', 'edge_count', 'detachedness'];
  const nodeTypes = ['hidden', 'array', 'string', 'object', 'code', 'closure', 'synthetic'];
  const edgeFields = ['type', 'name_or_index', 'to_node'];
  const edgeTypes = ['context', 'element', 'property', 'internal', 'hidden', 'shortcut', 'weak'];
  const CODE = nodeTypes.indexOf('code');
  const STRING = nodeTypes.indexOf('string');
  const INTERNAL = edgeTypes.indexOf('internal');
  const stride = nodeFields.length;

  const nodes = [];
  const edges = [];
  let id = 1;
  // Script nodes first, then their source strings, so to_node offsets are known.
  const sourceNodeIndex = new Map();
  scripts.forEach((spec, i) => {
    sourceNodeIndex.set(i, scripts.length + i);
  });
  scripts.forEach((spec, i) => {
    const label = spec.url == null ? 'system / Script' : `system / Script / ${spec.url}`;
    nodes.push(CODE, intern(label), id += 1, 64, 1, 0);
    edges.push(INTERNAL, intern('source'), sourceNodeIndex.get(i) * stride);
  });
  scripts.forEach((spec) => {
    nodes.push(STRING, 1, id += 1, spec.sourceBytes, 0, 0);
  });

  return {
    snapshot: { meta: { node_fields: nodeFields, node_types: [nodeTypes], edge_fields: edgeFields, edge_types: [edgeTypes] } },
    nodes,
    edges,
    strings,
  };
}

const censusOf = (scripts, opts) => summarizeScriptRealmCensus(
  indexHeapSnapshotGraph(synthesizeScriptSnapshot(scripts)),
  opts,
);

test('unit: the script URL is read off the node label, not the node name alone', () => {
  assert.equal(scriptUrlFromNodeName('system / Script / http://host/chart.js'), 'http://host/chart.js');
  assert.equal(scriptUrlFromNodeName('system / Script'), '(anonymous)');
  assert.equal(scriptUrlFromNodeName('system / SharedFunctionInfo / foo'), null);
});

test('unit: cache-busting query strings do not split copies of one file', () => {
  assert.equal(normalizeScriptUrl('http://h/chart.js?v=20260729b99'), 'http://h/chart.js');
  assert.equal(normalizeScriptUrl('http://h/a.js?x=1&v=b99'), 'http://h/a.js?x=1');
});

test('unit: one copy per URL with one live realm reports no redundancy', () => {
  const census = censusOf([
    { url: 'http://h/chart.js?v=1', sourceBytes: 1000 },
    { url: 'http://h/order.js?v=1', sourceBytes: 500 },
  ], { liveRealms: 1 });
  assert.equal(census.scriptNodes, 2);
  assert.equal(census.distinctUrls, 2);
  assert.equal(census.totalSourceBytes, 1500);
  assert.equal(census.redundantBytes, 0);
  assert.equal(census.maxCopies, 1);
  assert.equal(census.retainsDeadRealms, false);
});

test('unit: four copies of one file with one live realm is per-realm duplication', () => {
  const four = Array.from({ length: 4 }, () => ({ url: 'http://h/chart.js?v=1', sourceBytes: 1000 }));
  const census = censusOf(four, { liveRealms: 1 });
  assert.equal(census.maxCopies, 4);
  assert.equal(census.totalSourceBytes, 4000);
  // Three of four copies are redundant.
  assert.equal(census.redundantBytes, 3000);
  assert.equal(census.retainsDeadRealms, true);
  assert.deepEqual(census.copiesHistogram, { 4: 1 });
});

test('unit: differing ?v= builds still aggregate as one file', () => {
  const census = censusOf([
    { url: 'http://h/chart.js?v=b98', sourceBytes: 100 },
    { url: 'http://h/chart.js?v=b99', sourceBytes: 100 },
  ], { liveRealms: 1 });
  assert.equal(census.distinctUrls, 1);
  assert.equal(census.maxCopies, 2);
});

test('unit: copies matching live realms are shared-or-collected, not a leak', () => {
  const census = censusOf([{ url: 'http://h/a.js', sourceBytes: 10 }], { liveRealms: 1 });
  const verdict = assessScriptRealmRetention(census, { realmsPerCycle: 4, cycles: 3 });
  assert.equal(verdict.verdict, 'SHARED-OR-COLLECTED');
});

test('unit: one retained generation is distinguished from per-cycle accumulation', () => {
  // 4 copies after 3 cycles: dead realms retained, but not every generation
  // (all-generations retention would be 1 + 3*3 = 10).
  const census = censusOf(
    Array.from({ length: 4 }, () => ({ url: 'http://h/a.js', sourceBytes: 1000 })),
    { liveRealms: 1 },
  );
  const verdict = assessScriptRealmRetention(census, { realmsPerCycle: 4, cycles: 3 });
  assert.equal(verdict.verdict, 'ONE-DEAD-GENERATION-RETAINED');
  assert.equal(verdict.accumulatingExpectation, 10);
  assert.equal(verdict.perCycleAccumulation, false);
});

test('unit: copies reaching the all-generations count grade as per-cycle accumulation', () => {
  const census = censusOf(
    Array.from({ length: 10 }, () => ({ url: 'http://h/a.js', sourceBytes: 1000 })),
    { liveRealms: 1 },
  );
  const verdict = assessScriptRealmRetention(census, { realmsPerCycle: 4, cycles: 3 });
  assert.equal(verdict.verdict, 'ACCUMULATES-PER-CYCLE');
  assert.equal(verdict.perCycleAccumulation, true);
});

test('unit: an empty snapshot is NO-DATA rather than a clean pass', () => {
  const census = censusOf([], { liveRealms: 1 });
  assert.equal(census.scriptNodes, 0);
  assert.equal(assessScriptRealmRetention(census, {}).verdict, 'NO-DATA');
});

test('unit: the verdict follows the file carrying the mass, not a tiny inline script', () => {
  // A 1-byte document script present 23x must not outvote a 1MB bundle held 4x.
  const scripts = [
    ...Array.from({ length: 23 }, () => ({ url: 'http://h/index.html', sourceBytes: 1 })),
    ...Array.from({ length: 4 }, () => ({ url: 'http://h/chart.js', sourceBytes: 1_000_000 })),
  ];
  const census = censusOf(scripts, { liveRealms: 1 });
  assert.equal(census.maxCopies, 23);
  assert.equal(census.copiesOfLargestFile, 4);
  assert.equal(census.largestFile.url, 'http://h/chart.js');
  const verdict = assessScriptRealmRetention(census, { realmsPerCycle: 4, cycles: 3 });
  assert.equal(verdict.verdict, 'ONE-DEAD-GENERATION-RETAINED');
  assert.equal(verdict.maxCopiesAnyUrl, 23);
});

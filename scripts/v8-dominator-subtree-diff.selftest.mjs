import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { diffDominatorSubtrees } from './lib/heap-dominator-subtrees.mjs';

const MB = 1048576;

function synthGraph(nodesIn, edgeList) {
  const strings = [''];
  const sIx = (s) => {
    let ix = strings.indexOf(s);
    if (ix >= 0) return ix;
    ix = strings.length;
    strings.push(s);
    return ix;
  };
  const nodeFields = ['type', 'name', 'id', 'self_size', 'edge_count', 'trace_node_id', 'detachedness'];
  const nodeTypes = ['synthetic', 'object', 'native', 'string'];
  const edgeFields = ['type', 'name_or_index', 'to_node'];
  const edgeTypes = ['property', 'element', 'weak'];
  const outByFrom = new Map();
  for (const e of edgeList) {
    if (!outByFrom.has(e.from)) outByFrom.set(e.from, []);
    outByFrom.get(e.from).push(e);
  }
  const nodes = [];
  nodesIn.forEach((n, i) => {
    nodes.push(
      nodeTypes.indexOf(n.type || 'object'),
      sIx(n.name),
      i + 1,
      n.selfSize || 0,
      (outByFrom.get(i) || []).length,
      0,
      0,
    );
  });
  const stride = nodeFields.length;
  const edges = [];
  for (let i = 0; i < nodesIn.length; i += 1) {
    for (const e of outByFrom.get(i) || []) {
      edges.push(edgeTypes.indexOf(e.type || 'property'), sIx(e.name || ''), e.to * stride);
    }
  }
  return {
    snapshot: {
      meta: {
        node_fields: nodeFields,
        node_types: [nodeTypes],
        edge_fields: edgeFields,
        edge_types: [edgeTypes],
      },
      node_count: nodesIn.length,
      edge_count: edges.length / edgeFields.length,
    },
    nodes,
    edges,
    strings,
  };
}

describe('V8 dominator subtree fallback', () => {
  it('finds retained growth under a small-self-size cache dominator', () => {
    const before = synthGraph([
      { type: 'synthetic', name: '(GC roots)' },
      { type: 'object', name: 'Window', selfSize: 16 },
      { type: 'object', name: 'TalariaCache', selfSize: 32 },
      { type: 'object', name: 'Array', selfSize: MB },
    ], [
      { from: 0, to: 1, name: 'window' },
      { from: 1, to: 2, name: '_cache' },
      { from: 2, to: 3, name: 'items' },
    ]);
    const after = synthGraph([
      { type: 'synthetic', name: '(GC roots)' },
      { type: 'object', name: 'Window', selfSize: 16 },
      { type: 'object', name: 'TalariaCache', selfSize: 32 },
      { type: 'object', name: 'Array', selfSize: MB },
      { type: 'object', name: 'Array', selfSize: 3 * MB },
    ], [
      { from: 0, to: 1, name: 'window' },
      { from: 1, to: 2, name: '_cache' },
      { from: 2, to: 3, name: 'items' },
      { from: 2, to: 4, name: 'items' },
    ]);

    const diff = diffDominatorSubtrees(before, after, { topN: 10, candidateN: 10 });
    const cache = diff.topRetainedDelta.find((r) => /TalariaCache/.test(r.path));
    assert.ok(cache, JSON.stringify(diff.topRetainedDelta, null, 2));
    assert.equal(cache.retainedDeltaMB, 3);
    assert.equal(cache.selfDeltaMB, 0);
    assert.ok(cache.dominatedNodeCountDelta > 0);
  });

  it('does not count weak-only leaves as retained subtree growth', () => {
    const before = synthGraph([
      { type: 'synthetic', name: '(GC roots)' },
      { type: 'object', name: 'Holder', selfSize: 16 },
    ], [
      { from: 0, to: 1, name: 'holder' },
    ]);
    const after = synthGraph([
      { type: 'synthetic', name: '(GC roots)' },
      { type: 'object', name: 'Holder', selfSize: 16 },
      { type: 'object', name: 'WeakOnly', selfSize: 5 * MB },
    ], [
      { from: 0, to: 1, name: 'holder' },
      { from: 1, to: 2, name: 'weak', type: 'weak' },
    ]);
    const diff = diffDominatorSubtrees(before, after, { topN: 10, candidateN: 10 });
    const holder = diff.topRetainedDelta.find((r) => /Holder/.test(r.path));
    assert.equal(holder?.retainedDeltaMB || 0, 0);
  });
});

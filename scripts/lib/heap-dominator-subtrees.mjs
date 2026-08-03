/**
 * HEAP-DOMINATOR-SUBTREES-V1
 *
 * Fallback for the "constructor names explain <10% of measured delta" stop rule.
 * It reads a V8 heap snapshot as a graph and reports retained size by dominator
 * subtree instead of by constructor class.
 */
import { normalizeConstructorKey } from './heap-snapshot-aggregates.mjs';
import { indexHeapSnapshotGraph } from './heap-retainer-paths.mjs';

export const HEAP_DOMINATOR_SUBTREES_SIGNATURE = 'HEAP-DOMINATOR-SUBTREES-V1';

const MB = 1048576;

function mb(bytes) {
  return +(Number(bytes || 0) / MB).toFixed(3);
}

function edgeTypeName(graph, edgeIndex) {
  const code = graph.edges[edgeIndex + graph.eTypeIx] | 0;
  return graph.edgeTypeStrings ? graph.edgeTypeStrings[code] : null;
}

function isWeakEdge(graph, edgeIndex) {
  return edgeTypeName(graph, edgeIndex) === 'weak';
}

function nodeInfo(graph, nodeIndex) {
  const base = nodeIndex * graph.nodeStride;
  const rawName = graph.strings[graph.nodes[base + graph.nameIx]] || '';
  const typeCode = graph.typeIx >= 0 ? graph.nodes[base + graph.typeIx] : null;
  const typeName = graph.typeStrings && typeCode != null ? graph.typeStrings[typeCode] : null;
  const detached = graph.detIx >= 0 ? Number(graph.nodes[base + graph.detIx]) === 1 : false;
  const label = normalizeConstructorKey(rawName, detached) || typeName || rawName || '(unknown)';
  return { rawName, typeName, detached, label };
}

function isGcRoot(graph, nodeIndex) {
  const info = nodeInfo(graph, nodeIndex);
  if (info.typeName === 'synthetic') return true;
  if (/GC roots/i.test(info.rawName)) return true;
  return ['(GC roots)', 'Window / Document', '(Window roots)', 'DOMWindow'].includes(info.rawName);
}

function edgeLabel(graph, parentIndex, childIndex) {
  if (parentIndex < 0) return '';
  const count = graph.nodes[parentIndex * graph.nodeStride + graph.edgeCountIx] | 0;
  const first = graph.firstEdge[parentIndex];
  let best = '';
  for (let e = 0; e < count; e += 1) {
    const ei = first + e * graph.edgeStride;
    if (isWeakEdge(graph, ei)) continue;
    const toIndex = Math.floor((graph.edges[ei + graph.eToIx] | 0) / graph.nodeStride);
    if (toIndex !== childIndex) continue;
    const type = edgeTypeName(graph, ei) || 'property';
    const nameOrIndex = graph.edges[ei + graph.eNameIx];
    if (type === 'element' || type === 'hidden') return '[]';
    const name = graph.strings[nameOrIndex] || '';
    best = name || String(nameOrIndex);
    if (type === 'property') break;
  }
  return best;
}

function findRoots(graph) {
  const roots = [];
  for (let n = 0; n < graph.nodeCount; n += 1) {
    if (isGcRoot(graph, n)) roots.push(n);
  }
  if (roots.length) return roots;
  for (let n = 0; n < graph.nodeCount; n += 1) {
    if (graph.revHead[n] === -1) roots.push(n);
  }
  return roots.length ? roots : [0];
}

function buildReachableRpo(graph, roots) {
  const seen = new Uint8Array(graph.nodeCount);
  const post = [];
  const stack = roots.map((n) => ({ n, edge: 0 }));
  for (const r of roots) seen[r] = 1;
  while (stack.length) {
    const top = stack[stack.length - 1];
    const count = graph.nodes[top.n * graph.nodeStride + graph.edgeCountIx] | 0;
    if (top.edge >= count) {
      post.push(top.n);
      stack.pop();
      continue;
    }
    const ei = graph.firstEdge[top.n] + top.edge * graph.edgeStride;
    top.edge += 1;
    if (isWeakEdge(graph, ei)) continue;
    const to = Math.floor((graph.edges[ei + graph.eToIx] | 0) / graph.nodeStride);
    if (to < 0 || to >= graph.nodeCount || seen[to]) continue;
    seen[to] = 1;
    stack.push({ n: to, edge: 0 });
  }
  return { seen, rpo: post.reverse() };
}

function computeImmediateDominators(graph, roots, seen, rpo) {
  const superRoot = graph.nodeCount;
  const rpoIndex = new Int32Array(graph.nodeCount + 1);
  rpoIndex.fill(-1);
  rpoIndex[superRoot] = 0;
  for (let i = 0; i < rpo.length; i += 1) rpoIndex[rpo[i]] = i + 1;
  const idom = new Int32Array(graph.nodeCount);
  idom.fill(-1);
  const rootSet = new Uint8Array(graph.nodeCount);
  for (const r of roots) {
    if (!seen[r]) continue;
    rootSet[r] = 1;
    idom[r] = superRoot;
  }

  const intersect = (a0, b0) => {
    let a = a0;
    let b = b0;
    while (a !== b) {
      while (rpoIndex[a] > rpoIndex[b]) a = idom[a];
      while (rpoIndex[b] > rpoIndex[a]) b = idom[b];
    }
    return a;
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < rpo.length; i += 1) {
      const n = rpo[i];
      if (rootSet[n]) continue;
      let newIdom = -1;
      for (let ri = graph.revHead[n]; ri !== -1; ri = graph.revNext[ri]) {
        const p = graph.revFrom[ri];
        if (!seen[p] || idom[p] < 0) continue;
        newIdom = newIdom < 0 ? p : intersect(p, newIdom);
      }
      if (newIdom >= 0 && idom[n] !== newIdom) {
        idom[n] = newIdom;
        changed = true;
      }
    }
  }
  return { idom, superRoot, rootSet };
}

function pathSignature(graph, idom, superRoot, nodeIndex, { maxDepth = 12 } = {}) {
  const chain = [];
  const guard = new Set();
  let cur = nodeIndex;
  while (cur >= 0 && cur !== superRoot && chain.length < maxDepth && !guard.has(cur)) {
    guard.add(cur);
    chain.push(cur);
    cur = idom[cur];
  }
  chain.reverse();
  const parts = [];
  for (let i = 0; i < chain.length; i += 1) {
    const n = chain[i];
    const label = nodeInfo(graph, n).label;
    if (i === 0) {
      parts.push(label);
    } else {
      const edge = edgeLabel(graph, chain[i - 1], n);
      parts.push(edge ? `${label}.${edge}` : label);
    }
  }
  return parts.join(' -> ');
}

export function analyzeDominatorSubtrees(snapshot, {
  topN = 40,
  maxDepth = 12,
  minRetainedBytes = 0,
} = {}) {
  const graph = indexHeapSnapshotGraph(snapshot);
  const roots = findRoots(graph);
  const { seen, rpo } = buildReachableRpo(graph, roots);
  const { idom, superRoot } = computeImmediateDominators(graph, roots, seen, rpo);
  const retained = new Float64Array(graph.nodeCount);
  const dominatedCount = new Uint32Array(graph.nodeCount);
  for (const n of rpo) {
    const base = n * graph.nodeStride;
    retained[n] = Number(graph.nodes[base + graph.sizeIx]) || 0;
  }
  for (let i = rpo.length - 1; i >= 0; i -= 1) {
    const n = rpo[i];
    const p = idom[n];
    if (p >= 0 && p !== superRoot) {
      retained[p] += retained[n];
      dominatedCount[p] += dominatedCount[n] + 1;
    }
  }

  const rows = [];
  for (const n of rpo) {
    if (retained[n] < minRetainedBytes) continue;
    const base = n * graph.nodeStride;
    const selfSize = Number(graph.nodes[base + graph.sizeIx]) || 0;
    const info = nodeInfo(graph, n);
    rows.push({
      nodeIndex: n,
      label: info.label,
      type: info.typeName,
      selfSize,
      retainedSize: retained[n],
      dominatedNodeCount: dominatedCount[n],
      path: pathSignature(graph, idom, superRoot, n, { maxDepth }),
    });
  }
  rows.sort((a, b) => b.retainedSize - a.retainedSize || b.selfSize - a.selfSize || a.path.localeCompare(b.path));
  return {
    signature: HEAP_DOMINATOR_SUBTREES_SIGNATURE,
    nodeCount: graph.nodeCount,
    reachableNodeCount: rpo.length,
    rootCount: roots.length,
    top: rows.slice(0, topN).map((r) => ({
      ...r,
      selfMB: mb(r.selfSize),
      retainedMB: mb(r.retainedSize),
    })),
  };
}

export function diffDominatorSubtrees(beforeSnapshot, afterSnapshot, {
  topN = 40,
  candidateN = 250,
  maxDepth = 12,
} = {}) {
  const before = analyzeDominatorSubtrees(beforeSnapshot, { topN: candidateN, maxDepth });
  const after = analyzeDominatorSubtrees(afterSnapshot, { topN: candidateN, maxDepth });
  const beforeByPath = new Map(before.top.map((r) => [r.path, r]));
  const afterByPath = new Map(after.top.map((r) => [r.path, r]));
  const paths = new Set([...beforeByPath.keys(), ...afterByPath.keys()]);
  const rows = [...paths].map((path) => {
    const b = beforeByPath.get(path);
    const a = afterByPath.get(path);
    const beforeRetained = b?.retainedSize || 0;
    const afterRetained = a?.retainedSize || 0;
    const beforeSelf = b?.selfSize || 0;
    const afterSelf = a?.selfSize || 0;
    return {
      path,
      label: a?.label || b?.label || null,
      beforeRetained,
      afterRetained,
      retainedDelta: afterRetained - beforeRetained,
      beforeSelf,
      afterSelf,
      selfDelta: afterSelf - beforeSelf,
      beforeDominatedNodeCount: b?.dominatedNodeCount || 0,
      afterDominatedNodeCount: a?.dominatedNodeCount || 0,
      dominatedNodeCountDelta: (a?.dominatedNodeCount || 0) - (b?.dominatedNodeCount || 0),
    };
  }).sort((x, y) => y.retainedDelta - x.retainedDelta || y.afterRetained - x.afterRetained);
  return {
    signature: 'HEAP-DOMINATOR-SUBTREE-DIFF-V1',
    before: { nodeCount: before.nodeCount, reachableNodeCount: before.reachableNodeCount },
    after: { nodeCount: after.nodeCount, reachableNodeCount: after.reachableNodeCount },
    topRetainedAfter: after.top.slice(0, topN),
    topRetainedDelta: rows.slice(0, topN).map((r) => ({
      ...r,
      beforeRetainedMB: mb(r.beforeRetained),
      afterRetainedMB: mb(r.afterRetained),
      retainedDeltaMB: mb(r.retainedDelta),
      beforeSelfMB: mb(r.beforeSelf),
      afterSelfMB: mb(r.afterSelf),
      selfDeltaMB: mb(r.selfDelta),
    })),
    note: 'Dominator subtree rows are not additive. Use this when constructor self-size naming is below the stopping threshold.',
  };
}

/**
 * HEAP-RETAINER-PATHS-V1 — aggregate identical retainer paths for named
 * constructors. One line per distinct path, ranked by total retained bytes.
 *
 * Design: do NOT emit per-instance chains. Walk a BFS spanning tree from GC
 * roots (first-visit parent ≈ immediate-dominator chain), collapse element
 * indices to [], aggregate identical path signatures.
 */

import { normalizeConstructorKey } from './heap-snapshot-aggregates.mjs';

export const HEAP_RETAINER_PATHS_SIGNATURE = 'TALARIA_HEAP_RETAINER_PATHS_V1';

/** Default A-list tops from W68 live census. */
export const HEAP_RETAINER_DEFAULT_TARGETS = Object.freeze([
  'system / ExternalStringData',
  'heap number',
  'Object',
]);

/** Host-cache tokens that corroborate rank-1 suspicion when present in a path. */
export const HEAP_RETAINER_CACHE_SUSPECT_TOKENS = Object.freeze([
  '_tfDataCache',
  '_btTfDataCache',
  '_smartPrefetchCache',
  '_btTfCache',
  'smartPrefetch',
  '__talariaBarStore',
  'fullRawData',
  'rawData',
]);

function edgeLabel(edgeType, nameOrIndex, strings) {
  if (edgeType === 'element' || edgeType === 'hidden') {
    // Collapse indices so path [0]/[1]/… aggregate as one line.
    return '[]';
  }
  if (typeof nameOrIndex === 'string') return nameOrIndex || '(anonymous)';
  const name = strings[nameOrIndex];
  if (name == null || name === '') return edgeType === 'property' ? '(anonymous)' : String(nameOrIndex);
  return String(name);
}

function nodeLabel(rawName, detachedFlag, typeName) {
  const norm = normalizeConstructorKey(rawName, detachedFlag);
  if (norm) return norm;
  if (typeName) return typeName;
  return rawName || '(unknown)';
}

/**
 * Parse snapshot into compact node/edge indexes + reverse adjacency.
 * @param {object} snapshot
 */
export function indexHeapSnapshotGraph(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('heap snapshot must be an object');
  }
  const meta = snapshot.snapshot?.meta;
  const nodes = snapshot.nodes;
  const edges = snapshot.edges;
  const strings = snapshot.strings;
  if (!meta || !Array.isArray(nodes) || !Array.isArray(edges) || !Array.isArray(strings)) {
    throw new Error('heap snapshot missing meta/nodes/edges/strings');
  }
  const nodeFields = meta.node_fields || [];
  const edgeFields = meta.edge_fields || [];
  const nameIx = nodeFields.indexOf('name');
  const typeIx = nodeFields.indexOf('type');
  const sizeIx = nodeFields.indexOf('self_size');
  const edgeCountIx = nodeFields.indexOf('edge_count');
  const detIx = nodeFields.indexOf('detachedness');
  const eTypeIx = edgeFields.indexOf('type');
  const eNameIx = edgeFields.indexOf('name_or_index');
  const eToIx = edgeFields.indexOf('to_node');
  if ([nameIx, sizeIx, edgeCountIx, eTypeIx, eNameIx, eToIx].some((i) => i < 0)) {
    throw new Error('heap snapshot missing required node/edge fields');
  }
  const nodeStride = nodeFields.length;
  const edgeStride = edgeFields.length;
  const nodeCount = Math.floor(nodes.length / nodeStride);
  const typeStrings = Array.isArray(meta.node_types?.[typeIx]) ? meta.node_types[typeIx] : null;
  const edgeTypeStrings = Array.isArray(meta.edge_types?.[eTypeIx]) ? meta.edge_types[eTypeIx] : null;

  const firstEdge = new Int32Array(nodeCount);
  let edgeCursor = 0;
  for (let n = 0; n < nodeCount; n += 1) {
    firstEdge[n] = edgeCursor;
    const count = nodes[n * nodeStride + edgeCountIx] | 0;
    edgeCursor += count * edgeStride;
  }

  // Reverse adjacency as linked lists (from-node per inbound edge).
  const inboundCount = Math.floor(edges.length / edgeStride);
  const revFrom = new Int32Array(inboundCount);
  const revEdge = new Int32Array(inboundCount);
  const revNext = new Int32Array(inboundCount);
  const revHead = new Int32Array(nodeCount);
  revHead.fill(-1);
  let revLen = 0;
  for (let n = 0; n < nodeCount; n += 1) {
    const base = firstEdge[n];
    const count = nodes[n * nodeStride + edgeCountIx] | 0;
    for (let e = 0; e < count; e += 1) {
      const ei = base + e * edgeStride;
      const toNodeField = edges[ei + eToIx] | 0;
      const toIndex = Math.floor(toNodeField / nodeStride);
      if (toIndex < 0 || toIndex >= nodeCount) continue;
      // Skip weak edges for retainer paths (DevTools default).
      const etCode = edges[ei + eTypeIx] | 0;
      const et = edgeTypeStrings ? edgeTypeStrings[etCode] : null;
      if (et === 'weak') continue;
      revFrom[revLen] = n;
      revEdge[revLen] = ei;
      revNext[revLen] = revHead[toIndex];
      revHead[toIndex] = revLen;
      revLen += 1;
    }
  }

  return {
    nodes,
    edges,
    strings,
    nodeStride,
    edgeStride,
    nodeCount,
    nameIx,
    typeIx,
    sizeIx,
    edgeCountIx,
    detIx,
    eTypeIx,
    eNameIx,
    eToIx,
    typeStrings,
    edgeTypeStrings,
    firstEdge,
    revFrom,
    revEdge,
    revNext,
    revHead,
    revLen,
  };
}

function isGcRootNode(graph, nodeIndex) {
  const { nodes, strings, nodeStride, nameIx, typeIx, typeStrings } = graph;
  const base = nodeIndex * nodeStride;
  const rawName = strings[nodes[base + nameIx]] || '';
  const typeCode = typeIx >= 0 ? nodes[base + typeIx] : null;
  const typeName = typeStrings && typeCode != null ? typeStrings[typeCode] : null;
  if (typeName === 'synthetic') return true;
  if (/GC roots/i.test(rawName)) return true;
  if (rawName === '(GC roots)' || rawName === 'Window / Document'
    || rawName === '(Window roots)' || rawName === 'DOMWindow') {
    return true;
  }
  return false;
}

/**
 * BFS from GC-root-like nodes; first visit parent forms a spanning tree used
 * as the retainer chain (dominator-path approximation).
 */
export function buildRetainerParentTree(graph) {
  const { nodeCount, revHead, revNext, revFrom } = graph;
  const parent = new Int32Array(nodeCount);
  parent.fill(-1);
  const queue = new Int32Array(nodeCount);
  let qh = 0;
  let qt = 0;
  const seen = new Uint8Array(nodeCount);

  for (let n = 0; n < nodeCount; n += 1) {
    if (!isGcRootNode(graph, n)) continue;
    seen[n] = 1;
    queue[qt++] = n;
  }
  // Fallback: if no synthetic roots found, seed from nodes with no inbound.
  if (qt === 0) {
    for (let n = 0; n < nodeCount; n += 1) {
      if (revHead[n] === -1) {
        seen[n] = 1;
        queue[qt++] = n;
      }
    }
  }

  while (qh < qt) {
    const cur = queue[qh++];
    // Outbound edges from cur — walk via firstEdge/edge_count on graph
    const base = cur * graph.nodeStride;
    const count = graph.nodes[base + graph.edgeCountIx] | 0;
    const edgeBase = graph.firstEdge[cur];
    for (let e = 0; e < count; e += 1) {
      const ei = edgeBase + e * graph.edgeStride;
      const etCode = graph.edges[ei + graph.eTypeIx] | 0;
      const et = graph.edgeTypeStrings ? graph.edgeTypeStrings[etCode] : null;
      if (et === 'weak') continue;
      const toIndex = Math.floor((graph.edges[ei + graph.eToIx] | 0) / graph.nodeStride);
      if (toIndex < 0 || toIndex >= nodeCount || seen[toIndex]) continue;
      seen[toIndex] = 1;
      parent[toIndex] = cur;
      queue[qt++] = toIndex;
    }
  }

  return { parent, seen };
}

function edgeFromParent(graph, parentIndex, childIndex) {
  if (parentIndex < 0) return null;
  const count = graph.nodes[parentIndex * graph.nodeStride + graph.edgeCountIx] | 0;
  const edgeBase = graph.firstEdge[parentIndex];
  let best = null;
  for (let e = 0; e < count; e += 1) {
    const ei = edgeBase + e * graph.edgeStride;
    const toIndex = Math.floor((graph.edges[ei + graph.eToIx] | 0) / graph.nodeStride);
    if (toIndex !== childIndex) continue;
    const etCode = graph.edges[ei + graph.eTypeIx] | 0;
    const et = graph.edgeTypeStrings ? graph.edgeTypeStrings[etCode] : 'property';
    if (et === 'weak') continue;
    const nameOrIndex = graph.edges[ei + graph.eNameIx];
    const el = edgeLabel(et, nameOrIndex, graph.strings);
    if (!best || et === 'property') best = el;
    if (et === 'property') break;
  }
  return best;
}

function pathForNode(graph, parent, nodeIndex, maxDepth) {
  // Collect root→leaf as Ctor[edgeFromParent]
  const chain = [];
  let cur = nodeIndex;
  let depth = 0;
  const guard = new Set();
  while (cur >= 0 && depth < maxDepth) {
    if (guard.has(cur)) break;
    guard.add(cur);
    chain.push(cur);
    if (isGcRootNode(graph, cur) || parent[cur] < 0) break;
    cur = parent[cur];
    depth += 1;
  }
  chain.reverse();
  const parts = [];
  for (let i = 0; i < chain.length; i += 1) {
    const n = chain[i];
    const base = n * graph.nodeStride;
    const rawName = graph.strings[graph.nodes[base + graph.nameIx]] || '';
    const typeCode = graph.typeIx >= 0 ? graph.nodes[base + graph.typeIx] : null;
    const typeName = graph.typeStrings && typeCode != null ? graph.typeStrings[typeCode] : null;
    const detached = graph.detIx >= 0
      ? Number(graph.nodes[base + graph.detIx]) === 1
      : false;
    const label = nodeLabel(rawName, detached, typeName);
    if (i === 0) {
      parts.push(label);
      continue;
    }
    const edge = edgeFromParent(graph, chain[i - 1], n);
    // Skip redundant edge labels that equal the child constructor name.
    if (edge && edge !== '[]' && edge !== label && edge !== '(anonymous)') {
      parts.push(`${label}[${edge}]`);
    } else if (edge === '[]') {
      parts.push(`${label}[]`);
    } else {
      parts.push(label);
    }
  }
  return parts.join(' → ');
}

function pathHitsSuspect(path) {
  const text = String(path || '');
  const hits = [];
  for (const token of HEAP_RETAINER_CACHE_SUSPECT_TOKENS) {
    // Require property/edge form — avoid `_btTfCacheAnchorKey` false positives.
    const edgeForm = `[${token}]`;
    const bareEdge = new RegExp(`(?:^|→\\s*)${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s*→|$)`);
    if (text.includes(edgeForm) || bareEdge.test(text)) hits.push(token);
  }
  return hits;
}

/** Collapse script-backing ExternalStringData paths to one line per script URL. */
export function canonicalizeScriptSourcePath(path) {
  const text = String(path || '');
  const urlMatch = text.match(/system \/ Script(?: \/ ([^\s→\[]+))?/);
  if (urlMatch && urlMatch[1]) {
    return `system / Script / ${urlMatch[1]} → (script-source) → system / ExternalStringData[backing_store]`;
  }
  return 'system / Script → (script-source) → system / ExternalStringData[backing_store]';
}

/**
 * Collapse instance-specific noise so identical structures aggregate:
 * heap ids, WeakMap table addresses, script source snippets, DevTools indexes.
 */
export function normalizePathSignature(path) {
  let text = String(path || '');
  // Flatten newlines so WeakMap / source fragments match reliably.
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(/@\d+/g, '@#');
  text = text.replace(/WeakMap \(table @#\)/g, 'WeakMap');
  // Nested parens inside "part of key (...) -> value (...) pair in WeakMap".
  text = text.replace(
    /\[?\d*\s*\/?\s*part of key[\s\S]*?pair in WeakMap(?:\s*\([^)]*\))?\]?/g,
    '[WeakMapPair]',
  );
  text = text.replace(/\[\d+\s*\/\s*DevTools console\]/g, '[DevTools]');
  text = text.replace(/system \/ Script \/ [^\s→]+/g, 'system / Script');
  // Script source node labels (/** … */, // …, or huge leftover text).
  text = text.replace(
    /→\s*(?:\/\*[\s\S]*?\*\/|\/\/)[^→]{16,}/g,
    '→ (script-source)',
  );
  text = text.replace(
    /(system \/ Script)\s*→\s*\(script-source\)(?:\s*→\s*system \/ ExternalStringData(?:\[[^\]]*\])?)?/g,
    '$1 → (script-source) → system / ExternalStringData[backing_store]',
  );
  // Any remaining huge unique node labels (response bodies, etc.).
  text = text.replace(/→\s*[^→]{160,}/g, '→ (large-string-label)');
  text = text.replace(/\[\d+\]/g, '[]');
  text = text.replace(/FunctionTemplateInfo\[\d+\]/g, 'FunctionTemplateInfo[]');
  return text;
}

/** Classify a normalized retainer path for ExternalStringData triage. */
export function classifyRetainerPath(path) {
  const text = String(path || '');
  if (/\(script-source\)|system \/ Script/.test(text)) return 'script-source';
  if (pathHitsSuspect(text).length > 0) return 'cache-suspect';
  if (/Response|XMLHttpRequest|fetch|Network|ArrayBuffer|Uint8Array/i.test(text)) {
    return 'network-ish';
  }
  return 'application';
}

function scoreRetainerPath(path) {
  const text = String(path || '');
  let score = 0;
  const suspects = pathHitsSuspect(text);
  if (suspects.length) score += 1000 + suspects.length * 50;
  if (/_tfDataCache|_btTfDataCache|_smartPrefetchCache/.test(text)) score += 500;
  if (/Chart/.test(text) && /Window|Global handles/.test(text)) score += 80;
  if (/script-source|system \/ Script/.test(text)) score -= 250;
  if (/Eternal handles|FunctionTemplateInfo|WeakMapPair|PageTransitionEvent/.test(text)) {
    score -= 120;
  }
  // Prefer shorter readable paths once signal is equal.
  score -= text.split('→').length;
  return score;
}

/**
 * Greedy reverse climb preferring named property edges / cache tokens over
 * Eternal→Script retainers (BFS spanning tree often lands on script source).
 */
function applicationPreferredPath(graph, nodeIndex, maxDepth) {
  const chain = [nodeIndex];
  const guard = new Set([nodeIndex]);
  let cur = nodeIndex;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (isGcRootNode(graph, cur)) break;
    let bestParent = -1;
    let bestEdge = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let r = graph.revHead[cur]; r !== -1; r = graph.revNext[r]) {
      const parentIndex = graph.revFrom[r];
      if (parentIndex < 0 || guard.has(parentIndex)) continue;
      const edge = edgeFromParent(graph, parentIndex, cur) || '(anonymous)';
      const base = parentIndex * graph.nodeStride;
      const rawName = graph.strings[graph.nodes[base + graph.nameIx]] || '';
      const typeCode = graph.typeIx >= 0 ? graph.nodes[base + graph.typeIx] : null;
      const typeName = graph.typeStrings && typeCode != null ? graph.typeStrings[typeCode] : null;
      const detached = graph.detIx >= 0
        ? Number(graph.nodes[base + graph.detIx]) === 1
        : false;
      const label = nodeLabel(rawName, detached, typeName);
      let edgeScore = 0;
      if (HEAP_RETAINER_CACHE_SUSPECT_TOKENS.some((t) => edge.includes(t) || label.includes(t))) {
        edgeScore += 1000;
      }
      if (edge !== '[]' && edge !== '(anonymous)') edgeScore += 40;
      if (/Window|Chart|Map|Object/.test(label)) edgeScore += 30;
      if (/Eternal|FunctionTemplate|Script|WeakMap|PageTransition|synthetic/i.test(label)) {
        edgeScore -= 80;
      }
      if (isGcRootNode(graph, parentIndex)) edgeScore += 10;
      if (edgeScore > bestScore) {
        bestScore = edgeScore;
        bestParent = parentIndex;
        bestEdge = edge;
      }
    }
    if (bestParent < 0) break;
    chain.push(bestParent);
    guard.add(bestParent);
    cur = bestParent;
    if (bestEdge && HEAP_RETAINER_CACHE_SUSPECT_TOKENS.some((t) => bestEdge.includes(t))) {
      // Keep climbing a bit more to reach Window/Chart for a readable path.
      if (/Window|Global handles|Chart/.test(
        nodeLabel(
          graph.strings[graph.nodes[bestParent * graph.nodeStride + graph.nameIx]] || '',
          false,
          null,
        ),
      )) break;
    }
  }
  chain.reverse();
  const parts = [];
  for (let i = 0; i < chain.length; i += 1) {
    const n = chain[i];
    const base = n * graph.nodeStride;
    const rawName = graph.strings[graph.nodes[base + graph.nameIx]] || '';
    const typeCode = graph.typeIx >= 0 ? graph.nodes[base + graph.typeIx] : null;
    const typeName = graph.typeStrings && typeCode != null ? graph.typeStrings[typeCode] : null;
    const detached = graph.detIx >= 0
      ? Number(graph.nodes[base + graph.detIx]) === 1
      : false;
    const label = nodeLabel(rawName, detached, typeName);
    if (i === 0) {
      parts.push(label);
      continue;
    }
    const edge = edgeFromParent(graph, chain[i - 1], n);
    if (edge && edge !== '[]' && edge !== label && edge !== '(anonymous)') {
      parts.push(`${label}[${edge}]`);
    } else if (edge === '[]') {
      parts.push(`${label}[]`);
    } else {
      parts.push(label);
    }
  }
  return parts.join(' → ');
}

function chooseRetainerPath(graph, parent, nodeIndex, maxDepth) {
  const spanning = normalizePathSignature(pathForNode(graph, parent, nodeIndex, maxDepth));
  const preferred = normalizePathSignature(applicationPreferredPath(graph, nodeIndex, maxDepth));
  if (!preferred) return spanning;
  return scoreRetainerPath(preferred) >= scoreRetainerPath(spanning) ? preferred : spanning;
}

/**
 * Aggregate retainer paths for target constructors.
 *
 * @param {object} snapshot
 * @param {{ constructors?: string[], maxDepth?: number, topPaths?: number, samplePerCtor?: number }} [opts]
 */
export function aggregateRetainerPaths(snapshot, opts = {}) {
  const constructors = opts.constructors || HEAP_RETAINER_DEFAULT_TARGETS.slice();
  const maxDepth = opts.maxDepth ?? 18;
  const topPaths = opts.topPaths ?? 40;
  const samplePerCtor = opts.samplePerCtor ?? 25_000;

  const graph = indexHeapSnapshotGraph(snapshot);
  const { parent } = buildRetainerParentTree(graph);

  /** @type {Map<string, number[]>} */
  const targetsByCtor = new Map();
  for (const c of constructors) targetsByCtor.set(c, []);

  for (let n = 0; n < graph.nodeCount; n += 1) {
    const base = n * graph.nodeStride;
    const rawName = graph.strings[graph.nodes[base + graph.nameIx]] || '';
    const detached = graph.detIx >= 0
      ? Number(graph.nodes[base + graph.detIx]) === 1
      : false;
    const key = normalizeConstructorKey(rawName, detached) || rawName;
    const list = targetsByCtor.get(key);
    if (!list) continue;
    list.push(n);
  }

  const byConstructor = [];
  for (const ctor of constructors) {
    let nodes = targetsByCtor.get(ctor) || [];
    // Prefer largest self_size when sampling.
    if (nodes.length > samplePerCtor) {
      nodes = nodes
        .map((n) => ({
          n,
          size: graph.nodes[n * graph.nodeStride + graph.sizeIx] | 0,
        }))
        .sort((a, b) => b.size - a.size)
        .slice(0, samplePerCtor)
        .map((row) => row.n);
    }

    /** @type {Map<string, { path: string, instanceCount: number, totalSelfBytes: number, suspectTokens: string[], class: string }>} */
    const agg = new Map();
    let totalSelfBytes = 0;
    let instanceCount = 0;
    const classBytes = {
      'script-source': 0,
      'cache-suspect': 0,
      'network-ish': 0,
      application: 0,
    };
    for (const n of nodes) {
      const size = graph.nodes[n * graph.nodeStride + graph.sizeIx] | 0;
      totalSelfBytes += size;
      instanceCount += 1;
      let path = chooseRetainerPath(graph, parent, n, maxDepth);
      let klass = classifyRetainerPath(path);
      if (klass === 'script-source') {
        path = canonicalizeScriptSourcePath(path);
        klass = 'script-source';
      }
      classBytes[klass] = (classBytes[klass] || 0) + size;
      const prev = agg.get(path);
      if (prev) {
        prev.instanceCount += 1;
        prev.totalSelfBytes += size;
      } else {
        const suspectTokens = pathHitsSuspect(path);
        agg.set(path, {
          path,
          instanceCount: 1,
          totalSelfBytes: size,
          suspectTokens,
          class: klass,
        });
      }
    }

    const paths = [...agg.values()]
      .sort((a, b) => b.totalSelfBytes - a.totalSelfBytes
        || b.instanceCount - a.instanceCount
        || a.path.localeCompare(b.path))
      .slice(0, topPaths);

    byConstructor.push({
      constructor: ctor,
      instanceCount,
      sampledCount: nodes.length,
      totalSelfBytes,
      pathCount: agg.size,
      paths,
      classBytes,
      cacheSuspectHits: paths.filter((p) => p.suspectTokens.length > 0),
    });
  }

  return {
    signature: HEAP_RETAINER_PATHS_SIGNATURE,
    meta: {
      ranking: 'aggregated-identical-paths-by-total-self-bytes',
      note: 'One line per distinct retainer path; element indices collapsed to []. Dominator approx via BFS spanning tree from GC roots.',
      maxDepth,
      topPaths,
      samplePerCtor,
      cacheSuspectTokens: HEAP_RETAINER_CACHE_SUSPECT_TOKENS.slice(),
    },
    byConstructor,
  };
}

export function formatRetainerPathsSummary(report) {
  const lines = [`${HEAP_RETAINER_PATHS_SIGNATURE}`];
  for (const block of report.byConstructor || []) {
    lines.push(
      `## ${block.constructor} instances=${block.instanceCount} sampled=${block.sampledCount} selfBytes=${block.totalSelfBytes} distinctPaths=${block.pathCount}`,
    );
    if (block.classBytes) {
      lines.push(`  classBytes=${JSON.stringify(block.classBytes)}`);
    }
    for (const row of block.paths || []) {
      const suspect = row.suspectTokens.length
        ? `  [SUSPECT:${row.suspectTokens.join(',')}]`
        : '';
      const klass = row.class ? ` [${row.class}]` : '';
      lines.push(
        `  ${row.totalSelfBytes}B ×${row.instanceCount}${klass}${suspect}  ${row.path}`,
      );
    }
    if (block.cacheSuspectHits?.length) {
      lines.push(`  → cache-suspect path lines: ${block.cacheSuspectHits.length}`);
    }
  }
  return lines.join('\n');
}

/**
 * Tiny synthetic snapshot for unit tests of path aggregation.
 * Graph: Root → holder(_tfDataCache) → bag(Object) → s1,s2 (ExternalStringData)
 *                    ↘ other(Object) → s3
 */
export function synthesizeRetainerSnapshotFixture() {
  const strings = [
    '',
    '(GC roots)',
    'Window',
    'Object',
    'system / ExternalStringData',
    '_tfDataCache',
    'bag',
    'other',
    'data',
  ];
  const nodeFields = ['type', 'name', 'id', 'self_size', 'edge_count', 'trace_node_id', 'detachedness'];
  const nodeTypes = [[
    'hidden', 'array', 'string', 'object', 'code', 'closure', 'regexp', 'number',
    'native', 'synthetic', 'concatenated string', 'sliced string',
  ]];
  const edgeFields = ['type', 'name_or_index', 'to_node'];
  const edgeTypes = [['context', 'element', 'property', 'internal', 'hidden', 'shortcut', 'weak']];
  // node indices: 0=GC, 1=Window, 2=holder Object, 3=bag Object, 4=other Object, 5=s1, 6=s2, 7=s3
  const nodes = [];
  const pushNode = (type, nameIx, id, selfSize, edgeCount) => {
    nodes.push(type, nameIx, id, selfSize, edgeCount, 0, 0);
  };
  pushNode(9, 1, 1, 0, 1); // GC → Window
  pushNode(3, 2, 2, 64, 1); // Window → holder via _tfDataCache
  pushNode(3, 3, 3, 128, 2); // holder Object → bag, other
  pushNode(3, 3, 4, 64, 2); // bag → s1,s2
  pushNode(3, 3, 5, 64, 1); // other → s3
  pushNode(2, 4, 6, 1000, 0); // ExternalStringData s1
  pushNode(2, 4, 7, 2000, 0); // s2
  pushNode(2, 4, 8, 500, 0); // s3
  const edges = [];
  const prop = 2;
  const nodeStride = 7;
  // GC → Window (property)
  edges.push(prop, 2, 1 * nodeStride);
  // Window → holder (_tfDataCache)
  edges.push(prop, 5, 2 * nodeStride);
  // holder → bag, other
  edges.push(prop, 6, 3 * nodeStride);
  edges.push(prop, 7, 4 * nodeStride);
  // bag → s1, s2 (both element edges — identical path after [] collapse)
  edges.push(1, 0, 5 * nodeStride);
  edges.push(1, 1, 6 * nodeStride);
  // other → s3
  edges.push(prop, 8, 7 * nodeStride);
  return {
    snapshot: {
      meta: {
        node_fields: nodeFields,
        node_types: nodeTypes,
        edge_fields: edgeFields,
        edge_types: edgeTypes,
      },
      node_count: 8,
      edge_count: edges.length / 3,
    },
    nodes,
    edges,
    strings,
  };
}

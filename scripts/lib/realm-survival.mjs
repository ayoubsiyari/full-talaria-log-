/**
 * REALM-SURVIVAL-V1 — does a panel realm outlive its teardown, and is it the
 * product or our own inspector that holds it?
 *
 * W79 measured that a destroyed multichart panel can leave its entire realm
 * behind, carrying that realm's ~21 MB script set with it. Two facts make a
 * naive reading of a snapshot wrong, and this module exists to encode both:
 *
 *  1. Weak edges and WeakMap key/value pairs do not retain, and the snapshot
 *     encodes the WeakMap pairs as ordinary `internal` edges. A shortest-path
 *     walk that follows them reports a retainer that does not retain — that is
 *     what produced the (Eternal handles) -> FunctionTemplateInfo -> WeakMap
 *     chain in W77/W78, now retracted.
 *  2. With the Runtime domain enabled, the inspector holds page objects as
 *     '(Global handles) / DevTools console'. An Error created inside a panel
 *     realm closes over that realm through its stack accessor, so our own CDP
 *     session can pin a dead realm. Those realms must be reported separately or
 *     a harness will grade a product fix against its own noise.
 *
 * A realm is therefore classified by which roots can still reach it:
 *   live               — reachable directly from the snapshot root (a real frame)
 *   product-retained   — reachable without the inspector's handles: a real leak
 *   inspector-retained — reachable ONLY through the inspector's handles: ours
 */

import { indexHeapSnapshotGraph } from './heap-retainer-paths.mjs';

export const REALM_SURVIVAL_SIGNATURE = 'TALARIA_REALM_SURVIVAL_V1';
/** Kill-switch: set to '1' to disable this instrument without touching callers. */
export const REALM_SURVIVAL_DISABLE_ENV = 'TALARIA_DISABLE_REALM_SURVIVAL_V1';

const WEAKMAP_PAIR = /part of key .* pair in WeakMap|in WeakMap \(table|part of key -> value pair in ephemeron table/;
const INSPECTOR_HANDLE = /DevTools console/;
const REALM_TAG_PREFIX = 'REALMTAG|';

export function realmSurvivalEnabled(env = process.env) {
  return String(env?.[REALM_SURVIVAL_DISABLE_ENV] || '') !== '1';
}

/** Parse a REALMTAG string into its fields. */
export function parseRealmTag(tag) {
  if (typeof tag !== 'string' || !tag.startsWith(REALM_TAG_PREFIX)) return null;
  const fields = {};
  for (const pair of tag.slice(REALM_TAG_PREFIX.length).split('|')) {
    const ix = pair.indexOf('=');
    if (ix <= 0) continue;
    fields[pair.slice(0, ix)] = pair.slice(ix + 1);
  }
  if (!fields.panel) return null;
  return {
    cycle: Number(fields.cycle) || null,
    panel: fields.panel,
    host: fields.host === 'true',
    fileId: fields.file ?? null,
    timeframe: fields.tf ?? null,
  };
}

/**
 * Classify realm rows. Split from the graph walk so the verdict logic can be
 * tested without synthesising a heap snapshot.
 *
 * @param {{label:string,host?:boolean,live?:boolean,reachable?:boolean,
 *          reachableWithoutInspector?:boolean,path?:string}[]} rows
 */
export function classifyRealmRows(rows = []) {
  const classified = rows.map((row) => {
    let verdict;
    if (row.live) verdict = 'live';
    else if (!row.reachable) verdict = 'collected';
    else if (row.reachableWithoutInspector) verdict = 'product-retained';
    else verdict = 'inspector-retained';
    return { ...row, verdict };
  });
  const counts = { live: 0, collected: 0, 'product-retained': 0, 'inspector-retained': 0 };
  for (const row of classified) counts[row.verdict] += 1;
  const peers = classified.filter((r) => !r.host);
  return {
    rows: classified,
    counts,
    peerProductRetained: peers.filter((r) => r.verdict === 'product-retained'),
    peerInspectorRetained: peers.filter((r) => r.verdict === 'inspector-retained'),
  };
}

/**
 * Walk a heap snapshot and classify every realm in it.
 *
 * Prefers REALMTAG identity when the harness wrote it (a destroyed iframe's
 * Window loses its URL, so untagged dead realms cannot be told apart), and
 * falls back to counting bare `Window [JSGlobalObject]` nodes.
 */
export function summarizeRealmSurvival(snapshot, { maxPathDepth = 14 } = {}) {
  const g = indexHeapSnapshotGraph(snapshot);
  const {
    nodes, edges, strings, nodeStride, edgeStride, nodeCount,
    nameIx, typeIx, edgeCountIx, eTypeIx, eNameIx, eToIx,
    edgeTypeStrings, typeStrings, firstEdge, revHead, revNext, revFrom, revEdge,
  } = g;
  const nodeName = (n) => strings[nodes[n * nodeStride + nameIx]] || '';
  const nodeType = (n) => (typeStrings ? typeStrings[nodes[n * nodeStride + typeIx]] : '') || '';
  const edgeInfo = (ei) => {
    const et = edgeTypeStrings ? edgeTypeStrings[edges[ei + eTypeIx] | 0] : '';
    const nm = edges[ei + eNameIx] | 0;
    return { et, name: (et === 'element' || et === 'hidden') ? `[${nm}]` : (strings[nm] || '') };
  };

  const bfs = ({ excludeInspector }) => {
    const seen = new Uint8Array(nodeCount);
    const prev = new Int32Array(nodeCount).fill(-1);
    const prevEdge = new Int32Array(nodeCount).fill(-1);
    const queue = new Int32Array(nodeCount);
    let head = 0; let tail = 0;
    seen[0] = 1; queue[tail] = 0; tail += 1;
    while (head < tail) {
      const n = queue[head]; head += 1;
      const base = firstEdge[n];
      const count = nodes[n * nodeStride + edgeCountIx] | 0;
      for (let e = 0; e < count; e += 1) {
        const ei = base + e * edgeStride;
        const { et, name } = edgeInfo(ei);
        if (et === 'weak' || WEAKMAP_PAIR.test(name)) continue;
        if (excludeInspector && INSPECTOR_HANDLE.test(name)) continue;
        const to = Math.floor((edges[ei + eToIx] | 0) / nodeStride);
        if (to < 0 || to >= nodeCount || seen[to]) continue;
        seen[to] = 1; prev[to] = n; prevEdge[to] = ei;
        queue[tail] = to; tail += 1;
      }
    }
    return { seen, prev, prevEdge, reached: tail };
  };

  const withInspector = bfs({ excludeInspector: false });
  const withoutInspector = bfs({ excludeInspector: true });

  // Identity: tagged realms if present, else every JS global object.
  const tagged = new Map();
  for (let n = 0; n < nodeCount; n += 1) {
    if (!nodeName(n).startsWith(REALM_TAG_PREFIX)) continue;
    for (let r = revHead[n]; r !== -1; r = revNext[r]) {
      if (edgeInfo(revEdge[r]).name === '__TALARIA_REALM_TAG__') {
        tagged.set(revFrom[r], parseRealmTag(nodeName(n)));
      }
    }
  }
  const windows = [];
  if (tagged.size > 0) {
    for (const [node, tag] of tagged) windows.push({ node, tag });
  } else {
    for (let n = 0; n < nodeCount; n += 1) {
      if (nodeType(n) === 'object' && nodeName(n).startsWith('Window [JSGlobalObject]')) {
        windows.push({ node: n, tag: null });
      }
    }
  }

  const pathTo = (target) => {
    const parts = [];
    let cur = target;
    for (let d = 0; d < maxPathDepth && cur !== -1 && withoutInspector.prev[cur] !== -1; d += 1) {
      const from = withoutInspector.prev[cur];
      const { et, name } = edgeInfo(withoutInspector.prevEdge[cur]);
      parts.push(`${nodeType(from)}"${nodeName(from).slice(0, 60).replace(/\s+/g, ' ')}"--${et}:${name}`);
      cur = from;
    }
    return parts.reverse().join(' -> ');
  };

  const rows = windows.map(({ node, tag }) => {
    // A realm one hop from the snapshot root is a live frame, not a survivor.
    const live = withoutInspector.prev[node] !== -1
      && withoutInspector.prev[node] !== 0
      && nodeType(withoutInspector.prev[node]) === 'hidden'
      && withoutInspector.prev[withoutInspector.prev[node]] === 0;
    return {
      label: tag ? `cycle${tag.cycle}/panel${tag.panel}${tag.host ? '(HOST)' : ''}` : `window@${node}`,
      host: tag ? tag.host : nodeName(node).includes('http'),
      cycle: tag?.cycle ?? null,
      panel: tag?.panel ?? null,
      fileId: tag?.fileId ?? null,
      live,
      reachable: withInspector.seen[node] === 1,
      reachableWithoutInspector: withoutInspector.seen[node] === 1,
      path: withoutInspector.seen[node] === 1 ? pathTo(node) : null,
    };
  });

  return {
    signature: REALM_SURVIVAL_SIGNATURE,
    realmsFound: rows.length,
    identity: tagged.size > 0 ? 'realm-tags' : 'bare-window-count',
    nodesReached: { withInspector: withInspector.reached, withoutInspector: withoutInspector.reached },
    ...classifyRealmRows(rows),
  };
}

/**
 * Grade a census. Fails when the product still holds a torn-down peer realm.
 *
 * Inspector-retained realms are reported but never graded: they are ours, and
 * failing on them would make the gate fail on its own attachment.
 */
export function assessRealmSurvival(census, { allowedPeerSurvivors = 0 } = {}) {
  if (!census || !Number.isFinite(census.realmsFound) || census.realmsFound === 0) {
    return {
      verdict: 'NO-DATA',
      ok: false,
      reason: 'no realms found in snapshot — cannot grade',
    };
  }
  const survivors = census.peerProductRetained || [];
  const inspector = (census.peerInspectorRetained || []).length;
  if (survivors.length > allowedPeerSurvivors) {
    return {
      verdict: 'PEER-REALM-SURVIVES-TEARDOWN',
      ok: false,
      peerProductRetained: survivors.length,
      allowedPeerSurvivors,
      inspectorRetainedNotGraded: inspector,
      survivors: survivors.map((r) => ({ label: r.label, panel: r.panel, cycle: r.cycle, path: r.path })),
      reason: `${survivors.length} torn-down peer realm(s) still reachable from product references`,
    };
  }
  return {
    verdict: 'NO-PEER-REALM-SURVIVES',
    ok: true,
    peerProductRetained: survivors.length,
    allowedPeerSurvivors,
    inspectorRetainedNotGraded: inspector,
    reason: inspector > 0
      ? `no product-retained peer realms; ${inspector} realm(s) held only by our inspector session (not graded)`
      : 'no product-retained peer realms',
  };
}

export function formatRealmSurvival(census, assessment) {
  const lines = [
    `REALM-SURVIVAL-V1 ${assessment.verdict} (${assessment.ok ? 'PASS' : 'FAIL'})`,
    `  realms=${census.realmsFound} identity=${census.identity}`,
    `  live=${census.counts.live} product-retained=${census.counts['product-retained']} `
    + `inspector-retained=${census.counts['inspector-retained']} collected=${census.counts.collected}`,
  ];
  for (const row of census.peerProductRetained || []) {
    lines.push(`  SURVIVOR ${row.label}: ${row.path || '(no path)'}`);
  }
  return lines.join('\n');
}

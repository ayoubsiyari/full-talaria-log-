/**
 * SCRIPT-REALM-CENSUS-V1 — count how many copies of each script source a heap
 * holds, and name what holds them.
 *
 * Why this exists: the retainer-path aggregator answers "what class of thing
 * retains ExternalStringData" but collapses `system / Script / <url>` to
 * `system / Script`, so it cannot say whether one script is held once or held
 * once per realm. Copy count per URL is the measurement that distinguishes
 * "compiled once and shared" from "compiled per iframe and kept".
 *
 * Reading the result: a run that ends collapsed to a single chart has ONE live
 * realm. Any URL present N>1 times is held by realms that no longer exist.
 */

export const SCRIPT_REALM_CENSUS_SIGNATURE = 'TALARIA_SCRIPT_REALM_CENSUS_V1';

const SCRIPT_NODE_PREFIX = 'system / Script';
const SOURCE_EDGE_NAMES = new Set(['source', 'source_string']);
const BACKING_EDGE_NAMES = new Set(['backing_store']);

/**
 * V8 sometimes names internal edges `<index> / <field>` (e.g. `2 / backing_store`),
 * so match the trailing field token rather than the whole label.
 */
function edgeNameMatches(edgeName, names) {
  if (!edgeName) return false;
  if (names.has(edgeName)) return true;
  const slash = edgeName.lastIndexOf('/');
  return slash >= 0 && names.has(edgeName.slice(slash + 1).trim());
}

/** V8 names script nodes `system / Script / <url>`; anonymous scripts omit the URL. */
export function scriptUrlFromNodeName(rawName) {
  const text = String(rawName || '');
  if (!text.startsWith(SCRIPT_NODE_PREFIX)) return null;
  const rest = text.slice(SCRIPT_NODE_PREFIX.length);
  if (!rest.startsWith(' / ')) return '(anonymous)';
  const url = rest.slice(3).trim();
  return url || '(anonymous)';
}

/** Strip the cache-busting query so copies of one file aggregate together. */
export function normalizeScriptUrl(url) {
  const text = String(url || '');
  if (text === '(anonymous)') return text;
  return text.replace(/[?&]v=[^&]*/g, '').replace(/[?&]$/, '');
}

/**
 * @param {object} graph indexHeapSnapshotGraph() result
 * @param {{ liveRealms?: number, topUrls?: number }} [opts]
 */
export function summarizeScriptRealmCensus(graph, opts = {}) {
  if (!graph || typeof graph !== 'object' || !graph.nodes) {
    throw new Error('script realm census requires an indexed heap snapshot graph');
  }
  const liveRealms = Number.isFinite(opts.liveRealms) ? Number(opts.liveRealms) : 1;
  const topUrls = opts.topUrls ?? 25;
  const {
    nodes, edges, strings, nodeStride, edgeStride,
    nameIx, typeIx, sizeIx, edgeCountIx,
    eTypeIx, eNameIx, eToIx, edgeTypeStrings, typeStrings, firstEdge, nodeCount,
  } = graph;

  const nodeName = (n) => strings[nodes[n * nodeStride + nameIx]] || '';
  const nodeType = (n) => (typeStrings ? typeStrings[nodes[n * nodeStride + typeIx]] : '') || '';
  const nodeSize = (n) => nodes[n * nodeStride + sizeIx] | 0;

  /** Targets of out-edges whose name is in `names` (indexed edges skipped). */
  function namedEdgeTargets(n, names) {
    const out = [];
    const base = firstEdge[n];
    const count = nodes[n * nodeStride + edgeCountIx] | 0;
    for (let e = 0; e < count; e += 1) {
      const ei = base + e * edgeStride;
      const et = edgeTypeStrings ? edgeTypeStrings[edges[ei + eTypeIx] | 0] : '';
      const nameOrIndex = edges[ei + eNameIx] | 0;
      // backing_store arrives as an indexed internal edge in some builds, so
      // match on the trailing token rather than requiring a named edge.
      const edgeName = (et === 'element' || et === 'hidden')
        ? ''
        : (strings[nameOrIndex] || '');
      if (!edgeNameMatches(edgeName, names)) continue;
      const to = Math.floor((edges[ei + eToIx] | 0) / nodeStride);
      if (to >= 0 && to < nodeCount) out.push(to);
    }
    return out;
  }

  /** @type {Map<string, { copies: number, sourceBytes: number, rawUrls: Set<string> }>} */
  const byUrl = new Map();
  let scriptNodes = 0;

  for (let n = 0; n < nodeCount; n += 1) {
    if (nodeType(n) !== 'code') continue;
    const url = scriptUrlFromNodeName(nodeName(n));
    if (url == null) continue;
    scriptNodes += 1;

    let sourceBytes = 0;
    for (const to of namedEdgeTargets(n, SOURCE_EDGE_NAMES)) {
      // The source string node is a small wrapper; for external strings the
      // bytes sit in the ExternalStringData reached via backing_store.
      sourceBytes += nodeSize(to);
      for (const backing of namedEdgeTargets(to, BACKING_EDGE_NAMES)) {
        sourceBytes += nodeSize(backing);
      }
    }

    const key = normalizeScriptUrl(url);
    const row = byUrl.get(key) || { copies: 0, sourceBytes: 0, rawUrls: new Set() };
    row.copies += 1;
    row.sourceBytes += sourceBytes;
    row.rawUrls.add(url);
    byUrl.set(key, row);
  }

  const rows = [...byUrl].map(([url, row]) => ({
    url,
    copies: row.copies,
    sourceBytes: row.sourceBytes,
    // Bytes that would be reclaimed if the file were held once, not per realm.
    redundantBytes: row.copies > 1
      ? Math.round(row.sourceBytes * ((row.copies - 1) / row.copies))
      : 0,
  })).sort((a, b) => b.redundantBytes - a.redundantBytes || b.copies - a.copies);

  const totalSourceBytes = rows.reduce((s, r) => s + r.sourceBytes, 0);
  const redundantBytes = rows.reduce((s, r) => s + r.redundantBytes, 0);
  const maxCopies = rows.reduce((m, r) => Math.max(m, r.copies), 0);
  // Grade on the file that carries the mass. Tiny inline document scripts can
  // be present many times while contributing nothing to the heap.
  const largestFile = rows.length
    ? rows.reduce((best, r) => {
      if (!best) return r;
      if (r.sourceBytes !== best.sourceBytes) return r.sourceBytes > best.sourceBytes ? r : best;
      return r.copies > best.copies ? r : best;
    }, null)
    : null;
  const duplicatedUrls = rows.filter((r) => r.copies > liveRealms).length;

  /** Copy-count histogram: how many URLs are held 1×, 2×, … */
  const copiesHistogram = {};
  for (const r of rows) {
    copiesHistogram[r.copies] = (copiesHistogram[r.copies] || 0) + 1;
  }

  return {
    signature: SCRIPT_REALM_CENSUS_SIGNATURE,
    liveRealms,
    scriptNodes,
    distinctUrls: rows.length,
    totalSourceBytes,
    redundantBytes,
    maxCopies,
    largestFile,
    copiesOfLargestFile: largestFile ? largestFile.copies : 0,
    duplicatedUrls,
    copiesHistogram,
    // A single generation of dead realms retained looks like maxCopies ≈ realms
    // per cycle; accumulation across cycles looks like maxCopies ≫ that.
    retainsDeadRealms: maxCopies > liveRealms,
    topUrls: rows.slice(0, topUrls),
  };
}

/**
 * Grade copy counts against what the run should have left live.
 *
 * @param {object} census summarizeScriptRealmCensus() result
 * @param {{ realmsPerCycle?: number, cycles?: number }} [opts]
 */
export function assessScriptRealmRetention(census, opts = {}) {
  const realmsPerCycle = Number.isFinite(opts.realmsPerCycle) ? Number(opts.realmsPerCycle) : 4;
  const cycles = Number.isFinite(opts.cycles) ? Number(opts.cycles) : 1;
  if (!census || !Number.isFinite(census.maxCopies) || census.scriptNodes === 0) {
    return { verdict: 'NO-DATA', reason: 'no script nodes in snapshot' };
  }
  const live = census.liveRealms;
  // Grade the file carrying the mass, not the highest count anywhere.
  const max = Number.isFinite(census.copiesOfLargestFile) && census.copiesOfLargestFile > 0
    ? census.copiesOfLargestFile
    : census.maxCopies;
  // Leaking ONE realm per cycle produces live + cycles copies. Leaking every
  // realm the cycle creates produces live + (realmsPerCycle - live) * cycles.
  // W77 tested only the second and wrongly cleared the first.
  const onePerCycleExpectation = live + cycles;
  const allRealmsExpectation = live + Math.max(0, realmsPerCycle - live) * cycles;

  let verdict;
  let reading;
  if (max <= live) {
    verdict = 'SHARED-OR-COLLECTED';
    reading = 'no script is held more times than there are live realms';
  } else if (max >= allRealmsExpectation && allRealmsExpectation > onePerCycleExpectation) {
    verdict = 'ACCUMULATES-EVERY-REALM-PER-CYCLE';
    reading = `copies (${max}) reach the every-realm-retained expectation `
      + `(${allRealmsExpectation}) for ${cycles} cycles`;
  } else if (max >= onePerCycleExpectation) {
    verdict = 'ACCUMULATES-ONE-REALM-PER-CYCLE';
    reading = `copies (${max}) match live realms plus one per cycle `
      + `(${onePerCycleExpectation}): exactly one realm's script set is retained `
      + 'each cycle, and the rest are collected';
  } else {
    verdict = 'RETAINS-SOME-DEAD-REALMS';
    reading = `copies (${max}) exceed live realms (${live}) but fall short of one `
      + `per cycle (${onePerCycleExpectation})`;
  }
  return {
    verdict,
    reading,
    maxCopies: max,
    onePerCycleExpectation,
    allRealmsExpectation,
    maxCopiesAnyUrl: census.maxCopies,
    largestFileUrl: census.largestFile ? census.largestFile.url : null,
    liveRealms: live,
    redundantBytes: census.redundantBytes,
    perCycleAccumulation: verdict === 'ACCUMULATES-ONE-REALM-PER-CYCLE'
      || verdict === 'ACCUMULATES-EVERY-REALM-PER-CYCLE',
  };
}

/**
 * Model-free growth test: diff two censuses taken one cycle apart at the same
 * collapsed state. This needs no assumption about how many realms a cycle
 * creates, which is where the single-snapshot verdict went wrong in W77.
 *
 * @param {object} before census at cycle N
 * @param {object} after census at cycle N+1
 */
export function assessScriptRealmGrowth(before, after) {
  if (!before?.topUrls || !after?.topUrls) {
    return { verdict: 'NO-DATA', reason: 'two censuses required' };
  }
  const beforeByUrl = new Map(before.topUrls.map((r) => [r.url, r]));
  const grew = [];
  for (const row of after.topUrls) {
    const prev = beforeByUrl.get(row.url);
    const prevCopies = prev ? prev.copies : 0;
    if (row.copies > prevCopies) {
      grew.push({
        url: row.url,
        copiesBefore: prevCopies,
        copiesAfter: row.copies,
        copiesAdded: row.copies - prevCopies,
        bytesAdded: row.sourceBytes - (prev ? prev.sourceBytes : 0),
      });
    }
  }
  const copiesAdded = grew.reduce((s, r) => s + r.copiesAdded, 0);
  const bytesAdded = grew.reduce((s, r) => s + r.bytesAdded, 0);
  const scriptNodesAdded = (after.scriptNodes || 0) - (before.scriptNodes || 0);
  const sourceBytesAdded = (after.totalSourceBytes || 0) - (before.totalSourceBytes || 0);
  // Every tracked file gaining exactly one copy is one whole realm retained.
  const uniformSingleCopy = grew.length > 0 && grew.every((r) => r.copiesAdded === 1);
  return {
    verdict: grew.length === 0
      ? 'NO-GROWTH-BETWEEN-CYCLES'
      : (uniformSingleCopy ? 'ONE-REALM-RETAINED-PER-CYCLE' : 'UNEVEN-GROWTH'),
    urlsThatGrew: grew.length,
    copiesAdded,
    bytesAdded,
    scriptNodesAdded,
    sourceBytesAdded,
    perCycleSourceMb: +(sourceBytesAdded / 1048576).toFixed(2),
    detail: grew.sort((a, b) => b.bytesAdded - a.bytesAdded).slice(0, 15),
  };
}

/** Human-readable summary lines. */
export function formatScriptRealmCensus(census, assessment = null) {
  const MB = 1048576;
  const lines = [
    `${SCRIPT_REALM_CENSUS_SIGNATURE} scripts=${census.scriptNodes} urls=${census.distinctUrls} `
    + `sourceMB=${(census.totalSourceBytes / MB).toFixed(2)} `
    + `redundantMB=${(census.redundantBytes / MB).toFixed(2)} maxCopies=${census.maxCopies}`,
  ];
  if (assessment) lines.push(`  verdict=${assessment.verdict} — ${assessment.reading}`);
  for (const r of census.topUrls) {
    lines.push(
      `  ×${String(r.copies).padStart(2)} ${(r.sourceBytes / MB).toFixed(2).padStart(7)}MB `
      + `(redundant ${(r.redundantBytes / MB).toFixed(2)}MB)  ${r.url}`,
    );
  }
  return lines.join('\n');
}

/**
 * ARRAYBUFFER-HEAP-JOIN-V1
 *
 * Capture one Chromium heap snapshot, find large ArrayBuffer/backing-store nodes,
 * and print shortest retainer chains so partition_alloc/partitions/buffer has
 * nameable JS owners instead of anonymous bucket rows.
 */
import fs from 'node:fs';
import path from 'node:path';

import { startServer } from '../chart v 1.4/chart/multichart-prod/harness/serve.mjs';
import { embedFrames, sleep } from '../chart v 1.4/chart/multichart-prod/harness/harness-lib.mjs';
import { loadPuppeteer } from './lib/heap-cycle-browser.mjs';
import { indexHeapSnapshotGraph, buildRetainerParentTree } from './lib/heap-retainer-paths.mjs';
import { summariseAllocatorDetail, pickHeaviestDetail } from './lib/blink-allocator-detail.mjs';

const MB = 1048576;
const OUT_DIR = process.argv.find((a) => a.startsWith('--outDir='))?.split('=').slice(1).join('=')
  || '_evidence/manager-E/arraybuffer-heap-join-20260802';
const TOP_N = Number(process.argv.find((a) => a.startsWith('--top='))?.split('=').pop() || 40);
const SNAP_CAP_MB = Number(process.argv.find((a) => a.startsWith('--capMB='))?.split('=').pop() || 3072);

function log(...args) {
  console.error(`[arraybuffer-join ${new Date().toISOString()}]`, ...args);
}

function mb(bytes) {
  return +(Number(bytes || 0) / MB).toFixed(3);
}

async function forceCollect(page) {
  const cdp = await page.createCDPSession();
  try {
    await cdp.send('HeapProfiler.enable').catch(() => {});
    await cdp.send('Runtime.enable').catch(() => {});
    for (let i = 0; i < 3; i++) {
      await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
      await cdp.send('Runtime.collectGarbage').catch(() => {});
      await page.evaluate(() => { try { if (typeof gc === 'function') gc(); } catch (_) {} }).catch(() => {});
      await sleep(500);
    }
    await sleep(1500);
  } finally {
    await cdp.detach().catch(() => {});
  }
}

async function bootHarness(page, url) {
  await page.goto(`${url}/harness/host.html?pair=same&panels=4&tf=1m&hostFile=25`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  const deadline = Date.now() + 45000;
  let state = null;
  while (Date.now() < deadline) {
    state = {
      hostChart: await page.evaluate(() => !!window.chart).catch(() => false),
      iframeCharts: 0,
      iframeCount: embedFrames(page).length,
      bootError: await page.evaluate(() => window.__harnessBootError || null).catch(() => null),
    };
    for (const f of embedFrames(page)) {
      if (await f.evaluate(() => !!window.chart).catch(() => false)) state.iframeCharts += 1;
    }
    if (state.hostChart && state.iframeCharts >= 3) return state;
    await sleep(250);
  }
  return state;
}

async function captureSnapshot(page, outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, '');
  const cdp = await page.target().createCDPSession();
  let written = 0;
  let aborted = false;
  const started = Date.now();
  const onChunk = (ev) => {
    if (aborted || !ev?.chunk) return;
    const n = Buffer.byteLength(ev.chunk, 'utf8');
    if (written + n > SNAP_CAP_MB * MB) {
      aborted = true;
      return;
    }
    fs.appendFileSync(outFile, ev.chunk);
    written += n;
  };
  try {
    cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.takeHeapSnapshot', {
      reportProgress: true,
      captureNumericValue: true,
    });
    await sleep(500);
  } finally {
    cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
    await cdp.detach().catch(() => {});
  }
  const onDisk = fs.existsSync(outFile) ? fs.statSync(outFile).size : 0;
  if (aborted || !onDisk) {
    try { fs.rmSync(outFile, { force: true }); } catch (_) {}
    return {
      ok: false,
      aborted,
      bytesCounted: written,
      bytesOnDisk: onDisk,
      elapsedMs: Date.now() - started,
      failedWhy: aborted
        ? `snapshot exceeded cap ${SNAP_CAP_MB} MB`
        : `snapshot produced ${onDisk} bytes`,
    };
  }
  return {
    ok: true,
    file: outFile,
    bytes: onDisk,
    mb: +(onDisk / MB).toFixed(1),
    elapsedMs: Date.now() - started,
  };
}

async function collectAllocatorDetailWithPagePid(browserCdp, page, { settleMs = 1500 } = {}) {
  const marker = `talaria-arraybuffer-join-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const events = [];
  const onData = (e) => { if (Array.isArray(e?.value)) events.push(...e.value); };
  browserCdp.on('Tracing.dataCollected', onData);
  const complete = new Promise((resolve) => browserCdp.once('Tracing.tracingComplete', resolve));
  await browserCdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: {
      includedCategories: [
        'disabled-by-default-memory-infra',
        'blink.user_timing',
        'devtools.timeline',
      ],
      memoryDumpConfig: {},
    },
  });
  await page.evaluate((name) => {
    try { performance.mark(name); } catch (_) {}
    try { console.timeStamp(name); } catch (_) {}
  }, marker).catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  await browserCdp.send('Tracing.requestMemoryDump', {
    deterministic: true,
    levelOfDetail: 'detailed',
  });
  await new Promise((r) => setTimeout(r, settleMs));
  await browserCdp.send('Tracing.end');
  await complete;
  browserCdp.off('Tracing.dataCollected', onData);

  const byPid = new Map();
  let pageRendererPid = null;
  for (const e of events) {
    if (pageRendererPid == null) {
      const asText = JSON.stringify({
        name: e.name,
        cat: e.cat,
        args: e.args,
      });
      if (asText.includes(marker)) pageRendererPid = e.pid;
    }
    if (e.ph !== 'v' || !e.args?.dumps?.allocators) continue;
    byPid.set(e.pid, summariseAllocatorDetail(e.args.dumps.allocators));
  }
  return { marker, pageRendererPid, byPid };
}

function typeName(graph, nodeIndex) {
  const base = nodeIndex * graph.nodeStride;
  const code = graph.typeIx >= 0 ? graph.nodes[base + graph.typeIx] : null;
  return graph.typeStrings && code != null ? graph.typeStrings[code] : null;
}

function rawName(graph, nodeIndex) {
  const base = nodeIndex * graph.nodeStride;
  return graph.strings[graph.nodes[base + graph.nameIx]] || '';
}

function selfSize(graph, nodeIndex) {
  return Number(graph.nodes[nodeIndex * graph.nodeStride + graph.sizeIx]) || 0;
}

function edgeName(graph, edgeIndex) {
  const typeCode = graph.edges[edgeIndex + graph.eTypeIx] | 0;
  const et = graph.edgeTypeStrings ? graph.edgeTypeStrings[typeCode] : 'property';
  const raw = graph.edges[edgeIndex + graph.eNameIx];
  if (et === 'element' || et === 'hidden') return '[]';
  const s = graph.strings[raw];
  return s == null || s === '' ? String(raw) : String(s);
}

function edgeBetween(graph, parentIndex, childIndex) {
  const count = graph.nodes[parentIndex * graph.nodeStride + graph.edgeCountIx] | 0;
  const edgeBase = graph.firstEdge[parentIndex];
  for (let i = 0; i < count; i++) {
    const ei = edgeBase + i * graph.edgeStride;
    const toIndex = Math.floor((graph.edges[ei + graph.eToIx] | 0) / graph.nodeStride);
    if (toIndex === childIndex) return edgeName(graph, ei);
  }
  return '?';
}

function pathFor(graph, parent, nodeIndex, maxDepth = 18) {
  const chain = [];
  const seen = new Set();
  let cur = nodeIndex;
  while (cur >= 0 && !seen.has(cur) && chain.length < maxDepth) {
    seen.add(cur);
    chain.push(cur);
    cur = parent[cur];
  }
  chain.reverse();
  return chain.map((n, i) => {
    const label = `${typeName(graph, n) || '?'}:${rawName(graph, n) || '(anonymous)'}`;
    if (i === 0) return label;
    return `${label} via ${edgeBetween(graph, chain[i - 1], n)}`;
  });
}

function numericNodeValue(graph, nodeIndex) {
  const name = rawName(graph, nodeIndex);
  const n = Number(name);
  return Number.isFinite(n) ? n : null;
}

function outgoing(graph, nodeIndex) {
  const count = graph.nodes[nodeIndex * graph.nodeStride + graph.edgeCountIx] | 0;
  const edgeBase = graph.firstEdge[nodeIndex];
  const rows = [];
  for (let i = 0; i < count; i++) {
    const ei = edgeBase + i * graph.edgeStride;
    const toIndex = Math.floor((graph.edges[ei + graph.eToIx] | 0) / graph.nodeStride);
    rows.push({ edge: edgeName(graph, ei), toIndex, type: typeName(graph, toIndex), name: rawName(graph, toIndex), size: selfSize(graph, toIndex) });
  }
  return rows;
}

function findByteLength(graph, nodeIndex) {
  const direct = outgoing(graph, nodeIndex).find((e) => e.edge === 'byteLength');
  if (direct) return numericNodeValue(graph, direct.toIndex);
  const backing = outgoing(graph, nodeIndex)
    .filter((e) => /backing|buffer|data|store/i.test(`${e.edge} ${e.name}`))
    .sort((a, b) => b.size - a.size)[0];
  return backing && backing.size > 0 ? backing.size : null;
}

function isArrayBufferCandidate(graph, nodeIndex) {
  const name = rawName(graph, nodeIndex);
  const type = typeName(graph, nodeIndex);
  const label = `${type} ${name}`;
  if (/ArrayBuffer|JSArrayBufferData|ArrayBufferData|BackingStore|backing store/i.test(label)) return true;
  return false;
}

function analyseSnapshot(snapshotFile) {
  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  const graph = indexHeapSnapshotGraph(snapshot);
  const { parent, seen } = buildRetainerParentTree(graph);
  const rows = [];
  for (let i = 0; i < graph.nodeCount; i++) {
    if (!isArrayBufferCandidate(graph, i)) continue;
    const size = selfSize(graph, i);
    const bytes = findByteLength(graph, i);
    if (size < 1024 && !(bytes > 1024)) continue;
    rows.push({
      nodeIndex: i,
      type: typeName(graph, i),
      name: rawName(graph, i),
      selfSizeBytes: size,
      selfSizeMB: mb(size),
      byteLength: bytes,
      byteLengthMB: bytes == null ? null : mb(bytes),
      reachableFromRoot: !!seen[i],
      retainers: pathFor(graph, parent, i, 18),
      outgoing: outgoing(graph, i)
        .filter((e) => /byteLength|buffer|backing|store|data|view|parent|map|elements|length/i.test(`${e.edge} ${e.name}`))
        .slice(0, 16),
    });
  }
  rows.sort((a, b) => (b.selfSizeBytes || b.byteLength || 0) - (a.selfSizeBytes || a.byteLength || 0));
  return {
    nodeCount: graph.nodeCount,
    candidateCount: rows.length,
    totalCandidateSelfMB: +rows.reduce((s, r) => s + r.selfSizeBytes, 0) / MB,
    top: rows.slice(0, TOP_N),
  };
}

const report = {
  signature: 'ARRAYBUFFER-HEAP-JOIN-V1',
  at: new Date().toISOString(),
  method: 'four-panel local harness; force GC; memory-infra detailed dump; HeapProfiler.takeHeapSnapshot with captureNumericValue=true; filter ArrayBuffer/backing-store nodes',
};

let browser;
let srv;
try {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  srv = await startServer(0);
  const puppeteer = await loadPuppeteer();
  browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 900000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--enable-precise-memory-info',
      '--js-flags=--expose-gc',
    ],
    defaultViewport: { width: 1440, height: 960 },
  });
  report.browser = await browser.version();
  const page = await browser.newPage();
  report.boot = await bootHarness(page, srv.url);
  await forceCollect(page);
  const browserCdp = await browser.target().createCDPSession();
  try {
    const alloc = await collectAllocatorDetailWithPagePid(browserCdp, page, { settleMs: 1500 });
    const heavy = pickHeaviestDetail(alloc.byPid);
    const pageDetail = alloc.pageRendererPid != null ? alloc.byPid.get(alloc.pageRendererPid) : null;
    report.allocatorCoverage = {
      marker: alloc.marker,
      pageRendererPid: alloc.pageRendererPid,
      pagePidHasAllocatorDump: !!pageDetail,
      heaviestPid: heavy?.pid ?? null,
      heaviestIsPagePid: !!(heavy && alloc.pageRendererPid != null && heavy.pid === alloc.pageRendererPid),
    };
    report.heaviestAllocator = heavy ? {
      pid: heavy.pid,
      rootsMB: heavy.detail.rootsMB,
      partitionBufferTop: (heavy.detail.childrenByRoot.partition_alloc || [])
        .filter((r) => /partitions\/buffer/.test(r.name))
        .slice(0, 20),
      mallocTop: (heavy.detail.childrenByRoot.malloc || []).slice(0, 12),
    } : null;
    report.pageAllocator = pageDetail ? {
      pid: alloc.pageRendererPid,
      rootsMB: pageDetail.rootsMB,
      partitionBufferTop: (pageDetail.childrenByRoot.partition_alloc || [])
        .filter((r) => /partitions\/buffer/.test(r.name))
        .slice(0, 20),
      mallocTop: (pageDetail.childrenByRoot.malloc || []).slice(0, 12),
    } : null;
  } finally {
    await browserCdp.detach().catch(() => {});
  }
  const snapFile = path.join(OUT_DIR, 'snapshot.heapsnapshot');
  report.snapshot = await captureSnapshot(page, snapFile);
  if (report.snapshot.ok) {
    const analysis = analyseSnapshot(report.snapshot.file);
    analysis.totalCandidateSelfMB = +analysis.totalCandidateSelfMB.toFixed(3);
    report.arrayBuffers = analysis;
  }
  await page.close().catch(() => {});
} catch (error) {
  report.error = String(error?.stack || error);
} finally {
  try { await browser?.close(); } catch (_) {}
  try { await srv?.close?.(); } catch (_) {}
}

const reportFile = path.join(OUT_DIR, 'report.json');
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  reportFile,
  snapshot: report.snapshot,
  allocatorRoots: report.heaviestAllocator?.rootsMB || null,
  allocatorCoverage: report.allocatorCoverage || null,
  pageAllocatorRoots: report.pageAllocator?.rootsMB || null,
  partitionBufferTop: report.heaviestAllocator?.partitionBufferTop?.slice(0, 8) || null,
  pagePartitionBufferTop: report.pageAllocator?.partitionBufferTop?.slice(0, 8) || null,
  arrayBufferTop: report.arrayBuffers?.top?.slice(0, 12).map((r) => ({
    type: r.type,
    name: r.name,
    selfSizeMB: r.selfSizeMB,
    byteLengthMB: r.byteLengthMB,
    retainer: r.retainers?.slice(-8),
  })) || null,
  error: report.error || null,
}, null, 2));

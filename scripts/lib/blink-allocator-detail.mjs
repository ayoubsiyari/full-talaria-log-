/**
 * Blink / PartitionAlloc detail from a Chrome memory-infra dump.
 *
 * The prior arena dumps kept only root allocator names (no '/'), which is enough to NAME blink_gc but
 * not enough to say what inside it grew. This keeps children under blink_gc and partition_alloc so the
 * 212 MB Oilpan growth can be attributed to DOM / CSS / Canvas / something else.
 *
 * Hypothesis carried in (Director): detached canvas backing stores and retained DOM across four panels
 * of layered canvases. Those live in blink_gc and partition_alloc; a JS object-graph walk is blind to
 * both by design.
 */

const MB = 1048576;

function bytesOf(node) {
  const raw = node?.attrs?.size?.value;
  if (raw == null) return null;
  const bytes = typeof raw === 'string' ? parseInt(raw, 16) : Number(raw);
  return Number.isFinite(bytes) ? bytes : null;
}

/**
 * Keep root totals PLUS children whose name starts with one of the prefixes.
 * @param {object} allocators memory-infra allocators map
 * @param {string[]} prefixes e.g. ['blink_gc', 'partition_alloc', 'skia', 'cc', 'gpu']
 */
export function summariseAllocatorDetail(allocators, {
  prefixes = ['blink_gc', 'partition_alloc', 'skia', 'cc', 'gpu', 'malloc', 'v8', 'web_cache'],
  maxChildren = 80,
} = {}) {
  const roots = {};
  const children = {};
  for (const [name, node] of Object.entries(allocators || {})) {
    const bytes = bytesOf(node);
    if (bytes == null) continue;
    if (!name.includes('/')) {
      roots[name] = +(bytes / MB).toFixed(3);
      continue;
    }
    const root = name.split('/')[0];
    if (!prefixes.includes(root)) continue;
    if (!children[root]) children[root] = [];
    children[root].push({ name, mb: +(bytes / MB).toFixed(3) });
  }
  for (const root of Object.keys(children)) {
    children[root].sort((a, b) => b.mb - a.mb);
    children[root] = children[root].slice(0, maxChildren);
  }
  return { rootsMB: roots, childrenByRoot: children };
}

/** Diff two detail summaries. Positive = growth. */
export function diffAllocatorDetail(before, after) {
  const rootKeys = new Set([
    ...Object.keys(before?.rootsMB || {}),
    ...Object.keys(after?.rootsMB || {}),
  ]);
  const rootDeltas = [];
  for (const k of rootKeys) {
    const a = before?.rootsMB?.[k] ?? 0;
    const b = after?.rootsMB?.[k] ?? 0;
    rootDeltas.push({ name: k, beforeMB: a, afterMB: b, deltaMB: +(b - a).toFixed(3) });
  }
  rootDeltas.sort((x, y) => Math.abs(y.deltaMB) - Math.abs(x.deltaMB));

  const childDeltas = {};
  const roots = new Set([
    ...Object.keys(before?.childrenByRoot || {}),
    ...Object.keys(after?.childrenByRoot || {}),
  ]);
  for (const root of roots) {
    const bMap = new Map((before?.childrenByRoot?.[root] || []).map((r) => [r.name, r.mb]));
    const aMap = new Map((after?.childrenByRoot?.[root] || []).map((r) => [r.name, r.mb]));
    const names = new Set([...bMap.keys(), ...aMap.keys()]);
    const rows = [];
    for (const name of names) {
      const bv = bMap.get(name) ?? 0;
      const av = aMap.get(name) ?? 0;
      rows.push({ name, beforeMB: bv, afterMB: av, deltaMB: +(av - bv).toFixed(3) });
    }
    rows.sort((x, y) => y.deltaMB - x.deltaMB || Math.abs(y.deltaMB) - Math.abs(x.deltaMB));
    childDeltas[root] = rows.slice(0, 40);
  }
  return { rootDeltas, childDeltas };
}

/**
 * Collect one detailed memory dump and return per-pid allocator detail.
 * @param {import('puppeteer').CDPSession} browserCdp
 */
export async function collectAllocatorDetail(browserCdp, { settleMs = 1500 } = {}) {
  const events = [];
  const onData = (e) => { if (Array.isArray(e?.value)) events.push(...e.value); };
  browserCdp.on('Tracing.dataCollected', onData);
  const complete = new Promise((resolve) => browserCdp.once('Tracing.tracingComplete', resolve));
  await browserCdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: {
      includedCategories: ['disabled-by-default-memory-infra'],
      memoryDumpConfig: {},
    },
  });
  await new Promise((r) => setTimeout(r, 400));
  await browserCdp.send('Tracing.requestMemoryDump', {
    deterministic: true,
    levelOfDetail: 'detailed',
  });
  await new Promise((r) => setTimeout(r, settleMs));
  await browserCdp.send('Tracing.end');
  await complete;
  browserCdp.off('Tracing.dataCollected', onData);

  /** @type {Map<number, ReturnType<typeof summariseAllocatorDetail>>} */
  const byPid = new Map();
  for (const e of events) {
    if (e.ph !== 'v' || !e.args?.dumps?.allocators) continue;
    byPid.set(e.pid, summariseAllocatorDetail(e.args.dumps.allocators));
  }
  return byPid;
}

/** Pick the heaviest process by blink_gc + partition_alloc + v8. */
export function pickHeaviestDetail(byPid) {
  let best = null;
  for (const [pid, detail] of byPid) {
    const r = detail.rootsMB || {};
    const score = (r.blink_gc || 0) + (r.partition_alloc || 0) + (r.v8 || 0);
    if (!best || score > best.score) best = { pid, score, detail };
  }
  return best;
}

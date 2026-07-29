/**
 * Per-constructor aggregates from Chromium HeapProfiler.takeHeapSnapshot JSON.
 *
 * Matches DevTools Comparison/Summary grouping as closely as possible:
 * - detachedness===1 prefixes "Detached "
 * - serialized elements `Detached <div style="...">` collapse to `Detached <div>`
 *   (without this, each unique style string is its own row and PO's
 *   Detached <div> +21699 signal is invisible)
 */

/**
 * Normalize a heapsnapshot node name into a DevTools-like constructor key.
 * @param {string} rawName
 * @param {boolean} detachedFlag
 */
export function normalizeConstructorKey(rawName, detachedFlag = false) {
  let name = String(rawName || '');
  if (!name) return '';

  // Already-detached serialized element: Detached <div style="..."> → Detached <div>
  let m = name.match(/^Detached\s*<([a-zA-Z][\w:-]*)\b[^>]*>/i);
  if (m) return `Detached <${m[1].toLowerCase()}>`;

  // Detached HTMLDivElement / Detached HTMLSpanElement → keep class form
  m = name.match(/^Detached\s+(HTML[A-Za-z0-9]+)/);
  if (m) return `Detached ${m[1]}`;

  // Serialized element without prefix: <div style="...">
  m = name.match(/^<([a-zA-Z][\w:-]*)\b[^>]*>/);
  if (m) {
    const tag = m[1].toLowerCase();
    return detachedFlag ? `Detached <${tag}>` : `<${tag}>`;
  }

  if (detachedFlag && !name.startsWith('Detached')) {
    // Class-style native name
    if (/^HTML[A-Za-z0-9]+/.test(name)) return `Detached ${name.split(/\s/)[0]}`;
    return `Detached ${name}`;
  }

  return name;
}

/** Count nodes that are Detached <div> / Detached HTMLDivElement after normalize. */
export function isDetachedDivConstructor(key) {
  const text = String(key || '');
  return /^Detached\s*<div>$/i.test(text)
    || /^Detached\s+HTMLDivElement$/i.test(text);
}

/**
 * @param {object} snapshot
 * @returns {Map<string, { constructor: string, count: number, size: number }>}
 */
export function aggregateHeapSnapshotByConstructor(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('heap snapshot must be an object');
  }
  const meta = snapshot.snapshot?.meta;
  const nodes = snapshot.nodes;
  const strings = snapshot.strings;
  if (!meta || !Array.isArray(nodes) || !Array.isArray(strings)) {
    throw new Error('heap snapshot missing snapshot.meta / nodes / strings');
  }
  const fields = Array.isArray(meta.node_fields) ? meta.node_fields : [];
  const nameIx = fields.indexOf('name');
  const sizeIx = fields.indexOf('self_size');
  const detIx = fields.indexOf('detachedness');
  if (nameIx < 0) throw new Error('heap snapshot node_fields missing name');
  if (sizeIx < 0) throw new Error('heap snapshot node_fields missing self_size');
  const stride = fields.length;
  if (!(stride > 0)) throw new Error('heap snapshot node_fields empty');

  /** @type {Map<string, { constructor: string, count: number, size: number }>} */
  const out = new Map();
  for (let i = 0; i + stride <= nodes.length; i += stride) {
    const rawName = strings[nodes[i + nameIx]] || '';
    if (!rawName) continue;
    const detachedFlag = detIx >= 0 ? Number(nodes[i + detIx]) === 1 : false;
    const key = normalizeConstructorKey(rawName, detachedFlag);
    if (!key) continue;
    const size = Number(nodes[i + sizeIx]) || 0;
    const prev = out.get(key);
    if (prev) {
      prev.count += 1;
      prev.size += size;
    } else {
      out.set(key, { constructor: key, count: 1, size });
    }
  }
  return out;
}

/**
 * @param {Map<string, { constructor: string, count: number, size: number }> | null | undefined} before
 * @param {Map<string, { constructor: string, count: number, size: number }> | null | undefined} after
 * @returns {Array<{ constructor: string, countBefore: number, countAfter: number, countDelta: number, sizeBefore: number, sizeAfter: number, sizeDelta: number }>}
 */
export function compareConstructorAggregates(before, after) {
  const keys = new Set([
    ...((before && before.keys()) || []),
    ...((after && after.keys()) || []),
  ]);
  const rows = [];
  for (const key of keys) {
    const b = before?.get(key);
    const a = after?.get(key);
    const countBefore = b?.count || 0;
    const countAfter = a?.count || 0;
    const sizeBefore = b?.size || 0;
    const sizeAfter = a?.size || 0;
    rows.push({
      constructor: key,
      countBefore,
      countAfter,
      countDelta: countAfter - countBefore,
      sizeBefore,
      sizeAfter,
      sizeDelta: sizeAfter - sizeBefore,
    });
  }
  rows.sort((x, y) => y.sizeDelta - x.sizeDelta || y.countDelta - x.countDelta
    || String(x.constructor).localeCompare(String(y.constructor)));
  return rows;
}

/** Serialize aggregate map for JSON reports. */
export function aggregatesToObject(map) {
  const obj = {};
  if (!map) return obj;
  for (const [key, row] of map) {
    obj[key] = { count: row.count, size: row.size };
  }
  return obj;
}

/**
 * Tiny synthetic snapshot for unit tests (object + native nodes).
 * @param {Array<{ name: string, count: number, selfSize?: number, detached?: boolean }>} specs
 */
export function synthesizeHeapSnapshotWithConstructors(specs = []) {
  const strings = [''];
  const nameIndex = new Map();
  const ensure = (name) => {
    if (nameIndex.has(name)) return nameIndex.get(name);
    const ix = strings.length;
    strings.push(name);
    nameIndex.set(name, ix);
    return ix;
  };
  const nodeFields = ['type', 'name', 'id', 'self_size', 'edge_count', 'trace_node_id', 'detachedness'];
  const nodeTypes = [['hidden', 'array', 'string', 'object', 'code', 'closure', 'regexp', 'number', 'native', 'synthetic']];
  const nodes = [];
  let nextId = 1;
  for (const spec of specs) {
    const nameIx = ensure(spec.name);
    const selfSize = Number.isFinite(spec.selfSize) ? Number(spec.selfSize) : 64;
    const detached = spec.detached ? 1 : 0;
    for (let i = 0; i < (spec.count || 0); i += 1) {
      nodes.push(8, nameIx, nextId++, selfSize, 0, 0, detached);
    }
  }
  return {
    snapshot: {
      meta: {
        node_fields: nodeFields,
        node_types: nodeTypes,
        edge_fields: ['type', 'name_or_index', 'to_node'],
        edge_types: [['context', 'element', 'property']],
      },
      node_count: nodes.length / nodeFields.length,
      edge_count: 0,
    },
    nodes,
    edges: [],
    strings,
  };
}

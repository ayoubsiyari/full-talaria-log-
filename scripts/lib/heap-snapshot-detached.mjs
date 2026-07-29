/**
 * Count Detached HTMLDivElement / Detached <div> nodes in a Chromium
 * `.heapsnapshot` JSON object (HeapProfiler.takeHeapSnapshot).
 *
 * Superior mechanism gate vs raw usedJSHeapSize: immune to unrelated heap noise.
 * PO calibration magnitude: +21_699 detached divs per multichart cycle.
 *
 * Chromium often names nodes `Detached <div style="...">` — those count too.
 */

import { normalizeConstructorKey } from './heap-snapshot-aggregates.mjs';

export const DETACHED_DIV_NAME_EXACT = Object.freeze([
  'HTMLDivElement',
  'Detached HTMLDivElement',
  'Detached <div>',
]);

export function isDetachedDivName(name) {
  const text = String(name || '');
  if (DETACHED_DIV_NAME_EXACT.includes(text)) return true;
  if (/^Detached\s+HTMLDivElement$/i.test(text)) return true;
  if (/^Detached\s*<div>$/i.test(text)) return true;
  // Serialized form from modern Chromium heap snapshots
  if (/^Detached\s*<div\b/i.test(text)) return true;
  const norm = normalizeConstructorKey(text, true);
  if (norm === 'Detached <div>' || norm === 'Detached HTMLDivElement') return true;
  return false;
}

/**
 * @param {object} snapshot Parsed heapsnapshot JSON
 * @returns {{ detachedDivCount: number, htmlDivElementCount: number, detachednessField: boolean, nodeCount: number }}
 */
export function countDetachedDivsFromHeapSnapshot(snapshot) {
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
  const typeIx = fields.indexOf('type');
  const detIx = fields.indexOf('detachedness');
  if (nameIx < 0) throw new Error('heap snapshot node_fields missing name');
  const stride = fields.length;
  if (!(stride > 0)) throw new Error('heap snapshot node_fields empty');

  const typeStrings = Array.isArray(meta.node_types?.[typeIx]) ? meta.node_types[typeIx] : null;
  let detachedDivCount = 0;
  let htmlDivElementCount = 0;
  let nodeCount = 0;

  for (let i = 0; i + stride <= nodes.length; i += stride) {
    nodeCount += 1;
    const name = strings[nodes[i + nameIx]] || '';
    const typeCode = typeIx >= 0 ? nodes[i + typeIx] : null;
    const typeName = typeStrings && typeCode != null ? typeStrings[typeCode] : null;
    const detachedFlag = detIx >= 0 ? Number(nodes[i + detIx]) : 0;
    const nameLooksDiv = isDetachedDivName(name) || name === 'HTMLDivElement';
    if (!nameLooksDiv && !(typeName === 'native' && name === 'HTMLDivElement')) continue;
    if (name === 'HTMLDivElement' || isDetachedDivName(name)) htmlDivElementCount += 1;
    const detachedByFlag = detIx >= 0 && detachedFlag === 1;
    const detachedByName = String(name).startsWith('Detached');
    if (detachedByFlag || detachedByName) detachedDivCount += 1;
  }

  return {
    detachedDivCount,
    htmlDivElementCount,
    detachednessField: detIx >= 0,
    nodeCount,
  };
}

/** Build a tiny synthetic snapshot for unit GATE-01 pins. */
export function synthesizeHeapSnapshotWithDetachedDivs(detachedDivCount, {
  attachedDivCount = 0,
} = {}) {
  const strings = ['', 'HTMLDivElement', 'Detached HTMLDivElement', 'Window'];
  const nodeFields = ['type', 'name', 'id', 'self_size', 'edge_count', 'trace_node_id', 'detachedness'];
  const nodeTypes = [['hidden', 'array', 'string', 'object', 'code', 'closure', 'regexp', 'number', 'native', 'synthetic']];
  const nodes = [];
  let nextId = 1;
  const pushNode = (nameIndex, detachedness) => {
    nodes.push(
      8, // native
      nameIndex,
      nextId++,
      64,
      0,
      0,
      detachedness,
    );
  };
  for (let i = 0; i < attachedDivCount; i += 1) pushNode(1, 0);
  for (let i = 0; i < detachedDivCount; i += 1) pushNode(1, 1);
  return {
    snapshot: {
      meta: {
        node_fields: nodeFields,
        node_types: nodeTypes,
        edge_fields: ['type', 'name_or_index', 'to_node'],
        edge_types: [['context', 'element', 'property']],
      },
      node_count: attachedDivCount + detachedDivCount,
      edge_count: 0,
    },
    nodes,
    edges: [],
    strings,
  };
}

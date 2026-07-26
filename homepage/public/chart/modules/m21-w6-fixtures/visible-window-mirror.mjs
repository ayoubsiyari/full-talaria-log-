/**
 * M21-2 / W6 — typed-array visible-window mirror (REFERENCE / TEST-ONLY).
 *
 * STATUS: PRELIMINARY-PENDING-W3/FABLE-SIGNOFF
 *
 * Ownership:
 *   - W3 owns render-worker scaffold + bootstrap + kill-switch plumbing.
 *   - W6 pre-builds this mirror shape for candle/indicator layer migration.
 *   - Do NOT wire into product runtime or worker bootstrap without W3/Fable sign-off.
 *
 * Layout (default stride=6): packed [t, o, h, l, c, v] × windowLength
 * Element layout matches IndicatorPerf.packBarsRangeCompact / W1 B2 intent.
 *
 * Capacity note (compat): W1 B2 allocates an *exact* pack (buffer.byteLength ===
 * view.byteLength). This mirror may retain spare capacity; window views are
 * always subarray(0, used) with byteOffset 0. Transfer consumers MUST honor
 * byteLength/elementCount from the transfer descriptor — never
 * `new Float64Array(buffer)` alone on a capacity-backed buffer.
 */

import { createReusableBufferPool } from './reusable-buffer-pool.mjs';

/** @typedef {import('./reusable-buffer-pool.mjs').TypedArrayView} TypedArrayView */

export const VISIBLE_WINDOW_STRIDE = 6;
export const VISIBLE_WINDOW_BYTES_PER_ELEMENT = Float64Array.BYTES_PER_ELEMENT;

/**
 * @typedef {object} VisibleWindowMirrorOptions
 * @property {number} [stride=6]
 * @property {number} [initialCapacityBars=512]
 * @property {ReturnType<typeof createReusableBufferPool>} [pool]
 * @property {boolean} [ownPool=true]
 */

/**
 * @typedef {object} VisibleWindowMeta
 * @property {number} startIndex
 * @property {number} endIndex
 * @property {number} length
 * @property {number} capacityBars
 * @property {number} stride
 * @property {number} generation
 * @property {boolean} detached
 */

/**
 * @typedef {object} VisibleWindowTransferDescriptor
 * @property {ArrayBuffer} buffer
 * @property {number} byteOffset  Always 0 for this mirror (window packed at head).
 * @property {number} byteLength  Used window bytes only (NOT full capacity).
 * @property {number} elementCount
 * @property {number} barCount
 * @property {number} stride
 * @property {ArrayBuffer[]} transferList
 * @property {VisibleWindowMeta} meta
 */

/**
 * Reference pack matching IndicatorPerf.packBarsRangeCompact element rules.
 * Fixture-local — does not import product modules.
 * @param {ArrayLike<object>} bars
 * @param {number} start
 * @param {number|null|undefined} [end]
 * @returns {Float64Array}
 */
export function packBarsRangeCompactCompatible(bars, start, end) {
  const n = bars ? bars.length : 0;
  const s = Math.max(0, Math.min(n, start | 0));
  const e = end == null ? n : Math.max(s, Math.min(n, end | 0));
  const count = e - s;
  const packed = new Float64Array(count * VISIBLE_WINDOW_STRIDE);
  for (let i = 0; i < count; i++) {
    const b = bars[s + i];
    const o = i * VISIBLE_WINDOW_STRIDE;
    packed[o] = b.t;
    packed[o + 1] = b.o != null ? b.o : b.open;
    packed[o + 2] = b.h != null ? b.h : b.high;
    packed[o + 3] = b.l != null ? b.l : b.low;
    packed[o + 4] = b.c != null ? b.c : b.close;
    packed[o + 5] = b.v != null ? b.v : (b.volume != null ? b.volume : 0);
  }
  return packed;
}

/**
 * @param {object|null|undefined} bar
 * @param {TypedArrayView} packed
 * @param {number} offset
 */
function writeBar(bar, packed, offset) {
  // Match packBarsRangeCompact field resolution (not null-safe there; we are).
  if (bar == null) {
    packed[offset] = NaN;
    packed[offset + 1] = NaN;
    packed[offset + 2] = NaN;
    packed[offset + 3] = NaN;
    packed[offset + 4] = NaN;
    packed[offset + 5] = 0;
    return;
  }
  packed[offset] = bar.t;
  packed[offset + 1] = bar.o != null ? bar.o : bar.open;
  packed[offset + 2] = bar.h != null ? bar.h : bar.high;
  packed[offset + 3] = bar.l != null ? bar.l : bar.low;
  packed[offset + 4] = bar.c != null ? bar.c : bar.close;
  packed[offset + 5] = bar.v != null ? bar.v : (bar.volume != null ? bar.volume : 0);
}

/**
 * @param {number} n
 * @param {number} start
 * @param {number|null|undefined} end
 */
export function clampVisibleBounds(n, start, end) {
  const len = Math.max(0, n | 0);
  let s = start | 0;
  let e = end == null ? len : (end | 0);
  if (s < 0) s = 0;
  if (e < 0) e = 0;
  if (s > len) s = len;
  if (e > len) e = len;
  if (e < s) e = s;
  return { startIndex: s, endIndex: e, length: e - s };
}

/**
 * Reconstruct a window view from a transfer descriptor (receiver-side helper).
 * Prefer this over `new Float64Array(buffer)` when capacity > window.
 * @param {{ buffer: ArrayBuffer, byteOffset: number, byteLength: number }} desc
 * @returns {Float64Array}
 */
export function viewFromTransferDescriptor(desc) {
  if (!desc || !(desc.buffer instanceof ArrayBuffer)) {
    throw new TypeError('viewFromTransferDescriptor requires { buffer, byteOffset, byteLength }');
  }
  return new Float64Array(desc.buffer, desc.byteOffset | 0, (desc.byteLength | 0) / VISIBLE_WINDOW_BYTES_PER_ELEMENT);
}

/**
 * @param {VisibleWindowMirrorOptions} [options]
 */
export function createVisibleWindowMirror(options = {}) {
  const stride = Math.max(1, options.stride ?? VISIBLE_WINDOW_STRIDE);
  const pool = options.pool
    || (options.ownPool === false
      ? null
      : createReusableBufferPool({ ArrayType: Float64Array, maxPerBucket: 4, maxLive: 32 }));

  if (!pool) {
    throw new Error('createVisibleWindowMirror requires a pool (or ownPool:true default)');
  }
  if (pool.ArrayType !== Float64Array) {
    throw new TypeError('Visible-window mirror requires a Float64Array pool');
  }

  let capacityBars = Math.max(1, options.initialCapacityBars ?? 512);
  /** @type {TypedArrayView | null} */
  let packed = pool.acquire(capacityBars * stride);
  let startIndex = 0;
  let endIndex = 0;
  let generation = 0;
  let detached = false;

  function ensureCapacity(barsNeeded) {
    const need = Math.max(1, barsNeeded | 0);
    if (!detached && packed && packed.length >= need * stride) {
      capacityBars = Math.max(capacityBars, Math.floor(packed.length / stride));
      return;
    }
    if (packed && !detached) pool.release(packed);
    let next = capacityBars;
    while (next < need) next = Math.max(need, next * 2);
    capacityBars = next;
    packed = pool.acquire(capacityBars * stride);
    detached = false;
  }

  /**
   * @param {ArrayLike<object>} bars
   * @param {number} start
   * @param {number|null|undefined} [end]
   */
  function syncFromBars(bars, start, end) {
    if (detached) {
      packed = null;
      detached = false;
    }
    const n = bars && typeof bars.length === 'number' ? bars.length : 0;
    const bounds = clampVisibleBounds(n, start, end);
    ensureCapacity(Math.max(1, bounds.length));

    const view = /** @type {Float64Array} */ (packed);
    for (let i = 0; i < bounds.length; i++) {
      writeBar(bars[bounds.startIndex + i], view, i * stride);
    }
    const used = bounds.length * stride;
    for (let i = used; i < view.length; i++) view[i] = NaN;

    startIndex = bounds.startIndex;
    endIndex = bounds.endIndex;
    generation += 1;

    const windowView = view.subarray(0, used);
    return {
      view: windowView,
      startIndex,
      endIndex,
      length: bounds.length,
      capacityBars,
      stride,
      generation,
      detached: false,
      byteOffset: windowView.byteOffset,
      byteLength: windowView.byteLength,
    };
  }

  function windowMeta() {
    return {
      startIndex,
      endIndex,
      length: endIndex - startIndex,
      capacityBars,
      stride,
      generation,
      detached,
    };
  }

  function asTypedArray() {
    if (detached || !packed) {
      throw new Error('VisibleWindowMirror is detached; syncFromBars before read');
    }
    return packed.subarray(0, (endIndex - startIndex) * stride);
  }

  /**
   * Capacity root view (includes spare tail). Test/audit aid only.
   * @returns {Float64Array}
   */
  function capacityView() {
    if (detached || !packed) {
      throw new Error('VisibleWindowMirror is detached; syncFromBars before read');
    }
    return packed;
  }

  /**
   * Detach ownership for postMessage transfer. Returns a W1-compatible
   * descriptor: transfer `transferList`, reconstruct with byteOffset/byteLength.
   * @returns {VisibleWindowTransferDescriptor}
   */
  function detachForTransfer() {
    if (detached || !packed) {
      throw new Error('VisibleWindowMirror already detached');
    }
    const elementCount = (endIndex - startIndex) * stride;
    const byteLength = elementCount * VISIBLE_WINDOW_BYTES_PER_ELEMENT;
    const root = packed;
    const poolDesc = pool.detachForTransfer(root);
    detached = true;
    packed = null;
    return {
      buffer: poolDesc.buffer,
      byteOffset: 0,
      byteLength,
      elementCount,
      barCount: endIndex - startIndex,
      stride,
      transferList: [poolDesc.buffer],
      meta: windowMeta(),
    };
  }

  function clear() {
    if (packed && !detached) pool.release(packed);
    packed = null;
    startIndex = 0;
    endIndex = 0;
    detached = false;
  }

  function destroy() {
    clear();
    if (options.pool == null && typeof pool.clear === 'function') pool.clear();
  }

  return {
    stride,
    pool,
    syncFromBars,
    windowMeta,
    asTypedArray,
    capacityView,
    detachForTransfer,
    clear,
    destroy,
    clampVisibleBounds,
  };
}

export const W6_VISIBLE_WINDOW_MIRROR_STATUS = 'PRELIMINARY-PENDING-W3/FABLE-SIGNOFF';
export const W6_VISIBLE_WINDOW_MIRROR_API = Object.freeze([
  'createVisibleWindowMirror',
  'clampVisibleBounds',
  'packBarsRangeCompactCompatible',
  'viewFromTransferDescriptor',
  'syncFromBars',
  'windowMeta',
  'asTypedArray',
  'capacityView',
  'detachForTransfer',
  'clear',
  'destroy',
]);

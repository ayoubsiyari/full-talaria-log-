/**
 * M21-2 / W6 — reusable TypedArray buffer pool (REFERENCE / TEST-ONLY).
 *
 * STATUS: PRELIMINARY-PENDING-W3/FABLE-SIGNOFF
 *
 * Ownership:
 *   - W3 owns the render-worker scaffold, bootstrap, and buffer contract.
 *   - W6 authors this fixture so M21-2 can land with a proven pool shape.
 *   - Do NOT import from chart.js, chart-indicators-full.js, order-manager.js,
 *     or any worker bootstrap until W3/Fable sign-off.
 *
 * Shared intent: M21-2 visible-window transfer + W1 B2 transferred-buffer path.
 *
 * Root-view rule: acquire() returns a view with byteOffset===0 covering the
 * whole ArrayBuffer. release/detachForTransfer reject subviews so capacity
 * tails cannot be mis-bucketed or transferred without an explicit descriptor.
 */

/** @typedef {typeof Float32Array | typeof Float64Array | typeof Uint8Array | typeof Uint16Array | typeof Uint32Array | typeof Int32Array} TypedArrayCtor */
/** @typedef {InstanceType<TypedArrayCtor>} TypedArrayView */

/**
 * @typedef {object} BufferPoolOptions
 * @property {TypedArrayCtor} [ArrayType=Float64Array]
 * @property {number} [maxPerBucket=8]  Max idle buffers retained per element-count bucket.
 * @property {number} [maxLive=64]      Hard cap on outstanding (unreleased) views.
 */

/**
 * @typedef {object} BufferPoolStats
 * @property {number} acquired
 * @property {number} released
 * @property {number} reused
 * @property {number} allocated
 * @property {number} live
 * @property {number} detached
 * @property {number} discarded
 * @property {number} idleTotal
 * @property {number} maxLive
 * @property {number} maxPerBucket
 * @property {Record<string, number>} idleByBucket
 */

/**
 * @param {BufferPoolOptions} [options]
 */
export function createReusableBufferPool(options = {}) {
  const ArrayType = options.ArrayType || Float64Array;
  const maxPerBucket = Math.max(0, options.maxPerBucket ?? 8);
  const maxLive = Math.max(1, options.maxLive ?? 64);
  const BYTES_PER_ELEMENT = ArrayType.BYTES_PER_ELEMENT;

  /** @type {Map<number, TypedArrayView[]>} */
  const idle = new Map();
  /** @type {WeakSet<ArrayBuffer>} */
  const owned = new WeakSet();
  /** @type {WeakSet<ArrayBuffer>} */
  const transferred = new WeakSet();

  const stats = {
    acquired: 0,
    released: 0,
    reused: 0,
    allocated: 0,
    live: 0,
    detached: 0,
    discarded: 0,
  };

  function bucketKey(elementCount) {
    const n = elementCount | 0;
    if (n < 0) throw new RangeError('elementCount must be >= 0');
    return n;
  }

  /** True when view is the full root mapping of its ArrayBuffer. */
  function isRootView(view) {
    if (!view || !(view instanceof ArrayType)) return false;
    try {
      return view.byteOffset === 0
        && view.byteLength === view.buffer.byteLength
        && view.length * BYTES_PER_ELEMENT === view.byteLength;
    } catch (_) {
      return false;
    }
  }

  function viewIsUsable(view) {
    if (!view || !(view instanceof ArrayType)) return false;
    const buf = view.buffer;
    if (transferred.has(buf)) return false;
    try {
      if (typeof buf.detached === 'boolean' && buf.detached) return false;
      void view.length;
      void buf.byteLength;
      return true;
    } catch (_) {
      return false;
    }
  }

  function idleTotal() {
    let n = 0;
    for (const arr of idle.values()) n += arr.length;
    return n;
  }

  /**
   * Acquire a root view with exact `elementCount` elements (byteOffset 0).
   * @param {number} elementCount
   * @returns {TypedArrayView}
   */
  function acquire(elementCount) {
    const key = bucketKey(elementCount);
    if (stats.live >= maxLive) {
      throw new Error(`BufferPool live cap exceeded (maxLive=${maxLive})`);
    }

    const bucket = idle.get(key);
    while (bucket && bucket.length) {
      const candidate = bucket.pop();
      if (viewIsUsable(candidate) && isRootView(candidate) && candidate.length === key) {
        stats.acquired += 1;
        stats.reused += 1;
        stats.live += 1;
        owned.add(candidate.buffer);
        return candidate;
      }
      stats.discarded += 1;
    }

    const view = new ArrayType(key);
    owned.add(view.buffer);
    stats.acquired += 1;
    stats.allocated += 1;
    stats.live += 1;
    return view;
  }

  /**
   * Return a root view to the idle pool. Rejects foreign / subview / transferred.
   * @param {TypedArrayView | null | undefined} view
   * @returns {boolean}
   */
  function release(view) {
    if (!view || !(view instanceof ArrayType)) return false;
    if (!isRootView(view)) return false;
    const buf = view.buffer;
    if (transferred.has(buf) || !owned.has(buf)) return false;
    if (!viewIsUsable(view)) {
      transferred.add(buf);
      stats.live = Math.max(0, stats.live - 1);
      stats.detached += 1;
      return false;
    }

    stats.released += 1;
    stats.live = Math.max(0, stats.live - 1);

    const key = view.length;
    let bucket = idle.get(key);
    if (!bucket) {
      bucket = [];
      idle.set(key, bucket);
    }
    if (bucket.length >= maxPerBucket) {
      stats.discarded += 1;
      return true;
    }
    bucket.push(view);
    return true;
  }

  /**
   * Mark a root view's ArrayBuffer as transferred-out.
   * @param {TypedArrayView} view
   * @returns {{ buffer: ArrayBuffer, byteOffset: number, byteLength: number, elementCount: number }}
   */
  function detachForTransfer(view) {
    if (!view || !(view instanceof ArrayType)) {
      throw new TypeError('detachForTransfer expects a pool ArrayType view');
    }
    if (!isRootView(view)) {
      throw new Error('detachForTransfer: subviews rejected — pass the root acquire() view');
    }
    const buf = view.buffer;
    if (!owned.has(buf)) {
      throw new Error('detachForTransfer: view is not pool-owned');
    }
    if (transferred.has(buf)) {
      throw new Error('detachForTransfer: buffer already detached/transferred');
    }
    if (!viewIsUsable(view)) {
      throw new Error('detachForTransfer: buffer already unusable');
    }

    const bucket = idle.get(view.length);
    if (bucket) {
      for (let i = bucket.length - 1; i >= 0; i--) {
        if (bucket[i] === view || bucket[i].buffer === buf) bucket.splice(i, 1);
      }
    }

    const descriptor = {
      buffer: buf,
      byteOffset: 0,
      byteLength: view.byteLength,
      elementCount: view.length,
    };

    transferred.add(buf);
    stats.live = Math.max(0, stats.live - 1);
    stats.detached += 1;
    return descriptor;
  }

  /** @returns {BufferPoolStats} */
  function getStats() {
    /** @type {Record<string, number>} */
    const idleByBucket = {};
    for (const [k, arr] of idle) {
      idleByBucket[String(k)] = arr.length;
      if (arr.length > maxPerBucket) {
        throw new Error(`BufferPool invariant broken: idle bucket ${k} > maxPerBucket`);
      }
    }
    if (stats.live > maxLive) {
      throw new Error('BufferPool invariant broken: live > maxLive');
    }
    return {
      ...stats,
      idleTotal: idleTotal(),
      maxLive,
      maxPerBucket,
      idleByBucket,
    };
  }

  function clear() {
    idle.clear();
  }

  return {
    ArrayType,
    acquire,
    release,
    detachForTransfer,
    getStats,
    clear,
    isRootView,
    /** @internal test aid */
    _isOwned(view) {
      return !!(view && owned.has(view.buffer));
    },
    /** @internal test aid */
    _isTransferred(view) {
      return !!(view && transferred.has(view.buffer));
    },
  };
}

export const W6_BUFFER_POOL_STATUS = 'PRELIMINARY-PENDING-W3/FABLE-SIGNOFF';
export const W6_BUFFER_POOL_API = Object.freeze([
  'createReusableBufferPool',
  'acquire',
  'release',
  'detachForTransfer',
  'getStats',
  'clear',
  'isRootView',
]);
